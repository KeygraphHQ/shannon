#!/bin/bash
# Extract Claude OAuth token and optionally update .env file
# Usage: ./get-token.sh [--update-env]
#
# NOTE: This script is macOS-only (uses Keychain).
# For Linux/Windows, manually set CLAUDE_CODE_OAUTH_TOKEN in .env
# or use: claude auth status (and copy the token)

TOKEN=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(d['claudeAiOauth']['accessToken'])" 2>/dev/null)

if [ -z "$TOKEN" ]; then
    echo "❌ Failed to extract OAuth token"
    echo "Make sure you're logged into Claude Code"
    exit 1
fi

if [ "$1" == "--update-env" ]; then
    if [ -f .env ]; then
        # Update existing .env
        if grep -q "CLAUDE_CODE_OAUTH_TOKEN" .env; then
            sed -i '' "s|CLAUDE_CODE_OAUTH_TOKEN=.*|CLAUDE_CODE_OAUTH_TOKEN=$TOKEN|" .env
        else
            echo "CLAUDE_CODE_OAUTH_TOKEN=$TOKEN" >> .env
        fi
        echo "✅ Updated .env with OAuth token"
    else
        echo "CLAUDE_CODE_OAUTH_TOKEN=$TOKEN" > .env
        echo "✅ Created .env with OAuth token"
    fi
else
    echo "$TOKEN"
fi
