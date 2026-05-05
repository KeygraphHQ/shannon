#!/bin/bash
set -euo pipefail

# Drop privileges to the non-root pentest user.
#
# SECURITY: Arguments arrive from `docker run ... CMD [<webUrl> <repoPath> ...]`.
# The webUrl originates from `shannon start -u <url>` and flows unescaped through
# the CLI. We must NEVER re-serialize argv through a shell string (e.g.
# `su -c "exec $*"`) because shell metacharacters in <url> would be re-parsed
# and executed by the inner shell. We use `su -s /bin/bash pentest -c` with
# printf '%q' to produce a single shell-safe command line.

TARGET_UID="${SHANNON_HOST_UID:-}"
TARGET_GID="${SHANNON_HOST_GID:-}"
CURRENT_UID=$(id -u pentest 2>/dev/null || echo "")

if [ -n "$TARGET_UID" ] && [ "$TARGET_UID" != "$CURRENT_UID" ]; then
  userdel pentest 2>/dev/null || true
  groupdel pentest 2>/dev/null || true

  groupadd -g "$TARGET_GID" pentest
  useradd -u "$TARGET_UID" -g pentest -s /bin/bash -M pentest

  chown -R pentest:pentest /app/sessions /app/workspaces /tmp/.claude
fi

# Require at least one argument; refuse to exec an empty command line.
if [ "$#" -lt 1 ]; then
  echo "entrypoint.sh: missing command" >&2
  exit 64
fi

# Build a shell-safe command string. printf '%q' escapes every metacharacter
# (;, |, &, $(, `, newline, space, quotes, etc.) so that the inner shell
# invoked by `su -c` cannot re-parse argv content as commands.
#
# Example: argv "http://x;rm -rf /" becomes the literal string
#   'http://x;rm -rf /'
# which the inner shell sees as a single argument to `exec`, not two statements.
printf -v QUOTED_CMD ' %q' "$@"
# Strip leading space introduced by the format string.
QUOTED_CMD=${QUOTED_CMD# }

exec su -s /bin/bash -m pentest -c "exec ${QUOTED_CMD}"
