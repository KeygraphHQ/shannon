#!/bin/bash

# Shannon Black-Box Mode Runner
# Combines LocalSourceGenerator with Shannon

set -e

TARGET_URL="$1"
CONFIG="${2:-configs/blackbox-templates/example-blackbox-config. yaml}"

if [ -z "$TARGET_URL" ]; then
    echo "Usage:  $0 <target-url> [config-file]"
    exit 1
fi

echo "🔍 Generating synthetic source from $TARGET_URL..."
SOURCE_DIR=$(./local-source-generator.mjs "$TARGET_URL" -o ./workspace | grep "Location:" | cut -d' ' -f2)

echo "🚀 Running Shannon with synthetic source..."
./shannon.mjs "$TARGET_URL" "$SOURCE_DIR" --config "$CONFIG"
