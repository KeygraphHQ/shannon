// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * AI Provider Abstraction Layer
 * 
 * Provides a unified interface for different AI providers (Claude, Ollama).
 * Selection is controlled via the AI_PROVIDER environment variable.
 */

import chalk from 'chalk';

// Available AI providers
export const AI_PROVIDERS = {
    CLAUDE: 'claude',
    OLLAMA: 'ollama'
};

// Get the current AI provider from environment
export function getCurrentProvider() {
    const provider = (process.env.AI_PROVIDER || AI_PROVIDERS.CLAUDE).toLowerCase();

    if (!Object.values(AI_PROVIDERS).includes(provider)) {
        console.log(chalk.yellow(`⚠️ Unknown AI_PROVIDER: ${provider}, defaulting to Claude`));
        return AI_PROVIDERS.CLAUDE;
    }

    return provider;
}

// Check if using Ollama
export function isOllamaProvider() {
    return getCurrentProvider() === AI_PROVIDERS.OLLAMA;
}

// Check if using Claude
export function isClaudeProvider() {
    return getCurrentProvider() === AI_PROVIDERS.CLAUDE;
}

// Get provider-specific executor
export async function getRunPromptWithRetry() {
    const provider = getCurrentProvider();

    if (provider === AI_PROVIDERS.OLLAMA) {
        const { runOllamaPromptWithRetry } = await import('./ollama-executor.js');
        return runOllamaPromptWithRetry;
    } else {
        const { runClaudePromptWithRetry } = await import('./claude-executor.js');
        return runClaudePromptWithRetry;
    }
}

// Display provider info
export function displayProviderInfo() {
    const provider = getCurrentProvider();

    if (provider === AI_PROVIDERS.OLLAMA) {
        const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
        const model = process.env.OLLAMA_MODEL || 'qwen3:32b';
        console.log(chalk.magenta(`🦙 AI Provider: Ollama (${model})`));
        console.log(chalk.gray(`   Host: ${host}`));
        console.log(chalk.yellow(`   ⚠️ Note: Browser automation is not available in Ollama mode`));
    } else {
        console.log(chalk.blue(`🤖 AI Provider: Claude (Anthropic)`));
    }
}

// Validate provider configuration
export async function validateProviderConfig() {
    const provider = getCurrentProvider();

    if (provider === AI_PROVIDERS.OLLAMA) {
        const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
        const model = process.env.OLLAMA_MODEL || 'qwen3:32b';

        try {
            // Try to connect to Ollama
            const response = await fetch(`${host}/api/tags`);

            if (!response.ok) {
                throw new Error(`Ollama server returned status ${response.status}`);
            }

            const data = await response.json();
            const models = data.models || [];
            const modelNames = models.map(m => m.name);

            // Check if the requested model is available
            const modelAvailable = modelNames.some(name =>
                name === model || name.startsWith(model.split(':')[0])
            );

            if (!modelAvailable) {
                console.log(chalk.yellow(`⚠️ Model "${model}" not found locally. Available models:`));
                modelNames.forEach(name => console.log(chalk.gray(`   - ${name}`)));
                console.log(chalk.yellow(`   Run: ollama pull ${model}`));
                return { valid: false, error: `Model ${model} not available` };
            }

            return { valid: true, provider, model, host };

        } catch (error) {
            console.log(chalk.red(`❌ Failed to connect to Ollama at ${host}`));
            console.log(chalk.gray(`   Error: ${error.message}`));
            console.log(chalk.yellow(`   Make sure Ollama is running: ollama serve`));
            return { valid: false, error: error.message };
        }
    } else {
        // Claude provider validation
        const hasOAuthToken = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
        const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

        if (!hasOAuthToken && !hasApiKey) {
            console.log(chalk.red(`❌ No Claude credentials found`));
            console.log(chalk.gray(`   Set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY`));
            return { valid: false, error: 'No Claude credentials' };
        }

        return { valid: true, provider: 'claude' };
    }
}
