import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ERR_SCHEMA } from '../src/constant';
import { clearCache, createEnhancedFetch, createEnhancedState, deleteCache } from '../src/enhanced';
import { FetchError } from '../src/error';
import { MessageStack } from '../src/message';
import type { StandardSchemaV1 } from '../src/standard-schema';
import type { FetchResponse, ResolvedFetchRequestConfig } from '../src/types';

// ============================================================
//  Helpers
// ============================================================

function createMockFetchCore(responseData: any = { ok: true }, status = 200) {
  return vi.fn(
    async (config: ResolvedFetchRequestConfig): Promise<FetchResponse> => ({
      data: typeof responseData === 'function' ? responseData() : responseData,
      status,
      statusText: status === 200 ? 'OK' : '',
      headers: new Headers(),
      config,
      request: undefined
    })
  );
}

function createConfig(overrides: Partial<ResolvedFetchRequestConfig> = {}): ResolvedFetchRequestConfig {
  return {
    url: '/test',
    method: 'GET',
    headers: new Headers(),
    responseType: 'json',
    validateStatus: (s: number) => s >= 200 && s < 300,
    paramsSerializer: () => '',
    ...overrides
  } as ResolvedFetchRequestConfig;
}

// ============================================================
//  Tests
// ============================================================

describe('createEnhancedState', () => {
  it('returns object with all fields initialized', () => {
    const state = createEnhancedState();
    expect(state.cache).toBeInstanceOf(Map);
    expect(state.dedupe).toBeInstanceOf(Map);
    expect(state.concurrency).toEqual({ active: 0, queue: [] });
    expect(state.loading.count).toBe(0);
    expect(state.loading.entries).toBeInstanceOf(Map);
    expect(state.debounce).toBeInstanceOf(Map);
    expect(state.throttle).toBeInstanceOf(Map);
    expect(state.auth).toEqual({ refreshing: null });
    expect(state.messages).toBeInstanceOf(MessageStack);
  });

  it('each call returns a fresh independent state', () => {
    const s1 = createEnhancedState();
    const s2 = createEnhancedState();
    expect(s1).not.toBe(s2);
    expect(s1.cache).not.toBe(s2.cache);
    s1.cache.set('a', {} as any);
    expect(s2.cache.size).toBe(0);
  });
});

describe('createEnhancedFetch — cache', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('caches GET response within TTL', async () => {
    const fetchCore = createMockFetchCore({ value: 1 });
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const config = createConfig({
      cache: { ttl: 5000, methods: ['get'] }
    });

    const r1 = await enhanced(config);
    const r2 = await enhanced(config);

    expect(fetchCore).toHaveBeenCalledTimes(1);
    expect(r1.data).toEqual({ value: 1 });
    expect(r2.data).toEqual({ value: 1 });
  });

  it('re-fetches after TTL expires', async () => {
    const fetchCore = createMockFetchCore({ value: 1 });
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const config = createConfig({
      cache: { ttl: 1000, methods: ['get'] }
    });

    await enhanced(config);
    vi.advanceTimersByTime(1500);
    await enhanced(config);

    expect(fetchCore).toHaveBeenCalledTimes(2);
  });

  it('does not cache when cache is false', async () => {
    const fetchCore = createMockFetchCore({ value: 1 });
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const config = createConfig({ cache: false });

    await enhanced(config);
    await enhanced(config);

    expect(fetchCore).toHaveBeenCalledTimes(2);
  });

  it('does not cache when cache is undefined', async () => {
    const fetchCore = createMockFetchCore({ value: 1 });
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    await enhanced(createConfig());
    await enhanced(createConfig());

    expect(fetchCore).toHaveBeenCalledTimes(2);
  });

  it('only caches specified methods', async () => {
    const fetchCore = createMockFetchCore({ value: 1 });
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const postConfig = createConfig({
      method: 'POST',
      cache: { ttl: 5000, methods: ['get'] }
    });

    await enhanced(postConfig);
    await enhanced(postConfig);

    expect(fetchCore).toHaveBeenCalledTimes(2);
  });

  it('evicts oldest entry when max is exceeded', async () => {
    const fetchCore = createMockFetchCore({ value: 1 });
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const baseConfig = createConfig({
      cache: { ttl: 10000, methods: ['get'], max: 2 }
    });

    await enhanced({ ...baseConfig, url: '/a' });
    await enhanced({ ...baseConfig, url: '/b' });
    await enhanced({ ...baseConfig, url: '/c' });

    expect(state.cache.size).toBe(2);
  });

  it('uses custom key function', async () => {
    const fetchCore = createMockFetchCore({ value: 1 });
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const customKey = vi.fn(() => 'custom-key');
    const config = createConfig({
      cache: { ttl: 5000, methods: ['get'], key: customKey }
    });

    await enhanced(config);
    await enhanced(config);

    expect(customKey).toHaveBeenCalled();
    expect(fetchCore).toHaveBeenCalledTimes(1);
    expect(state.cache.has('custom-key')).toBe(true);
  });
});

describe('createEnhancedFetch — dedupe', () => {
  it('deduplicates concurrent requests with same key', async () => {
    let resolveFetch: (val: any) => void;
    const fetchCore = vi.fn(
      () =>
        new Promise<FetchResponse>(resolve => {
          resolveFetch = resolve;
        })
    );
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const config = createConfig({
      dedupe: true,
      method: 'POST',
      body: { a: 1 }
    });

    const p1 = enhanced(config);
    // Flush microtasks so fetchCore is actually called and resolveFetch is assigned
    await new Promise<void>(r => queueMicrotask(r));
    const p2 = enhanced(config);

    resolveFetch!({
      data: { ok: true },
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      config,
      request: undefined
    });
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(fetchCore).toHaveBeenCalledTimes(1);
    expect(r1).toBe(r2);
  });

  it('uses custom dedupe key', async () => {
    const fetchCore = createMockFetchCore({ ok: true });
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const customKey = vi.fn(() => 'dedupe-custom');
    const config = createConfig({
      dedupe: { key: customKey }
    });

    await enhanced(config);

    expect(customKey).toHaveBeenCalled();
    expect(state.dedupe.size).toBe(0);
  });

  it('does not dedupe when dedupe is falsy', async () => {
    const fetchCore = createMockFetchCore({ ok: true });
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    await enhanced(createConfig({ dedupe: false }));
    await enhanced(createConfig({ dedupe: false }));

    expect(fetchCore).toHaveBeenCalledTimes(2);
  });
});

describe('createEnhancedFetch — concurrency', () => {
  it('limits concurrent requests to maxConcurrent', async () => {
    let resolveFirst: () => void;
    const fetchCore = vi.fn((config: ResolvedFetchRequestConfig) => {
      if (fetchCore.mock.calls.length === 1) {
        return new Promise<FetchResponse>(resolve => {
          resolveFirst = () =>
            resolve({ data: 1, status: 200, statusText: 'OK', headers: new Headers(), config, request: undefined });
        });
      }
      return Promise.resolve({
        data: 2,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        config,
        request: undefined
      });
    });

    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const config = createConfig({
      concurrency: { maxConcurrent: 1 }
    });

    const p1 = enhanced(config);
    await new Promise<void>(r => queueMicrotask(r));
    const p2 = enhanced(config);
    await new Promise<void>(r => queueMicrotask(r));

    expect(state.concurrency.active).toBe(1);
    expect(state.concurrency.queue.length).toBe(1);

    resolveFirst!();
    await p1;
    await p2;

    expect(state.concurrency.active).toBe(0);
    expect(fetchCore).toHaveBeenCalledTimes(2);
  });

  it('does not limit when concurrency is not set', async () => {
    const fetchCore = createMockFetchCore({ ok: true });
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    await Promise.all([enhanced(createConfig()), enhanced(createConfig()), enhanced(createConfig())]);

    expect(fetchCore).toHaveBeenCalledTimes(3);
  });
});

describe('createEnhancedFetch — loading', () => {
  it('fires onLoadingChange true then false', async () => {
    const fetchCore = createMockFetchCore({ ok: true });
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const calls: boolean[] = [];
    const config = createConfig({
      onLoadingChange: (loading: boolean) => calls.push(loading)
    });

    await enhanced(config);

    expect(calls).toEqual([true, false]);
  });

  it('fires onGlobalLoadingChange on 0→1 and 1→0 transitions', async () => {
    let resolveFirst: () => void;
    const fetchCore = vi.fn((config: ResolvedFetchRequestConfig) => {
      if (fetchCore.mock.calls.length === 1) {
        return new Promise<FetchResponse>(resolve => {
          resolveFirst = () =>
            resolve({ data: 1, status: 200, statusText: 'OK', headers: new Headers(), config, request: undefined });
        });
      }
      return Promise.resolve({
        data: 2,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        config,
        request: undefined
      });
    });

    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const calls: boolean[] = [];
    const config = createConfig({
      onGlobalLoadingChange: (loading: boolean) => calls.push(loading)
    });

    const p1 = enhanced(config);
    // Flush microtasks so fetchCore is actually called and resolveFirst is assigned
    await new Promise<void>(r => queueMicrotask(r));
    const p2 = enhanced(config);

    // While first is in-flight, global loading should have fired true once
    expect(calls).toEqual([true]);

    resolveFirst!();
    await Promise.all([p1, p2]);

    // After both complete, global loading should have fired false once
    expect(calls).toEqual([true, false]);
  });

  it('fires onSlowRequest after slowThreshold', async () => {
    vi.useFakeTimers();
    const fetchCore = vi.fn(
      () => new Promise<FetchResponse>(() => {}) // never resolves
    );
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const slowHandler = vi.fn();
    const config = createConfig({
      slowThreshold: 2000,
      onSlowRequest: slowHandler
    });

    const promise = enhanced(config);
    vi.advanceTimersByTime(2000);

    expect(slowHandler).toHaveBeenCalledTimes(1);
    expect(slowHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/test',
        method: 'GET',
        duration: expect.any(Number)
      })
    );

    vi.useRealTimers();
    // Prevent unhandled rejection
    promise.catch(() => {});
  });
});

describe('createEnhancedFetch — debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('delays request by debounce delay', async () => {
    const fetchCore = createMockFetchCore({ ok: true });
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const config = createConfig({
      debounce: 100
    });

    const promise = enhanced(config);
    expect(fetchCore).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    await promise;

    expect(fetchCore).toHaveBeenCalledTimes(1);
  });

  it('cancels previous debounced request with same key', async () => {
    const fetchCore = createMockFetchCore({ ok: true });
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const config = createConfig({
      debounce: 100,
      method: 'POST',
      body: { a: 1 }
    });

    const p1 = enhanced(config);
    // Second call with same key cancels the first
    const p2 = enhanced(config);

    await expect(p1).rejects.toThrow('cancelled by debounce');

    vi.advanceTimersByTime(100);
    await p2;

    expect(fetchCore).toHaveBeenCalledTimes(1);
  });
});

describe('createEnhancedFetch — throttle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('allows first call and throttles second within interval', async () => {
    const fetchCore = createMockFetchCore({ ok: true });
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const config = createConfig({
      throttle: 1000,
      method: 'POST',
      body: { a: 1 }
    });

    await enhanced(config);

    await expect(enhanced(config)).rejects.toMatchObject({
      code: 'ERR_THROTTLED'
    });

    expect(fetchCore).toHaveBeenCalledTimes(1);
  });

  it('allows second call after interval passes', async () => {
    const fetchCore = createMockFetchCore({ ok: true });
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const config = createConfig({
      throttle: 1000,
      method: 'POST',
      body: { a: 1 }
    });

    await enhanced(config);
    vi.advanceTimersByTime(1000);
    await enhanced(config);

    expect(fetchCore).toHaveBeenCalledTimes(2);
  });
});

describe('createEnhancedFetch — auth', () => {
  it('attaches Bearer token from getToken', async () => {
    const fetchCore = vi.fn(async (config: ResolvedFetchRequestConfig) => ({
      data: { ok: true },
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      config,
      request: undefined
    }));
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const config = createConfig({
      auth: { getToken: async () => 'my-token' }
    });

    await enhanced(config);

    const calledConfig = fetchCore.mock.calls[0][0] as ResolvedFetchRequestConfig;
    expect(calledConfig.headers.get('Authorization')).toBe('Bearer my-token');
  });

  it('does not attach header when getToken returns null', async () => {
    const fetchCore = vi.fn(async (config: ResolvedFetchRequestConfig) => ({
      data: { ok: true },
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      config,
      request: undefined
    }));
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const config = createConfig({
      auth: { getToken: async () => null }
    });

    await enhanced(config);

    const calledConfig = fetchCore.mock.calls[0][0] as ResolvedFetchRequestConfig;
    expect(calledConfig.headers.get('Authorization')).toBeNull();
  });

  it('refreshes token on 401 and retries', async () => {
    const fetchCore = vi.fn(async (config: ResolvedFetchRequestConfig) => {
      const callCount = fetchCore.mock.calls.length;
      if (callCount === 1) {
        return {
          data: { error: 'unauthorized' },
          status: 401,
          statusText: 'Unauthorized',
          headers: new Headers(),
          config,
          request: undefined
        };
      }
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: new Headers(), config, request: undefined };
    });
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const config = createConfig({
      auth: {
        getToken: async () => 'old-token',
        refreshToken: async () => 'new-token'
      }
    });

    const response = await enhanced(config);

    expect(fetchCore).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    expect(state.auth.refreshing).toBeNull();
  });

  it('uses custom refreshOn function', async () => {
    const fetchCore = vi.fn(async (config: ResolvedFetchRequestConfig) => {
      const callCount = fetchCore.mock.calls.length;
      if (callCount === 1) {
        return {
          data: { error: 'forbidden' },
          status: 403,
          statusText: 'Forbidden',
          headers: new Headers(),
          config,
          request: undefined
        };
      }
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: new Headers(), config, request: undefined };
    });
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const config = createConfig({
      auth: {
        getToken: async () => 'token',
        refreshToken: async () => 'new-token',
        refreshOn: (status: number) => status === 403
      }
    });

    const response = await enhanced(config);

    expect(fetchCore).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
  });

  it('shares refresh promise across concurrent 401s', async () => {
    let refreshCallCount = 0;
    const fetchCore = vi.fn(async (config: ResolvedFetchRequestConfig) => {
      const callCount = fetchCore.mock.calls.length;
      if (callCount <= 2) {
        return {
          data: { error: 'unauthorized' },
          status: 401,
          statusText: '',
          headers: new Headers(),
          config,
          request: undefined
        };
      }
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: new Headers(), config, request: undefined };
    });
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const config = createConfig({
      url: '/shared',
      method: 'POST',
      body: { a: 1 },
      auth: {
        getToken: async () => 'token',
        refreshToken: async () => {
          refreshCallCount++;
          return 'new-token';
        }
      }
    });

    // Two concurrent requests that both get 401
    await Promise.all([enhanced(config), enhanced({ ...config, body: { b: 2 } })]);

    // refreshToken should only be called once despite two 401s
    expect(refreshCallCount).toBe(1);
  });

  it('calls onUnauthorized when refresh fails', async () => {
    const fetchCore = vi.fn(async (config: ResolvedFetchRequestConfig) => ({
      data: { error: 'unauthorized' },
      status: 401,
      statusText: '',
      headers: new Headers(),
      config,
      request: undefined
    }));
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const onUnauthorized = vi.fn();
    const config = createConfig({
      auth: {
        getToken: async () => 'token',
        refreshToken: async () => null,
        onUnauthorized
      }
    });

    await enhanced(config);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});

describe('createEnhancedFetch — schema validation', () => {
  /** Build a minimal Standard Schema from a validate function. */
  function makeStandardSchema<T>(
    validate: (value: unknown) => StandardSchemaV1.Result<T> | Promise<StandardSchemaV1.Result<T>>
  ): StandardSchemaV1<unknown, T> {
    return {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate
      }
    } as StandardSchemaV1<unknown, T>;
  }

  it('validates with a plain function schema', async () => {
    const fetchCore = createMockFetchCore({ name: 'John', age: 30 });
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const schema = (data: any) => ({ ...data, validated: true });
    const config = createConfig({ schema });

    const response = await enhanced(config);

    expect(response.data).toEqual({ name: 'John', age: 30, validated: true });
  });

  it('validates with a Standard Schema (success — returns result.value)', async () => {
    const fetchCore = createMockFetchCore({ value: 42 });
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const schema = makeStandardSchema<{ value: number; doubled: number }>(data => ({
      value: { value: (data as any).value, doubled: (data as any).value * 2 }
    }));
    const config = createConfig({ schema });

    const response = await enhanced(config);

    expect(response.data).toEqual({ value: 42, doubled: 84 });
  });

  it('supports async Standard Schema validate()', async () => {
    const fetchCore = createMockFetchCore({ value: 42 });
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const schema = makeStandardSchema(data => Promise.resolve({ value: { parsed: true, original: data } }));
    const config = createConfig({ schema });

    const response = await enhanced(config);

    expect(response.data).toEqual({ parsed: true, original: { value: 42 } });
  });

  it('throws FetchError with ERR_SCHEMA on validation failure', async () => {
    const fetchCore = createMockFetchCore({ value: 42 });
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const schema = makeStandardSchema(() => ({ issues: [{ message: 'expected a string' }] }));
    const config = createConfig({ schema });

    await expect(enhanced(config)).rejects.toMatchObject({
      name: 'FetchError',
      code: ERR_SCHEMA,
      message: 'Schema validation failed: expected a string'
    });
  });

  it('throws FetchError instance on validation failure', async () => {
    const fetchCore = createMockFetchCore({ value: 42 });
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const schema = makeStandardSchema(() => ({ issues: [{ message: 'invalid' }] }));
    const config = createConfig({ schema });

    await expect(enhanced(config)).rejects.toBeInstanceOf(FetchError);
  });

  it('joins multiple issues with "; "', async () => {
    const fetchCore = createMockFetchCore({ value: 42 });
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const schema = makeStandardSchema(() => ({
      issues: [
        { message: 'must be a string', path: ['name'] },
        { message: 'must be positive', path: ['age'] }
      ]
    }));
    const config = createConfig({ schema });

    await expect(enhanced(config)).rejects.toMatchObject({
      code: ERR_SCHEMA,
      message: 'Schema validation failed: name: must be a string; age: must be positive'
    });
  });

  it('formats array-index path segments with brackets', async () => {
    const fetchCore = createMockFetchCore([{ id: 1 }]);
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const schema = makeStandardSchema(() => ({
      issues: [{ message: 'required', path: [0, 'id'] }]
    }));
    const config = createConfig({ schema });

    await expect(enhanced(config)).rejects.toMatchObject({
      code: ERR_SCHEMA,
      message: 'Schema validation failed: [0].id: required'
    });
  });

  it('supports { key } path segment objects', async () => {
    const fetchCore = createMockFetchCore({ value: 42 });
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const schema = makeStandardSchema(() => ({
      issues: [{ message: 'bad', path: [{ key: 'value' }] }]
    }));
    const config = createConfig({ schema });

    await expect(enhanced(config)).rejects.toMatchObject({
      code: ERR_SCHEMA,
      message: 'Schema validation failed: value: bad'
    });
  });

  it('skips schema when data is undefined', async () => {
    const fetchCore = vi.fn(async (config: ResolvedFetchRequestConfig) => ({
      data: undefined,
      status: 204,
      statusText: 'No Content',
      headers: new Headers(),
      config,
      request: undefined
    }));
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const schema = vi.fn();
    const config = createConfig({ schema });

    await enhanced(config);

    expect(schema).not.toHaveBeenCalled();
  });

  it('skips schema when data is null', async () => {
    const fetchCore = createMockFetchCore(null);
    const state = createEnhancedState();
    const enhanced = createEnhancedFetch(fetchCore, state);

    const schema = makeStandardSchema(vi.fn(() => ({ value: 'should-not-run' })));
    const config = createConfig({ schema });

    const response = await enhanced(config);

    expect(response.data).toBeNull();
    expect(schema['~standard'].validate).not.toHaveBeenCalled();
  });
});

describe('cache management functions', () => {
  it('clearCache clears all entries', () => {
    const state = createEnhancedState();
    state.cache.set('a', { response: {} as FetchResponse, timestamp: Date.now() });
    state.cache.set('b', { response: {} as FetchResponse, timestamp: Date.now() });

    clearCache(state);

    expect(state.cache.size).toBe(0);
  });

  it('deleteCache removes specific entry', () => {
    const state = createEnhancedState();
    state.cache.set('a', { response: {} as FetchResponse, timestamp: Date.now() });
    state.cache.set('b', { response: {} as FetchResponse, timestamp: Date.now() });

    deleteCache(state, 'a');

    expect(state.cache.has('a')).toBe(false);
    expect(state.cache.has('b')).toBe(true);
  });
});
