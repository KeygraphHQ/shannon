#!/bin/bash
# Shannon Helper Script for OpenClaw
# Wraps the Shannon CLI for easy integration

set -e

# Read Shannon install path from TOOLS.md or use default
SHANNON_PATH="${SHANNON_PATH:-/home/opc/.openclaw/workspace/shannon}"

# Verify Shannon installation
if [ ! -f "$SHANNON_PATH/shannon" ]; then
    echo "ERROR: Shannon not found at $SHANNON_PATH"
    echo "Please set SHANNON_PATH environment variable or update TOOLS.md"
    exit 1
fi

cd "$SHANNON_PATH"

# Ensure Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "ERROR: Docker is not running. Please start Docker first."
    exit 1
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check .env file
if [ ! -f .env ]; then
    echo -e "${YELLOW}WARNING: No .env file found. Please create one with your ANTHROPIC_API_KEY${NC}"
    echo ""
    echo "Example:"
    echo "cat > .env << 'EOF'"
    echo "ANTHROPIC_API_KEY=your-api-key"
    echo "CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000"
    echo "EOF"
    exit 1
fi

# Function to start a pentest
start_pentest() {
    local url="$1"
    local repo="$2"
    local config="$3"
    local workspace="$4"

    echo "Starting Shannon pentest..."
    echo "URL: $url"
    echo "Repo: $repo"
    [ -n "$config" ] && echo "Config: $config"
    [ -n "$workspace" ] && echo "Workspace: $workspace"
    echo ""

    # Build command
    cmd="./shannon start URL=\"$url\" REPO=\"$repo\""
    [ -n "$config" ] && cmd="$cmd CONFIG=\"$config\""
    [ -n "$workspace" ] && cmd="$cmd WORKSPACE=\"$workspace\""

    echo "Executing: $cmd"
    echo ""

    # Run the command
    eval "$cmd"
}

# Function to check workspace status
check_status() {
    local workspace="$1"

    if [ -z "$workspace" ]; then
        echo "Listing all workspaces:"
        echo ""
        ./shannon workspaces
    else
        echo "Checking workspace: $workspace"
        echo ""

        # Look for session.json
        local session_file="audit-logs/${workspace}/session.json"
        if [ -f "$session_file" ]; then
            echo "Session found. Status:"
            cat "$session_file" | jq -r '.status // "Unknown"'
        else
            echo "No session data found. Check Temporal UI at http://localhost:8233"
        fi
    fi
}

# Function to show logs
show_logs() {
    local id="$1"
    local lines="${2:-50}"

    if [ -z "$id" ]; then
        echo "ERROR: Workflow ID required for logs"
        echo "Usage: $0 logs <workflow-id> [lines]"
        exit 1
    fi

    echo "Showing last $lines lines of workflow $id:"
    echo ""

    # Try to find the log file
    local log_file="audit-logs/${id}/workflow.log"
    if [ ! -f "$log_file" ]; then
        # Try to search for it
        log_file=$(find audit-logs -name "workflow.log" -path "*/${id}/*" 2>/dev/null | head -1)
    fi

    if [ -z "$log_file" ] || [ ! -f "$log_file" ]; then
        echo "ERROR: Log file not found for workflow ID: $id"
        echo "Check the Temporal Web UI at http://localhost:8233"
        exit 1
    fi

    tail -n "$lines" "$log_file"
}

# Function to show report summary
show_summary() {
    local workspace="$1"

    if [ -z "$workspace" ]; then
        echo "ERROR: Workspace name required"
        echo "Usage: $0 summary <workspace>"
        exit 1
    fi

    local report_file="audit-logs/${workspace}/deliverables/comprehensive_security_assessment_report.md"

    if [ ! -f "$report_file" ]; then
        echo "ERROR: Report not found for workspace: $workspace"
        echo "Expected location: $report_file"
        exit 1
    fi

    echo "=== Pentest Summary ==="
    echo "Workspace: $workspace"
    echo ""

    # Extract key sections from the report
    echo "## Executive Summary"
    echo ""
    awk '/^## Executive Summary/,/^## [A-Z]/' "$report_file" | head -n -1

    echo ""
    echo "## Critical Findings"
    echo ""
    awk '/^## Critical Findings/,/^## [A-Z]/' "$report_file" | head -n -1

    echo ""
    echo "## High Severity Findings"
    echo ""
    awk '/^## High Severity Findings/,/^## [A-Z]/' "$report_file" | head -n -1

    echo ""
    echo "---"
    echo "Full report: $report_file"
}

# Function to get latest workspace
get_latest_workspace() {
    find audit-logs -maxdepth 1 -type d -name "*shannon*" | sort -r | head -1 | xargs basename
}

# Function to check if a workspace is complete
is_complete() {
    local workspace="$1"
    local report_file="audit-logs/${workspace}/deliverables/comprehensive_security_assessment_report.md"

    if [ -f "$report_file" ]; then
        echo "true"
    else
        echo "false"
    fi
}

# Function to get vulnerability count
get_vuln_count() {
    local workspace="$1"
    local report_file="audit-logs/${workspace}/deliverables/comprehensive_security_assessment_report.md"

    if [ ! -f "$report_file" ]; then
        echo "0"
        return
    fi

    # Count findings by severity
    critical=$(grep -c "### Critical" "$report_file" 2>/dev/null || echo "0")
    high=$(grep -c "### High" "$report_file" 2>/dev/null || echo "0")
    medium=$(grep -c "### Medium" "$report_file" 2>/dev/null || echo "0")
    low=$(grep -c "### Low" "$report_file" 2>/dev/null || echo "0")

    echo "{\"critical\": $critical, \"high\": $high, \"medium\": $medium, \"low\": $low}"
}

# Main command dispatch
case "${1:-help}" in
    start)
        if [ -z "$2" ] || [ -z "$3" ]; then
            echo "Usage: $0 start <url> <repo> [config] [workspace]"
            exit 1
        fi
        start_pentest "$2" "$3" "$4" "$5"
        ;;
    status)
        check_status "$2"
        ;;
    logs)
        show_logs "$2" "$3"
        ;;
    summary)
        show_summary "$2"
        ;;
    latest)
        latest=$(get_latest_workspace)
        echo "$latest"
        ;;
    complete)
        is_complete "$2"
        ;;
    vulns)
        get_vuln_count "$2"
        ;;
    workspaces)
        ./shannon workspaces
        ;;
    stop)
        ./shannon stop
        ;;
    help|--help|-h|*)
        echo "Shannon Helper for OpenClaw"
        echo ""
        echo "Usage:"
        echo "  $0 start <url> <repo> [config] [workspace]"
        echo "      Start a new pentest"
        echo ""
        echo "  $0 status [workspace]"
        echo "      Check status of all workspaces or a specific one"
        echo ""
        echo "  $0 logs <workflow-id> [lines]"
        echo "      Show workflow logs (default: last 50 lines)"
        echo ""
        echo "  $0 summary <workspace>"
        echo "      Show pentest report summary"
        echo ""
        echo "  $0 latest"
        echo "      Get the most recent workspace name"
        echo ""
        echo "  $0 complete <workspace>"
        echo "      Check if a pentest is complete (returns true/false)"
        echo ""
        echo "  $0 vulns <workspace>"
        echo "      Get vulnerability counts for a workspace (JSON)"
        echo ""
        echo "  $0 workspaces"
        echo "      List all workspaces"
        echo ""
        echo "  $0 stop"
        echo "      Stop all Shannon containers"
        echo ""
        echo "Environment variables:"
        echo "  SHANNON_PATH    Path to Shannon installation"
        echo "                  (default: /home/opc/.openclaw/workspace/shannon)"
        ;;
esac
