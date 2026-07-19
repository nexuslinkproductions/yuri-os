#define _DARWIN_C_SOURCE 1

#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <libproc.h>
#include <poll.h>
#include <signal.h>
#include <spawn.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/event.h>
#include <sys/mount.h>
#include <sys/proc_info.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/sysctl.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#define EVENT_FD 3
#define WRITER_EXEC_FD 4
#define WRITER_ENV_FD 5
#define WRITER_LEASE_FD 198
#define WRITER_START_FD 190
#define WRITER_PREPARATION_FD 191
#define WRITER_EXEC_RESULT_FD 192
#define CONTROLLER_LOCK_BYTE 0
#define SENTINEL_LOCK_BYTE 1
#define SENTINEL_MAGIC 0x59555249U
#define PROTOCOL_PREFIX "YURI_BACKEND_LOCK_V1"
#define NONCE_HEX_LENGTH 64
#define CONTROL_LINE_MAX 512
#define PARTIAL_FRAME_TIMEOUT_MS 2000
#define EXEC_TIMEOUT_MS 10000
#define TERM_GRACE_MS 3000
#define KILL_GRACE_MS 10000
#define LINGER_GRACE_MS 3000
#define MAX_WRITER_ENV_BYTES (64 * 1024)

enum {
    EXIT_USAGE = 64,
    EXIT_LOCK_PATH = 65,
    EXIT_LOCK_UNSAFE = 66,
    EXIT_LOCK_OPEN = 67,
    EXIT_LOCK_IDENTITY = 68,
    EXIT_PREPARE = 69,
    EXIT_EXEC = 70,
    EXIT_PROTOCOL = 71,
    EXIT_EVENT = 72,
    EXIT_BUSY = 73,
    EXIT_UNLOCK = 74,
    EXIT_HELPER_SIGNAL = 75,
    EXIT_GROUP_STALLED = 76,
    EXIT_LOCK_PATH_CHANGED = 77,
    EXIT_LEASE_STALLED = 78,
    EXIT_SENTINEL_DIED = 79,
    EXIT_IDENTITY_STALLED = 80,
    EXIT_DESCENDANT_UNPROVABLE = 81
};

enum sentinel_command_type {
    SENTINEL_COMMAND_ACQUIRE = 1,
    SENTINEL_COMMAND_ENROLL = 2,
    SENTINEL_COMMAND_RUNNING = 3,
    SENTINEL_COMMAND_CLEANUP = 4
};

enum sentinel_status_type {
    SENTINEL_STATUS_READY = 1,
    SENTINEL_STATUS_ENROLLED = 2,
    SENTINEL_STATUS_RUNNING = 3,
    SENTINEL_STATUS_RELEASED = 4,
    SENTINEL_STATUS_FAIL_HOLD = 5
};

enum sentinel_reason {
    SENTINEL_REASON_WRITER_EXIT = 1,
    SENTINEL_REASON_ABORT = 2,
    SENTINEL_REASON_TERMINATE = 3,
    SENTINEL_REASON_EXEC_FAILED = 4,
    SENTINEL_REASON_PROTOCOL = 5,
    SENTINEL_REASON_CONTROLLER_LOST = 6,
    SENTINEL_REASON_GUARDIAN_SIGNAL = 7,
    SENTINEL_REASON_CAPABILITY_CHANGED = 8,
    SENTINEL_REASON_EVENT_LOST = 9,
    SENTINEL_REASON_SENTINEL_DIED = 10,
    SENTINEL_REASON_PROTOCOL_PREPARED = 11,
    SENTINEL_REASON_DESCENDANT_UNPROVABLE = 12
};

struct process_identity {
    pid_t pid;
    pid_t pgid;
    uid_t uid;
    uint64_t start_sec;
    uint64_t start_usec;
};

struct capability_identity {
    uint64_t handle;
    uint64_t peer_handle;
};

struct sentinel_command {
    uint32_t magic;
    uint32_t type;
    uint32_t reason;
    uint32_t reserved;
    struct process_identity writer;
    struct capability_identity capability;
    struct stat lock_identity;
};

struct sentinel_status {
    uint32_t magic;
    uint32_t type;
    uint32_t reason;
    int32_t exit_code;
    pid_t sentinel_pid;
    pid_t writer_pid;
    uint64_t sentinel_start_sec;
    uint64_t sentinel_start_usec;
};

struct preparation_status {
    int ok;
    int error_number;
    pid_t pgid;
    unsigned long long exec_device;
    unsigned long long exec_inode;
    unsigned int exec_uid;
    unsigned int exec_mode;
    uint64_t capability_handle;
    uint64_t capability_peer_handle;
};

extern char **environ;
static char *empty_environment[] = { NULL };

static volatile sig_atomic_t caught_signal = 0;

static void signal_handler(int signal_number) {
    caught_signal = signal_number;
}

static int fail_message(const char *message, int code) {
    fprintf(stderr, "BACKEND_OPERATION_LOCK_FAILED %s\n", message);
    return code;
}

static int fail_errno(const char *operation, int code) {
    fprintf(stderr, "BACKEND_OPERATION_LOCK_FAILED %s: %s\n", operation, strerror(errno));
    return code;
}

static bool valid_nonce(const char *nonce) {
    size_t index;
    if (nonce == NULL || strlen(nonce) != NONCE_HEX_LENGTH) {
        return false;
    }
    for (index = 0; index < NONCE_HEX_LENGTH; index += 1) {
        if (!((nonce[index] >= '0' && nonce[index] <= '9')
              || (nonce[index] >= 'a' && nonce[index] <= 'f'))) {
            return false;
        }
    }
    return true;
}

static int write_all(int fd, const void *buffer, size_t length) {
    const unsigned char *cursor = buffer;
    size_t written = 0;
    while (written < length) {
        ssize_t count = write(fd, cursor + written, length - written);
        if (count > 0) {
            written += (size_t)count;
            continue;
        }
        if (count < 0 && errno == EINTR) {
            continue;
        }
        return -1;
    }
    return 0;
}

static int read_exact(int fd, void *buffer, size_t length) {
    unsigned char *cursor = buffer;
    size_t used = 0;
    while (used < length) {
        ssize_t count = read(fd, cursor + used, length - used);
        if (count > 0) {
            used += (size_t)count;
            continue;
        }
        if (count < 0 && errno == EINTR) {
            continue;
        }
        return count == 0 ? 0 : -1;
    }
    return 1;
}

static bool read_process_identity(pid_t pid, struct process_identity *identity) {
    struct proc_bsdinfo info;
    int count;
    memset(&info, 0, sizeof(info));
    count = proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, (int)sizeof(info));
    if (count != (int)sizeof(info) || (pid_t)info.pbi_pid != pid) {
        return false;
    }
    identity->pid = pid;
    identity->pgid = (pid_t)info.pbi_pgid;
    identity->uid = info.pbi_uid;
    identity->start_sec = info.pbi_start_tvsec;
    identity->start_usec = info.pbi_start_tvusec;
    return true;
}

static bool same_process_identity(
    const struct process_identity *expected,
    const struct process_identity *observed
) {
    return expected->pid == observed->pid
        && expected->pgid == observed->pgid
        && expected->uid == observed->uid
        && expected->start_sec == observed->start_sec
        && expected->start_usec == observed->start_usec;
}

static bool process_identity_live(const struct process_identity *expected) {
    struct process_identity observed;
    return read_process_identity(expected->pid, &observed)
        && same_process_identity(expected, &observed);
}

static bool pipe_identity_for_fd(int fd, struct capability_identity *identity) {
    struct pipe_fdinfo info;
    int count = proc_pidfdinfo(
        getpid(),
        fd,
        PROC_PIDFDPIPEINFO,
        &info,
        (int)sizeof(info)
    );
    if (count != (int)sizeof(info)) {
        return false;
    }
    identity->handle = info.pipeinfo.pipe_handle;
    identity->peer_handle = info.pipeinfo.pipe_peerhandle;
    return identity->handle != 0 && identity->peer_handle != 0;
}

static bool same_pipe_identity(
    const struct capability_identity *left,
    const struct capability_identity *right
) {
    return (left->handle == right->handle && left->peer_handle == right->peer_handle)
        || (left->handle == right->peer_handle && left->peer_handle == right->handle);
}

static int matching_pipe_fd_count(
    pid_t pid,
    const struct capability_identity *expected,
    bool *lease_fd_matches
) {
    struct proc_fdinfo *descriptors;
    int bytes = proc_pidinfo(pid, PROC_PIDLISTFDS, 0, NULL, 0);
    int count = 0;
    int index;
    *lease_fd_matches = false;
    if (bytes <= 0 || bytes > 1024 * 1024) {
        return -1;
    }
    descriptors = calloc(1, (size_t)bytes);
    if (descriptors == NULL) {
        return -1;
    }
    bytes = proc_pidinfo(pid, PROC_PIDLISTFDS, 0, descriptors, bytes);
    if (bytes < 0) {
        free(descriptors);
        return -1;
    }
    for (index = 0; index < bytes / (int)sizeof(*descriptors); index += 1) {
        struct pipe_fdinfo info;
        struct capability_identity observed;
        if (descriptors[index].proc_fdtype != PROX_FDTYPE_PIPE) {
            continue;
        }
        if (proc_pidfdinfo(
                pid,
                descriptors[index].proc_fd,
                PROC_PIDFDPIPEINFO,
                &info,
                (int)sizeof(info)
            ) != (int)sizeof(info)) {
            continue;
        }
        observed.handle = info.pipeinfo.pipe_handle;
        observed.peer_handle = info.pipeinfo.pipe_peerhandle;
        if (same_pipe_identity(expected, &observed)) {
            count += 1;
            if (descriptors[index].proc_fd == WRITER_LEASE_FD) {
                *lease_fd_matches = true;
            }
        }
    }
    free(descriptors);
    return count;
}

static bool capability_exact_in_writer(
    const struct process_identity *writer,
    const struct capability_identity *capability
) {
    bool lease_matches = false;
    int matches;
    if (!process_identity_live(writer)) {
        return false;
    }
    matches = matching_pipe_fd_count(writer->pid, capability, &lease_matches);
    return matches == 1 && lease_matches;
}

static bool group_has_other_members(pid_t pgid, pid_t writer_pid) {
    pid_t *pids;
    int bytes = proc_listpids(PROC_PGRP_ONLY, (uint32_t)pgid, NULL, 0);
    int index;
    bool found = false;
    if (bytes <= 0 || bytes > 4 * 1024 * 1024) {
        return false;
    }
    pids = calloc(1, (size_t)bytes);
    if (pids == NULL) {
        return true;
    }
    bytes = proc_listpids(PROC_PGRP_ONLY, (uint32_t)pgid, pids, bytes);
    if (bytes <= 0) {
        free(pids);
        return false;
    }
    for (index = 0; index < bytes / (int)sizeof(*pids); index += 1) {
        if (pids[index] > 1 && pids[index] != writer_pid) {
            found = true;
            break;
        }
    }
    free(pids);
    return found;
}

static int emit_event(const char *nonce, const char *event_name, const char *format, ...) {
    /* Keep every lifecycle frame within macOS PIPE_BUF (512) so the
       controller and sentinel can never interleave partial records. */
    char details[416];
    char frame[512];
    int details_length = 0;
    int frame_length;
    va_list arguments;

    details[0] = '\0';
    if (format != NULL && format[0] != '\0') {
        va_start(arguments, format);
        details_length = vsnprintf(details, sizeof(details), format, arguments);
        va_end(arguments);
        if (details_length < 0 || (size_t)details_length >= sizeof(details)) {
            return -1;
        }
    }

    frame_length = snprintf(
        frame,
        sizeof(frame),
        "%s nonce=%s event=%s%s%s\n",
        PROTOCOL_PREFIX,
        nonce,
        event_name,
        details_length > 0 ? " " : "",
        details
    );
    if (frame_length < 0 || (size_t)frame_length >= sizeof(frame)) {
        return -1;
    }
    return write_all(EVENT_FD, frame, (size_t)frame_length);
}

static bool same_identity(const struct stat *left, const struct stat *right) {
    return left->st_dev == right->st_dev
        && left->st_ino == right->st_ino
        && left->st_uid == right->st_uid
        && left->st_mode == right->st_mode
        && left->st_nlink == right->st_nlink;
}

static bool safe_lock_stat(const struct stat *value) {
    return S_ISREG(value->st_mode)
        && !S_ISLNK(value->st_mode)
        && value->st_uid == getuid()
        && (value->st_mode & 0777) == 0600
        && value->st_nlink == 1
        && value->st_size == 2
        && (value->st_flags & UF_IMMUTABLE) == 0;
}

static bool safe_anchor_stat(const struct stat *value) {
    return S_ISDIR(value->st_mode)
        && !S_ISLNK(value->st_mode)
        && value->st_uid == getuid()
        && (value->st_mode & 0777) == 0500
        && (value->st_flags & UF_IMMUTABLE) != 0;
}

static bool safe_anchor_directory(const char *lock_path) {
    char directory[PATH_MAX];
    char *separator;
    struct stat value;
    size_t length;

    if (lock_path == NULL) {
        return false;
    }
    length = strlen(lock_path);
    if (length == 0 || length >= sizeof(directory)) {
        return false;
    }
    memcpy(directory, lock_path, length + 1);
    separator = strrchr(directory, '/');
    if (separator == NULL || separator == directory) {
        return false;
    }
    *separator = '\0';
    if (lstat(directory, &value) != 0) {
        return false;
    }
    return safe_anchor_stat(&value);
}

static bool lock_path_matches(
    const char *lock_path,
    const struct stat *identity
) {
    struct stat current;
    return safe_anchor_directory(lock_path)
        && lstat(lock_path, &current) == 0
        && same_identity(identity, &current)
        && safe_lock_stat(&current);
}

static int set_ofd_range_lock(int fd, off_t start, short type) {
    struct flock range;
    memset(&range, 0, sizeof(range));
    range.l_start = start;
    range.l_len = 1;
    range.l_pid = 0;
    range.l_type = type;
    range.l_whence = SEEK_SET;
    return fcntl(fd, F_OFD_SETLK, &range);
}

static bool busy_lock_error(int value) {
    return value == EAGAIN || value == EACCES || value == EWOULDBLOCK;
}

static int open_lock_description(
    const char *lock_path,
    int *lock_fd,
    struct stat *lock_identity
) {
    char directory[PATH_MAX];
    char basename[NAME_MAX + 1];
    char *separator;
    size_t path_length;
    size_t name_length;
    struct stat parent_identity;
    struct stat before;
    struct stat opened;
    struct stat after;
    struct statfs filesystem;
    int parent_fd;
    int fd;

    if (lock_path == NULL || lock_path[0] != '/') {
        return fail_message("lock path must be absolute", EXIT_LOCK_PATH);
    }
    path_length = strlen(lock_path);
    if (path_length == 0 || path_length >= sizeof(directory)) {
        return fail_message("lock path is too long", EXIT_LOCK_PATH);
    }
    memcpy(directory, lock_path, path_length + 1);
    separator = strrchr(directory, '/');
    if (separator == NULL || separator == directory || separator[1] == '\0') {
        return fail_message("lock path lacks a dedicated parent", EXIT_LOCK_PATH);
    }
    name_length = strlen(separator + 1);
    if (name_length == 0 || name_length >= sizeof(basename)) {
        return fail_message("lock basename is unsafe", EXIT_LOCK_PATH);
    }
    memcpy(basename, separator + 1, name_length + 1);
    *separator = '\0';

    parent_fd = open(directory, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    if (parent_fd < 0) {
        return fail_errno("open lock anchor", EXIT_LOCK_OPEN);
    }
    if (fstat(parent_fd, &parent_identity) != 0
        || !safe_anchor_stat(&parent_identity)
        || fstatfs(parent_fd, &filesystem) != 0
        || strcmp(filesystem.f_fstypename, "apfs") != 0
        || (filesystem.f_flags & MNT_LOCAL) == 0) {
        close(parent_fd);
        return fail_message("lock anchor directory is not sealed local APFS", EXIT_LOCK_UNSAFE);
    }
    if (fstatat(parent_fd, basename, &before, AT_SYMLINK_NOFOLLOW) != 0) {
        int saved = errno;
        close(parent_fd);
        errno = saved;
        return fail_errno("fstatat lock", EXIT_LOCK_PATH);
    }
    if (!safe_lock_stat(&before)) {
        close(parent_fd);
        return fail_message("lock file identity, owner, link count, or mode is unsafe", EXIT_LOCK_UNSAFE);
    }

    fd = openat(parent_fd, basename, O_RDWR | O_NOFOLLOW | O_CLOEXEC);
    if (fd < 0) {
        int saved = errno;
        close(parent_fd);
        errno = saved;
        return fail_errno("open", EXIT_LOCK_OPEN);
    }
    if (fstat(fd, &opened) != 0 || !same_identity(&before, &opened) || !safe_lock_stat(&opened)) {
        close(fd);
        close(parent_fd);
        return fail_message("lock file identity changed during open", EXIT_LOCK_IDENTITY);
    }
    if (fstatat(parent_fd, basename, &after, AT_SYMLINK_NOFOLLOW) != 0
        || !same_identity(&opened, &after) || !safe_lock_stat(&after)) {
        close(fd);
        close(parent_fd);
        return fail_message("lock path identity changed during acquisition", EXIT_LOCK_IDENTITY);
    }
    close(parent_fd);

    *lock_fd = fd;
    *lock_identity = opened;
    return 0;
}

static int acquire_lock_file(
    const char *lock_path,
    int *lock_fd,
    struct stat *lock_identity
) {
    int fd;
    int opened = open_lock_description(lock_path, &fd, lock_identity);
    if (opened != 0) return opened;
    if (set_ofd_range_lock(fd, CONTROLLER_LOCK_BYTE, F_WRLCK) != 0) {
        int saved = errno;
        close(fd);
        errno = saved;
        return fail_message(busy_lock_error(saved) ? "busy" : strerror(saved),
                            busy_lock_error(saved) ? EXIT_BUSY : EXIT_LOCK_OPEN);
    }
    if (set_ofd_range_lock(fd, SENTINEL_LOCK_BYTE, F_WRLCK) != 0) {
        int saved = errno;
        int rollback = set_ofd_range_lock(fd, CONTROLLER_LOCK_BYTE, F_UNLCK);
        close(fd);
        if (rollback != 0) {
            return fail_message("byte-zero rollback failed after byte-one contention", EXIT_UNLOCK);
        }
        errno = saved;
        return fail_message(busy_lock_error(saved) ? "busy" : strerror(saved),
                            busy_lock_error(saved) ? EXIT_BUSY : EXIT_LOCK_OPEN);
    }
    *lock_fd = fd;
    return 0;
}

static int acquire_sentinel_lock_file(
    const char *lock_path,
    const struct stat *expected,
    int *lock_fd,
    struct stat *lock_identity
) {
    int fd;
    int opened = open_lock_description(lock_path, &fd, lock_identity);
    if (opened != 0) return opened;
    if (!same_identity(expected, lock_identity)) {
        close(fd);
        return fail_message("sentinel lock identity differs from controller", EXIT_LOCK_IDENTITY);
    }
    if (set_ofd_range_lock(fd, SENTINEL_LOCK_BYTE, F_WRLCK) != 0) {
        int saved = errno;
        close(fd);
        errno = saved;
        return fail_message(busy_lock_error(saved) ? "sentinel byte busy" : strerror(saved),
                            busy_lock_error(saved) ? EXIT_BUSY : EXIT_LOCK_OPEN);
    }
    *lock_fd = fd;
    return 0;
}

static int close_lock_description(int lock_fd) {
    return close(lock_fd);
}

static int make_cloexec_pipe(int descriptors[2]) {
    if (pipe(descriptors) != 0) {
        return -1;
    }
    if (fcntl(descriptors[0], F_SETFD, FD_CLOEXEC) != 0
        || fcntl(descriptors[1], F_SETFD, FD_CLOEXEC) != 0) {
        int saved = errno;
        close(descriptors[0]);
        close(descriptors[1]);
        errno = saved;
        return -1;
    }
    return 0;
}

static int read_line(int fd, char *buffer, size_t capacity) {
    size_t length = 0;
    struct timespec started;
    bool started_frame = false;
    while (length + 1 < capacity) {
        char value;
        if (started_frame) {
            struct timespec now;
            struct pollfd descriptor = { .fd = fd, .events = POLLIN | POLLHUP, .revents = 0 };
            long long elapsed;
            int remaining;
            int poll_result;
            clock_gettime(CLOCK_MONOTONIC, &now);
            elapsed = (long long)(now.tv_sec - started.tv_sec) * 1000
                + (long long)(now.tv_nsec - started.tv_nsec) / 1000000;
            remaining = PARTIAL_FRAME_TIMEOUT_MS - (int)elapsed;
            if (remaining <= 0) {
                return -2;
            }
            poll_result = poll(&descriptor, 1, remaining);
            if (poll_result == 0) {
                return -2;
            }
            if (poll_result < 0) {
                if (errno == EINTR && caught_signal != 0) {
                    return -3;
                }
                if (errno == EINTR) {
                    continue;
                }
                return -1;
            }
        }
        ssize_t count = read(fd, &value, 1);
        if (count == 0) {
            if (length == 0) {
                return 0;
            }
            return -2;
        }
        if (count < 0) {
            if (errno == EINTR) {
                if (caught_signal != 0) {
                    return -3;
                }
                continue;
            }
            return -1;
        }
        if (value == '\n') {
            buffer[length] = '\0';
            return 1;
        }
        if (value == '\r' || value == '\0') {
            return -2;
        }
        if (!started_frame) {
            clock_gettime(CLOCK_MONOTONIC, &started);
            started_frame = true;
        }
        buffer[length++] = value;
    }
    return -2;
}

static int command_name(const char *line, const char *nonce, char *result, size_t capacity) {
    char prefix[128];
    int prefix_length = snprintf(prefix, sizeof(prefix), "%s nonce=%s command=", PROTOCOL_PREFIX, nonce);
    size_t command_length;
    if (prefix_length < 0 || (size_t)prefix_length >= sizeof(prefix)
        || strncmp(line, prefix, (size_t)prefix_length) != 0) {
        return -1;
    }
    command_length = strlen(line + prefix_length);
    if (command_length == 0 || command_length >= capacity || strchr(line + prefix_length, ' ') != NULL) {
        return -1;
    }
    memcpy(result, line + prefix_length, command_length + 1);
    return 0;
}

static void sleep_milliseconds(long milliseconds) {
    struct timespec request;
    request.tv_sec = milliseconds / 1000;
    request.tv_nsec = (milliseconds % 1000) * 1000000L;
    while (nanosleep(&request, &request) != 0 && errno == EINTR) {
        if (caught_signal != 0) {
            break;
        }
    }
}

static uint64_t monotonic_milliseconds(void) {
    struct timespec now;
    if (clock_gettime(CLOCK_MONOTONIC, &now) != 0) {
        return 0;
    }
    return (uint64_t)now.tv_sec * 1000U + (uint64_t)now.tv_nsec / 1000000U;
}

static long add_elapsed(long current, long delta) {
    if (delta <= 0) return current;
    if (current >= LONG_MAX - delta) return LONG_MAX;
    return current + delta;
}

static int emit_writer_exit(const char *nonce, int writer_status) {
    if (WIFEXITED(writer_status)) {
        return emit_event(nonce, "WRITER_EXITED", "exit_code=%d term_signal=0", WEXITSTATUS(writer_status));
    }
    if (WIFSIGNALED(writer_status)) {
        return emit_event(nonce, "WRITER_EXITED", "exit_code=-1 term_signal=%d", WTERMSIG(writer_status));
    }
    return emit_event(nonce, "WRITER_EXITED", "exit_code=-1 term_signal=0");
}

static bool safe_environment_key(const char *key, size_t length) {
    size_t index;
    if (length == 0
        || !((key[0] >= 'A' && key[0] <= 'Z')
             || (key[0] >= 'a' && key[0] <= 'z')
             || key[0] == '_')) {
        return false;
    }
    for (index = 1; index < length; index += 1) {
        if (!((key[index] >= 'A' && key[index] <= 'Z')
              || (key[index] >= 'a' && key[index] <= 'z')
              || (key[index] >= '0' && key[index] <= '9')
              || key[index] == '_')) {
            return false;
        }
    }
    return true;
}

static bool dangerous_environment_key(const char *key) {
    static const char *blocked[] = {
        "CC", "CXX", "CPP", "CFLAGS", "CXXFLAGS", "CPPFLAGS", "LDFLAGS",
        "LIBRARY_PATH", "CPATH", "COMPILER_PATH", "GCC_EXEC_PREFIX", "SDKROOT",
        "NODE_OPTIONS", "BUN_OPTIONS", "PYTHONPATH", "PYTHONHOME", NULL
    };
    size_t index;
    if (strncmp(key, "DYLD_", 5) == 0 || strncmp(key, "LD_", 3) == 0) {
        return true;
    }
    for (index = 0; blocked[index] != NULL; index += 1) {
        if (strcmp(key, blocked[index]) == 0) {
            return true;
        }
    }
    return false;
}

static int install_writer_environment(int fd) {
    char *buffer = calloc(MAX_WRITER_ENV_BYTES + 1, 1);
    char *cursor;
    size_t used = 0;
    if (buffer == NULL) {
        return ENOMEM;
    }
    for (;;) {
        ssize_t count = read(fd, buffer + used, MAX_WRITER_ENV_BYTES - used);
        if (count == 0) {
            break;
        }
        if (count < 0) {
            if (errno == EINTR) {
                continue;
            }
            int saved = errno;
            free(buffer);
            return saved;
        }
        used += (size_t)count;
        if (used == MAX_WRITER_ENV_BYTES) {
            free(buffer);
            return E2BIG;
        }
    }
    if (used == 0 || buffer[used - 1] != '\0') {
        free(buffer);
        return EINVAL;
    }

    environ = empty_environment;
    cursor = buffer;
    while ((size_t)(cursor - buffer) < used && cursor[0] != '\0') {
        char *terminator = memchr(cursor, '\0', used - (size_t)(cursor - buffer));
        char *equals;
        size_t key_length;
        if (terminator == NULL) {
            free(buffer);
            return EINVAL;
        }
        equals = memchr(cursor, '=', (size_t)(terminator - cursor));
        if (equals == NULL || equals == cursor) {
            free(buffer);
            return EINVAL;
        }
        key_length = (size_t)(equals - cursor);
        if (!safe_environment_key(cursor, key_length)) {
            free(buffer);
            return EINVAL;
        }
        *equals = '\0';
        if (dangerous_environment_key(cursor) || setenv(cursor, equals + 1, 1) != 0) {
            int saved = dangerous_environment_key(cursor) ? EPERM : errno;
            free(buffer);
            return saved;
        }
        cursor = terminator + 1;
    }
    if ((size_t)(cursor - buffer) != used - 1) {
        free(buffer);
        return EINVAL;
    }
    free(buffer);
    return 0;
}

static bool safe_writer_executable(
    int exec_fd,
    const char *writer_path,
    const struct stat *expected,
    struct stat *observed
) {
    struct stat descriptor;
    struct stat pathname;
    unsigned char magic[4];
    bool native_binary;
    if (fstat(exec_fd, &descriptor) != 0
        || lstat(writer_path, &pathname) != 0
        || !S_ISREG(descriptor.st_mode)
        || S_ISLNK(pathname.st_mode)
        || (descriptor.st_mode & 0111) == 0
        || !same_identity(&descriptor, &pathname)
        || (expected != NULL && !same_identity(expected, &descriptor))
        || pread(exec_fd, magic, sizeof(magic), 0) != (ssize_t)sizeof(magic)) {
        return false;
    }
    native_binary = (magic[0] == 0xfe && magic[1] == 0xed && magic[2] == 0xfa
                     && (magic[3] == 0xce || magic[3] == 0xcf))
        || ((magic[0] == 0xce || magic[0] == 0xcf) && magic[1] == 0xfa
            && magic[2] == 0xed && magic[3] == 0xfe)
        || (magic[0] == 0xca && magic[1] == 0xfe && magic[2] == 0xba
            && (magic[3] == 0xbe || magic[3] == 0xbf))
        || ((magic[0] == 0xbe || magic[0] == 0xbf) && magic[1] == 0xba
            && magic[2] == 0xfe && magic[3] == 0xca);
    if (!native_binary) return false;
    if (observed != NULL) {
        *observed = descriptor;
    }
    return true;
}

static int hold_lock_on_path_mismatch(
    const char *nonce,
    const char *phase,
    int lock_fd
) {
    (void)lock_fd;
    emit_event(nonce, "LOCK_PATH_CHANGED", "phase=%s", phase);
    for (;;) {
        sleep_milliseconds(1000);
    }
}

static int run_hold(const char *lock_path, const char *nonce) {
    char line[CONTROL_LINE_MAX];
    char command[32];
    int lock_fd;
    struct stat lock_identity;
    int acquired = acquire_lock_file(lock_path, &lock_fd, &lock_identity);
    int read_result;
    int exit_code = 0;
    const char *reason = "request";

    if (acquired != 0) {
        return acquired;
    }
    if (emit_event(nonce, "READY", "mode=hold helper_pid=%d", getpid()) != 0) {
        close_lock_description(lock_fd);
        return fail_message("event channel unavailable", EXIT_EVENT);
    }
    for (;;) {
        struct pollfd control = { .fd = STDIN_FILENO, .events = POLLIN | POLLHUP, .revents = 0 };
        int poll_result;
        if (!lock_path_matches(lock_path, &lock_identity)) {
            return hold_lock_on_path_mismatch(nonce, "hold", lock_fd);
        }
        if (caught_signal != 0) {
            emit_event(nonce, "HELPER_SIGNAL", "signal=%d phase=hold", caught_signal);
            reason = "helper_signal";
            exit_code = EXIT_HELPER_SIGNAL;
            break;
        }
        poll_result = poll(&control, 1, 100);
        if (poll_result < 0 && errno == EINTR) {
            continue;
        }
        if (poll_result < 0) {
            read_result = -1;
            break;
        }
        if (poll_result > 0) {
            read_result = read_line(STDIN_FILENO, line, sizeof(line));
            break;
        }
    }
    if (exit_code == EXIT_HELPER_SIGNAL) {
        /* The dedicated event above already explains this terminal path. */
    } else
    if (read_result == 0) {
        reason = "control_eof";
        exit_code = EXIT_PROTOCOL;
    } else if (read_result < 0 || command_name(line, nonce, command, sizeof(command)) != 0
               || strcmp(command, "RELEASE") != 0) {
        emit_event(nonce, "PROTOCOL_ERROR", "phase=hold");
        reason = "protocol_error";
        exit_code = EXIT_PROTOCOL;
    }
    if (!lock_path_matches(lock_path, &lock_identity)) {
        return hold_lock_on_path_mismatch(nonce, "hold_release", lock_fd);
    }
    if (close_lock_description(lock_fd) != 0) {
        return fail_message("lock close failed", EXIT_UNLOCK);
    }
    emit_event(nonce, "RELEASED", "reason=%s", reason);
    return exit_code;
}

static const char *sentinel_reason_name(uint32_t reason) {
    switch (reason) {
        case SENTINEL_REASON_WRITER_EXIT: return "writer_group_exit";
        case SENTINEL_REASON_ABORT: return "abort_prepared";
        case SENTINEL_REASON_TERMINATE: return "terminate_request";
        case SENTINEL_REASON_EXEC_FAILED: return "exec_failed";
        case SENTINEL_REASON_PROTOCOL: return "protocol_error_running";
        case SENTINEL_REASON_PROTOCOL_PREPARED: return "protocol_error_prepared";
        case SENTINEL_REASON_CONTROLLER_LOST: return "controller_lost";
        case SENTINEL_REASON_GUARDIAN_SIGNAL: return "guardian_signal";
        case SENTINEL_REASON_CAPABILITY_CHANGED: return "writer_capability_changed";
        case SENTINEL_REASON_EVENT_LOST: return "event_channel_lost";
        case SENTINEL_REASON_SENTINEL_DIED: return "sentinel_died";
        case SENTINEL_REASON_DESCENDANT_UNPROVABLE: return "descendant_unprovable";
        default: return "control_error";
    }
}

static int send_sentinel_status(
    int fd,
    uint32_t type,
    uint32_t reason,
    int exit_code,
    pid_t writer_pid,
    const struct process_identity *sentinel
) {
    struct sentinel_status status;
    memset(&status, 0, sizeof(status));
    status.magic = SENTINEL_MAGIC;
    status.type = type;
    status.reason = reason;
    status.exit_code = exit_code;
    status.sentinel_pid = sentinel->pid;
    status.writer_pid = writer_pid;
    status.sentinel_start_sec = sentinel->start_sec;
    status.sentinel_start_usec = sentinel->start_usec;
    return write_all(fd, &status, sizeof(status));
}

static int send_sentinel_command(
    int fd,
    uint32_t type,
    uint32_t reason,
    const struct process_identity *writer,
    const struct capability_identity *capability,
    const struct stat *lock_identity
) {
    struct sentinel_command command;
    memset(&command, 0, sizeof(command));
    command.magic = SENTINEL_MAGIC;
    command.type = type;
    command.reason = reason;
    if (writer != NULL) command.writer = *writer;
    if (capability != NULL) command.capability = *capability;
    if (lock_identity != NULL) command.lock_identity = *lock_identity;
    return write_all(fd, &command, sizeof(command));
}

static int wait_sentinel_status(int fd, struct sentinel_status *status, int timeout_ms) {
    struct pollfd descriptor = { .fd = fd, .events = POLLIN | POLLHUP | POLLERR, .revents = 0 };
    int poll_result;
    do {
        poll_result = poll(&descriptor, 1, timeout_ms);
    } while (poll_result < 0 && errno == EINTR && caught_signal == 0);
    if (poll_result == 0) return 2;
    if (poll_result < 0 || (descriptor.revents & (POLLERR | POLLNVAL)) != 0) {
        return -1;
    }
    if (read_exact(fd, status, sizeof(*status)) != 1) {
        return 0;
    }
    return status->magic == SENTINEL_MAGIC ? 1 : -1;
}

static int capability_pipe_state(int fd) {
    struct pollfd descriptor = { .fd = fd, .events = POLLIN | POLLHUP | POLLERR, .revents = 0 };
    char value;
    int result = poll(&descriptor, 1, 0);
    if (result < 0 && errno == EINTR) return 0;
    if (result < 0 || (descriptor.revents & (POLLERR | POLLNVAL)) != 0) return -1;
    if (result == 0) return 0;
    result = (int)read(fd, &value, 1);
    if (result == 0) return 1;
    return -1;
}

static bool writer_exit_observed(pid_t writer_pid, siginfo_t *information) {
    memset(information, 0, sizeof(*information));
    if (waitid(P_PID, (id_t)writer_pid, information, WEXITED | WNOHANG | WNOWAIT) != 0) {
        return false;
    }
    return information->si_pid == writer_pid;
}

static bool signal_enrolled_group(
    const struct process_identity *writer,
    int signal_number
) {
    if (!process_identity_live(writer)) {
        return false;
    }
    if (kill(-writer->pgid, signal_number) == 0) {
        return true;
    }
    return errno == ESRCH;
}

static bool process_argv_matches(pid_t pid, char **expected_argv) {
    int mib[3] = { CTL_KERN, KERN_PROCARGS2, pid };
    size_t capacity = 0;
    unsigned char *buffer = NULL;
    unsigned char *cursor;
    unsigned char *end;
    int observed_argc;
    int expected_argc = 0;
    bool matches = false;

    while (expected_argv[expected_argc] != NULL) {
        if (expected_argc == INT_MAX) return false;
        expected_argc += 1;
    }
    if (sysctl(mib, 3, NULL, &capacity, NULL, 0) != 0
        || capacity < sizeof(observed_argc)
        || capacity > 4 * 1024 * 1024) {
        return false;
    }
    buffer = malloc(capacity);
    if (buffer == NULL || sysctl(mib, 3, buffer, &capacity, NULL, 0) != 0
        || capacity < sizeof(observed_argc)) {
        free(buffer);
        return false;
    }
    memcpy(&observed_argc, buffer, sizeof(observed_argc));
    if (observed_argc != expected_argc) goto done;
    cursor = buffer + sizeof(observed_argc);
    end = buffer + capacity;
    while (cursor < end && *cursor != '\0') cursor += 1;
    if (cursor == end) goto done;
    while (cursor < end && *cursor == '\0') cursor += 1;
    for (int index = 0; index < observed_argc; index += 1) {
        size_t remaining;
        size_t length;
        if (cursor >= end) goto done;
        remaining = (size_t)(end - cursor);
        length = strnlen((const char *)cursor, remaining);
        if (length == remaining || strcmp((const char *)cursor, expected_argv[index]) != 0) {
            goto done;
        }
        cursor += length + 1;
    }
    matches = true;

done:
    free(buffer);
    return matches;
}

static bool process_exec_matches(
    const struct process_identity *writer,
    const struct stat *expected_executable,
    char **expected_argv
) {
    char executable_path[PROC_PIDPATHINFO_MAXSIZE];
    struct stat executable;
    int length;
    if (!process_identity_live(writer)) return false;
    memset(executable_path, 0, sizeof(executable_path));
    length = proc_pidpath(writer->pid, executable_path, (uint32_t)sizeof(executable_path));
    if (length <= 0 || (size_t)length >= sizeof(executable_path)
        || lstat(executable_path, &executable) != 0
        || S_ISLNK(executable.st_mode)
        || !same_identity(expected_executable, &executable)) {
        return false;
    }
    return process_argv_matches(writer->pid, expected_argv);
}

static int register_writer_kqueue(int queue, const struct process_identity *writer) {
    struct kevent change;
    EV_SET(
        &change,
        (uintptr_t)writer->pid,
        EVFILT_PROC,
        EV_ADD | EV_ENABLE | EV_CLEAR,
        NOTE_EXIT | NOTE_EXEC | NOTE_FORK,
        0,
        NULL
    );
    return kevent(queue, &change, 1, NULL, 0, NULL);
}

static int sentinel_process(
    const char *lock_path,
    const char *nonce,
    int command_fd,
    int status_fd,
    int capability_read_fd,
    pid_t controller_pid,
    char **expected_writer_argv,
    const struct stat *expected_executable
) {
    int lock_fd = -1;
    struct stat lock_identity;
    struct process_identity sentinel;
    struct process_identity writer;
    struct capability_identity capability;
    struct capability_identity sentinel_capability;
    struct sentinel_command command;
    int queue = -1;
    bool enrolled = false;
    bool running = false;
    bool running_requested = false;
    bool expected_exec_pending = true;
    bool expected_exec_bound = false;
    bool descendant_unprovable = false;
    bool cleanup = false;
    bool writer_exited = false;
    bool capability_eof = false;
    bool capability_changed = false;
    bool controller_lost = false;
    bool terminating_announced = false;
    bool term_sent = false;
    bool kill_sent = false;
    bool group_stalled = false;
    bool capability_stalled = false;
    bool identity_stalled = false;
    uint32_t reason = SENTINEL_REASON_WRITER_EXIT;
    int requested_exit_code = 0;
    long cleanup_elapsed = 0;
    long identity_failure_elapsed = 0;
    long linger_elapsed = 0;
    uint64_t last_tick_ms = monotonic_milliseconds();

    if (!read_process_identity(getpid(), &sentinel)
        || !pipe_identity_for_fd(capability_read_fd, &sentinel_capability)) {
        return EXIT_PREPARE;
    }
    if (read_exact(command_fd, &command, sizeof(command)) != 1
        || command.magic != SENTINEL_MAGIC
        || command.type != SENTINEL_COMMAND_ACQUIRE
        || !safe_lock_stat(&command.lock_identity)) {
        return EXIT_PROTOCOL;
    }
    if (acquire_sentinel_lock_file(
            lock_path,
            &command.lock_identity,
            &lock_fd,
            &lock_identity
        ) != 0) {
        return EXIT_PREPARE;
    }
    if (emit_event(
            nonce,
            "READY",
            "mode=guardian helper_pid=%d sentinel_pid=%d sentinel_start_sec=%llu sentinel_start_usec=%llu lock_device=%llu lock_inode=%llu capability_handle=%llu capability_peer_handle=%llu",
            controller_pid,
            sentinel.pid,
            (unsigned long long)sentinel.start_sec,
            (unsigned long long)sentinel.start_usec,
            (unsigned long long)lock_identity.st_dev,
            (unsigned long long)lock_identity.st_ino,
            (unsigned long long)sentinel_capability.handle,
            (unsigned long long)sentinel_capability.peer_handle
        ) != 0
        || send_sentinel_status(
            status_fd,
            SENTINEL_STATUS_READY,
            0,
            0,
            0,
            &sentinel
        ) != 0) {
        return EXIT_EVENT;
    }

    if (read_exact(command_fd, &command, sizeof(command)) != 1
        || command.magic != SENTINEL_MAGIC
        || command.type != SENTINEL_COMMAND_ENROLL) {
        emit_event(
            nonce,
            "CONTROLLER_LOST",
            "phase=sentinel_ready controller_pid=%d",
            controller_pid
        );
        while (capability_pipe_state(capability_read_fd) == 0) sleep_milliseconds(100);
        close_lock_description(lock_fd);
        return EXIT_PROTOCOL;
    }
    writer = command.writer;
    capability = command.capability;
    queue = kqueue();
    if (writer.pid <= 1
        || writer.pgid != writer.pid
        || writer.uid != getuid()
        || !same_pipe_identity(&capability, &sentinel_capability)
        || !process_identity_live(&writer)
        || !capability_exact_in_writer(&writer, &capability)
        || queue < 0
        || register_writer_kqueue(queue, &writer) != 0) {
        emit_event(
            nonce,
            "IDENTITY_STALLED",
            "writer_pid=%d pgid=%d phase=enrollment",
            writer.pid,
            writer.pgid
        );
        for (;;) sleep_milliseconds(1000);
    }
    enrolled = true;
    if (send_sentinel_status(
            status_fd,
            SENTINEL_STATUS_ENROLLED,
            0,
            0,
            writer.pid,
            &sentinel
        ) != 0) {
        controller_lost = true;
        cleanup = true;
        reason = SENTINEL_REASON_CONTROLLER_LOST;
        requested_exit_code = EXIT_PROTOCOL;
    }

    while (enrolled) {
        struct pollfd descriptors[3];
        struct kevent event;
        struct timespec no_wait = { .tv_sec = 0, .tv_nsec = 0 };
        int poll_result;
        int event_count;
        bool other_members;
        uint64_t now_ms;
        long tick_elapsed = 0;

        descriptors[0] = (struct pollfd){ .fd = command_fd, .events = POLLIN | POLLHUP | POLLERR, .revents = 0 };
        descriptors[1] = (struct pollfd){ .fd = capability_read_fd, .events = POLLIN | POLLHUP | POLLERR, .revents = 0 };
        descriptors[2] = (struct pollfd){ .fd = queue, .events = POLLIN | POLLERR, .revents = 0 };
        poll_result = poll(descriptors, 3, 100);
        if (poll_result < 0 && errno != EINTR) {
            cleanup = true;
            reason = SENTINEL_REASON_PROTOCOL;
            requested_exit_code = EXIT_PROTOCOL;
        }
        now_ms = monotonic_milliseconds();
        if (last_tick_ms != 0 && now_ms >= last_tick_ms) {
            uint64_t delta = now_ms - last_tick_ms;
            tick_elapsed = delta > (uint64_t)LONG_MAX ? LONG_MAX : (long)delta;
        }
        last_tick_ms = now_ms;
        if ((descriptors[0].revents & (POLLIN | POLLHUP | POLLERR)) != 0) {
            int read_result = read_exact(command_fd, &command, sizeof(command));
            if (read_result != 1 || command.magic != SENTINEL_MAGIC) {
                if (!controller_lost && !descendant_unprovable) {
                    emit_event(
                        nonce,
                        "CONTROLLER_LOST",
                        "phase=%s controller_pid=%d",
                        running ? "running" : "prepared",
                        controller_pid
                    );
                }
                controller_lost = true;
                if (!descendant_unprovable) {
                    cleanup = true;
                    reason = SENTINEL_REASON_CONTROLLER_LOST;
                    requested_exit_code = EXIT_PROTOCOL;
                }
            } else if (command.type == SENTINEL_COMMAND_RUNNING) {
                if (!descendant_unprovable) running_requested = true;
            } else if (command.type == SENTINEL_COMMAND_CLEANUP) {
                if (!descendant_unprovable) {
                    cleanup = true;
                    reason = command.reason;
                    if (reason == SENTINEL_REASON_CAPABILITY_CHANGED) requested_exit_code = EXIT_LEASE_STALLED;
                    else if (reason == SENTINEL_REASON_CONTROLLER_LOST
                             || reason == SENTINEL_REASON_PROTOCOL
                             || reason == SENTINEL_REASON_PROTOCOL_PREPARED) requested_exit_code = EXIT_PROTOCOL;
                    else if (reason == SENTINEL_REASON_GUARDIAN_SIGNAL) requested_exit_code = EXIT_HELPER_SIGNAL;
                    else if (reason == SENTINEL_REASON_EXEC_FAILED) requested_exit_code = EXIT_EXEC;
                }
            } else if (!descendant_unprovable) {
                cleanup = true;
                reason = SENTINEL_REASON_PROTOCOL;
                requested_exit_code = EXIT_PROTOCOL;
            }
        }
        if (!capability_eof && (descriptors[1].revents & (POLLIN | POLLHUP | POLLERR)) != 0) {
            int state = capability_pipe_state(capability_read_fd);
            if (state == 1) capability_eof = true;
            if (state < 0 && !capability_changed && !descendant_unprovable) {
                capability_changed = true;
                cleanup = true;
                reason = SENTINEL_REASON_CAPABILITY_CHANGED;
                requested_exit_code = EXIT_LEASE_STALLED;
                emit_event(
                    nonce,
                    "CAPABILITY_CHANGED",
                    "writer_pid=%d lease_fd=%d matching_fds=-1",
                    writer.pid,
                    WRITER_LEASE_FD
                );
            }
        }
        event_count = kevent(queue, NULL, 0, &event, 1, &no_wait);
        if (!descendant_unprovable && event_count != 0) {
            const char *unprovable_reason = NULL;
            uint32_t proc_fflags = 0;
            const uint32_t known_proc_flags = NOTE_EXIT | NOTE_EXEC | NOTE_FORK
                | NOTE_TRACKERR | NOTE_CHILD;
            if (event_count < 0) {
                unprovable_reason = "proc_event_error";
            } else if (event.filter != EVFILT_PROC || (event.flags & EV_ERROR) != 0) {
                unprovable_reason = "proc_event_unknown";
            } else {
                proc_fflags = event.fflags;
                if ((proc_fflags & NOTE_EXIT) != 0 && event.ident == (uintptr_t)writer.pid) {
                    writer_exited = true;
                }
                if ((proc_fflags & NOTE_FORK) != 0) {
                    unprovable_reason = "proc_fork";
                } else if ((proc_fflags & NOTE_TRACKERR) != 0) {
                    unprovable_reason = "proc_trackerr";
                } else if (event.ident != (uintptr_t)writer.pid
                           || (proc_fflags & NOTE_CHILD) != 0) {
                    unprovable_reason = "proc_child";
                } else if ((proc_fflags & ~known_proc_flags) != 0 || proc_fflags == 0) {
                    unprovable_reason = "proc_unknown";
                } else if ((proc_fflags & NOTE_EXEC) != 0) {
                    if (!expected_exec_pending) {
                        unprovable_reason = "proc_exec";
                    } else {
                        expected_exec_pending = false;
                        if (process_exec_matches(
                                &writer,
                                expected_executable,
                                expected_writer_argv
                            )) {
                            expected_exec_bound = true;
                        } else {
                            unprovable_reason = "exec_identity_mismatch";
                        }
                    }
                }
            }
            if (unprovable_reason != NULL) {
                descendant_unprovable = true;
                cleanup = true;
                reason = SENTINEL_REASON_DESCENDANT_UNPROVABLE;
                requested_exit_code = EXIT_DESCENDANT_UNPROVABLE;
                emit_event(
                    nonce,
                    "DESCENDANT_UNPROVABLE",
                    "reason=%s writer_pid=%d pgid=%d proc_fflags=%u",
                    unprovable_reason,
                    writer.pid,
                    writer.pgid,
                    proc_fflags
                );
                send_sentinel_status(
                    status_fd,
                    SENTINEL_STATUS_FAIL_HOLD,
                    reason,
                    requested_exit_code,
                    writer.pid,
                    &sentinel
                );
            }
        }
        if (!descendant_unprovable && running_requested && expected_exec_bound && !running) {
            if (send_sentinel_status(
                    status_fd,
                    SENTINEL_STATUS_RUNNING,
                    0,
                    0,
                    writer.pid,
                    &sentinel
                ) != 0) {
                controller_lost = true;
                cleanup = true;
                reason = SENTINEL_REASON_CONTROLLER_LOST;
                requested_exit_code = EXIT_PROTOCOL;
            } else {
                running = true;
            }
        }
        if (!descendant_unprovable && !writer_exited && running && !capability_changed) {
            bool lease_matches = false;
            int matches = matching_pipe_fd_count(writer.pid, &capability, &lease_matches);
            if ((matches != 1 || !lease_matches) && process_identity_live(&writer)) {
                capability_changed = true;
                cleanup = true;
                reason = SENTINEL_REASON_CAPABILITY_CHANGED;
                requested_exit_code = EXIT_LEASE_STALLED;
                emit_event(
                    nonce,
                    "CAPABILITY_CHANGED",
                    "writer_pid=%d lease_fd=%d matching_fds=%d",
                    writer.pid,
                    WRITER_LEASE_FD,
                    matches
                );
            }
        }

        other_members = group_has_other_members(writer.pgid, writer.pid);
        if (!descendant_unprovable && writer_exited && !cleanup
            && (!capability_eof || other_members)) {
            linger_elapsed = add_elapsed(linger_elapsed, tick_elapsed);
            if (linger_elapsed >= LINGER_GRACE_MS) {
                cleanup = true;
                requested_exit_code = other_members ? EXIT_GROUP_STALLED : EXIT_LEASE_STALLED;
                if (other_members) {
                    group_stalled = true;
                    emit_event(
                        nonce,
                        "GROUP_STALLED",
                        "reason=writer_descendants_lingering pgid=%d",
                        writer.pgid
                    );
                }
                if (!capability_eof) {
                    capability_stalled = true;
                    emit_event(nonce, "CAPABILITY_STALLED", "reason=escaped_capability");
                }
            }
        }
        if (!descendant_unprovable && (running_requested || cleanup)
            && writer_exited && !other_members && capability_eof
            && !(controller_lost && identity_stalled)) {
            break;
        }
        if (cleanup) {
            if (!terminating_announced) {
                emit_event(
                    nonce,
                    "TERMINATING",
                    "reason=%s pgid=%d",
                    sentinel_reason_name(reason),
                    writer.pgid
                );
                terminating_announced = true;
            }
            if (!term_sent && !identity_stalled) {
                if (signal_enrolled_group(&writer, SIGTERM)) {
                    term_sent = true;
                    cleanup_elapsed = 0;
                    identity_failure_elapsed = 0;
                } else if (!writer_exited || other_members) {
                    identity_failure_elapsed = add_elapsed(identity_failure_elapsed, tick_elapsed);
                    if (identity_failure_elapsed >= TERM_GRACE_MS) {
                        identity_stalled = true;
                        emit_event(
                            nonce,
                            "IDENTITY_STALLED",
                            "writer_pid=%d pgid=%d phase=term",
                            writer.pid,
                            writer.pgid
                        );
                    }
                }
            }
            if (term_sent) {
                cleanup_elapsed = add_elapsed(cleanup_elapsed, tick_elapsed);
            }
            if (term_sent && !kill_sent && cleanup_elapsed >= TERM_GRACE_MS
                && (!writer_exited || other_members)) {
                if (signal_enrolled_group(&writer, SIGKILL)) {
                    kill_sent = true;
                    cleanup_elapsed = 0;
                    identity_failure_elapsed = 0;
                } else if (!identity_stalled) {
                    identity_failure_elapsed = add_elapsed(identity_failure_elapsed, tick_elapsed);
                    if (identity_failure_elapsed >= TERM_GRACE_MS) {
                        identity_stalled = true;
                        emit_event(
                            nonce,
                            "IDENTITY_STALLED",
                            "writer_pid=%d pgid=%d phase=kill",
                            writer.pid,
                            writer.pgid
                        );
                    }
                }
            }
            if (kill_sent && cleanup_elapsed >= KILL_GRACE_MS
                && (!writer_exited || other_members) && !group_stalled) {
                group_stalled = true;
                emit_event(
                    nonce,
                    "GROUP_STALLED",
                    "reason=writer_reap_stalled pgid=%d",
                    writer.pgid
                );
            }
            if (writer_exited && !other_members && !capability_eof && !capability_stalled) {
                capability_stalled = true;
                emit_event(nonce, "CAPABILITY_STALLED", "reason=escaped_capability");
            }
        }
        if (!lock_path_matches(lock_path, &lock_identity)) {
            return hold_lock_on_path_mismatch(nonce, "sentinel", lock_fd);
        }
    }

    if (!lock_path_matches(lock_path, &lock_identity)) {
        return hold_lock_on_path_mismatch(nonce, "sentinel_release", lock_fd);
    }
    if (close_lock_description(lock_fd) != 0) {
        return EXIT_UNLOCK;
    }
    emit_event(
        nonce,
        "SENTINEL_RELEASED",
        "sentinel_pid=%d reason=%s",
        sentinel.pid,
        sentinel_reason_name(reason)
    );
    send_sentinel_status(
        status_fd,
        SENTINEL_STATUS_RELEASED,
        reason,
        requested_exit_code,
        writer.pid,
        &sentinel
    );
    close(queue);
    close(command_fd);
    close(status_fd);
    close(capability_read_fd);
    return requested_exit_code;
}

static int writer_bootstrap(char **writer_argv) {
    struct preparation_status preparation = { .ok = 0, .error_number = 0, .pgid = -1 };
    struct capability_identity capability;
    struct stat executable;
    struct stat writer_identity;
    char start_byte;
    int saved;

    preparation.pgid = getpgrp();
    if (preparation.pgid != getpid()
        || fcntl(WRITER_LEASE_FD, F_GETFD) < 0
        || fcntl(WRITER_START_FD, F_GETFD) < 0
        || fcntl(WRITER_PREPARATION_FD, F_GETFD) < 0
        || fcntl(WRITER_EXEC_RESULT_FD, F_GETFD) < 0
        || fcntl(WRITER_EXEC_FD, F_GETFD) < 0
        || fcntl(WRITER_ENV_FD, F_GETFD) < 0) {
        preparation.error_number = errno;
        write_all(WRITER_PREPARATION_FD, &preparation, sizeof(preparation));
        return 125;
    }
    if (!pipe_identity_for_fd(WRITER_LEASE_FD, &capability)) {
        preparation.error_number = errno == 0 ? ESTALE : errno;
        write_all(WRITER_PREPARATION_FD, &preparation, sizeof(preparation));
        return 125;
    }
    if (!safe_writer_executable(WRITER_EXEC_FD, writer_argv[0], NULL, &writer_identity)) {
        preparation.error_number = errno == 0 ? ENOEXEC : errno;
        write_all(WRITER_PREPARATION_FD, &preparation, sizeof(preparation));
        return 125;
    }
    if (!safe_writer_executable(
            WRITER_EXEC_FD,
            writer_argv[0],
            &writer_identity,
            &executable
        )) {
        preparation.error_number = errno == 0 ? ESTALE : errno;
        write_all(WRITER_PREPARATION_FD, &preparation, sizeof(preparation));
        return 125;
    }
    preparation.exec_device = (unsigned long long)executable.st_dev;
    preparation.exec_inode = (unsigned long long)executable.st_ino;
    preparation.exec_uid = (unsigned int)executable.st_uid;
    preparation.exec_mode = (unsigned int)(executable.st_mode & 07777);
    preparation.capability_handle = capability.handle;
    preparation.capability_peer_handle = capability.peer_handle;
    preparation.ok = 1;
    if (write_all(WRITER_PREPARATION_FD, &preparation, sizeof(preparation)) != 0) return 125;
    close(WRITER_PREPARATION_FD);

    if (read(WRITER_START_FD, &start_byte, 1) != 1 || start_byte != 'X') return 125;
    close(WRITER_START_FD);
    saved = install_writer_environment(WRITER_ENV_FD);
    close(WRITER_ENV_FD);
    if (saved != 0 || setenv("YURI_BACKEND_OPERATION_LEASE_FD", "198", 1) != 0) {
        if (saved == 0) saved = errno;
        write_all(WRITER_EXEC_RESULT_FD, &saved, sizeof(saved));
        return 126;
    }
    if (!safe_writer_executable(WRITER_EXEC_FD, writer_argv[0], &executable, NULL)) {
        saved = errno == 0 ? ESTALE : errno;
        write_all(WRITER_EXEC_RESULT_FD, &saved, sizeof(saved));
        return 126;
    }
    if (fcntl(WRITER_LEASE_FD, F_SETFD, 0) != 0
        || fcntl(WRITER_EXEC_RESULT_FD, F_SETFD, FD_CLOEXEC) != 0
        || fcntl(WRITER_EXEC_FD, F_SETFD, FD_CLOEXEC) != 0) {
        saved = errno;
        write_all(WRITER_EXEC_RESULT_FD, &saved, sizeof(saved));
        return 126;
    }
    close(EVENT_FD);
    execv(writer_argv[0], writer_argv);
    saved = errno;
    write_all(WRITER_EXEC_RESULT_FD, &saved, sizeof(saved));
    return 126;
}

static int wait_for_preparation(int fd, struct preparation_status *status) {
    struct pollfd poll_descriptor = { .fd = fd, .events = POLLIN | POLLHUP, .revents = 0 };
    ssize_t count;
    int poll_result;
    do {
        poll_result = poll(&poll_descriptor, 1, EXEC_TIMEOUT_MS);
    } while (poll_result < 0 && errno == EINTR && caught_signal == 0);
    if (poll_result <= 0) {
        return -1;
    }
    count = read(fd, status, sizeof(*status));
    return count == (ssize_t)sizeof(*status) ? 0 : -1;
}

static int wait_for_exec_result(int fd, int *exec_error) {
    struct pollfd poll_descriptor = { .fd = fd, .events = POLLIN | POLLHUP, .revents = 0 };
    ssize_t count;
    int poll_result;
    do {
        poll_result = poll(&poll_descriptor, 1, EXEC_TIMEOUT_MS);
    } while (poll_result < 0 && errno == EINTR && caught_signal == 0);
    if (poll_result <= 0) {
        return -1;
    }
    count = read(fd, exec_error, sizeof(*exec_error));
    if (count == 0) {
        return 0;
    }
    if (count == (ssize_t)sizeof(*exec_error)) {
        return 1;
    }
    return -1;
}

static int controller_fail_hold_after_sentinel_loss(
    int lock_fd,
    const char *lock_path,
    const struct stat *lock_identity,
    const char *nonce,
    int capability_read_fd,
    const struct process_identity *writer,
    uint32_t reason
) {
    bool term_sent = false;
    bool kill_sent = false;
    bool writer_exited = false;
    bool capability_eof = false;
    bool group_stalled = false;
    bool capability_stalled = false;
    bool identity_stalled = false;
    long elapsed = 0;
    siginfo_t information;
    int writer_status = 0;

    emit_event(
        nonce,
        "TERMINATING",
        "reason=%s pgid=%d",
        sentinel_reason_name(reason),
        writer->pgid
    );
    for (;;) {
        bool other_members;
        int capability_state;
        writer_exited = writer_exit_observed(writer->pid, &information);
        capability_state = capability_pipe_state(capability_read_fd);
        if (capability_state == 1) capability_eof = true;
        other_members = group_has_other_members(writer->pgid, writer->pid);
        if (writer_exited && !other_members && capability_eof) break;

        if (!term_sent) {
            if (signal_enrolled_group(writer, SIGTERM)) {
                term_sent = true;
                elapsed = 0;
            } else if (!identity_stalled) {
                identity_stalled = true;
                emit_event(
                    nonce,
                    "IDENTITY_STALLED",
                    "writer_pid=%d pgid=%d phase=fallback_term",
                    writer->pid,
                    writer->pgid
                );
            }
        } else {
            elapsed += 100;
        }
        if (term_sent && !kill_sent && elapsed >= TERM_GRACE_MS
            && (!writer_exited || other_members)) {
            if (signal_enrolled_group(writer, SIGKILL)) {
                kill_sent = true;
                elapsed = 0;
            } else if (!identity_stalled) {
                identity_stalled = true;
                emit_event(
                    nonce,
                    "IDENTITY_STALLED",
                    "writer_pid=%d pgid=%d phase=fallback_kill",
                    writer->pid,
                    writer->pgid
                );
            }
        }
        if (kill_sent && elapsed >= KILL_GRACE_MS
            && (!writer_exited || other_members) && !group_stalled) {
            group_stalled = true;
            emit_event(
                nonce,
                "GROUP_STALLED",
                "reason=writer_reap_stalled pgid=%d",
                writer->pgid
            );
        }
        if (writer_exited && !other_members && !capability_eof && !capability_stalled) {
            capability_stalled = true;
            emit_event(nonce, "CAPABILITY_STALLED", "reason=escaped_capability");
        }
        if (!lock_path_matches(lock_path, lock_identity)) {
            return hold_lock_on_path_mismatch(nonce, "controller_fallback", lock_fd);
        }
        sleep_milliseconds(100);
    }
    while (waitpid(writer->pid, &writer_status, 0) < 0 && errno == EINTR) continue;
    emit_writer_exit(nonce, writer_status);
    close(capability_read_fd);
    for (;;) {
        if (!lock_path_matches(lock_path, lock_identity)) {
            return hold_lock_on_path_mismatch(nonce, "controller_fail_hold", lock_fd);
        }
        sleep_milliseconds(1000);
    }
}

static int controller_descendant_fail_hold(
    int lock_fd,
    const char *lock_path,
    const struct stat *lock_identity,
    const char *nonce
) {
    for (;;) {
        if (!lock_path_matches(lock_path, lock_identity)) {
            return hold_lock_on_path_mismatch(
                nonce,
                "controller_descendant_fail_hold",
                lock_fd
            );
        }
        sleep_milliseconds(1000);
    }
}

static int finish_after_sentinel_release(
    int lock_fd,
    const char *lock_path,
    const struct stat *lock_identity,
    const char *nonce,
    int capability_read_fd,
    pid_t sentinel_pid,
    const struct process_identity *writer,
    const struct sentinel_status *release
) {
    int writer_status = 0;
    int sentinel_status = 0;
    siginfo_t information;
    if (!writer_exit_observed(writer->pid, &information)) {
        return hold_lock_on_path_mismatch(nonce, "writer_not_exited_at_sentinel_release", lock_fd);
    }
    while (waitpid(writer->pid, &writer_status, 0) < 0 && errno == EINTR) continue;
    emit_writer_exit(nonce, writer_status);
    close(capability_read_fd);
    if (!lock_path_matches(lock_path, lock_identity)) {
        return hold_lock_on_path_mismatch(nonce, "controller_release", lock_fd);
    }
    if (close_lock_description(lock_fd) != 0) return EXIT_UNLOCK;
    emit_event(nonce, "RELEASED", "reason=%s", sentinel_reason_name(release->reason));
    while (waitpid(sentinel_pid, &sentinel_status, 0) < 0 && errno == EINTR) continue;
    return release->exit_code;
}

static int spawn_writer_bootstrap(
    pid_t *writer_pid,
    const char *helper_path,
    char **writer_argv,
    int capability_write_fd,
    int start_read_fd,
    int preparation_write_fd,
    int exec_write_fd
) {
    posix_spawn_file_actions_t actions;
    posix_spawnattr_t attributes;
    sigset_t defaults;
    sigset_t mask;
    short flags = POSIX_SPAWN_SETSID
        | POSIX_SPAWN_CLOEXEC_DEFAULT
        | POSIX_SPAWN_SETSIGDEF
        | POSIX_SPAWN_SETSIGMASK;
    char **bootstrap_argv;
    char *bootstrap_environment[] = {
        "PATH=/usr/bin:/bin:/usr/sbin:/sbin",
        "LANG=C",
        "LC_ALL=C",
        "TMPDIR=/private/tmp",
        NULL
    };
    size_t writer_argc = 0;
    int result;
    bool actions_initialized = false;
    bool attributes_initialized = false;
    while (writer_argv[writer_argc] != NULL) writer_argc += 1;
    bootstrap_argv = calloc(writer_argc + 3, sizeof(*bootstrap_argv));
    if (bootstrap_argv == NULL) return ENOMEM;
    bootstrap_argv[0] = (char *)helper_path;
    bootstrap_argv[1] = "writer-bootstrap";
    for (size_t index = 0; index < writer_argc; index += 1) {
        bootstrap_argv[index + 2] = writer_argv[index];
    }

    result = posix_spawn_file_actions_init(&actions);
    if (result == 0) actions_initialized = true;
    if (result == 0) {
        result = posix_spawnattr_init(&attributes);
        if (result == 0) attributes_initialized = true;
    }
    if (result != 0) {
        if (actions_initialized) posix_spawn_file_actions_destroy(&actions);
        free(bootstrap_argv);
        return result;
    }
    sigemptyset(&mask);
    sigemptyset(&defaults);
    sigaddset(&defaults, SIGTERM);
    sigaddset(&defaults, SIGINT);
    sigaddset(&defaults, SIGHUP);
    sigaddset(&defaults, SIGPIPE);
    if ((result = posix_spawnattr_setflags(&attributes, flags)) == 0)
        result = posix_spawnattr_setsigmask(&attributes, &mask);
    if (result == 0) result = posix_spawnattr_setsigdefault(&attributes, &defaults);
    if (result == 0) result = posix_spawn_file_actions_addopen(
        &actions, STDIN_FILENO, "/dev/null", O_RDONLY, 0
    );
    if (result == 0) result = posix_spawn_file_actions_addinherit_np(&actions, STDOUT_FILENO);
    if (result == 0) result = posix_spawn_file_actions_addinherit_np(&actions, STDERR_FILENO);
    if (result == 0) result = posix_spawn_file_actions_adddup2(
        &actions, capability_write_fd, WRITER_LEASE_FD
    );
    if (result == 0) result = posix_spawn_file_actions_adddup2(
        &actions, start_read_fd, WRITER_START_FD
    );
    if (result == 0) result = posix_spawn_file_actions_adddup2(
        &actions, preparation_write_fd, WRITER_PREPARATION_FD
    );
    if (result == 0) result = posix_spawn_file_actions_adddup2(
        &actions, exec_write_fd, WRITER_EXEC_RESULT_FD
    );
    if (result == 0) result = posix_spawn_file_actions_addinherit_np(&actions, WRITER_EXEC_FD);
    if (result == 0) result = posix_spawn_file_actions_addinherit_np(&actions, WRITER_ENV_FD);
    if (result == 0) result = posix_spawn_file_actions_addclose(&actions, EVENT_FD);
    if (result == 0) result = posix_spawn_file_actions_addclose(&actions, capability_write_fd);
    if (result == 0) result = posix_spawn_file_actions_addclose(&actions, start_read_fd);
    if (result == 0) result = posix_spawn_file_actions_addclose(&actions, preparation_write_fd);
    if (result == 0) result = posix_spawn_file_actions_addclose(&actions, exec_write_fd);
    if (result == 0) {
        result = posix_spawn(
            writer_pid,
            helper_path,
            &actions,
            &attributes,
            bootstrap_argv,
            bootstrap_environment
        );
    }
    if (actions_initialized) posix_spawn_file_actions_destroy(&actions);
    if (attributes_initialized) posix_spawnattr_destroy(&attributes);
    free(bootstrap_argv);
    return result;
}

static int stop_unstarted_writer(
    pid_t writer_pid,
    int start_write_fd,
    int capability_read_fd,
    int preparation_read_fd,
    int exec_read_fd
) {
    int status;
    uint64_t started = monotonic_milliseconds();
    if (start_write_fd >= 0) close(start_write_fd);
    if (preparation_read_fd >= 0) close(preparation_read_fd);
    if (exec_read_fd >= 0) close(exec_read_fd);
    for (;;) {
        pid_t waited = waitpid(writer_pid, &status, WNOHANG);
        if (waited == writer_pid || (waited < 0 && errno == ECHILD)) {
            if (capability_read_fd >= 0) close(capability_read_fd);
            return 0;
        }
        if (waited < 0 && errno != EINTR) break;
        uint64_t now = monotonic_milliseconds();
        if (started != 0 && now >= started && now - started >= TERM_GRACE_MS) break;
        sleep_milliseconds(10);
    }
    if (kill(writer_pid, SIGKILL) != 0 && errno != ESRCH) {
        if (capability_read_fd >= 0) close(capability_read_fd);
        return -1;
    }
    while (waitpid(writer_pid, &status, 0) < 0) {
        if (errno == EINTR) continue;
        if (errno == ECHILD) break;
        if (capability_read_fd >= 0) close(capability_read_fd);
        return -1;
    }
    if (capability_read_fd >= 0) close(capability_read_fd);
    return 0;
}

static int run_guard(
    const char *helper_path,
    const char *lock_path,
    const char *nonce,
    char **writer_argv
) {
    int lock_fd = -1;
    int capability_pipe[2];
    int sentinel_command_pipe[2];
    int sentinel_status_pipe[2];
    int start_pipe[2];
    int preparation_pipe[2];
    int exec_pipe[2];
    pid_t sentinel_pid = -1;
    pid_t writer_pid = -1;
    struct stat lock_identity;
    struct stat writer_identity;
    struct preparation_status preparation;
    struct process_identity sentinel_identity;
    struct process_identity writer_process;
    struct capability_identity controller_capability;
    struct capability_identity writer_capability;
    struct sentinel_status sentinel_status;
    char line[CONTROL_LINE_MAX];
    char command[32];
    int exec_error = 0;
    int control_result = 0;
    int sentinel_wait;
    uint32_t cleanup_reason = 0;
    int acquired;

    if (!safe_writer_executable(WRITER_EXEC_FD, writer_argv[0], NULL, &writer_identity)) {
        return fail_message("writer executable identity is unsafe", EXIT_PREPARE);
    }
    if (make_cloexec_pipe(capability_pipe) != 0
        || make_cloexec_pipe(sentinel_command_pipe) != 0
        || make_cloexec_pipe(sentinel_status_pipe) != 0
        || make_cloexec_pipe(start_pipe) != 0
        || make_cloexec_pipe(preparation_pipe) != 0
        || make_cloexec_pipe(exec_pipe) != 0) {
        return fail_errno("guardian pipe", EXIT_PREPARE);
    }
    if (!pipe_identity_for_fd(capability_pipe[0], &controller_capability)) {
        return fail_message("capability pipe identity unavailable", EXIT_PREPARE);
    }
    int spawn_result = spawn_writer_bootstrap(
        &writer_pid,
        helper_path,
        writer_argv,
        capability_pipe[1],
        start_pipe[0],
        preparation_pipe[1],
        exec_pipe[1]
    );
    if (spawn_result != 0) {
        close(capability_pipe[1]);
        errno = spawn_result;
        return fail_errno("writer posix_spawn bootstrap", EXIT_PREPARE);
    }

    close(WRITER_EXEC_FD);
    close(WRITER_ENV_FD);
    close(capability_pipe[1]);
    close(start_pipe[0]);
    close(preparation_pipe[1]);
    close(exec_pipe[1]);
    if (wait_for_preparation(preparation_pipe[0], &preparation) != 0
        || !preparation.ok
        || preparation.pgid != writer_pid
        || preparation.pgid == getpgrp()
        || preparation.exec_device != (unsigned long long)writer_identity.st_dev
        || preparation.exec_inode != (unsigned long long)writer_identity.st_ino
        || preparation.exec_uid != (unsigned int)writer_identity.st_uid
        || preparation.exec_mode != (unsigned int)(writer_identity.st_mode & 07777)
        || !read_process_identity(writer_pid, &writer_process)
        || writer_process.pgid != writer_pid) {
        stop_unstarted_writer(
            writer_pid, start_pipe[1], capability_pipe[0],
            preparation_pipe[0], exec_pipe[0]
        );
        return fail_message("writer bootstrap preparation failed", EXIT_PREPARE);
    }
    close(preparation_pipe[0]);
    writer_capability.handle = preparation.capability_handle;
    writer_capability.peer_handle = preparation.capability_peer_handle;
    if (!same_pipe_identity(&writer_capability, &controller_capability)
        || !capability_exact_in_writer(&writer_process, &writer_capability)) {
        stop_unstarted_writer(
            writer_pid, start_pipe[1], capability_pipe[0], -1, exec_pipe[0]
        );
        return fail_message("writer capability preparation failed", EXIT_PREPARE);
    }

    sentinel_pid = fork();
    if (sentinel_pid < 0) {
        stop_unstarted_writer(
            writer_pid, start_pipe[1], capability_pipe[0], -1, exec_pipe[0]
        );
        return fail_errno("sentinel fork", EXIT_PREPARE);
    }
    if (sentinel_pid == 0) {
        int result;
        close(sentinel_command_pipe[1]);
        close(sentinel_status_pipe[0]);
        close(start_pipe[1]);
        close(exec_pipe[0]);
        result = sentinel_process(
            lock_path,
            nonce,
            sentinel_command_pipe[0],
            sentinel_status_pipe[1],
            capability_pipe[0],
            getppid(),
            writer_argv,
            &writer_identity
        );
        _exit(result);
    }
    close(sentinel_command_pipe[0]);
    close(sentinel_status_pipe[1]);
    if (!read_process_identity(sentinel_pid, &sentinel_identity)) {
        close(sentinel_command_pipe[1]);
        stop_unstarted_writer(
            writer_pid, start_pipe[1], capability_pipe[0], -1, exec_pipe[0]
        );
        kill(sentinel_pid, SIGKILL);
        waitpid(sentinel_pid, NULL, 0);
        return fail_message("sentinel identity unavailable", EXIT_PREPARE);
    }

    acquired = acquire_lock_file(lock_path, &lock_fd, &lock_identity);
    if (acquired != 0) {
        close(sentinel_command_pipe[1]);
        close(sentinel_status_pipe[0]);
        stop_unstarted_writer(
            writer_pid, start_pipe[1], capability_pipe[0], -1, exec_pipe[0]
        );
        waitpid(sentinel_pid, NULL, 0);
        return acquired;
    }
    if (set_ofd_range_lock(lock_fd, SENTINEL_LOCK_BYTE, F_UNLCK) != 0
        || send_sentinel_command(
            sentinel_command_pipe[1],
            SENTINEL_COMMAND_ACQUIRE,
            0,
            NULL,
            NULL,
            &lock_identity
        ) != 0) {
        close(sentinel_command_pipe[1]);
        close(sentinel_status_pipe[0]);
        stop_unstarted_writer(
            writer_pid, start_pipe[1], capability_pipe[0], -1, exec_pipe[0]
        );
        kill(sentinel_pid, SIGKILL);
        waitpid(sentinel_pid, NULL, 0);
        close_lock_description(lock_fd);
        return fail_message("sentinel lock handoff failed", EXIT_PREPARE);
    }
    sentinel_wait = wait_sentinel_status(sentinel_status_pipe[0], &sentinel_status, EXEC_TIMEOUT_MS);
    if (sentinel_wait != 1 || sentinel_status.type != SENTINEL_STATUS_READY
        || sentinel_status.sentinel_pid != sentinel_pid
        || sentinel_identity.start_sec != sentinel_status.sentinel_start_sec
        || sentinel_identity.start_usec != sentinel_status.sentinel_start_usec
        || !process_identity_live(&sentinel_identity)) {
        close(sentinel_command_pipe[1]);
        close(sentinel_status_pipe[0]);
        stop_unstarted_writer(
            writer_pid, start_pipe[1], capability_pipe[0], -1, exec_pipe[0]
        );
        kill(sentinel_pid, SIGKILL);
        waitpid(sentinel_pid, NULL, 0);
        close_lock_description(lock_fd);
        return fail_message("sentinel did not acquire its independent lock byte", EXIT_PREPARE);
    }

    if (send_sentinel_command(
            sentinel_command_pipe[1],
            SENTINEL_COMMAND_ENROLL,
            0,
            &writer_process,
            &writer_capability,
            NULL
        ) != 0
        || wait_sentinel_status(sentinel_status_pipe[0], &sentinel_status, EXEC_TIMEOUT_MS) != 1
        || sentinel_status.type != SENTINEL_STATUS_ENROLLED
        || sentinel_status.writer_pid != writer_pid) {
        close(start_pipe[1]);
        close(exec_pipe[0]);
        cleanup_reason = SENTINEL_REASON_PROTOCOL_PREPARED;
        send_sentinel_command(
            sentinel_command_pipe[1], SENTINEL_COMMAND_CLEANUP,
            cleanup_reason, &writer_process, &writer_capability, NULL
        );
        goto await_sentinel;
    }
    if (emit_event(
            nonce,
            "PREPARED",
            "sentinel_pid=%d sentinel_start_sec=%llu sentinel_start_usec=%llu writer_pid=%d pgid=%d writer_start_sec=%llu writer_start_usec=%llu lease_fd=%d capability_handle=%llu capability_peer_handle=%llu exec_device=%llu exec_inode=%llu exec_uid=%u exec_mode=%u",
            sentinel_pid,
            (unsigned long long)sentinel_identity.start_sec,
            (unsigned long long)sentinel_identity.start_usec,
            writer_pid,
            writer_process.pgid,
            (unsigned long long)writer_process.start_sec,
            (unsigned long long)writer_process.start_usec,
            WRITER_LEASE_FD,
            (unsigned long long)writer_capability.handle,
            (unsigned long long)writer_capability.peer_handle,
            preparation.exec_device,
            preparation.exec_inode,
            preparation.exec_uid,
            preparation.exec_mode
        ) != 0) {
        cleanup_reason = SENTINEL_REASON_EVENT_LOST;
    }

    while (cleanup_reason == 0) {
        struct pollfd descriptors[2] = {
            { .fd = STDIN_FILENO, .events = POLLIN | POLLHUP | POLLERR, .revents = 0 },
            { .fd = sentinel_status_pipe[0], .events = POLLIN | POLLHUP | POLLERR, .revents = 0 }
        };
        int poll_result;
        if (caught_signal != 0) {
            emit_event(nonce, "GUARDIAN_SIGNAL", "signal=%d phase=prepared", caught_signal);
            cleanup_reason = SENTINEL_REASON_GUARDIAN_SIGNAL;
            break;
        }
        poll_result = poll(descriptors, 2, 100);
        if (poll_result < 0 && errno == EINTR) continue;
        if (poll_result < 0) {
            cleanup_reason = SENTINEL_REASON_PROTOCOL_PREPARED;
            break;
        }
        if ((descriptors[1].revents & (POLLIN | POLLHUP | POLLERR)) != 0) {
            sentinel_wait = wait_sentinel_status(sentinel_status_pipe[0], &sentinel_status, 0);
            if (sentinel_wait == 1 && sentinel_status.type == SENTINEL_STATUS_RELEASED) goto sentinel_released;
            if (sentinel_wait <= 0) goto sentinel_died;
        }
        if ((descriptors[0].revents & (POLLIN | POLLHUP | POLLERR)) != 0) {
            control_result = read_line(STDIN_FILENO, line, sizeof(line));
            break;
        }
    }
    if (cleanup_reason == 0
        && (control_result <= 0
            || command_name(line, nonce, command, sizeof(command)) != 0
            || (strcmp(command, "EXEC") != 0 && strcmp(command, "ABORT") != 0))) {
        emit_event(nonce, "PROTOCOL_ERROR", "phase=prepared");
        cleanup_reason = SENTINEL_REASON_PROTOCOL_PREPARED;
    }
    if (cleanup_reason == 0 && strcmp(command, "ABORT") == 0) {
        cleanup_reason = SENTINEL_REASON_ABORT;
    }
    if (cleanup_reason != 0) {
        close(start_pipe[1]);
        close(exec_pipe[0]);
        send_sentinel_command(
            sentinel_command_pipe[1], SENTINEL_COMMAND_CLEANUP,
            cleanup_reason, &writer_process, &writer_capability, NULL
        );
        goto await_sentinel;
    }

    if (write_all(start_pipe[1], "X", 1) != 0) {
        close(start_pipe[1]);
        close(exec_pipe[0]);
        cleanup_reason = SENTINEL_REASON_EXEC_FAILED;
        send_sentinel_command(
            sentinel_command_pipe[1], SENTINEL_COMMAND_CLEANUP,
            cleanup_reason, &writer_process, &writer_capability, NULL
        );
        goto await_sentinel;
    }
    close(start_pipe[1]);
    {
        int exec_result = wait_for_exec_result(exec_pipe[0], &exec_error);
        close(exec_pipe[0]);
        if (exec_result != 0) {
            emit_event(
                nonce,
                "EXEC_FAILED",
                "error_number=%d",
                exec_result > 0 ? exec_error : ETIMEDOUT
            );
            cleanup_reason = SENTINEL_REASON_EXEC_FAILED;
            send_sentinel_command(
                sentinel_command_pipe[1], SENTINEL_COMMAND_CLEANUP,
                cleanup_reason, &writer_process, &writer_capability, NULL
            );
            goto await_sentinel;
        }
    }
    if (send_sentinel_command(
            sentinel_command_pipe[1], SENTINEL_COMMAND_RUNNING, 0,
            &writer_process, &writer_capability, NULL
        ) != 0) {
        goto sentinel_died;
    }
    sentinel_wait = wait_sentinel_status(
        sentinel_status_pipe[0],
        &sentinel_status,
        EXEC_TIMEOUT_MS
    );
    if (sentinel_wait <= 0) goto sentinel_died;
    if (sentinel_status.type == SENTINEL_STATUS_FAIL_HOLD) {
        close(sentinel_command_pipe[1]);
        close(sentinel_status_pipe[0]);
        return controller_descendant_fail_hold(
            lock_fd,
            lock_path,
            &lock_identity,
            nonce
        );
    }
    if (sentinel_wait != 1 || sentinel_status.type != SENTINEL_STATUS_RUNNING
        || sentinel_status.writer_pid != writer_pid) {
        cleanup_reason = SENTINEL_REASON_PROTOCOL;
        send_sentinel_command(
            sentinel_command_pipe[1], SENTINEL_COMMAND_CLEANUP,
            cleanup_reason, &writer_process, &writer_capability, NULL
        );
        goto await_sentinel;
    }
    if (emit_event(
            nonce,
            "RUNNING",
            "sentinel_pid=%d sentinel_start_sec=%llu sentinel_start_usec=%llu writer_pid=%d pgid=%d writer_start_sec=%llu writer_start_usec=%llu lease_fd=%d capability_handle=%llu capability_peer_handle=%llu exec_device=%llu exec_inode=%llu exec_uid=%u exec_mode=%u",
            sentinel_pid,
            (unsigned long long)sentinel_identity.start_sec,
            (unsigned long long)sentinel_identity.start_usec,
            writer_pid,
            writer_process.pgid,
            (unsigned long long)writer_process.start_sec,
            (unsigned long long)writer_process.start_usec,
            WRITER_LEASE_FD,
            (unsigned long long)writer_capability.handle,
            (unsigned long long)writer_capability.peer_handle,
            preparation.exec_device,
            preparation.exec_inode,
            preparation.exec_uid,
            preparation.exec_mode
        ) != 0) {
        cleanup_reason = SENTINEL_REASON_EVENT_LOST;
    }

    while (cleanup_reason == 0) {
        struct pollfd descriptors[2] = {
            { .fd = STDIN_FILENO, .events = POLLIN | POLLHUP | POLLERR, .revents = 0 },
            { .fd = sentinel_status_pipe[0], .events = POLLIN | POLLHUP | POLLERR, .revents = 0 }
        };
        int poll_result;
        if (caught_signal != 0) {
            emit_event(nonce, "GUARDIAN_SIGNAL", "signal=%d phase=running", caught_signal);
            cleanup_reason = SENTINEL_REASON_GUARDIAN_SIGNAL;
            break;
        }
        poll_result = poll(descriptors, 2, 100);
        if (poll_result < 0 && errno == EINTR) continue;
        if (poll_result < 0) {
            cleanup_reason = SENTINEL_REASON_PROTOCOL;
            break;
        }
        if ((descriptors[1].revents & (POLLIN | POLLHUP | POLLERR)) != 0) {
            sentinel_wait = wait_sentinel_status(sentinel_status_pipe[0], &sentinel_status, 0);
            if (sentinel_wait == 1 && sentinel_status.type == SENTINEL_STATUS_RELEASED) goto sentinel_released;
            if (sentinel_wait == 1 && sentinel_status.type == SENTINEL_STATUS_FAIL_HOLD) {
                close(sentinel_command_pipe[1]);
                close(sentinel_status_pipe[0]);
                return controller_descendant_fail_hold(
                    lock_fd,
                    lock_path,
                    &lock_identity,
                    nonce
                );
            }
            if (sentinel_wait <= 0) goto sentinel_died;
        }
        if ((descriptors[0].revents & (POLLIN | POLLHUP | POLLERR)) != 0) {
            control_result = read_line(STDIN_FILENO, line, sizeof(line));
            if (control_result <= 0
                || command_name(line, nonce, command, sizeof(command)) != 0
                || strcmp(command, "TERMINATE") != 0) {
                emit_event(nonce, "PROTOCOL_ERROR", "phase=running");
                cleanup_reason = SENTINEL_REASON_PROTOCOL;
            } else {
                cleanup_reason = SENTINEL_REASON_TERMINATE;
            }
        }
    }
    send_sentinel_command(
        sentinel_command_pipe[1], SENTINEL_COMMAND_CLEANUP,
        cleanup_reason, &writer_process, &writer_capability, NULL
    );

await_sentinel:
    for (;;) {
        sentinel_wait = wait_sentinel_status(sentinel_status_pipe[0], &sentinel_status, 1000);
        if (sentinel_wait == 1 && sentinel_status.type == SENTINEL_STATUS_RELEASED) break;
        if (sentinel_wait <= 0) goto sentinel_died;
    }

sentinel_released:
    close(sentinel_command_pipe[1]);
    close(sentinel_status_pipe[0]);
    return finish_after_sentinel_release(
        lock_fd, lock_path, &lock_identity, nonce, capability_pipe[0],
        sentinel_pid, &writer_process, &sentinel_status
    );

sentinel_died:
    {
        int sentinel_exit_status = 0;
        int exit_code = -1;
        int term_signal = 0;
        pid_t waited = waitpid(sentinel_pid, &sentinel_exit_status, WNOHANG);
        if (waited == sentinel_pid) {
            if (WIFEXITED(sentinel_exit_status)) exit_code = WEXITSTATUS(sentinel_exit_status);
            if (WIFSIGNALED(sentinel_exit_status)) term_signal = WTERMSIG(sentinel_exit_status);
        }
        emit_event(
            nonce,
            "SENTINEL_DIED",
            "sentinel_pid=%d exit_code=%d term_signal=%d phase=%s",
            sentinel_pid,
            exit_code,
            term_signal,
            cleanup_reason == 0 ? "prepared" : "running"
        );
        close(sentinel_command_pipe[1]);
        close(sentinel_status_pipe[0]);
        emit_event(
            nonce,
            "DESCENDANT_UNPROVABLE",
            "reason=sentinel_lost writer_pid=%d pgid=%d proc_fflags=0",
            writer_process.pid,
            writer_process.pgid
        );
        return controller_fail_hold_after_sentinel_loss(
            lock_fd, lock_path, &lock_identity, nonce, capability_pipe[0],
            &writer_process, SENTINEL_REASON_SENTINEL_DIED
        );
    }
}

static int run_identity_selftest(void) {
    struct process_identity identity;
    struct process_identity stale;
    if (!read_process_identity(getpid(), &identity)
        || !process_identity_live(&identity)) {
        return EXIT_IDENTITY_STALLED;
    }
    stale = identity;
    if (stale.start_usec == UINT64_MAX) stale.start_usec -= 1;
    else stale.start_usec += 1;
    if (process_identity_live(&stale)) {
        return EXIT_IDENTITY_STALLED;
    }
    return 0;
}

int main(int argc, char **argv) {
    struct sigaction action;

    memset(&action, 0, sizeof(action));
    action.sa_handler = signal_handler;
    sigemptyset(&action.sa_mask);
    sigaction(SIGTERM, &action, NULL);
    sigaction(SIGINT, &action, NULL);
    sigaction(SIGHUP, &action, NULL);
    signal(SIGPIPE, SIG_IGN);

    if (argc >= 3 && strcmp(argv[1], "writer-bootstrap") == 0 && argv[2][0] == '/') {
        return writer_bootstrap(&argv[2]);
    }
    if (argc == 2 && strcmp(argv[1], "identity-selftest") == 0) {
        return run_identity_selftest();
    }
    if (fcntl(EVENT_FD, F_GETFD) < 0) {
        return fail_message("dedicated event fd 3 is unavailable", EXIT_USAGE);
    }
    if (argc < 4 || !valid_nonce(argv[3])) {
        return fail_message(
            "usage: backend-operation-lock <hold|guard> <absolute-lock-file> <64-hex-nonce> [absolute-writer [args...]]",
            EXIT_USAGE
        );
    }
    if (strcmp(argv[1], "hold") == 0 && argc == 4) {
        return run_hold(argv[2], argv[3]);
    }
    if (strcmp(argv[1], "guard") == 0 && argc >= 5 && argv[4][0] == '/') {
        if (fcntl(WRITER_EXEC_FD, F_GETFD) < 0 || fcntl(WRITER_ENV_FD, F_GETFD) < 0) {
            return fail_message("guardian writer executable or environment fd is unavailable", EXIT_USAGE);
        }
        return run_guard(argv[0], argv[2], argv[3], &argv[4]);
    }
    return fail_message("invalid mode or writer command", EXIT_USAGE);
}
