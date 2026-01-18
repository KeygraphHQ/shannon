import '@testing-library/jest-dom/vitest';

// Extend Vitest's expect with jest-dom matchers
// This allows assertions like:
// - expect(element).toBeInTheDocument()
// - expect(element).toHaveTextContent('text')
// - expect(element).toBeVisible()
// - expect(element).toBeDisabled()
