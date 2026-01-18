import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * Example component test for GhostShell package.
 *
 * This test file demonstrates the testing patterns for React components:
 * - Using @testing-library/react for rendering
 * - Testing user interactions with fireEvent
 * - Using screen queries (getByRole, getByText, etc.)
 * - Testing component behavior, not implementation
 *
 * Note: These tests use inline components for demonstration.
 * Real tests should import from the actual component files.
 */

// Example: Simple Button component for testing
function Button({
  onClick,
  disabled = false,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

describe('Button Component', () => {
  it('renders with correct text', () => {
    render(<Button>Click me</Button>);

    expect(screen.getByRole('button')).toHaveTextContent('Click me');
  });

  it('calls onClick when clicked', () => {
    let clicked = false;
    const handleClick = () => {
      clicked = true;
    };

    render(<Button onClick={handleClick}>Click me</Button>);

    fireEvent.click(screen.getByRole('button'));

    expect(clicked).toBe(true);
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Click me</Button>);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('is not disabled by default', () => {
    render(<Button>Click me</Button>);

    expect(screen.getByRole('button')).not.toBeDisabled();
  });
});

// Example: Testing a component with state
function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <span data-testid="count">{count}</span>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
      <button onClick={() => setCount((c) => c - 1)}>Decrement</button>
    </div>
  );
}

// Need to import useState for the Counter component
import { useState } from 'react';

describe('Counter Component', () => {
  it('renders initial count of 0', () => {
    render(<Counter />);

    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('increments count when increment button is clicked', () => {
    render(<Counter />);

    fireEvent.click(screen.getByRole('button', { name: /increment/i }));

    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });

  it('decrements count when decrement button is clicked', () => {
    render(<Counter />);

    fireEvent.click(screen.getByRole('button', { name: /decrement/i }));

    expect(screen.getByTestId('count')).toHaveTextContent('-1');
  });

  it('handles multiple clicks correctly', () => {
    render(<Counter />);

    fireEvent.click(screen.getByRole('button', { name: /increment/i }));
    fireEvent.click(screen.getByRole('button', { name: /increment/i }));
    fireEvent.click(screen.getByRole('button', { name: /decrement/i }));

    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });
});
