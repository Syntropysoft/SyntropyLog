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

/** Message for createMock when spy is not injected (guard). */
const SPY_REQUIRED_MESSAGE = `SPY FUNCTION NOT INJECTED. Inject vi.fn() (Vitest), jest.fn() (Jest), or jasmine.createSpy() in the constructor.`;

export class MockBrokerAdapter implements IBrokerAdapter {
  private spyFn: ((implementation?: any) => any) | null = null;
  private errors: Map<string, Error> = new Map();
  private timeouts: Map<string, number> = new Map();

  public readonly connect: any;
  public readonly disconnect: any;
  public readonly publish: any;
  public readonly subscribe: any;
  public readonly setError: any;
  public readonly setTimeout: any;
  public readonly reset: any;

  constructor(spyFn?: (implementation?: any) => any) {
    this.spyFn = spyFn ?? null;

    this.connect = this.createMock().mockImplementation(() =>
      this.guardReject('connect')
    );

    this.disconnect = this.createMock().mockImplementation(() =>
      this.guardReject('disconnect')
    );

    this.publish = this.createMock().mockImplementation(
      async (_topic: string, _message: BrokerMessage) => {
        await this.guardReject('publish');
      }
    );

    this.subscribe = this.createMock().mockImplementation(
      async (_topic: string, _handler: MessageHandler) => {
        await this.guardReject('subscribe');
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

  /** Guard: throw timeout or configured error for a method, else resolve. */
  private async guardReject(method: string): Promise<void> {
    const timeoutMs = this.timeouts.get(method);
    if (timeoutMs != null) {
      await new Promise((r) => setTimeout(r, timeoutMs + 10));
      throw new Error(`Mock broker timed out after ${timeoutMs}ms`);
    }
    const err = this.errors.get(method);
    if (err != null) throw err;
  }

  private createMock(implementation?: any) {
    if (this.spyFn == null) {
      throw new Error(SPY_REQUIRED_MESSAGE);
    }
    return this.spyFn(implementation);
  }
}
