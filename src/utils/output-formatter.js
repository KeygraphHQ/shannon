import { AGENTS } from '../session-manager.js';

/**
 * Extract domain from URL for display
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname || url.slice(0, 30);
  } catch {
    return url.slice(0, 30);
  }
}

/**
 * Summarize TodoWrite updates into clean progress indicators
 */
function summarizeTodoUpdate(input) {
  if (!input?.todos || !Array.isArray(input.todos)) {
    return null;
  }

  const todos = input.todos;
  const completed = todos.filter(t => t.status === 'completed');
  const inProgress = todos.filter(t => t.status === 'in_progress');

  // Show recently completed tasks
  if (completed.length > 0) {
    const recent = completed[completed.length - 1];
    return `✅ ${recent.content}`;
  }

  // Show current in-progress task
  if (inProgress.length > 0) {
    const current = inProgress[0];
    return `🔄 ${current.content}`;
  }

  return null;
}

/**
 * Get agent prefix for parallel execution
 */
export function getAgentPrefix(description) {
  // Map agent names to their prefixes
  const agentPrefixes = {
    'injection-vuln': '[SQLi/Cmd]',
    'xss-vuln': '[XSS]',
    'auth-vuln': '[Auth]',
    'authz-vuln': '[Authz]',
    'ssrf-vuln': '[SSRF]',
    'injection-exploit': '[SQLi/Cmd]',
    'xss-exploit': '[XSS]',
    'auth-exploit': '[Auth]',
    'authz-exploit': '[Authz]',
    'ssrf-exploit': '[SSRF]'
  };

  // First try to match by agent name directly
  for (const [agentName, prefix] of Object.entries(agentPrefixes)) {
    if (AGENTS[agentName] && description.includes(AGENTS[agentName].displayName)) {
      return prefix;
    }
  }

  // Fallback to partial matches for backwards compatibility
  if (description.includes('injection')) return '[SQLi/Cmd]';
  if (description.includes('xss')) return '[XSS]';
  if (description.includes('authz')) return '[Authz]';  // Check authz before auth
  if (description.includes('auth')) return '[Auth]';
  if (description.includes('ssrf')) return '[SSRF]';

  return '[Agent]';
}

/**
 * Format browser tool calls into clean progress indicators
 */
function formatBrowserAction(toolCall) {
  const toolName = toolCall.name;
  const input = toolCall.input || {};

  // Core Browser Operations
  if (toolName === 'mcp__playwright__browser_navigate') {
    const url = input.url || '';
    const domain = extractDomain(url);
    return `🌐 Navigating to ${domain}`;
  }

  if (toolName === 'mcp__playwright__browser_navigate_back') {
    return `⬅️ Going back`;
  }

  // Page Interaction
  if (toolName === 'mcp__playwright__browser_click') {
    const element = input.element || 'element';
    return `🖱️ Clicking ${element.slice(0, 25)}`;
  }

  if (toolName === 'mcp__playwright__browser_hover') {
    const element = input.element || 'element';
    return `👆 Hovering over ${element.slice(0, 20)}`;
  }

  if (toolName === 'mcp__playwright__browser_type') {
    const element = input.element || 'field';
    return `⌨️ Typing in ${element.slice(0, 20)}`;
  }

  if (toolName === 'mcp__playwright__browser_press_key') {
    const key = input.key || 'key';
    return `⌨️ Pressing ${key}`;
  }

  // Form Handling
  if (toolName === 'mcp__playwright__browser_fill_form') {
    const fieldCount = input.fields?.length || 0;
    return `📝 Filling ${fieldCount} form fields`;
  }

  if (toolName === 'mcp__playwright__browser_select_option') {
    return `📋 Selecting dropdown option`;
  }

  if (toolName === 'mcp__playwright__browser_file_upload') {
    return `📁 Uploading file`;
  }

  // Page Analysis
  if (toolName === 'mcp__playwright__browser_snapshot') {
    return `📸 Taking page snapshot`;
  }

  if (toolName === 'mcp__playwright__browser_take_screenshot') {
    return `📸 Taking screenshot`;
  }

  if (toolName === 'mcp__playwright__browser_evaluate') {
    return `🔍 Running JavaScript analysis`;
  }

  // Waiting & Monitoring
  if (toolName === 'mcp__playwright__browser_wait_for') {
    if (input.text) {
      return `⏳ Waiting for "${input.text.slice(0, 20)}"`;
    }
    return `⏳ Waiting for page response`;
  }

  if (toolName === 'mcp__playwright__browser_console_messages') {
    return `📜 Checking console logs`;
  }

  if (toolName === 'mcp__playwright__browser_network_requests') {
    return `🌐 Analyzing network traffic`;
  }

  // Tab Management
  if (toolName === 'mcp__playwright__browser_tabs') {
    const action = input.action || 'managing';
    return `🗂️ ${action} browser tab`;
  }

  // Dialog Handling
  if (toolName === 'mcp__playwright__browser_handle_dialog') {
    return `💬 Handling browser dialog`;
  }

  // Fallback for any missed tools
  const actionType = toolName.split('_').pop();
  return `🌐 Browser: ${actionType}`;
}

/**
 * Filter out JSON tool calls from content, with special handling for Task calls
 */
export function filterJsonToolCalls(content) {
  if (!content || typeof content !== 'string') {
    return content;
  }

  const lines = content.split('\n');
  const processedLines = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (trimmed === '') {
      continue;
    }

    // Check if this is a JSON tool call
    if (trimmed.startsWith('{"type":"tool_use"')) {
      try {
        const toolCall = JSON.parse(trimmed);

        // Special handling for Task tool calls
        if (toolCall.name === 'Task') {
          const description = toolCall.input?.description || 'analysis agent';
          processedLines.push(`🚀 Launching ${description}`);
          continue;
        }

        // Special handling for TodoWrite tool calls
        if (toolCall.name === 'TodoWrite') {
          const summary = summarizeTodoUpdate(toolCall.input);
          if (summary) {
            processedLines.push(summary);
          }
          continue;
        }

        // Special handling for browser tool calls
        if (toolCall.name.startsWith('mcp__playwright__browser_')) {
          const browserAction = formatBrowserAction(toolCall);
          if (browserAction) {
            processedLines.push(browserAction);
          }
          continue;
        }

        // Hide all other tool calls (Read, Write, Grep, etc.)
        continue;

      } catch (error) {
        // If JSON parsing fails, treat as regular text
        processedLines.push(line);
      }
    } else {
      // Keep non-JSON lines (assistant text)
      processedLines.push(line);
    }
  }

  return processedLines.join('\n');
}