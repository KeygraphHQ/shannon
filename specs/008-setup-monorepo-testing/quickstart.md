# Quickstart: Testing Infrastructure

**Date**: 2026-01-18
**Related Plan**: [plan.md](./plan.md)

## Overview

This guide helps developers run tests, write new tests, and understand the testing infrastructure in the Shannon monorepo.

---

## Running Tests

### Run All Tests (Monorepo)

```bash
# From repository root
npm test
```

This runs tests for both Shannon and GhostShell packages.

### Run Tests for Specific Package

```bash
# Shannon package only
npm test -w shannon

# GhostShell package only
npm test -w ghostshell
```

### Watch Mode (Continuous Testing)

```bash
# All packages
npm run test:watch

# Specific package
npm run test:watch -w shannon
npm run test:watch -w ghostshell
```

### Run Specific Test File

```bash
# By file path
npm test -- shannon/__tests__/unit/config-parser.test.ts

# By pattern
npm test -- --grep "config parser"
```

### Run with Coverage

```bash
# Generate coverage report
npm run test:coverage

# Open HTML coverage report
open coverage/index.html  # macOS
xdg-open coverage/index.html  # Linux
```

---

## Writing Tests

### Test File Location

| Package | Test Location | Purpose |
|---------|---------------|---------|
| Shannon | `shannon/__tests__/unit/` | Unit tests for utilities, services |
| Shannon | `shannon/__tests__/integration/` | Integration tests |
| GhostShell | `ghostshell/__tests__/unit/` | Unit tests for lib/ |
| GhostShell | `ghostshell/__tests__/components/` | React component tests |

### Naming Convention

- `*.test.ts` - Unit tests
- `*.test.tsx` - React component tests
- `*.spec.ts` - Integration tests (optional differentiation)

### Basic Unit Test (Shannon)

```typescript
// shannon/__tests__/unit/config-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseConfig } from '../../src/config-parser';

describe('parseConfig', () => {
  it('should parse valid YAML configuration', () => {
    const yaml = `
      target: https://example.com
      auth:
        type: form
    `;

    const config = parseConfig(yaml);

    expect(config.target).toBe('https://example.com');
    expect(config.auth.type).toBe('form');
  });

  it('should throw on invalid configuration', () => {
    const invalidYaml = 'not: valid: yaml: here';

    expect(() => parseConfig(invalidYaml)).toThrow();
  });
});
```

### React Component Test (GhostShell)

```typescript
// ghostshell/__tests__/components/Button.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../../components/ui/Button';

describe('Button', () => {
  it('renders with correct text', () => {
    render(<Button>Click me</Button>);

    expect(screen.getByRole('button')).toHaveTextContent('Click me');
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    fireEvent.click(screen.getByRole('button'));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Click me</Button>);

    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

### Async Test

```typescript
import { describe, it, expect, vi } from 'vitest';
import { fetchUserData } from '../../src/api';

describe('fetchUserData', () => {
  it('returns user data on success', async () => {
    const userData = await fetchUserData('user-123');

    expect(userData).toMatchObject({
      id: 'user-123',
      name: expect.any(String),
    });
  });

  it('throws on network error', async () => {
    // Mock fetch to simulate error
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    await expect(fetchUserData('user-123')).rejects.toThrow('Network error');
  });
});
```

---

## Mocking

### Module Mocking

```typescript
import { describe, it, expect, vi } from 'vitest';

// Mock an entire module
vi.mock('../../src/database', () => ({
  query: vi.fn(),
  connect: vi.fn(),
}));

import { query } from '../../src/database';

describe('UserService', () => {
  it('queries the database', async () => {
    vi.mocked(query).mockResolvedValueOnce([{ id: 1, name: 'Test' }]);

    // ... test code

    expect(query).toHaveBeenCalledWith('SELECT * FROM users');
  });
});
```

### Spying on Functions

```typescript
import { describe, it, expect, vi } from 'vitest';
import * as utils from '../../src/utils';

describe('processData', () => {
  it('calls formatOutput', () => {
    const spy = vi.spyOn(utils, 'formatOutput');

    processData({ value: 42 });

    expect(spy).toHaveBeenCalledWith(42);
    spy.mockRestore();
  });
});
```

### Mocking Environment Variables

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('config with env vars', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses DATABASE_URL from environment', async () => {
    process.env.DATABASE_URL = 'postgres://test:test@localhost/test';

    const { getDbUrl } = await import('../../src/config');

    expect(getDbUrl()).toBe('postgres://test:test@localhost/test');
  });
});
```

---

## Testing React Hooks (GhostShell)

```typescript
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCounter } from '../../lib/hooks/useCounter';

describe('useCounter', () => {
  it('increments count', () => {
    const { result } = renderHook(() => useCounter());

    expect(result.current.count).toBe(0);

    act(() => {
      result.current.increment();
    });

    expect(result.current.count).toBe(1);
  });
});
```

---

## Common Matchers

```typescript
// Equality
expect(value).toBe(expected);           // Strict equality (===)
expect(value).toEqual(expected);        // Deep equality
expect(value).toMatchObject(partial);   // Partial object match

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeNull();
expect(value).toBeDefined();

// Numbers
expect(value).toBeGreaterThan(number);
expect(value).toBeLessThanOrEqual(number);
expect(value).toBeCloseTo(0.3, 5);      // Floating point

// Strings
expect(value).toMatch(/regex/);
expect(value).toContain('substring');

// Arrays
expect(array).toContain(item);
expect(array).toHaveLength(3);

// Functions
expect(fn).toHaveBeenCalled();
expect(fn).toHaveBeenCalledWith(arg1, arg2);
expect(fn).toHaveBeenCalledTimes(2);

// Exceptions
expect(() => fn()).toThrow();
expect(() => fn()).toThrow('error message');
expect(asyncFn()).rejects.toThrow();

// DOM (Testing Library)
expect(element).toBeInTheDocument();
expect(element).toBeVisible();
expect(element).toBeDisabled();
expect(element).toHaveTextContent('text');
expect(element).toHaveAttribute('href', '/path');
```

---

## CI Integration

Tests run automatically on:
- Every pull request
- Every push to main branch

### PR Checks

| Check | Requirement |
|-------|-------------|
| Tests Pass | All tests must pass |
| Coverage | New/changed code must have 70-80% coverage |

### Viewing CI Results

1. Open the Pull Request on GitHub
2. Scroll to the "Checks" section
3. Click on "Tests" to view detailed results
4. Click "Details" for coverage report

---

## Troubleshooting

### Tests Timing Out

Default timeout is 30 seconds. For longer tests:

```typescript
it('long running test', async () => {
  // ... test code
}, 60000); // 60 second timeout for this test only
```

### Module Resolution Issues

Ensure `tsconfig.json` paths match `vitest.config.ts` alias configuration.

### Component Test DOM Issues

If a test fails with DOM-related errors, try:

```typescript
// At top of test file
// @vitest-environment jsdom
```

### Flaky Tests

- Avoid hardcoded timeouts; use `waitFor` from Testing Library
- Ensure proper cleanup in `afterEach`
- Check for shared state between tests

---

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library Docs](https://testing-library.com/docs/react-testing-library/intro/)
- [Vitest Matchers](https://vitest.dev/api/expect.html)
