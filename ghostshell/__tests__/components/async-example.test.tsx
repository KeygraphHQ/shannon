/**
 * Async Component Testing Examples
 *
 * This file demonstrates patterns for testing React components
 * with asynchronous behavior, data fetching, and loading states.
 *
 * Key patterns demonstrated:
 * - Testing loading states
 * - Testing async data fetching
 * - Testing error states
 * - Mocking fetch/API calls
 * - Using waitFor for async assertions
 * - Testing user interactions with async results
 */

import React, { useState, useEffect } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// =============================================================================
// Example Component: UserProfile
// A component that fetches and displays user data
// =============================================================================

interface User {
  id: string;
  name: string;
  email: string;
}

interface UserProfileProps {
  userId: string;
  fetchUser: (id: string) => Promise<User>;
}

function UserProfile({ userId, fetchUser }: UserProfileProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchUser(userId);
        if (!cancelled) {
          setUser(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load user');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadUser();

    return () => {
      cancelled = true;
    };
  }, [userId, fetchUser]);

  if (loading) {
    return <div role="status" aria-label="Loading">Loading user data...</div>;
  }

  if (error) {
    return <div role="alert">{error}</div>;
  }

  if (!user) {
    return <div>User not found</div>;
  }

  return (
    <div data-testid="user-profile">
      <h2>{user.name}</h2>
      <p>{user.email}</p>
    </div>
  );
}

describe('UserProfile', () => {
  const mockUser: User = {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
  };

  it('should show loading state initially', () => {
    const fetchUser = vi.fn(() => new Promise<User>(() => {})); // Never resolves

    render(<UserProfile userId="1" fetchUser={fetchUser} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading user data...');
  });

  it('should display user data after successful fetch', async () => {
    const fetchUser = vi.fn().mockResolvedValue(mockUser);

    render(<UserProfile userId="1" fetchUser={fetchUser} />);

    await waitFor(() => {
      expect(screen.getByTestId('user-profile')).toBeInTheDocument();
    });

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
    expect(fetchUser).toHaveBeenCalledWith('1');
  });

  it('should display error message on fetch failure', async () => {
    const fetchUser = vi.fn().mockRejectedValue(new Error('Network error'));

    render(<UserProfile userId="1" fetchUser={fetchUser} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Network error');
  });

  it('should refetch when userId changes', async () => {
    const fetchUser = vi.fn().mockResolvedValue(mockUser);

    const { rerender } = render(<UserProfile userId="1" fetchUser={fetchUser} />);

    await waitFor(() => {
      expect(screen.getByTestId('user-profile')).toBeInTheDocument();
    });

    const newUser = { id: '2', name: 'Jane Doe', email: 'jane@example.com' };
    fetchUser.mockResolvedValue(newUser);

    rerender(<UserProfile userId="2" fetchUser={fetchUser} />);

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });

    expect(fetchUser).toHaveBeenCalledTimes(2);
    expect(fetchUser).toHaveBeenLastCalledWith('2');
  });
});

// =============================================================================
// Example Component: SearchResults
// A component with debounced search
// =============================================================================

interface SearchResult {
  id: string;
  title: string;
}

interface SearchResultsProps {
  searchFn: (query: string) => Promise<SearchResult[]>;
}

function SearchResults({ searchFn }: SearchResultsProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await searchFn(query);
        setResults(data);
      } catch (err) {
        setError('Search failed');
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, searchFn]);

  return (
    <div>
      <input
        type="text"
        placeholder="Search..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search input"
      />

      {loading && <div role="status">Searching...</div>}

      {error && <div role="alert">{error}</div>}

      {!loading && !error && results.length > 0 && (
        <ul aria-label="Search results">
          {results.map((result) => (
            <li key={result.id}>{result.title}</li>
          ))}
        </ul>
      )}

      {!loading && !error && query && results.length === 0 && (
        <div>No results found</div>
      )}
    </div>
  );
}

describe('SearchResults', () => {
  // Note: Using real timers with waitFor instead of fake timers
  // as React 18's concurrent rendering has compatibility issues with vi.useFakeTimers()

  it('should show search results after debounce delay', async () => {
    const mockResults = [
      { id: '1', title: 'Result 1' },
      { id: '2', title: 'Result 2' },
    ];
    const searchFn = vi.fn().mockResolvedValue(mockResults);

    render(<SearchResults searchFn={searchFn} />);

    const input = screen.getByLabelText('Search input');
    fireEvent.change(input, { target: { value: 'test' } });

    // Wait for debounce delay and search to complete
    await waitFor(() => {
      expect(searchFn).toHaveBeenCalledWith('test');
    }, { timeout: 1000 });

    await waitFor(() => {
      expect(screen.getByLabelText('Search results')).toBeInTheDocument();
    });

    expect(screen.getByText('Result 1')).toBeInTheDocument();
    expect(screen.getByText('Result 2')).toBeInTheDocument();
  });

  it('should display error state on search failure', async () => {
    const searchFn = vi.fn().mockRejectedValue(new Error('API error'));

    render(<SearchResults searchFn={searchFn} />);

    const input = screen.getByLabelText('Search input');
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    }, { timeout: 1000 });

    expect(screen.getByRole('alert')).toHaveTextContent('Search failed');
  });

  it('should clear results when query is cleared', async () => {
    const mockResults = [{ id: '1', title: 'Result 1' }];
    const searchFn = vi.fn().mockResolvedValue(mockResults);

    render(<SearchResults searchFn={searchFn} />);

    const input = screen.getByLabelText('Search input');
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => {
      expect(screen.getByText('Result 1')).toBeInTheDocument();
    }, { timeout: 1000 });

    // Clear the input
    fireEvent.change(input, { target: { value: '' } });

    await waitFor(() => {
      expect(screen.queryByText('Result 1')).not.toBeInTheDocument();
    });
  });
});

// =============================================================================
// Example Component: FormWithSubmit
// A form component with async submission
// =============================================================================

interface FormData {
  name: string;
  email: string;
}

interface FormWithSubmitProps {
  onSubmit: (data: FormData) => Promise<void>;
  onSuccess?: () => void;
}

function FormWithSubmit({ onSubmit, onSuccess }: FormWithSubmitProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
    };

    try {
      await onSubmit(data);
      setSuccess(true);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="name">Name</label>
        <input id="name" name="name" type="text" required />
      </div>

      <div>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required />
      </div>

      {error && <div role="alert">{error}</div>}

      {success && <div role="status">Form submitted successfully!</div>}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  );
}

describe('FormWithSubmit', () => {
  it('should submit form data', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<FormWithSubmit onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Name'), 'John Doe');
    await user.type(screen.getByLabelText('Email'), 'john@example.com');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'John Doe',
        email: 'john@example.com',
      });
    });
  });

  it('should show submitting state', async () => {
    const user = userEvent.setup();
    let resolveSubmit: () => void;
    const onSubmit = vi.fn(
      () => new Promise<void>((resolve) => {
        resolveSubmit = resolve;
      })
    );

    render(<FormWithSubmit onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Name'), 'John');
    await user.type(screen.getByLabelText('Email'), 'john@example.com');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    // Button should show submitting state
    expect(screen.getByRole('button')).toHaveTextContent('Submitting...');
    expect(screen.getByRole('button')).toBeDisabled();

    // Resolve submission
    await waitFor(async () => {
      resolveSubmit!();
    });

    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveTextContent('Submit');
    });
  });

  it('should display success message', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn();

    render(<FormWithSubmit onSubmit={onSubmit} onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText('Name'), 'John');
    await user.type(screen.getByLabelText('Email'), 'john@example.com');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Form submitted successfully!');
    });

    expect(onSuccess).toHaveBeenCalled();
  });

  it('should display error on submission failure', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error('Server error'));

    render(<FormWithSubmit onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Name'), 'John');
    await user.type(screen.getByLabelText('Email'), 'john@example.com');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Server error');
    });
  });
});

// =============================================================================
// Example Component: DataList with Pagination
// A component that loads paginated data
// =============================================================================

interface Item {
  id: string;
  name: string;
}

interface DataListProps {
  fetchPage: (page: number) => Promise<{ items: Item[]; hasMore: boolean }>;
}

function DataList({ fetchPage }: DataListProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      setLoading(true);
      setError(null);

      try {
        const result = await fetchPage(page);
        if (!cancelled) {
          setItems((prev) =>
            page === 1 ? result.items : [...prev, ...result.items]
          );
          setHasMore(result.hasMore);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load items');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPage();

    return () => {
      cancelled = true;
    };
  }, [page, fetchPage]);

  return (
    <div>
      {error && <div role="alert">{error}</div>}

      {items.length > 0 && (
        <ul aria-label="Items list">
          {items.map((item) => (
            <li key={item.id}>{item.name}</li>
          ))}
        </ul>
      )}

      {loading && <div role="status">Loading...</div>}

      {!loading && hasMore && (
        <button onClick={() => setPage((p) => p + 1)}>Load More</button>
      )}

      {!loading && !hasMore && items.length > 0 && (
        <div>End of list</div>
      )}
    </div>
  );
}

describe('DataList', () => {
  it('should load and display initial page', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      items: [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ],
      hasMore: true,
    });

    render(<DataList fetchPage={fetchPage} />);

    await waitFor(() => {
      expect(screen.getByText('Item 1')).toBeInTheDocument();
    });

    expect(screen.getByText('Item 2')).toBeInTheDocument();
    expect(fetchPage).toHaveBeenCalledWith(1);
  });

  it('should load more items when clicking load more', async () => {
    const user = userEvent.setup();
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        items: [{ id: '1', name: 'Item 1' }],
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: [{ id: '2', name: 'Item 2' }],
        hasMore: false,
      });

    render(<DataList fetchPage={fetchPage} />);

    await waitFor(() => {
      expect(screen.getByText('Item 1')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Load More' }));

    await waitFor(() => {
      expect(screen.getByText('Item 2')).toBeInTheDocument();
    });

    // Both items should be visible
    expect(screen.getByText('Item 1')).toBeInTheDocument();

    // Load more button should be gone
    expect(screen.queryByRole('button', { name: 'Load More' })).not.toBeInTheDocument();
    expect(screen.getByText('End of list')).toBeInTheDocument();
  });

  it('should display error on fetch failure', async () => {
    const fetchPage = vi.fn().mockRejectedValue(new Error('Network error'));

    render(<DataList fetchPage={fetchPage} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to load items');
    });
  });
});
