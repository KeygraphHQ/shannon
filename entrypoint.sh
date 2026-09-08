#!/bin/bash
set -euo pipefail

TARGET_UID="${SHANNON_HOST_UID:-}"
TARGET_GID="${SHANNON_HOST_GID:-}"
CURRENT_UID=$(id -u pentest 2>/dev/null || echo "")

# Validate the host-supplied ids before they reach groupadd/useradd. Unvalidated
# input here either fails with an opaque groupadd error (empty GID) or silently
# maps the container's pentest user onto uid 0, which defeats the point of
# running the agents unprivileged.
validate_id() {
  local name="$1"
  local value="$2"
  if ! [[ "$value" =~ ^[0-9]+$ ]] || [ "$value" -lt 1 ] || [ "$value" -gt 2000000 ]; then
    echo "ERROR: invalid ${name}: '${value}' (must be an integer in 1..2000000)" >&2
    exit 1
  fi
}

if [ -n "$TARGET_UID" ] && [ "$TARGET_UID" != "$CURRENT_UID" ]; then
  validate_id "SHANNON_HOST_UID" "$TARGET_UID"
  validate_id "SHANNON_HOST_GID" "$TARGET_GID"

  userdel pentest 2>/dev/null || true
  groupdel pentest 2>/dev/null || true

  groupadd -g "$TARGET_GID" pentest
  useradd -u "$TARGET_UID" -g pentest -s /bin/bash -M pentest

  # These must all be re-chowned to the new uid. The image tightens them to 770
  # (see Dockerfile), so unlike the old 0777 world-writable mode a remapped uid
  # no longer gets write access implicitly.
  chown -R pentest:pentest /app/sessions /app/workspaces /tmp/.claude /tmp/.pi \
    /tmp/.cache /tmp/.config /tmp/.npm
fi

exec su -m pentest -c "exec $*"
