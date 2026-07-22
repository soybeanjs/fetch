import { FetchError } from './error';
import { MessageStack } from './message';
import { serializeParams } from './utils';
import type {
  AuthOptions,
  CacheOptions,
  ConcurrencyOptions,
  FetchResponse,
  ResolvedFetchRequestConfig,
  SlowRequestEntry
} from './types';

// ============================================================
//  Types (内部类型)
// ============================================================

interface CacheEntry {
  response: FetchResponse;
  timestamp: number;
}

interface LoadingEntry {
  url: string;
  method: string;
  startTime: number;
  timer?: ReturnType<typeof setTimeout>;
  onGlobalLoadingChange?: (loading: boolean) => void;
  onLoadingChange?: (loading: boolean) => void;
  onSlowRequest?: (entry: SlowRequestEntry) => void;
}

interface DebounceEntry {
  timer: ReturnType<typeof setTimeout>;
  reject: (err: Error) => void;
}

/**
 * Shared state for cache, dedupe, concurrency, loading, debounce, throttle,
 * and auth. Each fetch instance gets its own state.
 *
 * 缓存、去重、并发、加载、防抖、节流和 Auth 的共享状态。
 * 每个 fetch 实例拥有独立的状态。
 */
export interface EnhancedState {
  cache: Map<string, CacheEntry>;
  dedupe: Map<string, Promise<FetchResponse>>;
  concurrency: { active: number; queue: (() => void)[] };
  loading: { count: number; entries: Map<string, LoadingEntry> };
  debounce: Map<string, DebounceEntry>;
  throttle: Map<string, number>;
  auth: { refreshing: Promise<string | null> | null };
  /** 请求消息去重栈 (Request message deduplication stack) */
  messages: MessageStack;
  [key: string]: any;
}

// ============================================================
//  State Factory (状态工厂)
// ============================================================

export function createEnhancedState(): EnhancedState {
  return {
    cache: new Map(),
    dedupe: new Map(),
    concurrency: { active: 0, queue: [] },
    loading: { count: 0, entries: new Map() },
    debounce: new Map(),
    throttle: new Map(),
    auth: { refreshing: null },
    messages: new MessageStack()
  };
}

// ============================================================
//  Key Generators (Key 生成器)
// ============================================================

function defaultCacheKey(config: ResolvedFetchRequestConfig): string {
  const params = config.params ? serializeParams(config.params) : '';
  return `${config.method.toUpperCase()}:${config.url}:${params}`;
}

function defaultDedupeKey(config: ResolvedFetchRequestConfig): string {
  const params = config.params ? serializeParams(config.params) : '';
  const data = config.data ? JSON.stringify(config.data) : '';
  return `${config.method.toUpperCase()}:${config.url}:${params}:${data}`;
}

// ============================================================
//  Option Resolvers (配置解析)
// ============================================================

function resolveCacheOptions(config: ResolvedFetchRequestConfig): CacheOptions | null {
  if (config.cache === false || config.cache === undefined) return null;
  const opts = config.cache;
  const methods = (opts.methods ?? ['get']).map(m => m.toUpperCase());
  if (!methods.includes(config.method.toUpperCase())) return null;
  return opts;
}

function resolveDedupeOptions(config: ResolvedFetchRequestConfig): { key: (config: ResolvedFetchRequestConfig) => string } | null {
  if (!config.dedupe) return null;
  if (config.dedupe === true) return { key: defaultDedupeKey };
  return { key: config.dedupe.key ?? defaultDedupeKey };
}

function resolveConcurrencyOptions(config: ResolvedFetchRequestConfig): ConcurrencyOptions | null {
  if (!config.concurrency || config.concurrency.maxConcurrent <= 0) return null;
  return config.concurrency;
}

// ============================================================
//  Loading Tracker (加载追踪)
// ============================================================

function startLoading(state: EnhancedState, config: ResolvedFetchRequestConfig): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const entry: LoadingEntry = {
    url: config.url,
    method: config.method,
    startTime: Date.now(),
    onGlobalLoadingChange: config.onGlobalLoadingChange,
    onLoadingChange: config.onLoadingChange,
    onSlowRequest: config.onSlowRequest
  };

  // Slow request detection
  if (config.slowThreshold && config.slowThreshold > 0) {
    entry.timer = setTimeout(() => {
      config.onSlowRequest?.({
        url: config.url,
        method: config.method,
        duration: Date.now() - entry.startTime
      });
    }, config.slowThreshold);
  }

  state.loading.entries.set(id, entry);

  // Per-request loading: always fires for this individual request
  config.onLoadingChange?.(true);

  // Global loading: fires only on 0→1 transition
  if (state.loading.count === 0) {
    config.onGlobalLoadingChange?.(true);
  }
  state.loading.count++;

  return id;
}

function endLoading(state: EnhancedState, id: string): void {
  const entry = state.loading.entries.get(id);
  if (!entry) return;

  if (entry.timer) clearTimeout(entry.timer);
  state.loading.entries.delete(id);

  // Per-request loading: always fires for this individual request
  entry.onLoadingChange?.(false);

  // Global loading: fires only on 1→0 transition
  state.loading.count--;
  if (state.loading.count === 0) {
    entry.onGlobalLoadingChange?.(false);
  }
}

// ============================================================
//  Concurrency Control (并发控制)
// ============================================================

function withConcurrency(
  state: EnhancedState,
  maxConcurrent: number,
  fn: () => Promise<FetchResponse>
): Promise<FetchResponse> {
  return new Promise((resolve, reject) => {
    const execute = async () => {
      try {
        resolve(await fn());
      } catch (err) {
        reject(err);
      } finally {
        state.concurrency.active--;
        processConcurrencyQueue(state, maxConcurrent);
      }
    };

    if (state.concurrency.active < maxConcurrent) {
      state.concurrency.active++;
      execute();
    } else {
      state.concurrency.queue.push(() => {
        state.concurrency.active++;
        execute();
      });
    }
  });
}

function processConcurrencyQueue(state: EnhancedState, maxConcurrent: number): void {
  while (state.concurrency.queue.length > 0 && state.concurrency.active < maxConcurrent) {
    const run = state.concurrency.queue.shift()!;
    run();
  }
}

// ============================================================
//  Debounce & Throttle (防抖与节流)
// ============================================================

function debounceFetch(
  state: EnhancedState,
  key: string,
  delay: number,
  fn: () => Promise<FetchResponse>
): Promise<FetchResponse> {
  // Cancel previous debounced request with the same key
  const existing = state.debounce.get(key);
  if (existing) {
    clearTimeout(existing.timer);
    existing.reject(new FetchError(`[${key}]: Request cancelled by debounce`, { code: 'ERR_DEBOUNCED' }));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(async () => {
      state.debounce.delete(key);
      try {
        resolve(await fn());
      } catch (err) {
        reject(err);
      }
    }, delay);

    state.debounce.set(key, { timer, reject });
  });
}

function checkThrottle(
  state: EnhancedState,
  key: string,
  interval: number
): boolean {
  const now = Date.now();
  const lastCall = state.throttle.get(key);
  if (lastCall && now - lastCall < interval) {
    return false; // throttled
  }
  state.throttle.set(key, now);
  return true; // allowed
}

// ============================================================
//  Auth (认证 — Token 附加与刷新)
// ============================================================

async function attachAuthHeaders(
  config: ResolvedFetchRequestConfig
): Promise<ResolvedFetchRequestConfig> {
  if (!config.auth?.getToken) return config;
  const token = await config.auth.getToken();
  if (!token) return config;
  const headers = new Headers(config.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return { ...config, headers };
}

/** Check if the response should trigger a token refresh based on `auth.refreshOn`. */
function shouldRefreshAuth(
  auth: AuthOptions | undefined,
  status: number,
  response: FetchResponse
): boolean {
  if (!auth?.refreshToken) return false;
  const condition = auth.refreshOn ?? 401;
  if (typeof condition === 'number') {
    return status === condition;
  }
  return condition(status, response);
}

async function handleAuthRefresh(
  state: EnhancedState,
  config: ResolvedFetchRequestConfig
): Promise<string | null> {
  if (!config.auth?.refreshToken) {
    config.auth?.onUnauthorized?.();
    return null;
  }

  // Reuse existing refresh promise to prevent multiple concurrent refreshes
  if (!state.auth.refreshing) {
    state.auth.refreshing = config.auth.refreshToken().catch(() => null);
  }

  const newToken = await state.auth.refreshing;
  state.auth.refreshing = null;

  if (!newToken) {
    config.auth.onUnauthorized?.();
  }

  return newToken;
}

// ============================================================
//  Schema Validation (响应验证)
// ============================================================

function validateSchema(
  data: any,
  schema: NonNullable<ResolvedFetchRequestConfig['schema']>
): any {
  if (typeof schema === 'function') {
    return schema(data);
  }
  return schema.parse(data);
}

// ============================================================
//  Enhanced Fetch (增强的 Fetch — 包装 fetchCore)
// ============================================================

/**
 * Wrap `fetchCore` with cache, dedupe, throttle, debounce, auth, concurrency,
 * loading tracking, and schema validation.
 *
 * 用缓存、去重、节流、防抖、Auth、并发限制、加载追踪和 Schema 验证包装 `fetchCore`。
 */
export function createEnhancedFetch(
  fetchCore: (config: ResolvedFetchRequestConfig) => Promise<FetchResponse>,
  state: EnhancedState
): (config: ResolvedFetchRequestConfig) => Promise<FetchResponse> {
  return async function enhancedFetch(config: ResolvedFetchRequestConfig): Promise<FetchResponse> {
    // 1. Cache check
    const cacheOpts = resolveCacheOptions(config);
    if (cacheOpts) {
      const cacheKey = cacheOpts.key?.(config) ?? defaultCacheKey(config);
      const entry = state.cache.get(cacheKey);
      if (entry) {
        const age = Date.now() - entry.timestamp;
        if (age < cacheOpts.ttl) {
          return entry.response;
        }
        state.cache.delete(cacheKey);
      }
    }

    // 2. Dedupe check
    const dedupeOpts = resolveDedupeOptions(config);
    const dedupeKey = dedupeOpts ? dedupeOpts.key(config) : null;
    if (dedupeKey && state.dedupe.has(dedupeKey)) {
      return state.dedupe.get(dedupeKey)!;
    }

    // 3. Throttle check (after cache/dedupe, before debounce)
    const actionKey = defaultDedupeKey(config);
    if (config.throttle && config.throttle > 0) {
      if (!checkThrottle(state, actionKey, config.throttle)) {
        throw new FetchError(
          `[${config.method}] "${config.url}": Request throttled`,
          { code: 'ERR_THROTTLED', config }
        );
      }
    }

    // 4. Build the actual fetch function (auth + loading + fetchCore + 401 refresh + schema + cache)
    const doFetch = async (): Promise<FetchResponse> => {
      const loadingId = startLoading(state, config);
      try {
        // Attach auth token
        let authedConfig = await attachAuthHeaders(config);

        let response = await fetchCore(authedConfig);

        // Auth refresh + retry (triggered by auth.refreshOn, default 401)
        if (shouldRefreshAuth(config.auth, response.status, response)) {
          const newToken = await handleAuthRefresh(state, config);
          if (newToken) {
            authedConfig = await attachAuthHeaders(config);
            response = await fetchCore(authedConfig);
          }
        }

        // Schema validation
        if (config.schema && response.data !== undefined && response.data !== null) {
          response.data = validateSchema(response.data, config.schema);
        }

        // Store in cache
        if (cacheOpts) {
          const key = cacheOpts.key?.(config) ?? defaultCacheKey(config);
          const max = cacheOpts.max ?? 100;
          while (state.cache.size >= max) {
            const oldestKey = state.cache.keys().next().value;
            if (oldestKey === undefined) break;
            state.cache.delete(oldestKey);
          }
          state.cache.set(key, { response, timestamp: Date.now() });
        }

        return response;
      } finally {
        endLoading(state, loadingId);
        if (dedupeKey) state.dedupe.delete(dedupeKey);
      }
    };

    // 5. Wrap with concurrency control
    const concurrencyOpts = resolveConcurrencyOptions(config);
    const withConcurrent = (): Promise<FetchResponse> => {
      if (concurrencyOpts) {
        return withConcurrency(state, concurrencyOpts.maxConcurrent, doFetch);
      }
      return doFetch();
    };

    // 6. Wrap with debounce (outermost — delays everything)
    const execute = (): Promise<FetchResponse> => {
      if (config.debounce && config.debounce > 0) {
        return debounceFetch(state, actionKey, config.debounce, withConcurrent);
      }
      return withConcurrent();
    };

    // 7. Store in dedupe map (before executing to avoid race)
    if (dedupeKey) {
      const promise = execute();
      state.dedupe.set(dedupeKey, promise);
      return promise;
    }

    return execute();
  };
}

// ============================================================
//  Cache Management (缓存管理)
// ============================================================

/**
 * Clear all cached responses for the given state.
 *
 * 清除指定状态的所有缓存响应。
 */
export function clearCache(state: EnhancedState): void {
  state.cache.clear();
}

/**
 * Delete a specific cache entry by key.
 *
 * 按 key 删除特定缓存条目。
 */
export function deleteCache(state: EnhancedState, key: string): void {
  state.cache.delete(key);
}
