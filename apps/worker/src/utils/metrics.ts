// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Wall-clock timer. Safe to call duration() before stop() to read elapsed time so far. */
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

  // Falls back to the current time when the timer hasn't been stopped yet, so callers
  // can poll an in-flight timer without needing to stop it first.
  duration(): number {
    const end = this.endTime || Date.now();
    return end - this.startTime;
  }
}
