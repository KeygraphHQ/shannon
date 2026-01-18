import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Extend Vitest's expect with jest-dom matchers
// This allows assertions like:
// - expect(element).toBeInTheDocument()
// - expect(element).toHaveTextContent('text')
// - expect(element).toBeVisible()
// - expect(element).toBeDisabled()

// Clean up after each test to prevent DOM pollution
afterEach(() => {
  cleanup();
});
