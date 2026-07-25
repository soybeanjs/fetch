import { describe, it, expect, vi, expectTypeOf } from 'vitest';
import type { paths } from '../examples/openapi';
import { createRequest } from '../src/core';
import { createTypedClient, toFlatTypedClient } from '../src/openapi';
import type { FetchResponse } from '../src/types';
import { setFetchResponse, getFetchCalls } from './helpers';

// ============================================================
//  Shared constants & mock factories
// ============================================================

const METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'] as const;

/**
 * Build a mock RequestInstance.
 *
 * `createTypedClient` calls `requestInstance(buildFetchConfig(...))` and returns
 * the resulting promise, so the mock resolves to the config it received — making
 * assertions on the built config straightforward.
 *
 * `toFlatTypedClient` calls `requestInstance.withResponse(...)` and `requestInstance.raw(...)`,
 * so the mock also exposes those two methods.
 */
function createMockRequest() {
  const mockRequest = vi.fn(async (config: any) => config) as any;
  mockRequest.raw = vi.fn(async (config: any) => config);
  mockRequest.withResponse = vi.fn(async (config: any) => ({
    data: config,
    response: { status: 200, config }
  }));
  return mockRequest;
}

// ============================================================
//  createTypedClient (unit — mock request instance)
// ============================================================

describe('createTypedClient', () => {
  it('exposes all HTTP methods as functions on both client and raw', () => {
    const client = createTypedClient(createMockRequest(), '/api') as any;
    for (const m of METHODS) {
      expect(typeof client[m]).toBe('function');
      expect(typeof client.raw[m]).toBe('function');
    }
  });

  it('client.get calls requestInstance with the correct config', async () => {
    const mockRequest = createMockRequest();
    const client = createTypedClient(mockRequest, '/api/v1') as any;

    const result = await client.get('/users', { query: { page: 1, pageSize: 10 } });

    expect(mockRequest).toHaveBeenCalledTimes(1);
    const config = mockRequest.mock.calls[0][0];
    expect(config.url).toBe('/api/v1/users');
    expect(config.method).toBe('get');
    expect(config.query).toEqual({ page: 1, pageSize: 10 });
    // The client returns whatever requestInstance resolves with.
    expect(result).toBe(config);
  });

  it('client.post calls requestInstance with method POST and body', async () => {
    const mockRequest = createMockRequest();
    const client = createTypedClient(mockRequest, '/api') as any;

    await client.post('/users', { body: { name: 'John' } });

    const config = mockRequest.mock.calls[0][0];
    expect(config.method).toBe('post');
    expect(config.url).toBe('/api/users');
    expect(config.body).toEqual({ name: 'John' });
  });

  it('prepends the URL prefix', async () => {
    const mockRequest = createMockRequest();
    const client = createTypedClient(mockRequest, '/base') as any;

    await client.get('/items');
    expect(mockRequest.mock.calls[0][0].url).toBe('/base/items');
  });

  it('replaces path params (e.g. /users/{id}) from pathParams', async () => {
    const mockRequest = createMockRequest();
    const client = createTypedClient(mockRequest, '/api') as any;

    await client.get('/users/{id}', { pathParams: { id: 42 } });
    expect(mockRequest.mock.calls[0][0].url).toBe('/api/users/42');
  });

  it('replaces multiple path params', async () => {
    const mockRequest = createMockRequest();
    const client = createTypedClient(mockRequest, '/api') as any;

    await client.get('/orgs/{org}/repos/{repo}', { pathParams: { org: 'soybeanjs', repo: 'fetch' } });
    expect(mockRequest.mock.calls[0][0].url).toBe('/api/orgs/soybeanjs/repos/fetch');
  });

  it('throws when a required path param is missing', () => {
    const mockRequest = createMockRequest();
    const client = createTypedClient(mockRequest, '/api') as any;

    expect(() => client.get('/users/{id}', { pathParams: {} })).toThrow(/Missing required path parameter "id"/);
    // The request instance must never be called when path resolution fails.
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('sets query params from query', async () => {
    const mockRequest = createMockRequest();
    const client = createTypedClient(mockRequest, '/api') as any;

    await client.get('/search', { query: { q: 'hello', limit: 5 } });
    expect(mockRequest.mock.calls[0][0].query).toEqual({ q: 'hello', limit: 5 });
  });

  it('sets the request body from `body`', async () => {
    const mockRequest = createMockRequest();
    const client = createTypedClient(mockRequest, '/api') as any;

    await client.put('/users/1', { body: { name: 'Jane' } });
    const config = mockRequest.mock.calls[0][0];
    expect(config.method).toBe('put');
    expect(config.body).toEqual({ name: 'Jane' });
  });

  it('sets headers from headers', async () => {
    const mockRequest = createMockRequest();
    const client = createTypedClient(mockRequest, '/api') as any;

    const headers = new Headers({ 'x-custom': 'abc', authorization: 'Bearer token' });
    await client.get('/users', { headers });
    expect(mockRequest.mock.calls[0][0].headers).toBe(headers);
  });

  it('client.raw.get calls requestInstance.raw', async () => {
    const mockRequest = createMockRequest();
    const client = createTypedClient(mockRequest, '/api') as any;

    await client.raw.get('/users');

    expect(mockRequest.raw).toHaveBeenCalledTimes(1);
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockRequest.raw.mock.calls[0][0].url).toBe('/api/users');
    expect(mockRequest.raw.mock.calls[0][0].method).toBe('get');
  });

  it('passes extra config (timeout, retry) through untouched', async () => {
    const mockRequest = createMockRequest();
    const client = createTypedClient(mockRequest, '/api') as any;

    await client.get('/users', { timeout: 5000, retry: { retries: 3 } });
    const config = mockRequest.mock.calls[0][0];
    expect(config.timeout).toBe(5000);
    expect(config.retry).toEqual({ retries: 3 });
  });

  it('works without a prefix', async () => {
    const mockRequest = createMockRequest();
    const client = createTypedClient(mockRequest) as any;

    await client.delete('/users/1');
    const config = mockRequest.mock.calls[0][0];
    expect(config.url).toBe('/users/1');
    expect(config.method).toBe('delete');
  });
});

// ============================================================
//  createTypedClient (integration — real createRequest + mocked fetch)
// ============================================================

describe('createTypedClient (integration with real createRequest)', () => {
  function makeRequest() {
    return createRequest(
      { baseURL: 'https://api.example.com' },
      {
        transform: (response: any) => response.data,
        isBackendSuccess: (response: any) => response.status >= 200 && response.status < 300
      }
    );
  }

  it('performs a real GET and returns the transformed data', async () => {
    setFetchResponse({ status: 200, body: { ok: true, items: [1, 2, 3] } });

    const client = createTypedClient(makeRequest() as any, '/api/v1') as any;
    const data = await client.get('/items', { query: { page: 1 } });

    expect(data).toEqual({ ok: true, items: [1, 2, 3] });

    const calls = getFetchCalls();
    expect(calls[0].url).toBe('https://api.example.com/api/v1/items?page=1');
    expect(calls[0].init?.method).toBe('GET');
  });

  it('sends a JSON body via POST and resolves path params', async () => {
    setFetchResponse({ status: 200, body: { id: 42, title: 'hi' } });

    const client = createTypedClient(makeRequest() as any, '/api') as any;
    const data = await client.post('/users/{id}/posts', {
      pathParams: { id: 42 },
      body: { title: 'hi' }
    });

    expect(data).toEqual({ id: 42, title: 'hi' });

    const calls = getFetchCalls();
    expect(calls[0].url).toBe('https://api.example.com/api/users/42/posts');
    expect(calls[0].init?.method).toBe('POST');
    expect(calls[0].init?.body).toBe(JSON.stringify({ title: 'hi' }));
  });

  it('raw.get returns the full FetchResponse (bypassing transform)', async () => {
    setFetchResponse({ status: 200, body: { raw: true } });

    const client = createTypedClient(makeRequest() as any, '/api') as any;
    const response = await client.raw.get('/items');

    expect(response).toHaveProperty('data');
    expect(response).toHaveProperty('status', 200);
    expect(response).toHaveProperty('headers');
    expect(response.data).toEqual({ raw: true });
  });
});

// ============================================================
//  toFlatTypedClient (unit — mock request instance)
// ============================================================

describe('toFlatTypedClient', () => {
  it('exposes all HTTP methods as functions on both client and raw', () => {
    const client = toFlatTypedClient(createMockRequest(), '/api') as any;
    for (const m of METHODS) {
      expect(typeof client[m]).toBe('function');
      expect(typeof client.raw[m]).toBe('function');
    }
  });

  it('client.get calls requestInstance.withResponse and returns a flat { data, error, response }', async () => {
    const mockRequest = createMockRequest();
    const client = toFlatTypedClient(mockRequest, '/api/v1') as any;

    const result = await client.get('/users', { query: { page: 1 } });

    expect(mockRequest.withResponse).toHaveBeenCalledTimes(1);
    expect(mockRequest).not.toHaveBeenCalled();
    const config = mockRequest.withResponse.mock.calls[0][0];
    expect(config.url).toBe('/api/v1/users');
    expect(config.method).toBe('get');
    expect(config.query).toEqual({ page: 1 });

    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('error', null);
    expect(result).toHaveProperty('response');
    expect(result.data).toBe(config);
  });

  it('client.raw.get calls requestInstance.raw', async () => {
    const mockRequest = createMockRequest();
    const client = toFlatTypedClient(mockRequest, '/api') as any;

    const result = await client.raw.get('/users');

    expect(mockRequest.raw).toHaveBeenCalledTimes(1);
    expect(mockRequest.withResponse).not.toHaveBeenCalled();
    expect(mockRequest.raw.mock.calls[0][0].url).toBe('/api/users');

    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('error', null);
    expect(result).toHaveProperty('response');
  });

  it('prepends the URL prefix and forwards method/body', async () => {
    const mockRequest = createMockRequest();
    const client = toFlatTypedClient(mockRequest, '/base') as any;

    await client.post('/items', { body: { x: 1 } });
    const config = mockRequest.withResponse.mock.calls[0][0];
    expect(config.url).toBe('/base/items');
    expect(config.method).toBe('post');
    expect(config.body).toEqual({ x: 1 });
  });
});

// ============================================================
//  toFlatTypedClient (integration — real createRequest + mocked fetch)
// ============================================================

describe('toFlatTypedClient (integration with real createRequest)', () => {
  it('returns { data, error: null, response } on success', async () => {
    setFetchResponse({ status: 200, body: { ok: true } });

    const request = createRequest(
      { baseURL: 'https://api.example.com' },
      {
        transform: (response: any) => response.data,
        isBackendSuccess: (response: any) => response.status >= 200 && response.status < 300
      }
    );
    const client = toFlatTypedClient(request as any, '/api/v1') as any;

    const result = await client.get('/items');

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ ok: true });
    expect(result.response).toBeDefined();
    expect(getFetchCalls()[0].url).toBe('https://api.example.com/api/v1/items');
  });

  it('returns { data: null, error } on backend failure without throwing', async () => {
    // HTTP 200, but the backend envelope reports a business failure.
    setFetchResponse({ status: 200, body: { code: 500, msg: 'fail' } });

    const request = createRequest(
      { baseURL: 'https://api.example.com' },
      {
        transform: (response: any) => response.data,
        isBackendSuccess: (response: any) => response.data?.code === 200
      }
    );
    const client = toFlatTypedClient(request as any, '/api') as any;

    const result = await client.get('/items');

    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.response).toBeDefined();
  });

  it('returns { data: null, error } on HTTP error without throwing', async () => {
    setFetchResponse({ status: 500, body: { msg: 'server error' } });

    const request = createRequest(
      { baseURL: 'https://api.example.com' },
      {
        transform: (response: any) => response.data,
        isBackendSuccess: (response: any) => response.status >= 200 && response.status < 300
      }
    );
    const client = toFlatTypedClient(request as any, '/api') as any;

    const result = await client.get('/items');

    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });
});

// ============================================================
//  Type-level tests (responseType inference via MappedType)
// ============================================================

/**
 * These tests assert the type-level behaviour introduced by threading `R` (the
 * `responseType` option) through {@link ClientMethod} / {@link FlatClientMethod}.
 *
 * They use `expectTypeOf` so a regression in the type inference surfaces as a
 * typecheck failure (the runtime assertions are no-ops).
 */
describe('createTypedClient — responseType type inference', () => {
  it("infers `string` for responseType: 'text' on a text/plain endpoint", () => {
    const request = createRequest();
    const client = createTypedClient<paths, '/api'>(request, '/api');

    const res = client.get('/text', { responseType: 'text' });
    expectTypeOf(res).toEqualTypeOf<Promise<string>>();
  });

  it('defaults to the OpenAPI success response when responseType is omitted', () => {
    const request = createRequest();
    const client = createTypedClient<paths, '/api'>(request, '/api');

    // /api/hello declares `application/json: { message?, timestamp?, method? }`.
    const res = client.get('/hello');
    expectTypeOf(res).toEqualTypeOf<Promise<{ message?: string; timestamp?: string; method?: string }>>();
  });

  it("infers `FileResponseData<Blob>` for responseType: 'blob'", () => {
    const request = createRequest();
    const client = createTypedClient<paths, '/api'>(request, '/api');

    const res = client.get('/download', { responseType: 'blob' });
    expectTypeOf(res).toEqualTypeOf<Promise<{ file: Blob; filename: string; contentType: string }>>();
  });

  it('preserves responseType inference on raw.get (FetchResponse<string>)', () => {
    const request = createRequest();
    const client = createTypedClient<paths, '/api'>(request, '/api');

    const res = client.raw.get('/text', { responseType: 'text' });
    // Only assert the `data` field type — the rest of FetchResponse is constant.
    expectTypeOf(res).toEqualTypeOf<Promise<FetchResponse<string>>>();
  });
});

describe('toFlatTypedClient — responseType type inference', () => {
  it("infers `string` for the flat `data` when responseType: 'text'", () => {
    const request = createRequest();
    const client = toFlatTypedClient<paths, '/api'>(request, '/api');

    const res = client.get('/text', { responseType: 'text' });
    expectTypeOf(res).toMatchTypeOf<Promise<{ data: string; error: null } | { data: null; error: unknown }>>();
  });
});
