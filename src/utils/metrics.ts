// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

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

