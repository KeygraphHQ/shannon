#!/usr/bin/env python3
"""
Antigravity OpenAI-Compatible Proxy Bridge for Shannon Pentest Engine.

Exposes an OpenAI-compatible /v1/chat/completions and /v1/models endpoint,
routing prompts directly to Google Antigravity via the local Antigravity
AgentAPI daemon without requiring external API keys.
"""

import asyncio
import json
import os
import re
import sys
import time
import uuid
import shutil
from typing import Any, AsyncGenerator, Dict, List, Optional
import uvicorn
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response, StreamingResponse

PORT = int(os.environ.get("PORT", "8000"))
HOST = os.environ.get("HOST", "127.0.0.1")

# Locate agentapi binary across Linux, macOS, and Windows
DEFAULT_AGENTAPI_PATHS = [
    os.environ.get("ANTIGRAVITY_AGENTAPI_EXE"),
    shutil.which("agentapi"),
    os.path.expanduser("~/.gemini/antigravity/bin/agentapi"),
    os.path.expanduser("~/.gemini/antigravity/bin/agentapi.bat"),
    os.path.expanduser("~/AppData/Local/Programs/antigravity/resources/bin/language_server.exe"),
    shutil.which("language_server"),
]

def find_agentapi() -> str:
    for p in DEFAULT_AGENTAPI_PATHS:
        if p and os.path.exists(p):
            return p
    return "agentapi"

AGENTAPI_BIN = find_agentapi()

# Brain directory where conversation transcripts are stored (cross-platform)
BRAIN_DIR = os.environ.get(
    "ANTIGRAVITY_BRAIN_DIR",
    os.path.expanduser("~/.gemini/antigravity/brain")
)

AVAILABLE_MODELS = [
    # Gemini 3.8 Flash
    "gemini-3.8-flash",
    "gemini-3.8-flash-high",
    "gemini-3.8-flash-medium",
    "gemini-3.8-flash-low",
    # Gemini 3.7 Flash
    "gemini-3.7-flash",
    "gemini-3.7-flash-high",
    "gemini-3.7-flash-medium",
    "gemini-3.7-flash-low",
    # Gemini 3.1 Pro
    "gemini-3.1-pro",
    "gemini-3.1-pro-preview",
    "gemini-3.1-pro-high",
    "gemini-3.1-pro-medium",
    "gemini-3.1-pro-low",
    # Gemini 2.5
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    # Aliases
    "default",
]

def map_model_tier(model_name: str) -> str:
    """Map requested model or variant to Antigravity model tier."""
    lower = model_name.lower()
    if "pro" in lower:
        return "pro"
    if "lite" in lower:
        return "flash_lite"
    return "flash"

def format_messages_to_prompt(messages: List[Dict[str, Any]]) -> str:
    """Format an array of OpenAI chat messages into an Antigravity prompt."""
    parts = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if isinstance(content, list):
            content_str = ""
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    content_str += item.get("text", "")
            content = content_str
        
        if role == "system":
            parts.append(f"[System Directive]\n{content}\n")
        elif role == "user":
            parts.append(f"[User Request]\n{content}\n")
        elif role == "assistant":
            parts.append(f"[Assistant Previous Output]\n{content}\n")
    return "\n".join(parts)

async def run_agentapi_prompt(prompt: str, model_tier: str) -> str:
    """Invoke agentapi new-conversation and await completion."""
    if AGENTAPI_BIN.endswith("language_server.exe"):
        cmd = [AGENTAPI_BIN, "agentapi", "new-conversation", f"--model={model_tier}", prompt]
    elif sys.platform == "win32" and AGENTAPI_BIN.lower().endswith(".bat"):
        cmd = ["cmd.exe", "/c", AGENTAPI_BIN, "new-conversation", f"--model={model_tier}", prompt]
    else:
        cmd = [AGENTAPI_BIN, "new-conversation", f"--model={model_tier}", prompt]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()
    
    if proc.returncode != 0:
        err_msg = stderr.decode(errors="replace").strip() or stdout.decode(errors="replace").strip()
        raise RuntimeError(f"agentapi execution failed (exit code {proc.returncode}): {err_msg}")

    output_str = stdout.decode(errors="replace").strip()
    conv_id = None
    try:
        data = json.loads(output_str)
        conv_id = data.get("response", {}).get("newConversation", {}).get("conversationId")
    except Exception:
        pass

    if not conv_id:
        m = re.search(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', output_str, re.IGNORECASE)
        conv_id = m.group(0) if m else None

    # Strict UUID validation to prevent path traversal
    if not conv_id or not re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', conv_id, re.IGNORECASE):
        raise RuntimeError(f"Could not retrieve a valid conversationId from agentapi output: {output_str}")

    transcript_path = os.path.join(BRAIN_DIR, conv_id, ".system_generated", "logs", "transcript.jsonl")
    
    start_time = time.time()
    response_text = ""
    while time.time() - start_time < 120:
        if os.path.exists(transcript_path):
            try:
                with open(transcript_path, "r", encoding="utf-8") as f:
                    lines = f.readlines()
                    for line in reversed(lines):
                        line_str = line.strip()
                        if not line_str:
                            continue
                        step = json.loads(line_str)
                        if step.get("type") == "PLANNER_RESPONSE" and step.get("status") == "DONE":
                            response_text = step.get("content", "")
                            return response_text
            except Exception:
                pass
        await asyncio.sleep(0.5)

    if response_text:
        return response_text
    raise TimeoutError(f"Antigravity conversation {conv_id} timed out waiting for response.")

async def stream_openai_response(
    response_text: str,
    model: str,
    chunk_size: int = 40
) -> AsyncGenerator[bytes, None]:
    """Yield SSE chunks in standard OpenAI streaming format."""
    completion_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
    created = int(time.time())

    for i in range(0, len(response_text), chunk_size):
        chunk = response_text[i:i + chunk_size]
        payload = {
            "id": completion_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model,
            "choices": [
                {
                    "index": 0,
                    "delta": {"content": chunk},
                    "finish_reason": None,
                }
            ],
        }
        yield f"data: {json.dumps(payload)}\n\n".encode("utf-8")
        await asyncio.sleep(0.01)

    done_payload = {
        "id": completion_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model,
        "choices": [
            {
                "index": 0,
                "delta": {},
                "finish_reason": "stop",
            }
        ],
    }
    yield f"data: {json.dumps(done_payload)}\n\n".encode("utf-8")
    yield b"data: [DONE]\n\n"

# --- Starlette Endpoints ---

async def health(_request: Request) -> JSONResponse:
    return JSONResponse({
        "status": "ok",
        "provider": "antigravity",
        "agentapi": AGENTAPI_BIN,
        "models": len(AVAILABLE_MODELS)
    })

async def list_models(_request: Request) -> JSONResponse:
    data = [
        {
            "id": m,
            "object": "model",
            "created": 1710000000,
            "owned_by": "antigravity",
        }
        for m in AVAILABLE_MODELS
    ]
    return JSONResponse({"object": "list", "data": data})

async def chat_completions(request: Request) -> Response:
    try:
        body = await request.json()
    except Exception as e:
        return JSONResponse({"error": f"Invalid JSON body: {str(e)}"}, status_code=400)

    model = body.get("model", "gemini-3.8-flash")
    messages = body.get("messages", [])
    stream = body.get("stream", False)

    prompt = format_messages_to_prompt(messages)
    tier = map_model_tier(model)

    try:
        answer = await run_agentapi_prompt(prompt, tier)
    except Exception as e:
        return JSONResponse({
            "error": {
                "message": str(e),
                "type": "antigravity_error",
                "code": "agentapi_failed"
            }
        }, status_code=502)

    if stream:
        return StreamingResponse(
            stream_openai_response(answer, model),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            }
        )

    completion_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
    return JSONResponse({
        "id": completion_id,
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": answer,
                },
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens": len(prompt) // 4,
            "completion_tokens": len(answer) // 4,
            "total_tokens": (len(prompt) + len(answer)) // 4,
        },
    })

routes = [
    ("/health", health, ["GET"]),
    ("/v1/models", list_models, ["GET"]),
    ("/models", list_models, ["GET"]),
    ("/v1/chat/completions", chat_completions, ["POST"]),
    ("/chat/completions", chat_completions, ["POST"]),
]

app = Starlette(
    routes=[],
    middleware=[
        Middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
    ],
)

for path_str, handler, methods in routes:
    app.add_route(path_str, handler, methods=methods)

if __name__ == "__main__":
    print(f"[*] Starting Antigravity Proxy Bridge on {HOST}:{PORT}")
    print(f"[*] AgentAPI Binary: {AGENTAPI_BIN}")
    print(f"[*] Supported Models: {', '.join(AVAILABLE_MODELS[:5])} ...")
    uvicorn.run(app, host=HOST, port=PORT)
