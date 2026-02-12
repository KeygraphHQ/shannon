---
name: optimize-all-skills
description: Runs Skill Forge via the MCP gateway to profile, analyze, and optimize Shannon skills and prompts. Use when the user wants to optimize, audit, or improve skills; run all skills and see how to optimize; or get criterion-specific performance suggestions.
---

# Skill Forge — Optimize All Skills (Gateway)

When the user asks to optimize skills, this skill orchestrates the full Skill Forge loop.

## When to Use

- User says: "optimize my skills", "run all skills and optimize", "audit skills", "run forge", "skill performance"
- User wants pentest skill profiling, A/B testing, or version management

## Two Modes

### 1. Static Skill Quality Check (fast, no profiler data needed)

Call `optimize_skills` with `scope: "both"` to evaluate SKILL.md files against structural criteria (name, description, size, paths, references).

### 2. Full Forge Optimization Cycle (requires profiler data from past runs)

Call `forge_status` first to see profiler stats, then `forge_optimize` to run the full cycle.

## forge_status — View Performance Data

Call `forge_status` (optional `skill_id` filter) to see:
- Per-skill stats: avg duration, tokens in/out, cost, success rate, trend
- Optimization candidates flagged by the analyzer
- Version history per skill

## forge_optimize — Run Full Cycle

Call `forge_optimize` with:
- `project_root`: Shannon project root path (required)
- `auto_promote`: false (v1 manual, default) or true (v2 auto)
- Optional threshold overrides: `slow_tool_ms`, `slow_agent_ms`, `min_success_rate`, `improvement_threshold`

The tool runs: PROFILE → ANALYZE → GENERATE → VALIDATE → PROMOTE → VERSION

Returns for each candidate:
- **promote**: version swapped, reason (e.g. "~30% token reduction, outputs identical")
- **reject**: A/B test failed (outputs differ semantically)
- **needs_review**: some improvement but below threshold; present diff to user

## Thresholds (What Triggers Optimization)

| Rule | Default | Priority |
|------|---------|----------|
| Avg execution time (tools) | >2000ms | high |
| Avg execution time (agents) | >120s | high |
| Success rate | <50% | high |
| Tool response tokens | >3000 | medium |
| Agent token ratio (out/in) | >5x | medium |
| Cost per agent run | >$0.50 | low |
| Degrading trend | 5 consecutive worse | medium |

## After Running

1. Summarize which skills are optimal and which need work
2. For skills needing review: show the diff, expected improvement, and changes made
3. For promoted skills: confirm the version swap and note the improvement
4. For rejected skills: explain why (usually semantic output mismatch)
