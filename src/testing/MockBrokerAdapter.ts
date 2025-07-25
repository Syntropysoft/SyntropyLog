/**
 * MockBrokerAdapter - Framework Agnostic Mock
 *
 * This mock provides a testing-agnostic version of IBrokerAdapter
 * that can be used with both Vitest and Jest without conflicts.
 */

export interface BrokerMessage {
  id: string;
  data: any;
  metadata?: Record<string, any>;
  timestamp?: string;
}

export type MessageHandler = (message: BrokerMessage) => Promise<void> | void;

export interface IBrokerAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  publish(topic: string, message: BrokerMessage): Promise<void>;
  subscribe(topic: string, handler: MessageHandler): Promise<void>;
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

export class MockBrokerAdapter implements IBrokerAdapter {
  private spyFn: ((implementation?: any) => any) | null = null;
  private errors: Map<string, Error> = new Map();
  private timeouts: Map<string, number> = new Map();

  // Core methods - will be initialized in constructor
  public readonly connect: any;
  public readonly disconnect: any;
  public readonly publish: any;
  public readonly subscribe: any;
  public readonly setError: any;
  public readonly setTimeout: any;
  public readonly reset: any;

  constructor(spyFn?: (implementation?: any) => any) {
    this.spyFn = spyFn || null;

    // Initialize mocks after spyFn is set
    this.connect = this.createMock().mockImplementation(async () => {
      // Check for timeout first
      if (this.timeouts.has('connect')) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.timeouts.get('connect')! + 10)
        );
        throw new Error(
          `Mock broker timed out after ${this.timeouts.get('connect')}ms`
        );
      }

      // Check for error simulation
      if (this.errors.has('connect')) {
        throw this.errors.get('connect')!;
      }

      return undefined;
    });

    this.disconnect = this.createMock().mockImplementation(async () => {
      if (this.timeouts.has('disconnect')) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.timeouts.get('disconnect')! + 10)
        );
        throw new Error(
          `Mock broker timed out after ${this.timeouts.get('disconnect')}ms`
        );
      }

      if (this.errors.has('disconnect')) {
        throw this.errors.get('disconnect')!;
      }

      return undefined;
    });

    this.publish = this.createMock().mockImplementation(
      async (topic: string, message: BrokerMessage) => {
        if (this.timeouts.has('publish')) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.timeouts.get('publish')! + 10)
          );
          throw new Error(
            `Mock broker timed out after ${this.timeouts.get('publish')}ms`
          );
        }

        if (this.errors.has('publish')) {
          throw this.errors.get('publish')!;
        }

        return undefined;
      }
    );

    this.subscribe = this.createMock().mockImplementation(
      async (topic: string, handler: MessageHandler) => {
        if (this.timeouts.has('subscribe')) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.timeouts.get('subscribe')! + 10)
          );
          throw new Error(
            `Mock broker timed out after ${this.timeouts.get('subscribe')}ms`
          );
        }

        if (this.errors.has('subscribe')) {
          throw this.errors.get('subscribe')!;
        }

        return undefined;
      }
    );

    this.setError = this.createMock().mockImplementation(
      (method: string, error: Error) => {
        this.errors.set(method, error);
      }
    );

    this.setTimeout = this.createMock().mockImplementation(
      (method: string, timeoutMs: number) => {
        this.timeouts.set(method, timeoutMs);
      }
    );

    this.reset = this.createMock().mockImplementation(() => {
      this.errors.clear();
      this.timeouts.clear();
      this.connect.mockReset();
      this.disconnect.mockReset();
      this.publish.mockReset();
      this.subscribe.mockReset();

      // Restore default implementations
      this.connect.mockImplementation(async () => undefined);
      this.disconnect.mockImplementation(async () => undefined);
      this.publish.mockImplementation(async () => undefined);
      this.subscribe.mockImplementation(async () => undefined);
    });
  }

  private createMock(implementation?: any) {
    if (!this.spyFn) {
      throw new Error(`
🚨 SPY FUNCTION NOT INJECTED! 😡

To use spy functions like toHaveBeenCalled(), toHaveBeenCalledWith(), etc.
YOU MUST inject your spy function in the constructor:

// For Vitest:
const mockBroker = new MockBrokerAdapter(vi.fn);

// For Jest:
const mockBroker = new MockBrokerAdapter(jest.fn);

// For Jasmine:
const mockBroker = new MockBrokerAdapter(jasmine.createSpy);

// Without spy (basic functionality only):
const mockBroker = new MockBrokerAdapter();

DON'T FORGET AGAIN! 😤
      `);
    }
    return this.spyFn(implementation);
  }
}
