// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { createInterface } from 'readline';
import { PentestError } from '../error-handling.js';

/**
 * Prompt user for yes/no confirmation
 * @param {string} message - Question to display
 * @returns {Promise<boolean>} true if confirmed, false otherwise
 */
export async function promptConfirmation(message) {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    readline.question(message + ' ', (answer) => {
      readline.close();
      const confirmed = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
      resolve(confirmed);
    });
  });
}

/**
 * Prompt user to select from numbered list
 * @param {string} message - Selection prompt
 * @param {Array} items - Items to choose from
 * @returns {Promise<any>} Selected item
 * @throws {PentestError} If invalid selection
 */
export async function promptSelection(message, items) {
  if (!items || items.length === 0) {
    throw new PentestError(
      'No items available for selection',
      'validation',
      false
    );
  }

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve, reject) => {
    readline.question(message + ' ', (answer) => {
      readline.close();

      const choice = parseInt(answer);
      if (isNaN(choice) || choice < 1 || choice > items.length) {
        reject(new PentestError(
          `Invalid selection. Please enter a number between 1 and ${items.length}`,
          'validation',
          false,
          { choice: answer }
        ));
      } else {
        resolve(items[choice - 1]);
      }
    });
  });
}
