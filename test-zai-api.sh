#!/bin/bash
# Simple test of Z.AI API key

API_KEY="${ZAI_API_KEY:-7204a531ca9a4ecc99a7a52812cd57f2.y3YjNU5cBr3E8UwH}"

echo "Testing Z.AI API key..."
echo ""

# Test 1: Simple completion
echo "Test 1: Simple chat completion..."
RESPONSE=$(curl -s -X POST "https://api.z.ai/api/paas/v4/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "model": "glm-4.7",
    "messages": [
      {"role": "user", "content": "Say hello in one word"}
    ],
    "max_tokens": 10
  }')

if echo "$RESPONSE" | grep -q "hello\|Hello\|Hi\|hi"; then
  echo "✅ Z.AI API key is working"
  echo ""
  echo "Response preview:"
  echo "$RESPONSE" | jq -r '.choices[0].message.content' 2>/dev/null || echo "$RESPONSE"
else
  echo "❌ Z.AI API key test failed"
  echo ""
  echo "Response:"
  echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
  exit 1
fi
