// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * LogStream - Stream composition utility for append-only logging
 *
 * Encapsulates the common stream management pattern used by AgentLogger
 * and WorkflowLogger: opening streams in append mode, handling backpressure,
 * and proper cleanup.
 */

import fs from 'fs';
import path from 'path';
import { ensureDirectory } from '../utils/file-io.js';

/**
 * LogStream - Manages a single append-only log file stream
 */
export class LogStream {
  private readonly filePath: string;
  private stream: fs.WriteStream | null = null;
  private _isOpen: boolean = false;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * Open the stream for writing (creates parent directories, opens in append mode)
   */
  async open(): Promise<void> {
    if (this._isOpen) {
      return;
    }

    // Ensure parent directory exists
    await ensureDirectory(path.dirname(this.filePath));

    // Create write stream in append mode
    this.stream = fs.createWriteStream(this.filePath, {
      flags: 'a',
      encoding: 'utf8',
      autoClose: true,
    });

    // Handle stream errors to prevent crashes (log and mark closed)
    this.stream.on('error', (err) => {
      console.error(`LogStream error for ${this.filePath}:`, err.message);
      this._isOpen = false;
    });

    this._isOpen = true;
  }

  /**
   * Write text to the stream with backpressure handling
   */
  async write(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this._isOpen || !this.stream) {
        reject(new Error('LogStream not open'));
        return;
      }

      const stream = this.stream;
      let drainHandler: (() => void) | null = null;

      const cleanup = () => {
        if (drainHandler) {
          stream.removeListener('drain', drainHandler);
          drainHandler = null;
        }
      };

      const needsDrain = !stream.write(text, 'utf8', (error) => {
        cleanup();
        if (error) {
          reject(error);
        } else if (!needsDrain) {
          resolve();
        }
      });

      if (needsDrain) {
        drainHandler = () => {
          cleanup();
          resolve();
        };
        stream.once('drain', drainHandler);
      }
    });
  }

  /**
   * Close the stream (flush and close)
   */
  async close(): Promise<void> {
    if (!this._isOpen || !this.stream) {
      return;
    }

    return new Promise((resolve) => {
      this.stream!.end(() => {
        this._isOpen = false;
        this.stream = null;
        resolve();
      });
    });
  }

  /**
   * Check if the stream is currently open
   */
  get isOpen(): boolean {
    return this._isOpen;
  }

  /**
   * Get the file path this stream writes to
   */
  get path(): string {
    return this.filePath;
  }
}
