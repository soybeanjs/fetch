import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpSuccess } from '../src/shared';
import { serializeParams } from '../src/utils';
import { FetchError, BackendError } from '../src/error';
import { $fetch, createFetch, fetchCore, mergeConfig, resolveDefaults, processResponse } from '../src/fetch';
import type { FetchRequestConfig, FetchResponse, RequestOption } from '../src/types';
import {
  getFetchCalls,
  getFetchCallCount,
  setFetchImplementation,
  setFetchResponse,
  createMockAdapterResponse
} from './helpers';

// ============================================================
//  $fetch basic usage
// ============================================================

describe('$fetch basic usage', () => {
  it('GET returns parsed JSON data', async () => {
    setFetchResponse({ body: { id: 1, name: 'John' }, contentType: 'application/json' });
    const data = await $fetch('/api/users/1');
    expect(data).toEqual({ id: 1, name: 'John' });
  });

  it('POST sends JSON body', async () => {
    setFetchResponse({ body: { created: true } });
    await $fetch('/api/users', { method: 'POST', data: { name: 'John' } });
    const call = getFetchCalls()[0];
    expect(call.init?.method).toBe('POST');
    expect(call.init?.body).toBe(JSON.stringify({ name: 'John' }));
  });

  it('appends params to URL', async () => {
    setFetchResponse({ body: [] });
    await $fetch('/api/users', { params: { page: 1, limit: 10 } });
    const url = getFetchCalls()[0].url;
    expect(url).toContain('page=1');
    expect(url).toContain('limit=10');
  });

  it('prepends baseURL to relative URLs', async () => {
    setFetchResponse({ body: {} });
    await $fetch('/users', { baseURL: 'https://api.example.com' });
    expect(getFetchCalls()[0].url).toBe('https://api.example.com/users');
  });

  it('ignores baseURL for absolute URLs', async () => {
    setFetchResponse({ body: {} });
    await $fetch('https://other.com/data', { baseURL: 'https://api.example.com' });
    expect(getFetchCalls()[0].url).toBe('https://other.com/data');
  });

  it('merges custom headers with defaults', async () => {
    setFetchResponse({ body: {} });
    await $fetch('/test', { headers: { 'X-Custom': 'val' } });
    const init = getFetchCalls()[0].init!;
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get('X-Custom')).toBe('val');
  });

  it('responseType text returns string', async () => {
    setFetchResponse({ body: 'plain text', contentType: 'text/plain' });
    const data = await $fetch<string, 'text'>('/test', { responseType: 'text' });
    expect(data).toBe('plain text');
  });

  it('responseType blob returns Blob', async () => {
    setFetchResponse({ body: 'binary', contentType: 'application/octet-stream' });
    const data = await $fetch<Blob, 'blob'>('/test', { responseType: 'blob' });
    expect(data).toBeInstanceOf(Blob);
  });

  it('responseType arraybuffer returns ArrayBuffer', async () => {
    setFetchResponse({ body: 'binary', contentType: 'application/octet-stream' });
    const data = await $fetch<ArrayBuffer, 'arraybuffer'>('/test', { responseType: 'arraybuffer' });
    expect(data).toBeInstanceOf(ArrayBuffer);
  });

  it('json with empty body returns undefined', async () => {
    setFetchResponse({ body: '', contentType: 'application/json' });
    const data = await $fetch('/test');
    expect(data).toBeUndefined();
  });

  it('204 No Content returns undefined', async () => {
    setFetchResponse({ status: 204, body: '', contentType: 'application/json' });
    const data = await $fetch('/test');
    expect(data).toBeUndefined();
  });
});

// ============================================================
//  $fetch.raw / .native / .create
// ============================================================

describe('$fetch.raw / .native / .create', () => {
  it('.raw() returns full FetchResponse', async () => {
    setFetchResponse({ status: 200, body: { ok: true }, contentType: 'application/json' });
    const response = await $fetch.raw('/test');
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ ok: true });
    expect(response.headers).toBeInstanceOf(Headers);
    expect(response.config).toBeDefined();
  });

  it('.native is the fetch function', () => {
    expect($fetch.native).toBeDefined();
    expect(typeof $fetch.native).toBe('function');
  });

  it('.create() returns a new instance with merged defaults', async () => {
    setFetchResponse({ body: { ok: true } });
    const apiFetch = $fetch.create({ baseURL: 'https://api.example.com' });
    await apiFetch('/users');
    expect(getFetchCalls()[0].url).toBe('https://api.example.com/users');
  });

  it('.create() child inherits parent defaults', async () => {
    setFetchResponse({ body: {} });
    const parent = $fetch.create({ baseURL: 'https://api.example.com' });
    const child = parent.create({ headers: { 'X-Child': 'yes' } });
    await child('/test');
    const init = getFetchCalls()[0].init!;
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get('X-Child')).toBe('yes');
    expect(getFetchCalls()[0].url).toBe('https://api.example.com/test');
  });

  it('.create() child can override parent defaults', async () => {
    setFetchResponse({ body: {} });
    const parent = $fetch.create({ baseURL: 'https://api.example.com' });
    const child = parent.create({ baseURL: 'https://other.com' });
    await child('/test');
    expect(getFetchCalls()[0].url).toBe('https://other.com/test');
  });
});

// ============================================================
//  fetchCore: retry
// ============================================================

describe('fetchCore: retry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('retries on 503 status when retries > 0', async () => {
    let callCount = 0;
    setFetchImplementation(() => {
      callCount++;
      if (callCount <= 1) {
        return new Response('Service Unavailable', { status: 503, headers: { 'content-type': 'text/plain' } });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });

    const promise = fetchCore({
      url: '/test',
      method: 'GET',
      headers: new Headers(),
      responseType: 'json',
      retry: { retries: 1, retryDelay: () => 0 },
      validateStatus: isHttpSuccess,
      paramsSerializer: serializeParams
    } as any);

    await vi.advanceTimersByTimeAsync(10);
    const response = await promise;

    expect(callCount).toBe(2);
    expect(response.status).toBe(200);
  });

  it('does NOT retry on 400 status', async () => {
    setFetchResponse({ status: 400, body: 'Bad Request', contentType: 'text/plain' });

    await expect(
      fetchCore({
        url: '/test',
        method: 'GET',
        headers: new Headers(),
        responseType: 'json',
        retry: { retries: 3, retryDelay: () => 0 },
        validateStatus: isHttpSuccess,
        paramsSerializer: serializeParams
      } as any)
    ).rejects.toThrow();

    expect(getFetchCalls().length).toBe(1);
  });

  it('retries on network error (no response)', async () => {
    let callCount = 0;
    setFetchImplementation(() => {
      callCount++;
      if (callCount === 1) throw new TypeError('Network Error');
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });

    const promise = fetchCore({
      url: '/test',
      method: 'GET',
      headers: new Headers(),
      responseType: 'json',
      retry: { retries: 2, retryDelay: () => 0 },
      validateStatus: isHttpSuccess,
      paramsSerializer: serializeParams
    } as any);

    await vi.advanceTimersByTimeAsync(10);
    const response = await promise;

    expect(callCount).toBe(2);
    expect(response.status).toBe(200);
  });

  it('does NOT retry on user-initiated abort', async () => {
    setFetchImplementation(() => {
      const err = new DOMException('Aborted', 'AbortError');
      throw err;
    });

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 0);

    await expect(
      fetchCore({
        url: '/test',
        method: 'GET',
        headers: new Headers(),
        responseType: 'json',
        signal: controller.signal,
        retry: { retries: 3, retryDelay: () => 0 },
        validateStatus: isHttpSuccess,
        paramsSerializer: serializeParams
      } as any)
    ).rejects.toMatchObject({ code: 'ERR_ABORTED' });

    expect(getFetchCalls().length).toBe(1);
  });

  it('uses custom retryDelay', async () => {
    const retryDelay = vi.fn(() => 500);
    let callCount = 0;
    setFetchImplementation(() => {
      callCount++;
      if (callCount === 1) throw new TypeError('Network Error');
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });

    const promise = fetchCore({
      url: '/test',
      method: 'GET',
      headers: new Headers(),
      responseType: 'json',
      retry: { retries: 2, retryDelay },
      validateStatus: isHttpSuccess,
      paramsSerializer: serializeParams
    } as any);

    await vi.advanceTimersByTimeAsync(500);
    await promise;

    expect(retryDelay).toHaveBeenCalledWith(1, expect.any(FetchError));
  });
});

// ============================================================
//  fetchCore: timeout
// ============================================================

describe('fetchCore: timeout', () => {
  it('throws ERR_TIMEOUT when timeout exceeded', async () => {
    vi.useFakeTimers();
    // Mock fetch that never resolves on its own, but rejects on abort.
    setFetchImplementation(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The user aborted a request.', 'AbortError'));
          });
        })
    );

    const promise = fetchCore({
      url: '/test',
      method: 'GET',
      headers: new Headers(),
      responseType: 'json',
      timeout: 1000,
      validateStatus: isHttpSuccess,
      paramsSerializer: serializeParams
    } as any);

    // Attach the rejection assertion handler SYNCHRONOUSLY before advancing
    // timers. Otherwise the timeout fires inside `advanceTimersByTimeAsync`,
    // the promise rejects, and Node emits a `PromiseRejectionHandledWarning`
    // because the handler is attached asynchronously in the next `await`.
    const assertion = expect(promise).rejects.toMatchObject({ code: 'ERR_TIMEOUT' });

    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    vi.useRealTimers();
  });

  it('throws ERR_NETWORK on network error', async () => {
    setFetchImplementation(() => {
      throw new TypeError('Network Error');
    });

    await expect(
      fetchCore({
        url: '/test',
        method: 'GET',
        headers: new Headers(),
        responseType: 'json',
        validateStatus: isHttpSuccess,
        paramsSerializer: serializeParams
      } as any)
    ).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  });

  it('throws ERR_ABORTED on user abort', async () => {
    const controller = new AbortController();
    setFetchImplementation(() => {
      controller.abort();
      throw new DOMException('Aborted', 'AbortError');
    });

    await expect(
      fetchCore({
        url: '/test',
        method: 'GET',
        headers: new Headers(),
        responseType: 'json',
        signal: controller.signal,
        validateStatus: isHttpSuccess,
        paramsSerializer: serializeParams
      } as any)
    ).rejects.toMatchObject({ code: 'ERR_ABORTED' });
  });
});

// ============================================================
//  fetchCore: hooks
// ============================================================

describe('fetchCore: hooks', () => {
  it('onRequest hook is called with context', async () => {
    setFetchResponse({ body: { ok: true } });
    const hook = vi.fn();

    await fetchCore({
      url: '/test',
      method: 'GET',
      headers: new Headers(),
      responseType: 'json',
      onRequest: hook,
      validateStatus: isHttpSuccess,
      paramsSerializer: serializeParams
    } as any);

    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook.mock.calls[0][0]).toHaveProperty('request');
    expect(hook.mock.calls[0][0]).toHaveProperty('options');
  });

  it('onResponse hook is called on success', async () => {
    setFetchResponse({ body: { ok: true } });
    const hook = vi.fn();

    await fetchCore({
      url: '/test',
      method: 'GET',
      headers: new Headers(),
      responseType: 'json',
      onResponse: hook,
      validateStatus: isHttpSuccess,
      paramsSerializer: serializeParams
    } as any);

    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook.mock.calls[0][0].response).toBeDefined();
  });

  it('onRequestError hook is called on network error', async () => {
    setFetchImplementation(() => {
      throw new TypeError('Network Error');
    });
    const hook = vi.fn();

    await expect(
      fetchCore({
        url: '/test',
        method: 'GET',
        headers: new Headers(),
        responseType: 'json',
        onRequestError: hook,
        retry: { retries: 0 },
        validateStatus: isHttpSuccess,
        paramsSerializer: serializeParams
      } as any)
    ).rejects.toThrow();

    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('onResponseError hook is called on bad status', async () => {
    setFetchResponse({ status: 500, body: 'Server Error', contentType: 'text/plain' });
    const hook = vi.fn();

    await expect(
      fetchCore({
        url: '/test',
        method: 'GET',
        headers: new Headers(),
        responseType: 'json',
        onResponseError: hook,
        retry: { retries: 0 },
        validateStatus: isHttpSuccess,
        paramsSerializer: serializeParams
      } as any)
    ).rejects.toThrow();

    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('hooks support arrays (sequential)', async () => {
    setFetchResponse({ body: { ok: true } });
    const order: string[] = [];
    const h1 = () => {
      order.push('h1');
    };
    const h2 = () => {
      order.push('h2');
    };

    await fetchCore({
      url: '/test',
      method: 'GET',
      headers: new Headers(),
      responseType: 'json',
      onRequest: [h1, h2],
      validateStatus: isHttpSuccess,
      paramsSerializer: serializeParams
    } as any);

    expect(order).toEqual(['h1', 'h2']);
  });

  it('hooks support async functions', async () => {
    setFetchResponse({ body: { ok: true } });
    const hook = vi.fn(async () => {
      await new Promise<void>(r => setTimeout(r, 0));
    });

    await fetchCore({
      url: '/test',
      method: 'GET',
      headers: new Headers(),
      responseType: 'json',
      onRequest: hook,
      validateStatus: isHttpSuccess,
      paramsSerializer: serializeParams
    } as any);

    expect(hook).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
//  fetchCore: body serialization
// ============================================================

describe('fetchCore: body serialization', () => {
  it('JSON object → JSON.stringify with content-type', async () => {
    setFetchResponse({ body: {} });
    await $fetch('/test', { method: 'POST', data: { name: 'John' } });
    const init = getFetchCalls()[0].init!;
    expect(init.body).toBe(JSON.stringify({ name: 'John' }));
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('string body passed as-is', async () => {
    setFetchResponse({ body: {} });
    await $fetch('/test', { method: 'POST', data: 'raw text' });
    expect(getFetchCalls()[0].init!.body).toBe('raw text');
  });

  it('FormData passed as-is', async () => {
    setFetchResponse({ body: {} });
    const formData = new FormData();
    formData.append('file', new Blob(['content']), 'test.txt');
    await $fetch('/test', { method: 'POST', data: formData });
    expect(getFetchCalls()[0].init!.body).toBe(formData);
  });

  it('Blob passed as-is', async () => {
    setFetchResponse({ body: {} });
    const blob = new Blob(['data']);
    await $fetch('/test', { method: 'POST', data: blob });
    expect(getFetchCalls()[0].init!.body).toBe(blob);
  });

  it('ArrayBuffer passed as-is', async () => {
    setFetchResponse({ body: {} });
    const buf = new ArrayBuffer(4);
    await $fetch('/test', { method: 'POST', data: buf });
    expect(getFetchCalls()[0].init!.body).toBe(buf);
  });

  it('URLSearchParams passed as-is', async () => {
    setFetchResponse({ body: {} });
    const params = new URLSearchParams();
    params.append('key', 'val');
    await $fetch('/test', { method: 'POST', data: params });
    expect(getFetchCalls()[0].init!.body).toBe(params);
  });

  it('null/undefined body → undefined', async () => {
    setFetchResponse({ body: {} });
    await $fetch('/test', { method: 'POST', data: null });
    expect(getFetchCalls()[0].init!.body).toBeUndefined();
  });

  it('GET request → no body', async () => {
    setFetchResponse({ body: {} });
    await $fetch('/test', { method: 'GET', data: { irrelevant: true } });
    expect(getFetchCalls()[0].init!.body).toBeUndefined();
  });
});

// ============================================================
//  fetchCore: validateStatus & ignoreResponseError
// ============================================================

describe('fetchCore: validateStatus & ignoreResponseError', () => {
  it('default validateStatus: 2xx passes', async () => {
    setFetchResponse({ status: 200, body: { ok: true } });
    const data = await $fetch('/test');
    expect(data).toEqual({ ok: true });
  });

  it('default validateStatus: 4xx throws', async () => {
    setFetchResponse({ status: 404, body: 'Not Found', contentType: 'text/plain' });
    await expect($fetch('/test')).rejects.toThrow();
  });

  it('custom validateStatus', async () => {
    setFetchResponse({ status: 404, body: { ok: true } });
    const data = await $fetch('/test', { validateStatus: () => true });
    expect(data).toEqual({ ok: true });
  });

  it('ignoreResponseError: true → no throw on bad status', async () => {
    setFetchResponse({ status: 500, body: { error: 'server' } });
    const data = await $fetch('/test', { ignoreResponseError: true });
    expect(data).toEqual({ error: 'server' });
  });
});

// ============================================================
//  fetchCore: transformRequest / transformResponse / parseResponse
// ============================================================

describe('fetchCore: transformRequest / transformResponse / parseResponse', () => {
  it('transformRequest transforms data before serialization', async () => {
    setFetchResponse({ body: {} });
    const transformRequest = (data: any) => ({ ...data, transformed: true });
    await $fetch('/test', { method: 'POST', data: { name: 'John' }, transformRequest } as any);
    const init = getFetchCalls()[0].init!;
    expect(JSON.parse(init.body as string)).toEqual({ name: 'John', transformed: true });
  });

  it('transformResponse transforms data after parsing', async () => {
    setFetchResponse({ body: { value: 42 } });
    const transformResponse = (data: any) => ({ ...data, doubled: data.value * 2 });
    const data = await $fetch('/test', { transformResponse } as any);
    expect(data).toEqual({ value: 42, doubled: 84 });
  });

  it('parseResponse custom function is used for JSON', async () => {
    setFetchResponse({ body: '{"key":"val"}' });
    const parseResponse = (text: string) => {
      const obj = JSON.parse(text);
      obj.parsed = true;
      return obj;
    };
    const data = await $fetch('/test', { parseResponse } as any);
    expect(data).toEqual({ key: 'val', parsed: true });
  });
});

// ============================================================
//  mergeConfig & resolveDefaults
// ============================================================

describe('mergeConfig', () => {
  it('merges defaults with per-request config', () => {
    const defaults = resolveDefaults({ baseURL: 'https://api.example.com', headers: { 'X-Default': '1' } });
    const merged = mergeConfig(defaults, { url: '/test', method: 'POST' });
    expect(merged.url).toBe('/test');
    expect(merged.method).toBe('POST');
    expect(merged.baseURL).toBe('https://api.example.com');
  });

  it('per-request config overrides defaults', () => {
    const defaults = resolveDefaults({ baseURL: 'https://api.example.com', timeout: 5000 });
    const merged = mergeConfig(defaults, { url: '/test', timeout: 10000 });
    expect(merged.timeout).toBe(10000);
  });

  it('headers are merged (not replaced)', () => {
    const defaults = resolveDefaults({ headers: { 'X-Default': '1', Accept: 'text/plain' } });
    const merged = mergeConfig(defaults, { url: '/test', headers: { 'X-Custom': '2' } });
    expect(merged.headers.get('X-Default')).toBe('1');
    expect(merged.headers.get('X-Custom')).toBe('2');
    expect(merged.headers.get('Accept')).toBe('text/plain');
  });
});

describe('resolveDefaults', () => {
  it('returns config with all fields', () => {
    const resolved = resolveDefaults({});
    expect(resolved.url).toBe('');
    expect(resolved.method).toBe('GET');
    expect(resolved.responseType).toBe('json');
    expect(resolved.headers).toBeInstanceOf(Headers);
    expect(typeof resolved.validateStatus).toBe('function');
    expect(typeof resolved.paramsSerializer).toBe('function');
  });

  it('respects user-provided method', () => {
    const resolved = resolveDefaults({ method: 'post' });
    expect(resolved.method).toBe('POST');
  });

  it('respects user-provided responseType', () => {
    // resolveDefaults accepts CreateFetchDefaults (default responseType 'json').
    // We deliberately test that a non-default responseType is preserved through the resolver,
    // so we cast through unknown to bypass the invariant generic on R.
    const resolved = resolveDefaults({ responseType: 'text' } as unknown as FetchRequestConfig);
    expect(resolved.responseType).toBe('text');
  });
});

// ============================================================
//  createFetch
// ============================================================

describe('createFetch', () => {
  it('returns a fetch function with .raw/.native/.create', () => {
    const fetchFn = createFetch();
    expect(typeof fetchFn).toBe('function');
    expect(typeof fetchFn.raw).toBe('function');
    expect(typeof fetchFn.create).toBe('function');
    expect(fetchFn.native).toBeDefined();
  });

  it('applies merged defaults', async () => {
    setFetchResponse({ body: {} });
    const fetchFn = createFetch({ baseURL: 'https://api.example.com' });
    await fetchFn('/test');
    expect(getFetchCalls()[0].url).toBe('https://api.example.com/test');
  });
});

// ============================================================
//  fetchCore: custom adapter
// ============================================================

describe('fetchCore: custom adapter', () => {
  it('uses the provided adapter instead of native fetch', async () => {
    const adapter = vi.fn(async () =>
      createMockAdapterResponse({
        status: 200,
        body: { ok: true }
      })
    );

    const data = await fetchCore({
      url: '/test',
      method: 'GET',
      headers: new Headers(),
      responseType: 'json',
      validateStatus: isHttpSuccess,
      paramsSerializer: serializeParams,
      adapter
    } as any);

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(data.data).toEqual({ ok: true });
    // Native fetch should NOT have been called
    expect(getFetchCallCount()).toBe(0);
  });

  it('passes url and init to the adapter', async () => {
    const adapter = vi.fn(async (_url: string, _init: any) => createMockAdapterResponse({ body: {} }));
    await fetchCore({
      url: 'https://custom.example.com/api',
      method: 'POST',
      headers: new Headers({ 'x-test': '1' }),
      responseType: 'json',
      validateStatus: isHttpSuccess,
      paramsSerializer: serializeParams,
      data: { hello: 'world' },
      adapter
    } as any);

    expect(adapter).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = adapter.mock.calls[0] as [string, any];
    expect(calledUrl).toBe('https://custom.example.com/api');
    expect(calledInit.method).toBe('POST');
    expect(calledInit.headers.get('x-test')).toBe('1');
    // JSON-serializable objects are stringified and content-type set to application/json
    expect(calledInit.body).toBe(JSON.stringify({ hello: 'world' }));
    expect(calledInit.headers.get('content-type')).toBe('application/json');
  });

  it('custom adapter takes precedence over onUploadProgress', async () => {
    const adapter = vi.fn(async () => createMockAdapterResponse({ body: {} }));
    const onUploadProgress = vi.fn();

    await fetchCore({
      url: '/test',
      method: 'POST',
      headers: new Headers(),
      responseType: 'json',
      validateStatus: isHttpSuccess,
      paramsSerializer: serializeParams,
      data: 'hello',
      adapter,
      onUploadProgress
    } as any);

    // Custom adapter should be used, not the auto-created upload-progress adapter
    expect(adapter).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
//  fetchCore: onDownloadProgress
// ============================================================

describe('fetchCore: onDownloadProgress', () => {
  it('reports download progress for streaming bodies', async () => {
    // Build a response with a known content-length and a chunked body.
    // fetchCore consumes the body during parseResponseBody, so progress
    // events should fire before fetchCore resolves.
    const bodyText = 'Hello, World!';
    const encoder = new TextEncoder();
    const chunks = [encoder.encode('Hello, '), encoder.encode('World!')];

    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      }
    });

    const adapter = vi.fn(
      async (): Promise<any> => ({
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'text/plain', 'content-length': String(bodyText.length) }),
        body: stream,
        text: () => Promise.resolve(bodyText),
        blob: () => Promise.resolve(new Blob([bodyText])),
        arrayBuffer: () => Promise.resolve(encoder.encode(bodyText).buffer)
      })
    );

    const progressEvents: { loaded: number; total: number; progress: number }[] = [];

    await fetchCore({
      url: '/test',
      method: 'GET',
      headers: new Headers(),
      responseType: 'text',
      validateStatus: isHttpSuccess,
      paramsSerializer: serializeParams,
      adapter,
      onDownloadProgress: (e: { loaded: number; total: number; progress: number }) => {
        progressEvents.push({ loaded: e.loaded, total: e.total, progress: e.progress });
      }
    } as any);

    expect(progressEvents.length).toBeGreaterThanOrEqual(2);
    expect(progressEvents[0].loaded).toBe(7); // 'Hello, '
    expect(progressEvents[progressEvents.length - 1].loaded).toBe(13); // full body
    expect(progressEvents[progressEvents.length - 1].total).toBe(13);
    expect(progressEvents[progressEvents.length - 1].progress).toBe(100);
  });

  it('does not crash when body is null (e.g. 204)', async () => {
    const adapter = vi.fn(
      async (): Promise<any> => ({
        status: 204,
        statusText: 'No Content',
        headers: new Headers(),
        body: null,
        text: () => Promise.resolve(''),
        blob: () => Promise.resolve(new Blob()),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0))
      })
    );

    const onDownloadProgress = vi.fn();

    await fetchCore({
      url: '/test',
      method: 'GET',
      headers: new Headers(),
      responseType: 'json',
      validateStatus: isHttpSuccess,
      paramsSerializer: serializeParams,
      adapter,
      onDownloadProgress
    } as any);

    // No progress events should fire for a null body
    expect(onDownloadProgress).not.toHaveBeenCalled();
  });
});

// ============================================================
//  processResponse
// ============================================================

describe('processResponse', () => {
  function makeResponse(overrides: Partial<FetchResponse> = {}): FetchResponse {
    return {
      data: { code: 200, message: 'ok' },
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      config: {
        url: '/test',
        method: 'GET',
        headers: new Headers(),
        responseType: 'json',
        validateStatus: isHttpSuccess,
        paramsSerializer: serializeParams
      } as any,
      ...overrides
    };
  }

  function makeInstance(): any {
    return vi.fn(async () => makeResponse());
  }

  const baseOpts: RequestOption = {
    transform: (r: FetchResponse) => r.data,
    isBackendSuccess: (r: FetchResponse) => (r.data as any)?.code === 200,
    backendErrorMsg: 'Backend error'
  };

  it('returns response unchanged when isBackendSuccess is true', async () => {
    const response = makeResponse({ data: { code: 200, message: 'ok' } });
    const result = await processResponse(response, baseOpts, makeInstance(), true);
    expect(result).toBe(response);
  });

  it('throws BackendError when isBackendSuccess is false and no onBackendFail', async () => {
    const response = makeResponse({ data: { code: 401, message: 'Unauthorized' } });
    await expect(processResponse(response, baseOpts, makeInstance(), true)).rejects.toBeInstanceOf(BackendError);
  });

  it('throws BackendError when allowBackendFail is false', async () => {
    const response = makeResponse({ data: { code: 401, message: 'Unauthorized' } });
    const onBackendFail = vi.fn(async () => makeResponse({ data: { code: 200 } }));
    const opts = { ...baseOpts, onBackendFail };
    await expect(processResponse(response, opts, makeInstance(), false)).rejects.toBeInstanceOf(BackendError);
    expect(onBackendFail).not.toHaveBeenCalled();
  });

  it('calls onBackendFail and re-validates the returned response', async () => {
    const failedResponse = makeResponse({ data: { code: 401 } });
    const recoveredResponse = makeResponse({ data: { code: 200, recovered: true } });
    const onBackendFail = vi.fn(async () => recoveredResponse);
    const opts = { ...baseOpts, onBackendFail };

    const result = await processResponse(failedResponse, opts, makeInstance(), true);
    expect(onBackendFail).toHaveBeenCalledTimes(1);
    expect(result).toBe(recoveredResponse);
  });

  it('does not call onBackendFail again on the re-validated response', async () => {
    const failedResponse = makeResponse({ data: { code: 401 } });
    // The recovery still fails isBackendSuccess
    const stillFailing = makeResponse({ data: { code: 401 } });
    const onBackendFail = vi.fn(async () => stillFailing);
    const opts = { ...baseOpts, onBackendFail };

    await expect(processResponse(failedResponse, opts, makeInstance(), true)).rejects.toBeInstanceOf(BackendError);
    // Should only be called once — not again for the re-validated still-failing response
    expect(onBackendFail).toHaveBeenCalledTimes(1);
  });

  it('throws BackendError when onBackendFail returns null', async () => {
    const failedResponse = makeResponse({ data: { code: 401 } });
    const onBackendFail = vi.fn(async () => null);
    const opts = { ...baseOpts, onBackendFail };

    await expect(processResponse(failedResponse, opts, makeInstance(), true)).rejects.toBeInstanceOf(BackendError);
    expect(onBackendFail).toHaveBeenCalledTimes(1);
  });

  it('skips isBackendSuccess for non-json response types', async () => {
    const isBackendSuccess = vi.fn(() => true);
    const opts = { ...baseOpts, isBackendSuccess };
    const response = makeResponse({
      data: 'plain text',
      config: { ...makeResponse().config, responseType: 'text' } as any
    });

    const result = await processResponse(response, opts, makeInstance(), true);
    expect(result).toBe(response);
    expect(isBackendSuccess).not.toHaveBeenCalled();
  });
});
