#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

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

int main(int argc, char **argv) {
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

    return fail("usage: backend-data-swap full-sync <root> <expected-dev> <expected-ino> | swap <left> <right> <left-dev> <left-ino> <right-dev> <right-ino>");
}
