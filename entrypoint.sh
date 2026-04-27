#!/bin/bash
set -euo pipefail

TARGET_UID="${SHANNON_HOST_UID:-}"
TARGET_GID="${SHANNON_HOST_GID:-}"
CURRENT_UID=$(id -u pentest 2>/dev/null || echo "")

# Validate UID/GID are numeric and within a sane non-root range before they
# reach groupadd/useradd. Without this, a host that exports a malicious
# SHANNON_HOST_UID like "0" or "1001; rm -rf /" would either map the
# pentest user to root or feed unsanitised input into a system command.
validate_id() {
  local name="$1"
  local value="$2"
  if ! [[ "$value" =~ ^[0-9]+$ ]] || [ "$value" -lt 1 ] || [ "$value" -gt 2000000 ]; then
    echo "ERROR: Invalid ${name}: ${value} (must be numeric, 1-2000000)" >&2
    exit 1
  fi
}

if [ -n "$TARGET_UID" ]; then
  validate_id "SHANNON_HOST_UID" "$TARGET_UID"
fi
if [ -n "$TARGET_GID" ]; then
  validate_id "SHANNON_HOST_GID" "$TARGET_GID"
fi

if [ -n "$TARGET_UID" ] && [ "$TARGET_UID" != "$CURRENT_UID" ]; then
  userdel pentest 2>/dev/null || true
  groupdel pentest 2>/dev/null || true

  groupadd -g "$TARGET_GID" pentest
  useradd -u "$TARGET_UID" -g pentest -s /bin/bash -M pentest

  chown -R pentest:pentest /app/sessions /app/workspaces /tmp/.claude
fi

exec su -m pentest -c "exec $*"
