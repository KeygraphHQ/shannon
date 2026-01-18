import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Example unit test demonstrating mocking patterns in Vitest.
 *
 * Mocking is essential for:
 * - Isolating the unit under test
 * - Avoiding side effects (file system, network, etc.)
 * - Controlling test conditions
 * - Speeding up tests
 *
 * Vitest provides:
 * - vi.fn() - Create a mock function
 * - vi.spyOn() - Spy on existing methods
 * - vi.mock() - Mock entire modules
 * - vi.mocked() - Type-safe access to mocked functions
 */

// Example module to test
interface Logger {
  info(message: string): void;
  error(message: string, error?: Error): void;
}

interface HttpClient {
  get(url: string): Promise<{ status: number; data: unknown }>;
  post(url: string, body: unknown): Promise<{ status: number; data: unknown }>;
}

class DataFetcher {
  constructor(
    private logger: Logger,
    private httpClient: HttpClient
  ) {}

  async fetchData(url: string): Promise<unknown> {
    this.logger.info(`Fetching data from ${url}`);

    try {
      const response = await this.httpClient.get(url);

      if (response.status !== 200) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      this.logger.info(`Successfully fetched data from ${url}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch data from ${url}`, error as Error);
      throw error;
    }
  }

  async postData(url: string, data: unknown): Promise<unknown> {
    this.logger.info(`Posting data to ${url}`);

    const response = await this.httpClient.post(url, data);
    return response.data;
  }
}

describe('DataFetcher with mocks', () => {
  // Create mock implementations
  let mockLogger: Logger;
  let mockHttpClient: HttpClient;
  let fetcher: DataFetcher;

  beforeEach(() => {
    // Create fresh mocks for each test
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
    };

    mockHttpClient = {
      get: vi.fn(),
      post: vi.fn(),
    };

    fetcher = new DataFetcher(mockLogger, mockHttpClient);
  });

  afterEach(() => {
    // Clear all mocks after each test
    vi.clearAllMocks();
  });

  describe('fetchData', () => {
    it('should fetch data successfully and log info', async () => {
      // Arrange
      const testData = { id: 1, name: 'Test' };
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        status: 200,
        data: testData,
      });

      // Act
      const result = await fetcher.fetchData('https://api.example.com/data');

      // Assert
      expect(result).toEqual(testData);
      expect(mockHttpClient.get).toHaveBeenCalledWith('https://api.example.com/data');
      expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('Fetching data from https://api.example.com/data');
      expect(mockLogger.info).toHaveBeenCalledWith('Successfully fetched data from https://api.example.com/data');
    });

    it('should throw and log error on HTTP error', async () => {
      // Arrange
      vi.mocked(mockHttpClient.get).mockResolvedValue({
        status: 404,
        data: null,
      });

      // Act & Assert
      await expect(fetcher.fetchData('https://api.example.com/missing')).rejects.toThrow('HTTP error: 404');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to fetch data from https://api.example.com/missing',
        expect.any(Error)
      );
    });

    it('should throw and log error on network failure', async () => {
      // Arrange
      const networkError = new Error('Network unavailable');
      vi.mocked(mockHttpClient.get).mockRejectedValue(networkError);

      // Act & Assert
      await expect(fetcher.fetchData('https://api.example.com/data')).rejects.toThrow('Network unavailable');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to fetch data from https://api.example.com/data',
        networkError
      );
    });
  });

  describe('postData', () => {
    it('should post data and return response', async () => {
      // Arrange
      const postBody = { name: 'New Item' };
      const responseData = { id: 123, name: 'New Item' };
      vi.mocked(mockHttpClient.post).mockResolvedValue({
        status: 201,
        data: responseData,
      });

      // Act
      const result = await fetcher.postData('https://api.example.com/items', postBody);

      // Assert
      expect(result).toEqual(responseData);
      expect(mockHttpClient.post).toHaveBeenCalledWith('https://api.example.com/items', postBody);
      expect(mockLogger.info).toHaveBeenCalledWith('Posting data to https://api.example.com/items');
    });
  });
});

// Example: Spying on existing objects
describe('Spying on objects', () => {
  it('should spy on console methods', () => {
    // Arrange
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Act
    console.log('Test message');

    // Assert
    expect(consoleSpy).toHaveBeenCalledWith('Test message');

    // Cleanup
    consoleSpy.mockRestore();
  });

  it('should track call history with spies', () => {
    // Arrange
    const obj = {
      multiply: (a: number, b: number) => a * b,
    };
    const spy = vi.spyOn(obj, 'multiply');

    // Act
    obj.multiply(2, 3);
    obj.multiply(4, 5);

    // Assert
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, 2, 3);
    expect(spy).toHaveBeenNthCalledWith(2, 4, 5);
    expect(spy).toHaveReturnedWith(6);
    expect(spy).toHaveLastReturnedWith(20);
  });
});

// Example: Mocking timers
describe('Mocking timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should handle setTimeout with fake timers', async () => {
    // Arrange
    const callback = vi.fn();
    setTimeout(callback, 1000);

    // Assert - callback not called yet
    expect(callback).not.toHaveBeenCalled();

    // Act - advance time
    vi.advanceTimersByTime(1000);

    // Assert - callback called after time passes
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should handle async operations with fake timers', async () => {
    // Arrange
    const delayedValue = async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return 'delayed';
    };

    // Act
    const promise = delayedValue();
    vi.advanceTimersByTime(500);
    const result = await promise;

    // Assert
    expect(result).toBe('delayed');
  });
});
