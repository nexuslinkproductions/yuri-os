#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/clonefile.h>
#include <sys/stat.h>
#include <unistd.h>
#include <copyfile.h>
#include <CommonCrypto/CommonDigest.h>
#ifdef __APPLE__
#include <sys/time.h>
#endif

static int fail(const char *message) {
    fprintf(stderr, "BACKEND_DATA_SWAP_FAILED %s\n", message);
    return 1;
}

/* Parse a non-negative decimal integer (dev_t or ino_t) from a string. The first char
 * MUST be a decimal digit; strtoull's acceptance of leading '-', '+', and whitespace is
 * rejected explicitly so a malformed identity (e.g. "-1", "+5", " 12") cannot wrap to a
 * huge value or be silently accepted. Returns 0 on success, -1 on error
 * (BACKEND_DATA_SWAP_FAILED line on stderr). */
static int parse_uint64(const char *s, unsigned long long *out, const char *label) {
    if (s == NULL || *s == '\0') {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED %s: empty\n", label);
        return -1;
    }
    if (s[0] < '0' || s[0] > '9') {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED %s: invalid (%s)\n", label, s);
        return -1;
    }
    errno = 0;
    char *end = NULL;
    unsigned long long v = strtoull(s, &end, 10);
    if (errno != 0 || end == s || *end != '\0') {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED %s: invalid (%s)\n", label, s);
        return -1;
    }
    *out = v;
    return 0;
}

/* Walk from '/' to the PARENT of full_path via a descriptor-relative openat chain.
 *
 * Each intermediate component is opened with O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC, so a
 * symlink substituted at ANY component is rejected at that step (O_NOFOLLOW covers the
 * final component of each individual openat). This defeats the intermediate-component
 * TOCTOU window that a bare open(path, O_NOFOLLOW) leaves open: O_NOFOLLOW only protects
 * the LAST path component, leaving every parent component re-resolvable mid-walk.
 *
 * full_path must be absolute, non-root, canonical: no "//", no trailing '/', no "." or
 * ".." components. The final component (basename) is NOT opened here; the caller opens
 * or operates on it relative to the returned parent fd.
 *
 * Returns parent fd (>=0) on success, -1 on error (message already on stderr). Caller
 * must close the returned fd. Basename (last component) copied to basename_out. */
static int walk_to_parent(const char *full_path, char *basename_out, size_t basename_cap) {
    if (full_path == NULL || full_path[0] != '/' || strcmp(full_path, "/") == 0) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED walk: path must be absolute non-root\n");
        return -1;
    }
    size_t len = strlen(full_path);
    if (full_path[len - 1] == '/') {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED walk: trailing slash rejected\n");
        return -1;
    }
    int parent_fd = open("/", O_RDONLY | O_DIRECTORY | O_CLOEXEC);
    if (parent_fd < 0) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED walk open(/): %s\n", strerror(errno));
        return -1;
    }
    const char *seg_start = full_path + 1; /* skip leading '/' */
    while (1) {
        const char *slash = strchr(seg_start, '/');
        if (slash == NULL) break; /* seg_start is the basename */
        size_t seglen = (size_t)(slash - seg_start);
        if (seglen == 0 || seglen > NAME_MAX) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED walk: bad component length\n");
            close(parent_fd);
            return -1;
        }
        char compbuf[NAME_MAX + 1];
        memcpy(compbuf, seg_start, seglen);
        compbuf[seglen] = '\0';
        if (strcmp(compbuf, ".") == 0 || strcmp(compbuf, "..") == 0) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED walk: '.' or '..' rejected (%s)\n", compbuf);
            close(parent_fd);
            return -1;
        }
        int next_fd = openat(parent_fd, compbuf, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
        if (next_fd < 0) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED walk openat(%s): %s\n", compbuf, strerror(errno));
            close(parent_fd);
            return -1;
        }
        close(parent_fd);
        parent_fd = next_fd;
        seg_start = slash + 1;
        if (*seg_start == '\0') {
            /* Defensive: trailing-slash rejection above should have caught this. */
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED walk: unexpected end after slash\n");
            close(parent_fd);
            return -1;
        }
    }
    size_t base_len = strlen(seg_start);
    if (base_len == 0 || base_len > NAME_MAX || base_len >= basename_cap) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED walk: bad basename length\n");
        close(parent_fd);
        return -1;
    }
    if (strcmp(seg_start, ".") == 0 || strcmp(seg_start, "..") == 0) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED walk: '.' or '..' basename rejected\n");
        close(parent_fd);
        return -1;
    }
    memcpy(basename_out, seg_start, base_len);
    basename_out[base_len] = '\0';
    return parent_fd;
}

/* ---- full-sync: descriptor-relative recursive F_FULLFSYNC (files) + fsync (dirs) ---- */

static int full_sync_file_at(int parent_fd, const char *name, const struct stat *pre) {
    int fd = openat(parent_fd, name, O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
    if (fd < 0) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED full-sync openat file(%s): %s\n", name, strerror(errno));
        return 1;
    }
    struct stat opened;
    if (fstat(fd, &opened) != 0) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED full-sync fstat file(%s): %s\n", name, strerror(errno));
        close(fd);
        return 1;
    }
    if (!S_ISREG(opened.st_mode)
        || opened.st_dev != pre->st_dev || opened.st_ino != pre->st_ino) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED full-sync file replacement detected (%s)\n", name);
        close(fd);
        return 1;
    }
    if (fcntl(fd, F_FULLFSYNC) != 0) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED full-sync F_FULLFSYNC(%s): %s\n", name, strerror(errno));
        close(fd);
        return 1;
    }
    if (close(fd) != 0) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED full-sync close(%s): %s\n", name, strerror(errno));
        return 1;
    }
    return 0;
}

/* Recursive F_FULLFSYNC of every regular file + fsync of every directory (deepest-first
 * post-order). Single-pass readdir: regular files synced immediately; subdirs collected
 * with their (dev,ino) snapshot and recursed after the pass. Symlinks/specials rejected.
 * errno is reset before each readdir and checked on NULL return so an I/O error is not
 * silently treated as EOF. For every entry we capture a pre-open fstatat snapshot, then
 * fstat the opened fd and require (dev,ino,type) to match - catching replacement between
 * check and open (including regular->regular). No PATH_MAX concatenation. */
static int full_sync_tree_fd(int rootfd) {
    DIR *dir = fdopendir(dup(rootfd));
    if (dir == NULL) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED full-sync fdopendir: %s\n", strerror(errno));
        return 1;
    }
    int current_fd = dirfd(dir);
    struct child_entry { char *name; dev_t dev; ino_t ino; };
    struct child_entry *subdirs = NULL;
    size_t n = 0, cap = 0;
    int rc = 0;
    struct dirent *entry;
    rewinddir(dir);
    while (1) {
        errno = 0;
        entry = readdir(dir);
        if (entry == NULL) {
            if (errno != 0) {
                fprintf(stderr, "BACKEND_DATA_SWAP_FAILED full-sync readdir: %s\n", strerror(errno));
                rc = 1;
            }
            break;
        }
        if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) continue;
        struct stat pre;
        if (fstatat(current_fd, entry->d_name, &pre, AT_SYMLINK_NOFOLLOW) != 0) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED full-sync fstatat(%s): %s\n", entry->d_name, strerror(errno));
            rc = 1; goto done;
        }
        if (S_ISLNK(pre.st_mode)) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED full-sync symlink rejected (%s)\n", entry->d_name);
            rc = 1; goto done;
        }
        if (S_ISREG(pre.st_mode)) {
            if (full_sync_file_at(current_fd, entry->d_name, &pre) != 0) { rc = 1; goto done; }
        } else if (S_ISDIR(pre.st_mode)) {
            if (n == cap) {
                size_t newcap = cap ? cap * 2 : 8;
                struct child_entry *tmp = realloc(subdirs, newcap * sizeof(*subdirs));
                if (!tmp) { fprintf(stderr, "BACKEND_DATA_SWAP_FAILED full-sync oom\n"); rc = 1; goto done; }
                subdirs = tmp; cap = newcap;
            }
            subdirs[n].name = strdup(entry->d_name);
            if (!subdirs[n].name) { fprintf(stderr, "BACKEND_DATA_SWAP_FAILED full-sync oom\n"); rc = 1; goto done; }
            subdirs[n].dev = pre.st_dev;
            subdirs[n].ino = pre.st_ino;
            n++;
        } else {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED full-sync special file rejected (%s)\n", entry->d_name);
            rc = 1; goto done;
        }
    }
    closedir(dir);
    dir = NULL;
    for (size_t i = 0; i < n; i++) {
        int childfd = openat(rootfd, subdirs[i].name, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
        if (childfd < 0) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED full-sync openat dir(%s): %s\n", subdirs[i].name, strerror(errno));
            rc = 1; goto done;
        }
        struct stat opened;
        if (fstat(childfd, &opened) != 0
            || !S_ISDIR(opened.st_mode)
            || opened.st_dev != subdirs[i].dev || opened.st_ino != subdirs[i].ino) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED full-sync dir replacement detected (%s)\n", subdirs[i].name);
            close(childfd);
            rc = 1; goto done;
        }
        int childrc = full_sync_tree_fd(childfd);
        close(childfd);
        if (childrc != 0) { rc = 1; goto done; }
    }
    if (fsync(rootfd) != 0) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED full-sync dir fsync: %s\n", strerror(errno));
        rc = 1; goto done;
    }
done:
    if (dir) closedir(dir);
    for (size_t i = 0; i < n; i++) free(subdirs[i].name);
    free(subdirs);
    return rc;
}

/* Verify a directory entry (via parent fd + fstatat AT_SYMLINK_NOFOLLOW) matches the
 * expected (dev,ino) and is a real directory, not a symlink or special. Returns 0 ok. */
static int verify_dir_identity(int parent_fd, const char *name,
                               unsigned long long expected_dev, unsigned long long expected_ino,
                               const char *label, struct stat *out_st) {
    struct stat st;
    if (fstatat(parent_fd, name, &st, AT_SYMLINK_NOFOLLOW) != 0) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED %s fstatat(%s): %s\n", label, name, strerror(errno));
        return 1;
    }
    if (!S_ISDIR(st.st_mode) || S_ISLNK(st.st_mode)
        || (unsigned long long)st.st_dev != expected_dev
        || (unsigned long long)st.st_ino != expected_ino) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED %s identity mismatch (expected dev=%llu ino=%llu, got dev=%llu ino=%llu mode=%o)\n",
                label, expected_dev, expected_ino,
                (unsigned long long)st.st_dev, (unsigned long long)st.st_ino, st.st_mode);
        return 1;
    }
    if (out_st) *out_st = st;
    return 0;
}

static int same_file_state(const struct stat *left, const struct stat *right) {
    return left->st_dev == right->st_dev
        && left->st_ino == right->st_ino
        && left->st_mode == right->st_mode
        && left->st_nlink == right->st_nlink
        && left->st_size == right->st_size
        && left->st_mtimespec.tv_sec == right->st_mtimespec.tv_sec
        && left->st_mtimespec.tv_nsec == right->st_mtimespec.tv_nsec
        && left->st_ctimespec.tv_sec == right->st_ctimespec.tv_sec
        && left->st_ctimespec.tv_nsec == right->st_ctimespec.tv_nsec;
}

/* A successful fclonefileat creates the destination atomically. On every later
 * validation or durability failure, retain that name and its snapshot namespace
 * as forensic evidence: same-destination retry must fail closed, while a later
 * recovery transaction can use its fresh nonce/path. Never unlink by pathname.
 * Close every held descriptor, make one best-effort parent durability attempt,
 * and emit one bounded telemetry line without replacing the primary errno. */
static int retain_failed_clone(int source_parent_fd, int source_fd,
                               int destination_parent_fd, int destination_fd,
                               const char *destination_base, int primary_errno) {
    int destination_close_rc = 0, destination_close_errno = 0;
    int source_close_rc = 0, source_close_errno = 0;
    if (destination_fd >= 0) {
        errno = 0;
        destination_close_rc = close(destination_fd);
        destination_close_errno = errno;
    }
    if (source_fd >= 0) {
        errno = 0;
        source_close_rc = close(source_fd);
        source_close_errno = errno;
    }

    errno = 0;
    int parent_fsync_rc = fsync(destination_parent_fd);
    int parent_fsync_errno = errno;

    errno = 0;
    int source_parent_close_rc = close(source_parent_fd);
    int source_parent_close_errno = errno;
    errno = 0;
    int destination_parent_close_rc = close(destination_parent_fd);
    int destination_parent_close_errno = errno;
    fprintf(stderr,
            "BACKEND_DATA_SWAP_FAILED clone retained for forensics "
            "(destination=%.*s; primary-errno=%d; destination-close=%d/%d; "
            "source-close=%d/%d; parent-fsync=%d/%d; source-parent-close=%d/%d; "
            "destination-parent-close=%d/%d)\n",
            NAME_MAX, destination_base, primary_errno,
            destination_close_rc, destination_close_errno,
            source_close_rc, source_close_errno,
            parent_fsync_rc, parent_fsync_errno,
            source_parent_close_rc, source_parent_close_errno,
            destination_parent_close_rc, destination_parent_close_errno);
    errno = primary_errno != 0 ? primary_errno : EIO;
    return 1;
}

/* clone-file <source> <destination> <source-dev> <source-ino>
 *            <destination-parent-dev> <destination-parent-ino> <source-size>
 *
 * Source and destination parents are reached through walk_to_parent(), whose
 * openat(O_DIRECTORY|O_NOFOLLOW) chain rejects every symlink component. The
 * source itself is opened O_NOFOLLOW and pinned to the JS-observed dev/ino/size.
 * fclonefileat() atomically creates a new APFS clone in an exact, pinned parent;
 * there is deliberately no byte-copy fallback. The new file is re-attested as
 * regular, same-filesystem, different-inode, same-size, then F_FULLFSYNC'd and
 * its parent fsync'd. Source fd + pathname identity/state must remain unchanged
 * across the entire operation. Once created, any failed clone remains in its
 * fresh snapshot namespace for forensics; this command never deletes it. */
static int clone_file_exact(const char *source_path, const char *destination_path,
                            unsigned long long expected_source_dev,
                            unsigned long long expected_source_ino,
                            unsigned long long expected_parent_dev,
                            unsigned long long expected_parent_ino,
                            unsigned long long expected_source_size) {
    char source_base[NAME_MAX + 1], destination_base[NAME_MAX + 1];
    int source_parent_fd = walk_to_parent(source_path, source_base, sizeof(source_base));
    if (source_parent_fd < 0) return 1;
    int destination_parent_fd = walk_to_parent(
        destination_path, destination_base, sizeof(destination_base));
    if (destination_parent_fd < 0) {
        close(source_parent_fd);
        return 1;
    }

    struct stat destination_parent;
    if (fstat(destination_parent_fd, &destination_parent) != 0
        || !S_ISDIR(destination_parent.st_mode)
        || (unsigned long long)destination_parent.st_dev != expected_parent_dev
        || (unsigned long long)destination_parent.st_ino != expected_parent_ino) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED clone destination parent identity mismatch\n");
        close(source_parent_fd); close(destination_parent_fd);
        return 1;
    }

    struct stat source_path_before;
    if (fstatat(source_parent_fd, source_base, &source_path_before, AT_SYMLINK_NOFOLLOW) != 0
        || !S_ISREG(source_path_before.st_mode)
        || S_ISLNK(source_path_before.st_mode)
        || source_path_before.st_size < 0
        || (unsigned long long)source_path_before.st_dev != expected_source_dev
        || (unsigned long long)source_path_before.st_ino != expected_source_ino
        || (unsigned long long)source_path_before.st_size != expected_source_size) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED clone source identity mismatch\n");
        close(source_parent_fd); close(destination_parent_fd);
        return 1;
    }
    /* Hard-link escape: an inode reachable outside the intended tree shares
     * st_dev/st_ino with every link name. Identity pins alone cannot distinguish
     * that alias; require a single directory entry (nlink==1) before cloning. */
    if (source_path_before.st_nlink != 1) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED clone source must be a single-link regular file\n");
        close(source_parent_fd); close(destination_parent_fd);
        return 1;
    }
    if (source_path_before.st_dev != destination_parent.st_dev) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED clone source and destination are not on the same filesystem\n");
        close(source_parent_fd); close(destination_parent_fd);
        return 1;
    }

    int source_fd = openat(source_parent_fd, source_base, O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
    if (source_fd < 0) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED clone source openat(%s): %s\n",
                source_base, strerror(errno));
        close(source_parent_fd); close(destination_parent_fd);
        return 1;
    }
    struct stat source_opened;
    if (fstat(source_fd, &source_opened) != 0
        || !same_file_state(&source_path_before, &source_opened)) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED clone source replacement before open\n");
        close(source_fd); close(source_parent_fd); close(destination_parent_fd);
        return 1;
    }

    struct stat unexpected_destination;
    errno = 0;
    if (fstatat(destination_parent_fd, destination_base, &unexpected_destination,
                AT_SYMLINK_NOFOLLOW) == 0 || errno != ENOENT) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED clone destination must be absent\n");
        close(source_fd); close(source_parent_fd); close(destination_parent_fd);
        return 1;
    }
    if (fclonefileat(source_fd, destination_parent_fd, destination_base, 0) != 0) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED fclonefileat(%s): %s\n",
                destination_base, strerror(errno));
        close(source_fd); close(source_parent_fd); close(destination_parent_fd);
        return 1;
    }

    int destination_fd = -1;
    int primary_errno = 0;
#ifdef BACKEND_DATA_SWAP_CLONE_TEST_FAIL_AFTER_CREATE
    errno = EIO;
    primary_errno = errno;
    fprintf(stderr, "BACKEND_DATA_SWAP_FAILED injected post-clone failure: %s\n",
            strerror(primary_errno));
    goto clone_failed;
#endif

    destination_fd = openat(destination_parent_fd, destination_base,
                            O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
    if (destination_fd < 0) {
        primary_errno = errno;
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED clone destination openat(%s): %s\n",
                destination_base, strerror(primary_errno));
        goto clone_failed;
    }
    struct stat destination_opened;
    errno = 0;
    if (fstat(destination_fd, &destination_opened) != 0
        || !S_ISREG(destination_opened.st_mode)
        || destination_opened.st_dev != source_opened.st_dev
        || destination_opened.st_ino == source_opened.st_ino
        || destination_opened.st_size != source_opened.st_size) {
        primary_errno = errno != 0 ? errno : ESTALE;
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED clone destination identity mismatch\n");
        goto clone_failed;
    }
    if (fcntl(destination_fd, F_FULLFSYNC) != 0) {
        primary_errno = errno;
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED clone F_FULLFSYNC(%s): %s\n",
                destination_base, strerror(primary_errno));
        goto clone_failed;
    }
    if (fsync(destination_parent_fd) != 0) {
        primary_errno = errno;
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED clone destination parent fsync: %s\n",
                strerror(primary_errno));
        goto clone_failed;
    }

    struct stat destination_after, destination_path_after;
    struct stat source_after, source_path_after;
    errno = 0;
    if (fstat(destination_fd, &destination_after) != 0
        || fstatat(destination_parent_fd, destination_base, &destination_path_after,
                   AT_SYMLINK_NOFOLLOW) != 0
        || destination_after.st_dev != destination_opened.st_dev
        || destination_after.st_ino != destination_opened.st_ino
        || destination_after.st_size != destination_opened.st_size
        || destination_path_after.st_dev != destination_opened.st_dev
        || destination_path_after.st_ino != destination_opened.st_ino
        || !S_ISREG(destination_path_after.st_mode)
        || fstat(source_fd, &source_after) != 0
        || fstatat(source_parent_fd, source_base, &source_path_after,
                   AT_SYMLINK_NOFOLLOW) != 0
        || !same_file_state(&source_opened, &source_after)
        || !same_file_state(&source_after, &source_path_after)) {
        primary_errno = errno != 0 ? errno : ESTALE;
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED clone post-operation identity changed\n");
        goto clone_failed;
    }

    errno = 0;
    int destination_close_rc = close(destination_fd);
    int destination_close_errno = errno;
    destination_fd = -1;
    errno = 0;
    int source_close_rc = close(source_fd);
    int source_close_errno = errno;
    source_fd = -1;
    if (destination_close_rc != 0 || source_close_rc != 0) {
        primary_errno = destination_close_rc != 0
            ? destination_close_errno : source_close_errno;
        fprintf(stderr,
                "BACKEND_DATA_SWAP_FAILED clone close (destination rc=%d errno=%d:%s; source rc=%d errno=%d:%s)\n",
                destination_close_rc, destination_close_errno, strerror(destination_close_errno),
                source_close_rc, source_close_errno, strerror(source_close_errno));
        goto clone_failed;
    }
    close(source_parent_fd);
    close(destination_parent_fd);
    return 0;

clone_failed:
    return retain_failed_clone(
        source_parent_fd, source_fd,
        destination_parent_fd, destination_fd,
        destination_base, primary_errno);
}

/* ---- copy-tree: two-phase descriptor-relative mirror ----
 * Phase 1 (PIN): openat every regular file / directory under held parent fds;
 *                retain those fds (inode pins) AND sha256 of file bytes via the
 *                held fd (content pin). Pathname swaps after pin cannot change
 *                which inode a held fd refers to; content mutation of that inode
 *                is detected at EMIT and fails closed.
 * Phase 2 (EMIT): re-hash held fds (must match PIN digest), then mkdirat +
 *                fclonefileat FROM HELD FDS + fcopyfile(METADATA) for directories.
 *                Never /usr/bin/ditto. Symlinks/specials/hardlinks/cross-device
 *                fail closed during PIN.
 * Optional test barrier: if YURI_COPY_TREE_PIN_BARRIER is set to an existing path,
 * spin until that path is unlinked between PIN and EMIT (swap / content-mutation window). */
struct pinned_file {
    char *name;
    int fd;
    struct stat st;
    unsigned char sha256[CC_SHA256_DIGEST_LENGTH];
};

/* Digest regular-file bytes through a held fd (descriptor-relative; no pathname). */
static int hash_fd_sha256(int fd, unsigned char out[CC_SHA256_DIGEST_LENGTH]) {
    if (lseek(fd, 0, SEEK_SET) < 0) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree lseek for hash: %s\n", strerror(errno));
        return 1;
    }
    CC_SHA256_CTX ctx;
    CC_SHA256_Init(&ctx);
    unsigned char buf[65536];
    for (;;) {
        ssize_t n = read(fd, buf, sizeof(buf));
        if (n < 0) {
            if (errno == EINTR) continue;
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree read for hash: %s\n", strerror(errno));
            return 1;
        }
        if (n == 0) break;
        CC_SHA256_Update(&ctx, buf, (CC_LONG)n);
    }
    CC_SHA256_Final(out, &ctx);
    if (lseek(fd, 0, SEEK_SET) < 0) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree lseek reset after hash: %s\n",
                strerror(errno));
        return 1;
    }
    return 0;
}
struct pinned_dir {
    char *name;
    int fd;
    struct stat st;
    struct pinned_file *files;
    size_t n_files;
    struct pinned_dir *dirs;
    size_t n_dirs;
};

static void free_pinned_dir(struct pinned_dir *node) {
    if (!node) return;
    for (size_t i = 0; i < node->n_files; i++) {
        if (node->files[i].fd >= 0) close(node->files[i].fd);
        free(node->files[i].name);
    }
    free(node->files);
    node->files = NULL;
    node->n_files = 0;
    for (size_t i = 0; i < node->n_dirs; i++) {
        free_pinned_dir(&node->dirs[i]);
        free(node->dirs[i].name);
        node->dirs[i].name = NULL;
    }
    free(node->dirs);
    node->dirs = NULL;
    node->n_dirs = 0;
    if (node->fd >= 0 && node->name != NULL) {
        /* root node's fd is owned by caller (name==NULL); child dir fds closed here */
        close(node->fd);
        node->fd = -1;
    }
}

static int pin_tree_fd(int src_fd, dev_t root_dev, struct pinned_dir *out) {
    /* Caller owns out->name / out->fd / out->st. Only fill children arrays here. */
    out->files = NULL;
    out->n_files = 0;
    out->dirs = NULL;
    out->n_dirs = 0;
    DIR *dir = fdopendir(dup(src_fd));
    if (dir == NULL) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree fdopendir: %s\n", strerror(errno));
        return 1;
    }
    int current_fd = dirfd(dir);
    int rc = 0;
    struct pinned_file *files = NULL;
    size_t n_files = 0, cap_files = 0;
    struct pinned_dir *dirs = NULL;
    size_t n_dirs = 0, cap_dirs = 0;
    struct dirent *entry;
    rewinddir(dir);
    while (1) {
        errno = 0;
        entry = readdir(dir);
        if (entry == NULL) {
            if (errno != 0) {
                fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree readdir: %s\n", strerror(errno));
                rc = 1;
            }
            break;
        }
        if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) continue;
        struct stat pre;
        if (fstatat(current_fd, entry->d_name, &pre, AT_SYMLINK_NOFOLLOW) != 0) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree fstatat(%s): %s\n",
                    entry->d_name, strerror(errno));
            rc = 1; goto done;
        }
        if (S_ISLNK(pre.st_mode)) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree symlink rejected (%s)\n", entry->d_name);
            rc = 1; goto done;
        }
        if (pre.st_dev != root_dev) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree cross-device entry rejected (%s)\n",
                    entry->d_name);
            rc = 1; goto done;
        }
        if (S_ISREG(pre.st_mode)) {
            if (pre.st_nlink != 1) {
                fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree hardlink rejected (%s)\n",
                        entry->d_name);
                rc = 1; goto done;
            }
            int src_file = openat(current_fd, entry->d_name, O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
            if (src_file < 0) {
                fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree openat file(%s): %s\n",
                        entry->d_name, strerror(errno));
                rc = 1; goto done;
            }
            struct stat opened;
            if (fstat(src_file, &opened) != 0
                || !S_ISREG(opened.st_mode)
                || opened.st_dev != pre.st_dev
                || opened.st_ino != pre.st_ino
                || opened.st_size != pre.st_size
                || opened.st_nlink != 1
                || opened.st_dev != root_dev) {
                fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree file replacement detected (%s)\n",
                        entry->d_name);
                close(src_file);
                rc = 1; goto done;
            }
            if (n_files == cap_files) {
                size_t newcap = cap_files ? cap_files * 2 : 8;
                struct pinned_file *tmp = realloc(files, newcap * sizeof(*files));
                if (!tmp) {
                    fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree oom\n");
                    close(src_file);
                    rc = 1; goto done;
                }
                files = tmp; cap_files = newcap;
            }
            files[n_files].name = strdup(entry->d_name);
            if (!files[n_files].name) {
                fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree oom\n");
                close(src_file);
                rc = 1; goto done;
            }
            files[n_files].fd = src_file;
            files[n_files].st = opened;
            if (hash_fd_sha256(src_file, files[n_files].sha256) != 0) {
                close(src_file);
                free(files[n_files].name);
                files[n_files].name = NULL;
                rc = 1; goto done;
            }
            n_files++;
        } else if (S_ISDIR(pre.st_mode)) {
            int child_src = openat(current_fd, entry->d_name, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
            if (child_src < 0) {
                fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree openat dir(%s): %s\n",
                        entry->d_name, strerror(errno));
                rc = 1; goto done;
            }
            struct stat opened_dir;
            if (fstat(child_src, &opened_dir) != 0
                || !S_ISDIR(opened_dir.st_mode)
                || opened_dir.st_dev != pre.st_dev
                || opened_dir.st_ino != pre.st_ino
                || opened_dir.st_dev != root_dev) {
                fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree dir replacement detected (%s)\n",
                        entry->d_name);
                close(child_src);
                rc = 1; goto done;
            }
            if (n_dirs == cap_dirs) {
                size_t newcap = cap_dirs ? cap_dirs * 2 : 4;
                struct pinned_dir *tmp = realloc(dirs, newcap * sizeof(*dirs));
                if (!tmp) {
                    fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree oom\n");
                    close(child_src);
                    rc = 1; goto done;
                }
                dirs = tmp; cap_dirs = newcap;
            }
            memset(&dirs[n_dirs], 0, sizeof(dirs[n_dirs]));
            dirs[n_dirs].name = strdup(entry->d_name);
            if (!dirs[n_dirs].name) {
                fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree oom\n");
                close(child_src);
                rc = 1; goto done;
            }
            dirs[n_dirs].fd = child_src;
            dirs[n_dirs].st = opened_dir;
            dirs[n_dirs].files = NULL;
            dirs[n_dirs].n_files = 0;
            dirs[n_dirs].dirs = NULL;
            dirs[n_dirs].n_dirs = 0;
            if (pin_tree_fd(child_src, root_dev, &dirs[n_dirs]) != 0) {
                free_pinned_dir(&dirs[n_dirs]);
                free(dirs[n_dirs].name);
                dirs[n_dirs].name = NULL;
                dirs[n_dirs].fd = -1;
                rc = 1; goto done;
            }
            n_dirs++;
        } else {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree special file rejected (%s)\n",
                    entry->d_name);
            rc = 1; goto done;
        }
    }

done:
    closedir(dir);
    if (rc != 0) {
        for (size_t i = 0; i < n_files; i++) {
            if (files[i].fd >= 0) close(files[i].fd);
            free(files[i].name);
        }
        free(files);
        for (size_t i = 0; i < n_dirs; i++) {
            free_pinned_dir(&dirs[i]);
            free(dirs[i].name);
        }
        free(dirs);
        return 1;
    }
    out->files = files;
    out->n_files = n_files;
    out->dirs = dirs;
    out->n_dirs = n_dirs;
    return 0;
}

static int apply_dir_metadata(int src_dir_fd, int dst_dir_fd) {
    /* Preserve ACL/xattr/stat (owner/mode/times) that ditto --acl/--extattr carried for dirs.
     * fclonefileat covers files; mkdirat alone would regress directory metadata. */
    if (fcopyfile(src_dir_fd, dst_dir_fd, NULL, COPYFILE_METADATA) != 0) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree dir metadata fcopyfile: %s\n",
                strerror(errno));
        return 1;
    }
    return 0;
}

static int emit_tree_fd(const struct pinned_dir *pin, int dst_fd, dev_t root_dev) {
    for (size_t i = 0; i < pin->n_files; i++) {
        const struct pinned_file *pf = &pin->files[i];
        struct stat still;
        /* After PIN, a same-class pathname swap may unlink the original; the held fd
         * still refers to I1 with nlink==0. That is the TOCTOU win — copy I1, not I2. */
        if (fstat(pf->fd, &still) != 0
            || still.st_dev != pf->st.st_dev
            || still.st_ino != pf->st.st_ino
            || !S_ISREG(still.st_mode)
            || (still.st_nlink != 0 && still.st_nlink != 1)) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree pinned file identity changed (%s)\n",
                    pf->name);
            return 1;
        }
        /* Content-mutation race on the pinned inode: fail closed if bytes changed. */
        unsigned char now_hash[CC_SHA256_DIGEST_LENGTH];
        if (hash_fd_sha256(pf->fd, now_hash) != 0) return 1;
        if (memcmp(now_hash, pf->sha256, CC_SHA256_DIGEST_LENGTH) != 0
            || still.st_size != pf->st.st_size) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree pinned file content mutated (%s)\n",
                    pf->name);
            return 1;
        }
        if (fclonefileat(pf->fd, dst_fd, pf->name, 0) != 0) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree fclonefileat(%s): %s\n",
                    pf->name, strerror(errno));
            return 1;
        }
        /* fclonefileat does not copy ACLs; restore ACL/xattr/stat parity from the held fd. */
        int dest_meta = openat(dst_fd, pf->name, O_RDWR | O_NOFOLLOW | O_CLOEXEC);
        if (dest_meta < 0) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree openat dest meta(%s): %s\n",
                    pf->name, strerror(errno));
            return 1;
        }
        if (fcopyfile(pf->fd, dest_meta, NULL, COPYFILE_METADATA) != 0) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree file metadata fcopyfile(%s): %s\n",
                    pf->name, strerror(errno));
            close(dest_meta);
            return 1;
        }
        close(dest_meta);
        struct stat dest_st;
        if (fstatat(dst_fd, pf->name, &dest_st, AT_SYMLINK_NOFOLLOW) != 0
            || !S_ISREG(dest_st.st_mode)
            || dest_st.st_dev != root_dev
            || dest_st.st_ino == pf->st.st_ino
            || dest_st.st_size != pf->st.st_size) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree destination identity mismatch (%s)\n",
                    pf->name);
            return 1;
        }
        int dest_file = openat(dst_fd, pf->name, O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
        if (dest_file < 0) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree openat dest file(%s): %s\n",
                    pf->name, strerror(errno));
            return 1;
        }
        unsigned char dest_hash[CC_SHA256_DIGEST_LENGTH];
        int hash_rc = hash_fd_sha256(dest_file, dest_hash);
        close(dest_file);
        if (hash_rc != 0) return 1;
        if (memcmp(dest_hash, pf->sha256, CC_SHA256_DIGEST_LENGTH) != 0) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree destination content mismatch (%s)\n",
                    pf->name);
            return 1;
        }
    }
    for (size_t i = 0; i < pin->n_dirs; i++) {
        const struct pinned_dir *pd = &pin->dirs[i];
        mode_t mode = pd->st.st_mode & 0777;
        if (mkdirat(dst_fd, pd->name, mode) != 0) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree mkdirat(%s): %s\n",
                    pd->name, strerror(errno));
            return 1;
        }
        int child_dst = openat(dst_fd, pd->name, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
        if (child_dst < 0) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree openat dest dir(%s): %s\n",
                    pd->name, strerror(errno));
            return 1;
        }
        /* Emit children BEFORE dir metadata — creating entries bumps parent mtime. */
        int child_rc = emit_tree_fd(pd, child_dst, root_dev);
        if (child_rc == 0) {
            child_rc = apply_dir_metadata(pd->fd, child_dst);
        }
        close(child_dst);
        if (child_rc != 0) return 1;
    }
    return 0;
}

static void copy_tree_pin_barrier_wait(void) {
    const char *ready = getenv("YURI_COPY_TREE_PIN_READY");
    if (ready != NULL && ready[0] != '\0') {
        /* Test-only: signal that PIN completed before the barrier wait. */
        int ready_fd = open(ready, O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC, 0600);
        if (ready_fd >= 0) {
            close(ready_fd);
        }
    }
    const char *barrier = getenv("YURI_COPY_TREE_PIN_BARRIER");
    if (barrier == NULL || barrier[0] == '\0') return;
    /* Test-only: hold between PIN and EMIT so the harness can same-class swap. */
    while (access(barrier, F_OK) == 0) {
        usleep(1000);
    }
}

static int copy_tree_exact(const char *source_path, const char *destination_path,
                           unsigned long long expected_source_dev,
                           unsigned long long expected_source_ino,
                           unsigned long long expected_parent_dev,
                           unsigned long long expected_parent_ino) {
    char source_base[NAME_MAX + 1], destination_base[NAME_MAX + 1];
    int source_parent_fd = walk_to_parent(source_path, source_base, sizeof(source_base));
    if (source_parent_fd < 0) return 1;
    int destination_parent_fd = walk_to_parent(
        destination_path, destination_base, sizeof(destination_base));
    if (destination_parent_fd < 0) {
        close(source_parent_fd);
        return 1;
    }

    struct stat destination_parent;
    if (fstat(destination_parent_fd, &destination_parent) != 0
        || !S_ISDIR(destination_parent.st_mode)
        || (unsigned long long)destination_parent.st_dev != expected_parent_dev
        || (unsigned long long)destination_parent.st_ino != expected_parent_ino) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree destination parent identity mismatch\n");
        close(source_parent_fd); close(destination_parent_fd);
        return 1;
    }

    int source_fd = openat(source_parent_fd, source_base, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    if (source_fd < 0) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree openat source(%s): %s\n",
                source_base, strerror(errno));
        close(source_parent_fd); close(destination_parent_fd);
        return 1;
    }
    struct stat source_st;
    if (fstat(source_fd, &source_st) != 0
        || !S_ISDIR(source_st.st_mode)
        || (unsigned long long)source_st.st_dev != expected_source_dev
        || (unsigned long long)source_st.st_ino != expected_source_ino) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree source identity mismatch\n");
        close(source_fd); close(source_parent_fd); close(destination_parent_fd);
        return 1;
    }
    if (source_st.st_dev != destination_parent.st_dev) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree source and destination are not on the same filesystem\n");
        close(source_fd); close(source_parent_fd); close(destination_parent_fd);
        return 1;
    }

    struct pinned_dir pinned;
    memset(&pinned, 0, sizeof(pinned));
    pinned.fd = source_fd;
    pinned.st = source_st;
    pinned.name = NULL; /* root: do not close source_fd in free_pinned_dir */
    if (pin_tree_fd(source_fd, source_st.st_dev, &pinned) != 0) {
        free_pinned_dir(&pinned);
        close(source_fd); close(source_parent_fd); close(destination_parent_fd);
        return 1;
    }

    copy_tree_pin_barrier_wait();

    struct stat unexpected;
    errno = 0;
    if (fstatat(destination_parent_fd, destination_base, &unexpected, AT_SYMLINK_NOFOLLOW) == 0
        || errno != ENOENT) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree destination must be absent\n");
        free_pinned_dir(&pinned);
        close(source_fd); close(source_parent_fd); close(destination_parent_fd);
        return 1;
    }
    if (mkdirat(destination_parent_fd, destination_base, 0700) != 0) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree mkdirat(%s): %s\n",
                destination_base, strerror(errno));
        free_pinned_dir(&pinned);
        close(source_fd); close(source_parent_fd); close(destination_parent_fd);
        return 1;
    }
    int destination_fd = openat(
        destination_parent_fd, destination_base, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    if (destination_fd < 0) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree openat destination(%s): %s\n",
                destination_base, strerror(errno));
        free_pinned_dir(&pinned);
        close(source_fd); close(source_parent_fd); close(destination_parent_fd);
        return 1;
    }

    int rc = emit_tree_fd(&pinned, destination_fd, source_st.st_dev);
    if (rc == 0) {
        /* Root metadata last — emit bumps destination root mtime. */
        rc = apply_dir_metadata(source_fd, destination_fd);
    }
    if (rc == 0) {
        if (fsync(destination_fd) != 0 || fsync(destination_parent_fd) != 0) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree destination fsync: %s\n", strerror(errno));
            rc = 1;
        }
    }
    struct stat source_after;
    if (rc == 0
        && (fstat(source_fd, &source_after) != 0
            || source_after.st_dev != source_st.st_dev
            || source_after.st_ino != source_st.st_ino)) {
        fprintf(stderr, "BACKEND_DATA_SWAP_FAILED copy-tree source root changed during copy\n");
        rc = 1;
    }

    close(destination_fd);
    free_pinned_dir(&pinned);
    close(source_fd);
    close(source_parent_fd);
    close(destination_parent_fd);
    return rc;
}

int main(int argc, char **argv) {
    if (argc == 9 && strcmp(argv[1], "clone-file") == 0) {
        unsigned long long source_dev, source_ino, parent_dev, parent_ino, source_size;
        if (parse_uint64(argv[4], &source_dev, "source-dev") != 0) return 1;
        if (parse_uint64(argv[5], &source_ino, "source-ino") != 0) return 1;
        if (parse_uint64(argv[6], &parent_dev, "destination-parent-dev") != 0) return 1;
        if (parse_uint64(argv[7], &parent_ino, "destination-parent-ino") != 0) return 1;
        if (parse_uint64(argv[8], &source_size, "source-size") != 0) return 1;
        if (clone_file_exact(argv[2], argv[3], source_dev, source_ino,
                             parent_dev, parent_ino, source_size) != 0) return 1;
        puts("BACKEND_DATA_CLONE_PASS");
        return 0;
    }

    /* copy-tree <source> <destination> <source-dev> <source-ino> <dest-parent-dev> <dest-parent-ino>
     *   Descriptor-relative tree mirror. Destination must be absent. Entries copied via
     *   openat/fstatat/fclonefileat under held directory fds — never ditto-by-pathname. */
    if (argc == 8 && strcmp(argv[1], "copy-tree") == 0) {
        unsigned long long source_dev, source_ino, parent_dev, parent_ino;
        if (parse_uint64(argv[4], &source_dev, "source-dev") != 0) return 1;
        if (parse_uint64(argv[5], &source_ino, "source-ino") != 0) return 1;
        if (parse_uint64(argv[6], &parent_dev, "destination-parent-dev") != 0) return 1;
        if (parse_uint64(argv[7], &parent_ino, "destination-parent-ino") != 0) return 1;
        if (copy_tree_exact(argv[2], argv[3], source_dev, source_ino, parent_dev, parent_ino) != 0) return 1;
        puts("BACKEND_DATA_COPY_TREE_PASS");
        return 0;
    }

    /* full-sync <root> <expected-dev> <expected-ino>:
     *   descriptor-relative recursive F_FULLFSYNC (files) + fsync (dirs, deepest-first).
     *   Root reached via parent-fd walk (defeats intermediate-component TOCTOU) then
     *   openat(O_DIRECTORY|O_NOFOLLOW); dev/ino anchor catches a root swap. */
    if (argc == 5 && strcmp(argv[1], "full-sync") == 0) {
        unsigned long long expected_dev, expected_ino;
        if (parse_uint64(argv[3], &expected_dev, "expected-dev") != 0) return 1;
        if (parse_uint64(argv[4], &expected_ino, "expected-ino") != 0) return 1;
        char basebuf[NAME_MAX + 1];
        int parent_fd = walk_to_parent(argv[2], basebuf, sizeof(basebuf));
        if (parent_fd < 0) return 1;
        int rootfd = openat(parent_fd, basebuf, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
        if (rootfd < 0) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED full-sync openat root(%s): %s\n", basebuf, strerror(errno));
            close(parent_fd);
            return 1;
        }
        struct stat opened_root;
        if (fstat(rootfd, &opened_root) != 0) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED full-sync fstat root: %s\n", strerror(errno));
            close(rootfd); close(parent_fd);
            return 1;
        }
        if (!S_ISDIR(opened_root.st_mode)
            || (unsigned long long)opened_root.st_dev != expected_dev
            || (unsigned long long)opened_root.st_ino != expected_ino) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED full-sync root identity mismatch (expected dev=%llu ino=%llu, got dev=%llu ino=%llu)\n",
                    expected_dev, expected_ino,
                    (unsigned long long)opened_root.st_dev, (unsigned long long)opened_root.st_ino);
            close(rootfd); close(parent_fd);
            return 1;
        }
        int rc = full_sync_tree_fd(rootfd);
        close(rootfd);
        close(parent_fd);
        if (rc != 0) return 1;
        puts("BACKEND_DATA_SWAP_PASS");
        return 0;
    }

    /* swap <left> <right> <left-dev> <left-ino> <right-dev> <right-ino>:
     *   descriptor-relative atomic RENAME_SWAP via the two parent fds (retained from the
     *   walk). Pre-swap: verify each side's (dev,ino) against expected and that both are
     *   real directories. Perform the exchange, then verify the exchange (left_base now
     *   carries right's original identity and vice versa). fsync both parents. */
    if (argc == 8 && strcmp(argv[1], "swap") == 0) {
        unsigned long long left_dev, left_ino, right_dev, right_ino;
        if (parse_uint64(argv[4], &left_dev, "left-dev") != 0) return 1;
        if (parse_uint64(argv[5], &left_ino, "left-ino") != 0) return 1;
        if (parse_uint64(argv[6], &right_dev, "right-dev") != 0) return 1;
        if (parse_uint64(argv[7], &right_ino, "right-ino") != 0) return 1;
        char left_base[NAME_MAX + 1], right_base[NAME_MAX + 1];
        int left_parent_fd = walk_to_parent(argv[2], left_base, sizeof(left_base));
        if (left_parent_fd < 0) return 1;
        int right_parent_fd = walk_to_parent(argv[3], right_base, sizeof(right_base));
        if (right_parent_fd < 0) { close(left_parent_fd); return 1; }

        struct stat left_st, right_st;
        if (verify_dir_identity(left_parent_fd, left_base, left_dev, left_ino, "swap left", &left_st) != 0
            || verify_dir_identity(right_parent_fd, right_base, right_dev, right_ino, "swap right", &right_st) != 0) {
            close(left_parent_fd); close(right_parent_fd);
            return 1;
        }
        if (left_st.st_dev != right_st.st_dev) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED swap: directories not on same filesystem\n");
            close(left_parent_fd); close(right_parent_fd);
            return 1;
        }
        /* Atomic exchange via descriptor-relative renameatx_np. XNU's signature
         * (bsd/man/man2/rename.2) is renameatx_np(int fromfd, const char *from,
         * int tofd, const char *to, unsigned int flags) - a single flags word holds
         * RENAME_SWAP / RENAME_EXCL / RENAME_NOFOLLOW_ANY; there is no separate
         * filesystem-flags argument at this call site. */
        if (renameatx_np(left_parent_fd, left_base, right_parent_fd, right_base, RENAME_SWAP) != 0) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED swap renameatx_np(RENAME_SWAP): %s\n", strerror(errno));
            close(left_parent_fd); close(right_parent_fd);
            return 1;
        }
        /* Verify the exchange: left_base now carries right's original identity, and
         * right_base now carries left's original identity. */
        if (verify_dir_identity(left_parent_fd, left_base, right_dev, right_ino, "swap post-left", NULL) != 0
            || verify_dir_identity(right_parent_fd, right_base, left_dev, left_ino, "swap post-right", NULL) != 0) {
            close(left_parent_fd); close(right_parent_fd);
            return 1;
        }
        /* Attempt both parent fsyncs independently; never short-circuit. A left failure
         * must still attempt the right so the caller (and any topology recovery) knows
         * each parent's exact outcome rather than a single merged errno. */
        errno = 0;
        int left_fsync_rc = fsync(left_parent_fd);
        int left_fsync_errno = errno;
        errno = 0;
        int right_fsync_rc = fsync(right_parent_fd);
        int right_fsync_errno = errno;
        if (left_fsync_rc != 0 || right_fsync_rc != 0) {
            fprintf(stderr, "BACKEND_DATA_SWAP_FAILED swap parent fsync (left rc=%d errno=%d:%s; right rc=%d errno=%d:%s)\n",
                    left_fsync_rc, left_fsync_errno, strerror(left_fsync_errno),
                    right_fsync_rc, right_fsync_errno, strerror(right_fsync_errno));
            close(left_parent_fd); close(right_parent_fd);
            return 1;
        }
        close(left_parent_fd);
        close(right_parent_fd);
        puts("BACKEND_DATA_SWAP_PASS");
        return 0;
    }

    return fail("usage: backend-data-swap clone-file <source> <destination> <source-dev> <source-ino> <destination-parent-dev> <destination-parent-ino> <source-size> | copy-tree <source> <destination> <source-dev> <source-ino> <destination-parent-dev> <destination-parent-ino> | full-sync <root> <expected-dev> <expected-ino> | swap <left> <right> <left-dev> <left-ino> <right-dev> <right-ino>");
}
