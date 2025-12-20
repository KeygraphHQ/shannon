import OpenAI from 'openai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { $ } from 'zx';
import fs from 'fs/promises';
import path from 'path';

// Import internal tools directly
import { saveDeliverableTool, generateTotpTool } from '../../mcp-server/src/index.js';

/**
 * Detect and configure LLM provider based on environment variables
 * 
 * Priority:
 * 1. LLM_PROVIDER + LLM_BASE_URL (fully custom endpoint)
 * 2. LLM_PROVIDER explicit selection
 * 3. Auto-detect from available API keys
 * 
 * Supported providers:
 * - github: GitHub Models (https://models.github.ai/inference)
 * - openai: OpenAI API (https://api.openai.com/v1)
 * - ollama: Local Ollama (http://localhost:11434/v1)
 * - llamacpp: Local llama.cpp server (http://localhost:8080/v1)
 * - custom: Any OpenAI-compatible endpoint (requires LLM_BASE_URL)
 */
function getProviderConfig() {
    const explicitProvider = process.env.LLM_PROVIDER?.toLowerCase();
    const customBaseURL = process.env.LLM_BASE_URL;
    const githubToken = process.env.GITHUB_TOKEN;
    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const modelOverride = process.env.LLM_MODEL;

    // For local providers that don't need real API keys
    const dummyKey = 'not-needed';

    // Explicit provider selection
    if (explicitProvider) {
        switch (explicitProvider) {
            case 'github':
                if (!githubToken) throw new Error('LLM_PROVIDER=github but GITHUB_TOKEN not set');
                return {
                    provider: 'github',
                    baseURL: customBaseURL || 'https://models.github.ai/inference',
                    apiKey: githubToken,
                    model: modelOverride || 'openai/gpt-4.1'
                };

            case 'openai':
                if (!openaiKey) throw new Error('LLM_PROVIDER=openai but OPENAI_API_KEY not set');
                return {
                    provider: 'openai',
                    baseURL: customBaseURL || 'https://api.openai.com/v1',
                    apiKey: openaiKey,
                    model: modelOverride || 'gpt-4o'
                };

            case 'ollama':
                // Ollama exposes OpenAI-compatible API at /v1
                // See: https://ollama.ai/blog/openai-compatibility
                return {
                    provider: 'ollama',
                    baseURL: customBaseURL || 'http://localhost:11434/v1',
                    apiKey: dummyKey,
                    model: modelOverride || 'llama3.2'
                };

            case 'llamacpp':
            case 'llama.cpp':
            case 'llama-cpp':
                // llama-cpp-python server exposes OpenAI-compatible API
                // See: https://github.com/abetlen/llama-cpp-python#openai-compatible-web-server
                return {
                    provider: 'llamacpp',
                    baseURL: customBaseURL || 'http://localhost:8080/v1',
                    apiKey: dummyKey,
                    model: modelOverride || 'local-model'
                };

            case 'lmstudio':
                // LM Studio exposes OpenAI-compatible API
                return {
                    provider: 'lmstudio',
                    baseURL: customBaseURL || 'http://localhost:1234/v1',
                    apiKey: dummyKey,
                    model: modelOverride || 'local-model'
                };

            case 'custom':
                // Fully custom endpoint - requires LLM_BASE_URL
                if (!customBaseURL) {
                    throw new Error('LLM_PROVIDER=custom requires LLM_BASE_URL to be set');
                }
                return {
                    provider: 'custom',
                    baseURL: customBaseURL,
                    apiKey: openaiKey || githubToken || dummyKey,
                    model: modelOverride || 'default'
                };

            case 'anthropic':
                if (!anthropicKey) throw new Error('LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY not set');
                throw new Error('Anthropic provider requires @anthropic-ai/sdk - use Claude Code or set LLM_PROVIDER=github/openai/ollama');

            default:
                throw new Error(`Unknown LLM_PROVIDER: ${explicitProvider}. Supported: github, openai, ollama, llamacpp, lmstudio, custom`);
        }
    }

    // Auto-detect based on available keys (priority order)
    if (githubToken) {
        console.log('🤖 Auto-detected provider: GitHub Models');
        return {
            provider: 'github',
            baseURL: customBaseURL || 'https://models.github.ai/inference',
            apiKey: githubToken,
            model: modelOverride || 'openai/gpt-4.1'
        };
    }

    if (openaiKey) {
        console.log('🤖 Auto-detected provider: OpenAI');
        return {
            provider: 'openai',
            baseURL: customBaseURL || 'https://api.openai.com/v1',
            apiKey: openaiKey,
            model: modelOverride || 'gpt-4o'
        };
    }

    if (anthropicKey) {
        throw new Error('Anthropic API key found but Anthropic provider requires @anthropic-ai/sdk. Set GITHUB_TOKEN or OPENAI_API_KEY instead.');
    }

    throw new Error(`No LLM provider configured. Set one of:
  - GITHUB_TOKEN (for GitHub Models)
  - OPENAI_API_KEY (for OpenAI)
  - LLM_PROVIDER=ollama (for local Ollama)
  - LLM_PROVIDER=llamacpp (for local llama.cpp)
  - LLM_PROVIDER=custom + LLM_BASE_URL (for any OpenAI-compatible endpoint)`);
}

/**
 * Multi-Provider LLM Client (OpenAI SDK compatible)
 * Supports: GitHub Models, OpenAI, (Anthropic via compatibility layer)
 */
export async function* query({ prompt, options }) {
    const config = getProviderConfig();
    console.log(`🤖 Using ${config.provider} with model: ${config.model}`);

    const client = new OpenAI({
        baseURL: config.baseURL,
        apiKey: config.apiKey,
    });

    const modelName = config.model;

    // 1. Initialize Tools List with Native Filesystem Tools (Replicating "Computer Use" basics)
    const tools = [
        {
            type: "function",
            function: {
                name: "run_command",
                description: "Execute a shell command in the current working directory",
                parameters: {
                    type: "object",
                    properties: {
                        command: { type: "string", description: "The command to run" }
                    },
                    required: ["command"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "read_file",
                description: "Read a file from the filesystem",
                parameters: {
                    type: "object",
                    properties: {
                        path: { type: "string", description: "Path to the file" }
                    },
                    required: ["path"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "write_file",
                description: "Write content to a file",
                parameters: {
                    type: "object",
                    properties: {
                        path: { type: "string", description: "Path to the file" },
                        content: { type: "string", description: "Content to write" }
                    },
                    required: ["path", "content"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "list_files",
                description: "List files in a directory",
                parameters: {
                    type: "object",
                    properties: {
                        path: { type: "string", description: "Directory path" }
                    },
                    required: ["path"]
                }
            }
        }
    ];

    // 2. Add Internal Shannon Helper Tools
    // Hardcoding schemas to avoid Anthropic SDK structure issues

    // save_deliverable
    tools.push({
        type: "function",
        function: {
            name: "save_deliverable",
            description: "Saves deliverable files with automatic validation. Queue files must have {\"vulnerabilities\": [...]} structure.",
            parameters: {
                type: "object",
                properties: {
                    deliverable_type: {
                        type: "string",
                        description: "Type of deliverable to save",
                        enum: [
                            "CODE_ANALYSIS", "RECON", "INJECTION_ANALYSIS", "INJECTION_QUEUE",
                            "XSS_ANALYSIS", "XSS_QUEUE", "AUTH_ANALYSIS", "AUTH_QUEUE",
                            "AUTHZ_ANALYSIS", "AUTHZ_QUEUE", "SSRF_ANALYSIS", "SSRF_QUEUE",
                            "INJECTION_EVIDENCE", "XSS_EVIDENCE", "AUTH_EVIDENCE",
                            "AUTHZ_EVIDENCE", "SSRF_EVIDENCE"
                        ]
                    },
                    content: {
                        type: "string",
                        description: "File content (markdown for analysis/evidence, JSON for queues)"
                    }
                },
                required: ["deliverable_type", "content"]
            }
        }
    });

    // generate_totp
    tools.push({
        type: "function",
        function: {
            name: "generate_totp",
            description: "Generates 6-digit TOTP code for authentication. Secret must be base32-encoded.",
            parameters: {
                type: "object",
                properties: {
                    secret: {
                        type: "string",
                        description: "Base32-encoded TOTP secret",
                        pattern: "^[A-Z2-7]+$"
                    }
                },
                required: ["secret"]
            }
        }
    });


    // 3. Connect to External MCP Servers (e.g. Playwright)
    const mcpClients = [];

    if (options.mcpServers) {
        for (const [name, config] of Object.entries(options.mcpServers)) {
            if (config.type === 'stdio') {
                try {
                    const transport = new StdioClientTransport({
                        command: config.command,
                        args: config.args,
                        env: config.env
                    });

                    const mcpClient = new Client({
                        name: "shannon-client",
                        version: "1.0.0"
                    }, {
                        capabilities: {}
                    });

                    await mcpClient.connect(transport);
                    mcpClients.push({ name, client: mcpClient, transport });

                    // Fetch tools
                    const result = await mcpClient.listTools();
                    for (const tool of result.tools) {
                        tools.push({
                            type: "function",
                            function: {
                                name: tool.name, // Note: Conflicts possible if names collide
                                description: tool.description,
                                parameters: tool.inputSchema // MCP uses 'inputSchema' which maps to JSON schema
                            }
                        });
                    }

                } catch (err) {
                    console.error(`Failed to connect to MCP server ${name}:`, err);
                }
            }
        }
    }

    // --- Agent Loop ---

    let messages = [
        { role: "system", content: "You are a helpful assistant. You have access to tools. Current working directory: " + options.cwd },
        { role: "user", content: prompt }
    ];

    yield {
        type: "system",
        subtype: "init",
        model: modelName,
        permissionMode: options.permissionMode,
        mcp_servers: mcpClients.map(c => ({ name: c.name, status: 'connected' }))
    };

    let keepGoing = true;
    let turn = 0;
    const maxTurns = options.maxTurns || 200; // Increase turn limit
    let totalCost = 0;

    try {
        while (keepGoing && turn < maxTurns) {
            turn++;

            // console.log(`DEBUG: Turn ${turn}, Messages:`, messages.length);

            const response = await client.chat.completions.create({
                messages,
                model: modelName,
                tools: tools,
                tool_choice: "auto"
            });

            const choice = response.choices[0];
            const message = choice.message;

            messages.push(message);

            if (message.content) {
                yield {
                    type: "assistant",
                    message: { content: message.content }
                };
            }

            if (message.tool_calls && message.tool_calls.length > 0) {
                for (const toolCall of message.tool_calls) {
                    const functionName = toolCall.function.name;
                    const functionArgs = JSON.parse(toolCall.function.arguments);

                    yield {
                        type: "tool_use",
                        name: functionName,
                        input: functionArgs
                    };

                    let result = "";
                    let isError = false;

                    try {
                        // Route to correct handler
                        // 1. Native Tools
                        if (functionName === "run_command") {
                            const cmd = functionArgs.command;
                            // Use zx for command execution in cwd
                            // Critical: zx $ handles quoting, but here we run partial shell commands sometimes.
                            // Using explicit standard shell execution
                            const { stdout, stderr, exitCode } = await $({ cwd: options.cwd, nothrow: true, shell: true })`${cmd}`;
                            result = stdout + (stderr ? "\nStderr: " + stderr : "");
                            if (exitCode !== 0) isError = true;

                        } else if (functionName === "read_file") {
                            const filePath = path.resolve(options.cwd, functionArgs.path);
                            result = await fs.readFile(filePath, 'utf8');

                        } else if (functionName === "write_file") {
                            const filePath = path.resolve(options.cwd, functionArgs.path);
                            await fs.writeFile(filePath, functionArgs.content);
                            result = "File written successfully";

                        } else if (functionName === "list_files") {
                            const searchPath = path.resolve(options.cwd, functionArgs.path);
                            const files = await fs.readdir(searchPath);
                            result = files.join('\n');
                        }
                        // 2. Internal Tools (Shannon Helper)
                        else if (functionName === "save_deliverable") {
                            // Map deliverable_type to filename (Hardcoded mapping from mcp-server/src/types/deliverables.js)
                            const DELIVERABLE_FILENAMES = {
                                'CODE_ANALYSIS': 'code_analysis_deliverable.md',
                                'RECON': 'recon_deliverable.md',
                                'INJECTION_ANALYSIS': 'injection_analysis_deliverable.md',
                                'INJECTION_QUEUE': 'injection_exploitation_queue.json',
                                'XSS_ANALYSIS': 'xss_analysis_deliverable.md',
                                'XSS_QUEUE': 'xss_exploitation_queue.json',
                                'AUTH_ANALYSIS': 'auth_analysis_deliverable.md',
                                'AUTH_QUEUE': 'auth_exploitation_queue.json',
                                'AUTHZ_ANALYSIS': 'authz_analysis_deliverable.md',
                                'AUTHZ_QUEUE': 'authz_exploitation_queue.json',
                                'SSRF_ANALYSIS': 'ssrf_analysis_deliverable.md',
                                'SSRF_QUEUE': 'ssrf_exploitation_queue.json',
                                'INJECTION_EVIDENCE': 'injection_exploitation_evidence.md',
                                'XSS_EVIDENCE': 'xss_exploitation_evidence.md',
                                'AUTH_EVIDENCE': 'auth_exploitation_evidence.md',
                                'AUTHZ_EVIDENCE': 'authz_exploitation_evidence.md',
                                'SSRF_EVIDENCE': 'ssrf_exploitation_evidence.md',
                            };

                            const { deliverable_type, content } = functionArgs;
                            const filename = DELIVERABLE_FILENAMES[deliverable_type];

                            if (!filename) {
                                throw new Error(`Unknown deliverable_type: ${deliverable_type}`);
                            }

                            const targetDir = options.cwd; // Using CWD as target
                            const filePath = path.join(targetDir, 'deliverables', filename);

                            await fs.mkdir(path.dirname(filePath), { recursive: true });
                            await fs.writeFile(filePath, content);

                            // Return JSON string matching original tool behavior
                            result = JSON.stringify({
                                status: 'success',
                                message: `Deliverable saved successfully: ${filename}`,
                                filepath: filePath,
                                deliverableType: deliverable_type,
                                validated: false // Skipping deep validation logic here to avoid deps
                            });
                        } else if (functionName === "generate_totp") {
                            // Implement TOTP generation if needed using 'totp-generator' or similar
                            result = "TOTP generation not supported in this client version";
                        }
                        // 3. External MCP Tools (Playwright)
                        else {
                            // Find client that provides this tool
                            // Simple linear search or map - for now iterate all
                            let handled = false;
                            for (const mcp of mcpClients) {
                                // Ideally we cached which tool belongs to which client
                                try {
                                    // Optimistic call
                                    const mcpResult = await mcp.client.callTool({
                                        name: functionName,
                                        arguments: functionArgs
                                    });
                                    // mcpResult structure: { content: [ { type: 'text', text: '...' } ], isError: boolean }
                                    const textContent = mcpResult.content.find(c => c.type === 'text')?.text || JSON.stringify(mcpResult.content);
                                    result = textContent;
                                    isError = mcpResult.isError;
                                    handled = true;
                                    break;
                                } catch (e) {
                                    // Not this client or call failed
                                    // If error is "Method not found", continue
                                    if (!e.message.includes("Method not found") && !e.message.includes("Tool not found")) {
                                        throw e; // Real error
                                    }
                                }
                            }
                            if (!handled) {
                                result = `Unknown tool: ${functionName}`;
                                isError = true;
                            }
                        }

                    } catch (err) {
                        result = `Error executing ${functionName}: ${err.message}`;
                        isError = true;
                    }

                    yield {
                        type: "tool_result",
                        content: result,
                        isError: isError
                    };

                    messages.push({
                        tool_call_id: toolCall.id,
                        role: "tool",
                        name: functionName,
                        content: result
                    });
                }
            } else {
                keepGoing = false;
                let finalResult = message.content || "";
                yield {
                    type: "result",
                    result: finalResult,
                    total_cost_usd: totalCost,
                    duration_ms: 0,
                    subtype: "success"
                };
            }
        }
    } catch (error) {
        console.error("GITHUB CLIENT CRASHED:", error);
        yield {
            type: "result",
            result: null,
            error: error.message,
            subtype: "error_during_execution"
        };
    } finally {
        // Cleanup
        for (const mcp of mcpClients) {
            try { await mcp.transport.close(); } catch (e) { }
        }
    }
}
