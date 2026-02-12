// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * optimize_skills MCP Tool
 *
 * Discovers Cursor skills (personal and/or project), evaluates each against
 * criterion-specific optimization rules from the create-skill skill, and
 * returns a structured report with precise suggestions to make each skill optimal.
 *
 * Intended to be invoked by the agent via the MCP gateway when the user
 * wants to optimize or audit all skills.
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createToolResult, type ToolResult } from '../types/tool-responses.js';
import { createGenericError } from '../utils/error-formatter.js';

/**
 * Input schema for optimize_skills tool
 */
export const OptimizeSkillsInputSchema = z.object({
  scope: z
    .enum(['personal', 'project', 'both'])
    .default('both')
    .describe('Which skills to analyze: personal (~/.cursor/skills), project (.cursor/skills), or both'),
  project_root: z
    .string()
    .optional()
    .describe('Project root for project skills. Defaults to current working directory.'),
});

export type OptimizeSkillsInput = z.infer<typeof OptimizeSkillsInputSchema>;

/** Criterion result for a single check */
export interface CriterionResult {
  id: string;
  name: string;
  passed: boolean;
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
  value?: string | number;
  limit?: number;
}

/** Per-skill evaluation result */
export interface SkillEvaluation {
  path: string;
  name: string;
  description: string;
  lineCount: number;
  criteria: CriterionResult[];
  score: number; // 0-100, proportion of passed criteria
  optimal: boolean;
}

/** Full optimization report */
export interface OptimizeSkillsResponse {
  status: 'success';
  message: string;
  summary: {
    totalSkills: number;
    optimalCount: number;
    needsWorkCount: number;
    scopesScanned: string[];
  };
  skills: SkillEvaluation[];
}

const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_SKILL_MD_LINES = 500;
const NAME_REGEX = /^[a-z0-9-]+$/;
const VAGUE_NAMES = ['helper', 'utils', 'tools', 'misc', 'other', 'general'];
const WINDOWS_PATH_REGEX = /\\/;
const THIRD_PERSON_INDICATORS = ['use when', 'use for', 'guides', 'processes', 'analyzes', 'generates', 'creates', 'helps with', 'extracts', 'reviews', 'validates'];
const FIRST_PERSON_INDICATORS = /\b(I |we |you can |your )/i;

function parseFrontmatter(content: string): { name?: string; description?: string; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { body: content };
  const front = match[1] ?? '';
  const body = match[2] ?? content;
  const nameMatch = front.match(/^name:\s*["']?([^"'\n]+)["']?/m);
  const descMatch = front.match(/^description:\s*["']?([^"'\n]+)["']?/m);
  return {
    name: nameMatch?.[1]?.trim(),
    description: descMatch?.[1]?.trim(),
    body,
  };
}

function discoverSkillDirs(basePath: string): string[] {
  const dirs: string[] = [];
  if (!fs.existsSync(basePath) || !fs.statSync(basePath).isDirectory()) return dirs;
  try {
    const entries = fs.readdirSync(basePath, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const skillPath = path.join(basePath, e.name);
      const skillMd = path.join(skillPath, 'SKILL.md');
      if (fs.existsSync(skillMd) && fs.statSync(skillMd).isFile()) dirs.push(skillPath);
    }
  } catch {
    // ignore permission errors etc.
  }
  return dirs;
}

function evaluateSkill(skillDir: string, rawContent: string): SkillEvaluation {
  const lines = rawContent.split(/\r?\n/);
  const lineCount = lines.length;
  const { name = '', description = '', body } = parseFrontmatter(rawContent);
  const criteria: CriterionResult[] = [];

  // C1: name present and non-empty
  if (!name || name.trim().length === 0) {
    criteria.push({
      id: 'name_required',
      name: 'Name required',
      passed: false,
      severity: 'error',
      message: 'Skill must have a `name` field in frontmatter.',
      suggestion: 'Add: name: your-skill-name (lowercase, hyphens, max 64 chars)',
    });
  } else {
    // C2: name length
    if (name.length > MAX_NAME_LENGTH) {
      criteria.push({
        id: 'name_length',
        name: 'Name length',
        passed: false,
        severity: 'error',
        message: `Name exceeds ${MAX_NAME_LENGTH} characters.`,
        value: name.length,
        limit: MAX_NAME_LENGTH,
        suggestion: `Shorten to ≤${MAX_NAME_LENGTH} chars (e.g. use abbreviations).`,
      });
    } else {
      criteria.push({
        id: 'name_length',
        name: 'Name length',
        passed: true,
        severity: 'info',
        message: `Name length OK (${name.length}/${MAX_NAME_LENGTH}).`,
        value: name.length,
        limit: MAX_NAME_LENGTH,
      });
    }
    // C3: name format (lowercase, hyphens)
    if (!NAME_REGEX.test(name)) {
      criteria.push({
        id: 'name_format',
        name: 'Name format',
        passed: false,
        severity: 'error',
        message: 'Name must use only lowercase letters, numbers, and hyphens.',
        value: name,
        suggestion: 'Use e.g. my-skill-name (no spaces, no uppercase).',
      });
    } else {
      criteria.push({
        id: 'name_format',
        name: 'Name format',
        passed: true,
        severity: 'info',
        message: 'Name format is valid.',
      });
    }
    // C4: vague name
    const nameLower = name.toLowerCase();
    if (VAGUE_NAMES.some((v) => nameLower === v || nameLower.includes(v))) {
      criteria.push({
        id: 'name_vague',
        name: 'Name specificity',
        passed: false,
        severity: 'warning',
        message: 'Skill name is vague; discovery is harder.',
        suggestion: 'Use a specific name (e.g. processing-pdfs, analyzing-spreadsheets).',
      });
    } else {
      criteria.push({
        id: 'name_vague',
        name: 'Name specificity',
        passed: true,
        severity: 'info',
        message: 'Name is specific enough.',
      });
    }
  }

  // C5: description required and length
  if (!description || description.trim().length === 0) {
    criteria.push({
      id: 'description_required',
      name: 'Description required',
      passed: false,
      severity: 'error',
      message: 'Skill must have a `description` in frontmatter.',
      suggestion: 'Add a brief description (WHAT + WHEN) so the agent knows when to apply it.',
    });
  } else {
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      criteria.push({
        id: 'description_length',
        name: 'Description length',
        passed: false,
        severity: 'error',
        message: `Description exceeds ${MAX_DESCRIPTION_LENGTH} characters.`,
        value: description.length,
        limit: MAX_DESCRIPTION_LENGTH,
        suggestion: `Shorten to ≤${MAX_DESCRIPTION_LENGTH} chars; move details to reference.md.`,
      });
    } else {
      criteria.push({
        id: 'description_length',
        name: 'Description length',
        passed: true,
        severity: 'info',
        message: `Description length OK (${description.length}/${MAX_DESCRIPTION_LENGTH}).`,
        value: description.length,
        limit: MAX_DESCRIPTION_LENGTH,
      });
    }
    // C6: third person (avoid "I", "you can")
    if (FIRST_PERSON_INDICATORS.test(description)) {
      criteria.push({
        id: 'description_third_person',
        name: 'Description third person',
        passed: false,
        severity: 'warning',
        message: 'Description should be in third person (injected into system prompt).',
        suggestion: 'Use e.g. "Processes Excel files..." instead of "I can help you process...".',
      });
    } else {
      criteria.push({
        id: 'description_third_person',
        name: 'Description third person',
        passed: true,
        severity: 'info',
        message: 'Description appears to be in third person.',
      });
    }
    // C7: WHAT + WHEN (trigger terms)
    const hasWhatWhen =
      description.length >= 20 &&
      (THIRD_PERSON_INDICATORS.some((t) => description.toLowerCase().includes(t)) ||
        /use when|when the user|when working with|when (analyzing|creating|reviewing)/i.test(description));
    if (!hasWhatWhen) {
      criteria.push({
        id: 'description_what_when',
        name: 'Description WHAT + WHEN',
        passed: false,
        severity: 'warning',
        message: 'Description should state what the skill does and when to use it (trigger terms).',
        suggestion: 'Add e.g. "Use when the user asks for X" or "Use when working with Y".',
      });
    } else {
      criteria.push({
        id: 'description_what_when',
        name: 'Description WHAT + WHEN',
        passed: true,
        severity: 'info',
        message: 'Description includes purpose and trigger context.',
      });
    }
  }

  // C8: SKILL.md under 500 lines
  if (lineCount > MAX_SKILL_MD_LINES) {
    criteria.push({
      id: 'skill_md_lines',
      name: 'SKILL.md size',
      passed: false,
      severity: 'warning',
      message: `SKILL.md has ${lineCount} lines (optimal: ≤${MAX_SKILL_MD_LINES}).`,
      value: lineCount,
      limit: MAX_SKILL_MD_LINES,
      suggestion: 'Move detailed content to reference.md or examples.md; keep SKILL.md concise.',
    });
  } else {
    criteria.push({
      id: 'skill_md_lines',
      name: 'SKILL.md size',
      passed: true,
      severity: 'info',
      message: `SKILL.md length OK (${lineCount}/${MAX_SKILL_MD_LINES} lines).`,
      value: lineCount,
      limit: MAX_SKILL_MD_LINES,
    });
  }

  // C9: Windows-style paths
  if (WINDOWS_PATH_REGEX.test(body)) {
    criteria.push({
      id: 'no_windows_paths',
      name: 'Path style',
      passed: false,
      severity: 'warning',
      message: 'Use forward slashes for paths (no backslashes).',
      suggestion: 'Use scripts/helper.py instead of scripts\\helper.py',
    });
  } else {
    criteria.push({
      id: 'no_windows_paths',
      name: 'Path style',
      passed: true,
      severity: 'info',
      message: 'No Windows-style paths detected.',
    });
  }

  // C10: Deep references (more than one level)
  const refMatches = body.matchAll(/\]\(([^)]+\.md)\)/g);
  let deepRefs: string[] = [];
  for (const m of refMatches) {
    const ref = m[1] ?? '';
    if (ref.includes('/') && (ref.match(/\//g)?.length ?? 0) >= 2) deepRefs.push(ref);
  }
  if (deepRefs.length > 0) {
    criteria.push({
      id: 'refs_one_level',
      name: 'File references one level',
      passed: false,
      severity: 'warning',
      message: 'Keep references one level deep from SKILL.md.',
      suggestion: `Move or flatten: ${deepRefs.slice(0, 3).join(', ')}${deepRefs.length > 3 ? '...' : ''}`,
    });
  } else {
    criteria.push({
      id: 'refs_one_level',
      name: 'File references one level',
      passed: true,
      severity: 'info',
      message: 'References appear one level deep.',
    });
  }

  const passed = criteria.filter((c) => c.passed).length;
  const score = criteria.length ? Math.round((passed / criteria.length) * 100) : 0;
  const optimal = criteria.filter((c) => !c.passed && (c.severity === 'error' || c.severity === 'warning')).length === 0;

  return {
    path: skillDir,
    name: name || path.basename(skillDir),
    description: description || '',
    lineCount,
    criteria,
    score,
    optimal,
  };
}

export async function optimizeSkills(args: OptimizeSkillsInput): Promise<ToolResult> {
  try {
    const projectRoot = args.project_root ?? process.cwd();
    const personalBase = path.join(os.homedir(), '.cursor', 'skills');
    const projectBase = path.join(projectRoot, '.cursor', 'skills');

    const scopesScanned: string[] = [];
    const allDirs: string[] = [];

    if (args.scope === 'personal' || args.scope === 'both') {
      const personalDirs = discoverSkillDirs(personalBase);
      allDirs.push(...personalDirs);
      if (personalBase) scopesScanned.push('personal');
    }
    if (args.scope === 'project' || args.scope === 'both') {
      const projectDirs = discoverSkillDirs(projectBase);
      allDirs.push(...projectDirs);
      if (projectBase) scopesScanned.push('project');
    }

    const skills: SkillEvaluation[] = [];
    for (const dir of allDirs) {
      const skillMdPath = path.join(dir, 'SKILL.md');
      try {
        const content = fs.readFileSync(skillMdPath, 'utf-8');
        skills.push(evaluateSkill(dir, content));
      } catch (err) {
        skills.push({
          path: dir,
          name: path.basename(dir),
          description: '',
          lineCount: 0,
          criteria: [
            {
              id: 'read_error',
              name: 'Read SKILL.md',
              passed: false,
              severity: 'error',
              message: err instanceof Error ? err.message : 'Failed to read SKILL.md',
            },
          ],
          score: 0,
          optimal: false,
        });
      }
    }

    const optimalCount = skills.filter((s) => s.optimal).length;
    const response: OptimizeSkillsResponse = {
      status: 'success',
      message: `Evaluated ${skills.length} skill(s) against optimization criteria.`,
      summary: {
        totalSkills: skills.length,
        optimalCount,
        needsWorkCount: skills.length - optimalCount,
        scopesScanned: [...new Set(scopesScanned)],
      },
      skills,
    };

    return createToolResult(response);
  } catch (error) {
    const errorResponse = createGenericError(error, false);
    return createToolResult(errorResponse);
  }
}

export const optimizeSkillsTool = tool(
  'optimize_skills',
  'Discovers Cursor skills (personal and/or project), evaluates each against criterion-specific optimization rules (name, description, SKILL.md size, paths, references), and returns a structured report with precise suggestions to make each skill optimal. Call when the user wants to optimize, audit, or improve their skills.',
  OptimizeSkillsInputSchema.shape,
  optimizeSkills
);
