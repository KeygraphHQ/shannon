// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import chalk from 'chalk';
import { formatDuration } from './formatting.js';

// Timing utilities

export class Timer {
  name: string;
  startTime: number;
  endTime: number | null = null;

  constructor(name: string) {
    this.name = name;
    this.startTime = Date.now();
  }

  stop(): number {
    this.endTime = Date.now();
    return this.duration();
  }

  duration(): number {
    const end = this.endTime || Date.now();
    return end - this.startTime;
  }
}

interface TimingResultsAgents {
  [key: string]: number;
}

interface TimingResults {
  total: Timer | null;
  agents: TimingResultsAgents;
}

interface CostResultsAgents {
  [key: string]: number;
}

interface CostResults {
  agents: CostResultsAgents;
  total: number;
}

// Global timing and cost tracker
export const timingResults: TimingResults = {
  total: null,
  agents: {},
};

export const costResults: CostResults = {
  agents: {},
  total: 0,
};

// Function to display comprehensive timing summary
export const displayTimingSummary = (): void => {
  if (!timingResults.total) {
    console.log(chalk.yellow('No timing data available'));
    return;
  }

  const totalDuration = timingResults.total.stop();

  console.log(chalk.cyan.bold('\n⏱️  TIMING SUMMARY'));
  console.log(chalk.gray('─'.repeat(60)));

  // Total execution time
  console.log(chalk.cyan(`📊 Total Execution Time: ${formatDuration(totalDuration)}`));
  console.log();

  // Agent breakdown
  if (Object.keys(timingResults.agents).length > 0) {
    console.log(chalk.magenta.bold('🤖 Agent Breakdown:'));
    let agentTotal = 0;
    for (const [agent, duration] of Object.entries(timingResults.agents)) {
      const percentage = ((duration / totalDuration) * 100).toFixed(1);
      const displayName = agent.replace(/-/g, ' ');
      console.log(
        chalk.magenta(
          `  ${displayName.padEnd(20)} ${formatDuration(duration).padStart(8)} (${percentage}%)`
        )
      );
      agentTotal += duration;
    }
    console.log(
      chalk.gray(
        `  ${'Agents Total'.padEnd(20)} ${formatDuration(agentTotal).padStart(8)} (${((agentTotal / totalDuration) * 100).toFixed(1)}%)`
      )
    );
  }

  // Cost breakdown
  if (Object.keys(costResults.agents).length > 0) {
    console.log(chalk.green.bold('\n💰 Cost Breakdown:'));
    for (const [agent, cost] of Object.entries(costResults.agents)) {
      const displayName = agent.replace(/-/g, ' ');
      console.log(chalk.green(`  ${displayName.padEnd(20)} $${cost.toFixed(4).padStart(8)}`));
    }
    console.log(chalk.gray(`  ${'Total Cost'.padEnd(20)} $${costResults.total.toFixed(4).padStart(8)}`));
  }

  console.log(chalk.gray('─'.repeat(60)));
};
