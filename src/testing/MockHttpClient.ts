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

/** Default response for mock (pure constant). */
const DEFAULT_RESPONSE: AdapterHttpResponse = {
  statusCode: 200,
  data: { message: 'Mock response' },
  headers: { 'content-type': 'application/json' },
};

const SPY_REQUIRED_MESSAGE = `SPY FUNCTION NOT INJECTED. Inject vi.fn() (Vitest), jest.fn() (Jest), or jasmine.createSpy() in the constructor.`;

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export class MockHttpClient implements IHttpClientAdapter {
  private spyFn: ((implementation?: any) => any) | null = null;
  private timeouts: Map<string, number> = new Map();

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
    this.spyFn = spyFn ?? null;

    this.request = this.createMock().mockImplementation(
      async (_req: AdapterHttpRequest) => ({ ...DEFAULT_RESPONSE })
    );

    this.get = this.createMock().mockImplementation(
      (url: string, headers?: Record<string, any>) =>
        this.request({ url, method: 'GET', headers: headers ?? {} })
    );
    this.post = this.createMock().mockImplementation(
      (url: string, body?: any, headers?: Record<string, any>) =>
        this.request({ url, method: 'POST', headers: headers ?? {}, body })
    );
    this.put = this.createMock().mockImplementation(
      (url: string, body?: any, headers?: Record<string, any>) =>
        this.request({ url, method: 'PUT', headers: headers ?? {}, body })
    );
    this.delete = this.createMock().mockImplementation(
      (url: string, headers?: Record<string, any>) =>
        this.request({ url, method: 'DELETE', headers: headers ?? {} })
    );
    this.patch = this.createMock().mockImplementation(
      (url: string, body?: any, headers?: Record<string, any>) =>
        this.request({ url, method: 'PATCH', headers: headers ?? {}, body })
    );

    this.updateMethodImplementations();

    this.setResponse = this.createMock().mockImplementation(
      (method: string, response: AdapterHttpResponse<any>) => {
        this.request.mockImplementation(async (req: AdapterHttpRequest) =>
          req.method.toUpperCase() === method.toUpperCase()
            ? response
            : { ...DEFAULT_RESPONSE }
        );
        this.updateMethodImplementations();
      }
    );

    this.setError = this.createMock().mockImplementation(
      (method: string, error: Error) => {
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
          return { ...DEFAULT_RESPONSE };
        });
        this.updateMethodImplementations();
      }
    );

    this.setTimeout = this.createMock().mockImplementation(
      (method: string, timeoutMs: number) => {
        this.timeouts.set(method, timeoutMs);
        this.request.mockImplementation(async (req: AdapterHttpRequest) => {
          if (
            req.method.toUpperCase() === method.toUpperCase() &&
            this.timeouts.has(method)
          ) {
            const ms = this.timeouts.get(method)!;
            await new Promise((r) => setTimeout(r, ms + 10));
            throw new Error(`Mock HTTP client timed out after ${ms}ms`);
          }
          return { ...DEFAULT_RESPONSE };
        });
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
      this.request.mockImplementation(async () => ({ ...DEFAULT_RESPONSE }));
      this.updateMethodImplementations();
    });
  }

  private static readonly METHOD_IMPLS: Array<{
    method: HttpMethod;
    key: keyof MockHttpClient;
    buildReq: (args: any[]) => AdapterHttpRequest;
  }> = [
    {
      method: 'GET',
      key: 'get',
      buildReq: ([url, headers]) => ({
        url,
        method: 'GET',
        headers: headers ?? {},
      }),
    },
    {
      method: 'POST',
      key: 'post',
      buildReq: ([url, body, headers]) => ({
        url,
        method: 'POST',
        headers: headers ?? {},
        body,
      }),
    },
    {
      method: 'PUT',
      key: 'put',
      buildReq: ([url, body, headers]) => ({
        url,
        method: 'PUT',
        headers: headers ?? {},
        body,
      }),
    },
    {
      method: 'DELETE',
      key: 'delete',
      buildReq: ([url, headers]) => ({
        url,
        method: 'DELETE',
        headers: headers ?? {},
      }),
    },
    {
      method: 'PATCH',
      key: 'patch',
      buildReq: ([url, body, headers]) => ({
        url,
        method: 'PATCH',
        headers: headers ?? {},
        body,
      }),
    },
  ];

  private updateMethodImplementations(): void {
    for (const { key, buildReq } of MockHttpClient.METHOD_IMPLS) {
      const request = this.request;
      (this[key] as any).mockImplementation(async (...args: any[]) =>
        request(buildReq(args))
      );
    }
  }

  private createMock(implementation?: any) {
    if (this.spyFn == null) throw new Error(SPY_REQUIRED_MESSAGE);
    return this.spyFn(implementation);
  }
}
