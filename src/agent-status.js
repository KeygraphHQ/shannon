import chalk from 'chalk';
import { path } from 'zx';

export class AgentStatusManager {
  constructor(options = {}) {
    this.mode = options.mode || 'parallel'; // 'parallel' or 'single'
    this.activeStatuses = new Map();
    this.lastStatusLine = '';
    this.hiddenOperationCount = 0;
    this.lastSummaryCount = 0;
    this.summaryInterval = options.summaryInterval || 10;
    this.showTodos = options.showTodos !== false;

    // Tools to completely hide in output
    this.suppressedTools = new Set([
      'Read', 'Write', 'Edit', 'MultiEdit',
      'Grep', 'Glob', 'LS'
    ]);

    // Tools that might be noisy bash commands to hide
    this.hiddenBashCommands = new Set([
      'pwd', 'echo', 'ls', 'cd'
    ]);
  }

  /**
   * Update status for an agent based on its current turn data
   */
  updateAgentStatus(agentName, turnData) {
    if (this.mode === 'single') {
      this.handleSingleAgentOutput(agentName, turnData);
    } else {
      const status = this.extractMeaningfulStatus(turnData);
      if (status) {
        this.activeStatuses.set(agentName, status);
        this.redrawStatusLine();
      }
    }
  }

  /**
   * Handle output for single agent mode with clean formatting
   */
  handleSingleAgentOutput(agentName, turnData) {
    const toolUse = turnData.tool_use;
    const text = turnData.assistant_text;
    const turnCount = turnData.turnCount;

    // Check if this is a tool we should hide
    if (toolUse && this.shouldHideTool(toolUse)) {
      this.hiddenOperationCount++;

      // Show summary every N hidden operations
      if (this.hiddenOperationCount - this.lastSummaryCount >= this.summaryInterval) {
        const operationCount = this.hiddenOperationCount - this.lastSummaryCount;
        console.log(chalk.gray(`    [${operationCount} file operations...]`));
        this.lastSummaryCount = this.hiddenOperationCount;
      }
      return;
    }

    // Format and show meaningful tools
    if (toolUse) {
      const formatted = this.formatMeaningfulTool(toolUse);
      if (formatted) {
        console.log(`🤖 ${formatted}`);
        return;
      }
    }

    // For turns without tool use, just ignore them silently
    // These are planning/thinking turns that don't need any output
  }

  /**
   * Check if a tool should be hidden from output
   */
  shouldHideTool(toolUse) {
    const toolName = toolUse.name;

    // Always hide these tools
    if (this.suppressedTools.has(toolName)) {
      return true;
    }

    // Hide TodoWrite unless we're configured to show todos
    if (toolName === 'TodoWrite' && !this.showTodos) {
      return true;
    }

    // Hide simple bash commands
    if (toolName === 'Bash') {
      const command = toolUse.input?.command || '';
      const simpleCommand = command.split(' ')[0];
      return this.hiddenBashCommands.has(simpleCommand);
    }

    return false;
  }

  /**
   * Format meaningful tools for single agent display
   */
  formatMeaningfulTool(toolUse) {
    const toolName = toolUse.name;
    const input = toolUse.input || {};

    switch (toolName) {
      case 'Task':
        const description = input.description || 'analysis agent';
        return `🚀 Launching ${description}`;

      case 'TodoWrite':
        if (this.showTodos) {
          return this.formatTodoUpdate(input);
        }
        return null;

      case 'WebFetch':
        const domain = this.extractDomain(input.url || '');
        return `🌐 Fetching ${domain}`;

      case 'Bash':
        // Only show meaningful bash commands
        const command = input.command || '';
        if (command.includes('nmap') || command.includes('subfinder') || command.includes('whatweb')) {
          const tool = command.split(' ')[0];
          return `🔍 Running ${tool}`;
        }
        return null;

      // Browser tools (keep existing formatting)
      default:
        if (toolName.startsWith('mcp__playwright__browser_')) {
          return this.extractBrowserAction(toolUse);
        }
    }

    return null;
  }

  /**
   * Format TodoWrite updates for display
   */
  formatTodoUpdate(input) {
    if (!input.todos || !Array.isArray(input.todos)) {
      return null;
    }

    const todos = input.todos;
    const inProgress = todos.filter(t => t.status === 'in_progress');
    const completed = todos.filter(t => t.status === 'completed');

    if (completed.length > 0) {
      const recent = completed[completed.length - 1];
      return `✅ ${recent.content.slice(0, 50)}${recent.content.length > 50 ? '...' : ''}`;
    }

    if (inProgress.length > 0) {
      const current = inProgress[0];
      return `🔄 ${current.content.slice(0, 50)}${current.content.length > 50 ? '...' : ''}`;
    }

    return null;
  }

  /**
   * Extract meaningful status from turn data, suppressing internal operations
   */
  extractMeaningfulStatus(turnData) {
    // Check for tool use first
    if (turnData.tool_use?.name) {
      // Suppress internal operations completely
      if (this.suppressedTools.has(turnData.tool_use.name)) {
        return null;
      }

      // Show browser testing actions
      if (turnData.tool_use.name.startsWith('mcp__playwright__browser_')) {
        return this.extractBrowserAction(turnData.tool_use);
      }

      // Show Task agent launches
      if (turnData.tool_use.name === 'Task') {
        const description = turnData.tool_use.input?.description || 'analysis';
        return `🚀 ${description.slice(0, 40)}`;
      }
    }

    // Parse assistant text for progress milestones
    if (turnData.assistant_text) {
      return this.extractProgressFromText(turnData.assistant_text);
    }

    return null; // Suppress everything else
  }

  /**
   * Extract browser action details
   */
  extractBrowserAction(toolUse) {
    const actionType = toolUse.name.split('_').pop();

    switch (actionType) {
      case 'navigate':
        const url = toolUse.input?.url || '';
        const domain = this.extractDomain(url);
        return `🌐 Testing ${domain}`;

      case 'click':
        const element = toolUse.input?.element || 'element';
        return `🖱️ Clicking ${element.slice(0, 20)}`;

      case 'fill':
      case 'form':
        return `📝 Testing form inputs`;

      case 'snapshot':
        return `📸 Capturing page state`;

      case 'type':
        return `⌨️ Testing input fields`;

      default:
        return `🌐 Browser: ${actionType}`;
    }
  }

  /**
   * Extract meaningful progress from assistant text (single-agent mode only)
   */
  extractProgressFromText(text) {
    // Only extract progress for single agents, not parallel ones
    if (this.mode !== 'single') {
      return null;
    }

    // For single agents, be very conservative about what we show
    // Most progress should come from tool formatting, not text parsing
    return null;
  }

  /**
   * Extract domain from URL for display
   */
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname || url.slice(0, 30);
    } catch {
      return url.slice(0, 30);
    }
  }

  /**
   * Redraw the status line showing all active agents
   */
  redrawStatusLine() {
    // Clear previous line
    if (this.lastStatusLine) {
      process.stdout.write('\r' + ' '.repeat(this.lastStatusLine.length) + '\r');
    }

    // Build new status line
    const statusEntries = Array.from(this.activeStatuses.entries())
      .map(([agent, status]) => `[${chalk.cyan(agent)}] ${status}`)
      .join(' | ');

    if (statusEntries) {
      process.stdout.write(statusEntries);
      this.lastStatusLine = statusEntries.replace(/\u001b\[[0-9;]*m/g, ''); // Remove ANSI codes for length calc
    }
  }

  /**
   * Clear status for a specific agent
   */
  clearAgentStatus(agentName) {
    this.activeStatuses.delete(agentName);
    this.redrawStatusLine();
  }

  /**
   * Clear all statuses and finish the status line
   */
  finishStatusLine() {
    if (this.lastStatusLine) {
      process.stdout.write('\n'); // Move to next line
      this.lastStatusLine = '';
      this.activeStatuses.clear();
    }
  }

  /**
   * Parse JSON tool use from message content
   */
  parseToolUse(content) {
    try {
      // Look for JSON tool use patterns
      const jsonMatch = content.match(/\{"type":"tool_use".*?\}/s);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      // Ignore parsing errors
    }
    return null;
  }
}