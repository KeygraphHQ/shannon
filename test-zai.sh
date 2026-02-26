#!/bin/bash
# Test script for Z.AI router integration

set -e

echo "=== Z.AI Router Integration Test ==="
echo ""

# Test 1: Check router config includes z.ai
echo "Test 1: Verifying router-config.json has z.ai provider..."
if grep -q '"zai"' configs/router-config.json; then
  echo "✅ Z.AI provider found in router config"
else
  echo "❌ Z.AI provider not found in router config"
  exit 1
fi
echo ""

# Test 2: Check docker-compose has ZAI_API_KEY
echo "Test 2: Verifying docker-compose.yml has ZAI_API_KEY..."
if grep -q 'ZAI_API_KEY' docker-compose.yml; then
  echo "✅ ZAI_API_KEY found in docker-compose.yml"
else
  echo "❌ ZAI_API_KEY not found in docker-compose.yml"
  exit 1
fi
echo ""

# Test 3: Check .env.example documents z.ai
echo "Test 3: Verifying .env.example documents Z.AI usage..."
if grep -q 'ZAI_API_KEY' .env.example; then
  echo "✅ Z.AI documented in .env.example"
else
  echo "❌ Z.AI not documented in .env.example"
  exit 1
fi
echo ""

# Test 4: Check shannon script handles ZAI_API_KEY
echo "Test 4: Verifying shannon script checks for ZAI_API_KEY..."
if grep -q 'ZAI_API_KEY' shannon; then
  echo "✅ ZAI_API_KEY checks found in shannon script"
else
  echo "❌ ZAI_API_KEY checks not found in shannon script"
  exit 1
fi
echo ""

# Test 5: Check README mentions z.ai
echo "Test 5: Verifying README.md mentions Z.AI..."
if grep -q 'Z.AI' README.md; then
  echo "✅ Z.AI mentioned in README"
else
  echo "❌ Z.AI not mentioned in README"
  exit 1
fi
echo ""

# Test 6: Validate router config JSON
echo "Test 6: Validating router-config.json is valid JSON..."
if jq empty configs/router-config.json 2>/dev/null; then
  echo "✅ router-config.json is valid JSON"
else
  echo "❌ router-config.json is invalid JSON"
  exit 1
fi
echo ""

# Test 7: Extract z.ai configuration
echo "Test 7: Extracting Z.AI configuration..."
echo "Z.AI Provider Config:"
jq '.Providers[] | select(.name == "zai")' configs/router-config.json
echo ""

echo "=== All tests passed! ✅ ==="
echo ""
echo "Next steps to use Z.AI:"
echo "1. Get a Z.AI API key from https://docs.z.ai"
echo "2. Create .env file with:"
echo "   ZAI_API_KEY=your-api-key"
echo "   ROUTER_DEFAULT=zai,glm-5"
echo "3. Run: ./shannon start URL=https://example.com REPO=repo-name ROUTER=true"
