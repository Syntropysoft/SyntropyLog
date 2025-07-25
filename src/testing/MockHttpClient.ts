/**
 * MockHttpClient - Framework Agnostic Mock
 *
 * This mock provides a testing-agnostic version of IHttpClientAdapter
 * that can be used with both Vitest and Jest without conflicts.
 */

export interface AdapterHttpRequest {
  url: string;
  method: string;
  headers: Record<string, any>;
  body?: any;
  timeout?: number;
}

export interface AdapterHttpResponse<T = any> {
  statusCode: number;
  data: T;
  headers: Record<string, any>;
}

export interface AdapterHttpError extends Error {
  request: AdapterHttpRequest;
  isAdapterError: boolean;
}

export interface IHttpClientAdapter {
  request(request: AdapterHttpRequest): Promise<AdapterHttpResponse<any>>;
  get(
    url: string,
    headers?: Record<string, any>
  ): Promise<AdapterHttpResponse<any>>;
  post(
    url: string,
    body?: any,
    headers?: Record<string, any>
  ): Promise<AdapterHttpResponse<any>>;
  put(
    url: string,
    body?: any,
    headers?: Record<string, any>
  ): Promise<AdapterHttpResponse<any>>;
  delete(
    url: string,
    headers?: Record<string, any>
  ): Promise<AdapterHttpResponse<any>>;
  patch(
    url: string,
    body?: any,
    headers?: Record<string, any>
  ): Promise<AdapterHttpResponse<any>>;
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

export class MockHttpClient implements IHttpClientAdapter {
  private spyFn: ((implementation?: any) => any) | null = null;
  private timeouts: Map<string, number> = new Map();

  // Core methods - will be initialized in constructor
  public readonly request: any;
  public readonly get: any;
  public readonly post: any;
  public readonly put: any;
  public readonly delete: any;
  public readonly patch: any;
  public readonly setResponse: any;
  public readonly setError: any;
  public readonly setTimeout: any;
  public readonly reset: any;

  constructor(spyFn?: (implementation?: any) => any) {
    this.spyFn = spyFn || null;

    // Initialize mocks after spyFn is set
    this.request = this.createMock().mockImplementation(
      async (request: AdapterHttpRequest) => {
        // Default successful response
        return {
          statusCode: 200,
          data: { message: 'Mock response' },
          headers: { 'content-type': 'application/json' },
        };
      }
    );

    this.get = this.createMock().mockImplementation(
      async (url: string, headers?: Record<string, any>) => {
        return this.request({
          url,
          method: 'GET',
          headers: headers || {},
        });
      }
    );

    this.post = this.createMock().mockImplementation(
      async (url: string, body?: any, headers?: Record<string, any>) => {
        return this.request({
          url,
          method: 'POST',
          headers: headers || {},
          body,
        });
      }
    );

    this.put = this.createMock().mockImplementation(
      async (url: string, body?: any, headers?: Record<string, any>) => {
        return this.request({
          url,
          method: 'PUT',
          headers: headers || {},
          body,
        });
      }
    );

    this.delete = this.createMock().mockImplementation(
      async (url: string, headers?: Record<string, any>) => {
        return this.request({
          url,
          method: 'DELETE',
          headers: headers || {},
        });
      }
    );

    this.patch = this.createMock().mockImplementation(
      async (url: string, body?: any, headers?: Record<string, any>) => {
        return this.request({
          url,
          method: 'PATCH',
          headers: headers || {},
          body,
        });
      }
    );

    // Initialize method implementations
    this.updateMethodImplementations();

    this.setResponse = this.createMock().mockImplementation(
      (method: string, response: AdapterHttpResponse<any>) => {
        // Configure the request method to return the specified response
        this.request.mockImplementation(async (req: AdapterHttpRequest) => {
          if (req.method.toUpperCase() === method.toUpperCase()) {
            return response;
          }
          // Default response for other methods
          return {
            statusCode: 200,
            data: { message: 'Mock response' },
            headers: { 'content-type': 'application/json' },
          };
        });

        // Also update individual method implementations
        this.updateMethodImplementations();
      }
    );

    this.setError = this.createMock().mockImplementation(
      (method: string, error: Error) => {
        // Configure the request method to throw the specified error
        this.request.mockImplementation(async (req: AdapterHttpRequest) => {
          if (req.method.toUpperCase() === method.toUpperCase()) {
            const adapterError: AdapterHttpError = {
              name: error.name,
              message: error.message,
              stack: error.stack,
              request: req,
              isAdapterError: true,
            };
            throw adapterError;
          }
          // Default response for other methods
          return {
            statusCode: 200,
            data: { message: 'Mock response' },
            headers: { 'content-type': 'application/json' },
          };
        });

        // Also update individual method implementations
        this.updateMethodImplementations();
      }
    );

    this.setTimeout = this.createMock().mockImplementation(
      (method: string, timeoutMs: number) => {
        this.timeouts.set(method, timeoutMs);

        // Configure the request method to timeout
        this.request.mockImplementation(async (req: AdapterHttpRequest) => {
          if (
            req.method.toUpperCase() === method.toUpperCase() &&
            this.timeouts.has(method)
          ) {
            await new Promise((resolve) =>
              setTimeout(resolve, this.timeouts.get(method)! + 10)
            );
            throw new Error(
              `Mock HTTP client timed out after ${this.timeouts.get(method)}ms`
            );
          }
          // Default response for other methods
          return {
            statusCode: 200,
            data: { message: 'Mock response' },
            headers: { 'content-type': 'application/json' },
          };
        });

        // Also update individual method implementations
        this.updateMethodImplementations();
      }
    );

    this.reset = this.createMock().mockImplementation(() => {
      this.timeouts.clear();
      this.request.mockReset();
      this.get.mockReset();
      this.post.mockReset();
      this.put.mockReset();
      this.delete.mockReset();
      this.patch.mockReset();

      // Restore default implementations
      this.request.mockImplementation(async (request: AdapterHttpRequest) => {
        return {
          statusCode: 200,
          data: { message: 'Mock response' },
          headers: { 'content-type': 'application/json' },
        };
      });

      this.updateMethodImplementations();
    });
  }

  private updateMethodImplementations() {
    this.get.mockImplementation(
      async (url: string, headers?: Record<string, any>) => {
        return this.request({
          url,
          method: 'GET',
          headers: headers || {},
        });
      }
    );

    this.post.mockImplementation(
      async (url: string, body?: any, headers?: Record<string, any>) => {
        return this.request({
          url,
          method: 'POST',
          headers: headers || {},
          body,
        });
      }
    );

    this.put.mockImplementation(
      async (url: string, body?: any, headers?: Record<string, any>) => {
        return this.request({
          url,
          method: 'PUT',
          headers: headers || {},
          body,
        });
      }
    );

    this.delete.mockImplementation(
      async (url: string, headers?: Record<string, any>) => {
        return this.request({
          url,
          method: 'DELETE',
          headers: headers || {},
        });
      }
    );

    this.patch.mockImplementation(
      async (url: string, body?: any, headers?: Record<string, any>) => {
        return this.request({
          url,
          method: 'PATCH',
          headers: headers || {},
          body,
        });
      }
    );
  }

  private createMock(implementation?: any) {
    if (!this.spyFn) {
      throw new Error(`
🚨 SPY FUNCTION NOT INJECTED! 😡

To use spy functions like toHaveBeenCalled(), toHaveBeenCalledWith(), etc.
YOU MUST inject your spy function in the constructor:

// For Vitest:
const mockHttp = new MockHttpClient(vi.fn);

// For Jest:
const mockHttp = new MockHttpClient(jest.fn);

// For Jasmine:
const mockHttp = new MockHttpClient(jasmine.createSpy);

// Without spy (basic functionality only):
const mockHttp = new MockHttpClient();

DON'T FORGET AGAIN! 😤
      `);
    }
    return this.spyFn(implementation);
  }
}
