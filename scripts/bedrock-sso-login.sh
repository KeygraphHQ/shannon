#!/usr/bin/env bash
# Helper script to log in with AWS SSO for a given profile and
# export short-lived credentials into the *current* shell.
#
# IMPORTANT: You must **source** this script so that the exported
# variables remain in your shell:
#
#   source ./scripts/bedrock-sso-login.sh <profile-name>

# Ensure aws CLI is available
if ! command -v aws >/dev/null 2>&1; then
  echo "[bedrock-sso-login] Error: 'aws' CLI not found in PATH." >&2
  echo "Install AWS CLI v2 and try again." >&2
  return 1 2>/dev/null || exit 1
fi

# Determine profile to use
if [[ -n "$1" ]]; then
  PROFILE="$1"
else
  PROFILE=$(aws configure get profile 2>/dev/null)
  if [[ -z "$PROFILE" ]]; then
    echo "[bedrock-sso-login] Error: No AWS profile provided and no default profile configured." >&2
  fi
fi

# Validate that the profile exists
if ! aws configure get sso_start_url --profile "$PROFILE" >/dev/null 2>&1; then
  echo "[bedrock-sso-login] Error: AWS profile '$PROFILE' not found or not configured for SSO." >&2
  echo "" >&2
  echo "Available profiles:" >&2
  aws configure list-profiles 2>/dev/null | sed 's/^/  /'
  return 1 2>/dev/null || exit 1
fi

# Perform SSO login (no-op if already logged in and cached)
echo "[bedrock-sso-login] Using AWS profile: $PROFILE"
echo "[bedrock-sso-login] Logging in with AWS SSO..."
aws sso login --profile "$PROFILE"

# Export short-lived credentials into the current shell.
# Requires AWS CLI v2.15+.
echo "[bedrock-sso-login] Exporting temporary credentials into current shell..."
_bedrock_creds="$(aws configure export-credentials --profile "$PROFILE" --format env 2>&1)" || {
  echo "[bedrock-sso-login] Error: failed to export credentials." >&2
  echo "$_bedrock_creds" >&2
  echo "Make sure you have AWS CLI v2.15+ installed." >&2
  unset _bedrock_creds
  return 1 2>/dev/null || exit 1
}
eval "$_bedrock_creds"
unset _bedrock_creds

echo "[bedrock-sso-login] Temporary AWS credentials loaded for profile '$PROFILE'."
