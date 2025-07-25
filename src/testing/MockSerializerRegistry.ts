/**
 * MockSerializerRegistry - Framework Agnostic Mock
 *
 * This mock provides a testing-agnostic version of SerializerRegistry
 * that can be used with both Vitest and Jest without conflicts.
 */

export interface ILogger {
  warn: (message: string, metadata?: any) => void;
}

export type SerializerMap = Record<string, (value: unknown) => string>;

export interface SerializerRegistryOptions {
  serializers?: SerializerMap;
  timeoutMs?: number;
}

/**
 * Creates a simple agnostic mock function without spy capabilities
 */
function createAgnosticMockFn<T = any>(implementation?: (...args: any[]) => T) {
  const mockFn = (...args: any[]) => {
    if (implementation) {
      return implementation(...args);
    }
    return undefined;
  };

  // Basic mock properties
  (mockFn as any).mockClear = () => {};
  (mockFn as any).mockReset = () => {};
  (mockFn as any).mockImplementation = (impl: (...args: any[]) => T) => {
    return createAgnosticMockFn(impl);
  };
  (mockFn as any).mockReturnValue = (value: T) => {
    return createAgnosticMockFn(() => value);
  };
  (mockFn as any).mockResolvedValue = (value: T) => {
    return createAgnosticMockFn(() => Promise.resolve(value));
  };
  (mockFn as any).mockRejectedValue = (value: any) => {
    return createAgnosticMockFn(() => Promise.reject(value));
  };

  return mockFn as any;
}

export class MockSerializerRegistry {
  // Internal state to track configured serializers
  private serializers: Map<string, (value: unknown) => string> = new Map();
  private errorKeys: Set<string> = new Set();
  private timeoutMs: number | null = null;
  private spyFn: ((implementation?: any) => any) | null = null;

  // Core methods - will be initialized in constructor
  public readonly process: any;
  public readonly setSerializer: any;
  public readonly setError: any;
  public readonly setTimeout: any;
  public readonly reset: any;

  constructor(spyFn?: (implementation?: any) => any) {
    this.spyFn = spyFn || null;

    // Initialize mocks after spyFn is set
    this.process = this.createMock().mockImplementation(
      async (meta: Record<string, unknown>, logger: ILogger) => {
        // Check for timeout first
        if (this.timeoutMs !== null) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.timeoutMs! + 10)
          );
          throw new Error(
            `Mock serializer timed out after ${this.timeoutMs}ms.`
          );
        }

        const processedMeta = { ...meta };

        // Process each field with its configured serializer
        for (const [key, value] of Object.entries(processedMeta)) {
          // Check for error simulation
          if (this.errorKeys.has(key)) {
            throw new Error(`Mock error for key '${key}'`);
          }

          // Check for serializer
          const serializer = this.serializers.get(key);
          if (serializer) {
            try {
              processedMeta[key] = serializer(value);
            } catch (error) {
              logger.warn(`Mock serializer for key "${key}" failed.`, {
                error: error instanceof Error ? error.message : String(error),
              });
              processedMeta[key] =
                `[MOCK_SERIALIZER_ERROR: Failed to process key '${key}']`;
            }
          }
        }

        return processedMeta;
      }
    );

    this.setSerializer = this.createMock().mockImplementation(
      (key: string, serializer: (value: unknown) => string) => {
        this.serializers.set(key, serializer);
      }
    );

    this.setError = this.createMock().mockImplementation(
      (key: string, error: Error) => {
        this.errorKeys.add(key);
      }
    );

    this.setTimeout = this.createMock().mockImplementation(
      (timeoutMs: number) => {
        this.timeoutMs = timeoutMs;
      }
    );

    this.reset = this.createMock().mockImplementation(() => {
      this.serializers.clear();
      this.errorKeys.clear();
      this.timeoutMs = null;
      this.process.mockReset();
      this.process.mockImplementation(
        async (meta: Record<string, unknown>, logger: ILogger) => {
          return { ...meta };
        }
      );
    });
  }

  private createMock(implementation?: any) {
    if (!this.spyFn) {
      throw new Error(`
🚨 SPY FUNCTION NOT INJECTED! 😡

To use spy functions like toHaveBeenCalled(), toHaveBeenCalledWith(), etc.
YOU MUST inject your spy function in the constructor:

// For Vitest:
const mockSerializer = new MockSerializerRegistry(vi.fn);

// For Jest:
const mockSerializer = new MockSerializerRegistry(jest.fn);

// For Jasmine:
const mockSerializer = new MockSerializerRegistry(jasmine.createSpy);

// Without spy (basic functionality only):
const mockSerializer = new MockSerializerRegistry();

DON'T FORGET AGAIN! 😤
      `);
    }
    return this.spyFn(implementation);
  }
}
