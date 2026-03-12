// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Context Prioritizer Service
 *
 * Prioritizes high-risk code paths for analysis to optimize context window usage.
 * Identifies security-critical files (auth, input handling, database access) and
 * prioritizes them over less critical files.
 */

import { fs, path } from 'zx';
import type { ActivityLogger } from '../types/activity-logger.js';

export interface FilePriority {
  filePath: string;
  priority: number; // Higher = more important
  riskFactors: string[];
}

export interface PrioritizedFileList {
  high: string[];
  medium: string[];
  low: string[];
}

/**
 * Risk patterns that indicate high-security relevance.
 */
const HIGH_RISK_PATTERNS = [
  // Authentication & Authorization
  /auth/i,
  /login/i,
  /session/i,
  /token/i,
  /jwt/i,
  /oauth/i,
  /permission/i,
  /authorize/i,
  /access.?control/i,
  
  // Input handling
  /input/i,
  /validate/i,
  /sanitize/i,
  /filter/i,
  /parse/i,
  /deserial/i,
  
  // Database access
  /query/i,
  /database/i,
  /db/i,
  /sql/i,
  /orm/i,
  /model/i,
  
  // File operations
  /file/i,
  /upload/i,
  /download/i,
  /read/i,
  /write/i,
  
  // Network operations
  /request/i,
  /http/i,
  /api/i,
  /endpoint/i,
  /route/i,
  
  // Command execution
  /exec/i,
  /command/i,
  /shell/i,
  /system/i,
  /process/i,
  
  // Template rendering
  /template/i,
  /render/i,
  /view/i,
  
  // Configuration
  /config/i,
  /secret/i,
  /credential/i,
  /key/i,
];

/**
 * Low-priority patterns (can be deprioritized).
 */
const LOW_PRIORITY_PATTERNS = [
  /test/i,
  /spec/i,
  /mock/i,
  /fixture/i,
  /example/i,
  /demo/i,
  /\.md$/i,
  /\.txt$/i,
  /\.json$/i,
  /\.lock$/i,
  /node_modules/i,
  /vendor/i,
  /dist/i,
  /build/i,
  /\.min\./i,
];

/**
 * Service for prioritizing files based on security risk.
 */
export class ContextPrioritizer {
  private readonly logger: ActivityLogger;

  constructor(logger: ActivityLogger) {
    this.logger = logger;
  }

  /**
   * Calculate priority score for a file.
   */
  private calculatePriority(filePath: string, fileName: string): FilePriority {
    const riskFactors: string[] = [];
    let priority = 50; // Base priority

    // Check high-risk patterns
    for (const pattern of HIGH_RISK_PATTERNS) {
      if (pattern.test(filePath) || pattern.test(fileName)) {
        priority += 20;
        riskFactors.push(pattern.source);
      }
    }

    // Check low-priority patterns (reduce priority)
    for (const pattern of LOW_PRIORITY_PATTERNS) {
      if (pattern.test(filePath) || pattern.test(fileName)) {
        priority -= 30;
        riskFactors.push(`low-priority: ${pattern.source}`);
        break; // Only apply once
      }
    }

    // Boost priority for common security-critical file names
    const criticalNames = [
      'auth', 'login', 'session', 'middleware', 'controller',
      'router', 'handler', 'service', 'util', 'helper',
    ];
    for (const name of criticalNames) {
      if (fileName.toLowerCase().includes(name)) {
        priority += 15;
        riskFactors.push(`critical-name: ${name}`);
      }
    }

    // Ensure priority is within bounds
    priority = Math.max(0, Math.min(100, priority));

    return {
      filePath,
      priority,
      riskFactors,
    };
  }

  /**
   * Prioritize a list of files.
   */
  async prioritizeFiles(filePaths: string[]): Promise<FilePriority[]> {
    const priorities: FilePriority[] = [];

    for (const filePath of filePaths) {
      const fileName = path.basename(filePath);
      const priority = this.calculatePriority(filePath, fileName);
      priorities.push(priority);
    }

    // Sort by priority (highest first)
    priorities.sort((a, b) => b.priority - a.priority);

    this.logger.info(
      `Prioritized ${priorities.length} files. ` +
      `High: ${priorities.filter(p => p.priority >= 70).length}, ` +
      `Medium: ${priorities.filter(p => p.priority >= 40 && p.priority < 70).length}, ` +
      `Low: ${priorities.filter(p => p.priority < 40).length}`
    );

    return priorities;
  }

  /**
   * Split files into priority tiers.
   */
  async splitByPriority(filePaths: string[]): Promise<PrioritizedFileList> {
    const priorities = await this.prioritizeFiles(filePaths);

    return {
      high: priorities.filter(p => p.priority >= 70).map(p => p.filePath),
      medium: priorities.filter(p => p.priority >= 40 && p.priority < 70).map(p => p.filePath),
      low: priorities.filter(p => p.priority < 40).map(p => p.filePath),
    };
  }

  /**
   * Get top N highest priority files.
   */
  async getTopFiles(filePaths: string[], limit: number): Promise<string[]> {
    const priorities = await this.prioritizeFiles(filePaths);
    return priorities.slice(0, limit).map(p => p.filePath);
  }

  /**
   * Analyze file content to detect security-relevant code patterns.
   */
  async analyzeFileContent(filePath: string): Promise<{ riskScore: number; patterns: string[] }> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const patterns: string[] = [];
      let riskScore = 0;

      // Check for dangerous functions/patterns
      const dangerousPatterns = [
        { pattern: /eval\s*\(/i, score: 30, name: 'eval()' },
        { pattern: /exec\s*\(/i, score: 25, name: 'exec()' },
        { pattern: /system\s*\(/i, score: 25, name: 'system()' },
        { pattern: /shell_exec/i, score: 25, name: 'shell_exec()' },
        { pattern: /SELECT.*FROM.*WHERE.*\$\{/i, score: 30, name: 'SQL injection risk' },
        { pattern: /innerHTML\s*=/i, score: 20, name: 'innerHTML assignment' },
        { pattern: /document\.write/i, score: 20, name: 'document.write()' },
        { pattern: /dangerouslySetInnerHTML/i, score: 20, name: 'dangerouslySetInnerHTML' },
        { pattern: /password.*=.*['"]/i, score: 15, name: 'hardcoded password' },
        { pattern: /api[_-]?key.*=.*['"]/i, score: 15, name: 'hardcoded API key' },
        { pattern: /secret.*=.*['"]/i, score: 15, name: 'hardcoded secret' },
      ];

      for (const { pattern, score, name } of dangerousPatterns) {
        if (pattern.test(content)) {
          riskScore += score;
          patterns.push(name);
        }
      }

      return { riskScore, patterns };
    } catch (error) {
      this.logger.warn(`Failed to analyze file content for ${filePath}: ${error}`);
      return { riskScore: 0, patterns: [] };
    }
  }

  /**
   * Enhance priority based on file content analysis.
   */
  async enhancePriorityWithContent(filePriority: FilePriority): Promise<FilePriority> {
    const contentAnalysis = await this.analyzeFileContent(filePriority.filePath);
    
    // Boost priority based on content risk score
    const enhancedPriority = Math.min(100, filePriority.priority + Math.floor(contentAnalysis.riskScore / 2));
    
    return {
      ...filePriority,
      priority: enhancedPriority,
      riskFactors: [...filePriority.riskFactors, ...contentAnalysis.patterns],
    };
  }
}
