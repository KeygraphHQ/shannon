#!/bin/bash
# Shannon Pentest Runner with Full Persistence
# Usage: ./run-shannon.sh <TARGET_URL> <REPO_PATH>
#
# NOTE: This script is macOS-only (uses Keychain for OAuth token).
# For Linux/Windows, use docker-compose.yml with manual .env setup.
#
# Example:
#   ./run-shannon.sh "https://api.example.com" "/app/repos/my-project"

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check arguments
if [ $# -lt 2 ]; then
    echo -e "${RED}Usage: ./run-shannon.sh <TARGET_URL> <REPO_PATH>${NC}"
    echo ""
    echo "Examples:"
    echo "  ./run-shannon.sh 'https://api.example.com' '/app/repos/my-project'"
    echo "  ./run-shannon.sh 'https://api.example.com' '/app/repos/my-project' --config myconfig.yaml"
    exit 1
fi

TARGET_URL="$1"
REPO_PATH="$2"
EXTRA_ARGS="${@:3}"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Create persistence directories
echo -e "${CYAN}📁 Creating persistence directories...${NC}"
mkdir -p repos sessions agent-logs deliverables

# Get OAuth token
echo -e "${CYAN}🔑 Extracting OAuth token...${NC}"
if ! security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(d['claudeAiOauth']['accessToken'])" > /tmp/claude_token.txt 2>/dev/null; then
    echo -e "${RED}❌ Failed to extract OAuth token from Keychain${NC}"
    echo "Make sure you're logged into Claude Code"
    exit 1
fi
echo -e "${GREEN}✅ Token extracted${NC}"

# Show what will be persisted
echo -e "${CYAN}📦 Persistence mounts:${NC}"
echo -e "   ${GREEN}✓${NC} repos/        → Source code + git checkpoints"
echo -e "   ${GREEN}✓${NC} sessions/     → Session state (resume support)"
echo -e "   ${GREEN}✓${NC} agent-logs/   → Detailed agent execution logs"
echo -e "   ${GREEN}✓${NC} deliverables/ → Final reports"
echo ""

# Run Shannon
echo -e "${CYAN}🚀 Starting Shannon...${NC}"
echo -e "   Target: ${YELLOW}${TARGET_URL}${NC}"
echo -e "   Source: ${YELLOW}${REPO_PATH}${NC}"
echo ""

docker run --rm \
    --add-host=host.docker.internal:host-gateway \
    --cap-add=NET_RAW \
    --cap-add=NET_ADMIN \
    -e CLAUDE_CODE_OAUTH_TOKEN="$(cat /tmp/claude_token.txt)" \
    -e CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000 \
    -v "$(pwd)/repos:/app/repos" \
    -v "$(pwd)/sessions:/app/sessions" \
    -v "$(pwd)/agent-logs:/app/agent-logs" \
    -v "$(pwd)/deliverables:/app/deliverables" \
    shannon:latest \
    "$TARGET_URL" \
    "$REPO_PATH" \
    $EXTRA_ARGS

# Cleanup token
rm -f /tmp/claude_token.txt

echo -e "${GREEN}✅ Shannon complete!${NC}"
echo ""
echo -e "📄 Reports: ${CYAN}$(pwd)/repos/${REPO_PATH##*/}/deliverables/${NC}"
echo -e "📝 Logs:    ${CYAN}$(pwd)/agent-logs/${NC}"
echo -e "💾 Session: ${CYAN}$(pwd)/sessions/sessions.json${NC}"
