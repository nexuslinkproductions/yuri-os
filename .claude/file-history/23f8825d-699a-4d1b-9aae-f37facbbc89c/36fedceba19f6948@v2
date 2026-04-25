#!/bin/bash
# Replace pm2's Unix socket fds with plain file descriptors
# This fixes posix_spawn EBADF caused by pm2's stdio socket setup
exec 0</dev/null 1>>/tmp/nudimmud-backend-stdout.log 2>>/tmp/nudimmud-backend-stderr.log 3>/dev/null 5>/dev/null 6>/dev/null
exec node dist/server.js "$@"
