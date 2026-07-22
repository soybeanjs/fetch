import { NULL_BODY_STATUS_CODES } from './constant';
import { coerceBinaryToJsonResponse, isHttpSuccess } from './shared';
import {
  callHooks,
  detectResponseType,
  isJSONSerializable,
  isPayloadMethod,
  mergeHeaders,
  resolveURL,
  serializeParams,
  toHeaders
} from './utils';
import { defaultAdapter } from './adapter';
import { BackendError, FetchError } from './error';
import { createRetryOptions } from './options';
import type {
  $Fetch,
  CreateFetchDefaults,
  FetchAdapterInit,
  FetchAdapterResponse,
  FetchContext,
  FetchInstance,
  FetchRequestConfig,
  FetchResponse,
  MappedType,
  RequestOption,
  ResolvedFetchRequestConfig,
  ResponseType
} from './types';

// ============================================================
//  Internal Helpers (内部辅助函数)
// ============================================================

/** Merge per-request config with instance defaults. */
export function mergeConfig(
  defaults: ResolvedFetchRequestConfig,
  config: Record<string, any>
): ResolvedFetchRequestConfig {
  const headers = mergeHeaders(defaults.headers, config.headers);

  return {
    ...defaults,
    ...config,
    headers,
    url: config.url ?? defaults.url ?? '',
    method: (config.method ?? defaults.method ?? 'GET').toString().toUpperCase(),
    responseType: config.responseType ?? defaults.responseType ?? 'json',
    retry: config.retry ?? defaults.retry,
    paramsSerializer: config.paramsSerializer ?? defaults.paramsSerializer ?? serializeParams,
    validateStatus: config.validateStatus ?? defaults.validateStatus ?? isHttpSuccess,
    parseResponse: config.parseResponse ?? defaults.parseResponse,
    getFileName: config.getFileName ?? defaults.getFileName,
    timeout: config.timeout ?? defaults.timeout,
    adapter: config.adapter ?? defaults.adapter,
    ignoreResponseError: config.ignoreResponseError ?? defaults.ignoreResponseError,
    onRequest: config.onRequest ?? defaults.onRequest,
    onRequestError: config.onRequestError ?? defaults.onRequestError,
    onResponse: config.onResponse ?? defaults.onResponse,
    onResponseError: config.onResponseError ?? defaults.onResponseError
  };
}

/** Build the final URL from baseURL, url, and params. */
function buildURL(config: ResolvedFetchRequestConfig): string {
  let url = resolveURL(config.url, config.baseURL);

  if (config.params) {
    const serializer = config.paramsSerializer ?? serializeParams;
    const queryString = serializer(config.params);
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  return url;
}

/** Serialize the request body. Returns `{ body, duplex }`. */
function serializeBody(data: any, method: string, headers: Headers): { body: BodyInit | undefined; duplex?: 'half' } {
  if (data === undefined || data === null) return { body: undefined };
  if (!isPayloadMethod(method)) return { body: undefined };

  // Native body types — pass through as-is
  if (
    typeof data === 'string' ||
    data instanceof Blob ||
    data instanceof ArrayBuffer ||
    data instanceof FormData ||
    data instanceof URLSearchParams ||
    (typeof ReadableStream !== 'undefined' && data instanceof ReadableStream) ||
    (typeof Uint8Array !== 'undefined' && data instanceof Uint8Array)
  ) {
    if (data instanceof ReadableStream) {
      return { body: data, duplex: 'half' };
    }
    return { body: data as BodyInit };
  }

  // Node.js Readable stream (has .pipe method) — needs duplex: 'half'
  if (data && typeof (data as any).pipe === 'function') {
    return { body: data as BodyInit, duplex: 'half' };
  }

  // JSON-serializable values
  if (isJSONSerializable(data)) {
    const contentType = headers.get('content-type');

    // URL-encoded form
    if (contentType?.includes('application/x-www-form-urlencoded')) {
      const form = new URLSearchParams();
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined && value !== null) {
          form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
        }
      }
      return { body: form };
    }

    // JSON
    if (!contentType) headers.set('content-type', 'application/json');
    if (!headers.has('accept')) headers.set('accept', 'application/json');
    return { body: JSON.stringify(data) };
  }

  return { body: JSON.stringify(data) };
}

/** Create a timeout abort signal that tracks whether the timeout fired. */
function createTimeoutSignal(
  timeout: number | undefined,
  userSignal?: AbortSignal
): { signal: AbortSignal | undefined; isTimeout: () => boolean } {
  if (!timeout) return { signal: userSignal, isTimeout: () => false };

  let timedOut = false;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);

  if (userSignal) {
    if (userSignal.aborted) {
      clearTimeout(timer);
      controller.abort(userSignal.reason);
    } else {
      userSignal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          controller.abort(userSignal.reason);
        },
        { once: true }
      );
    }
  }

  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });

  return { signal: controller.signal, isTimeout: () => timedOut };
}

/** Parse the response body based on responseType. */
async function parseResponseBody(
  response: FetchAdapterResponse,
  responseType: ResponseType,
  parseResponse?: (text: string) => any
): Promise<any> {
  if (NULL_BODY_STATUS_CODES.has(response.status)) return undefined;
  if (response.body === null) return undefined;

  // Auto-detect response type from content-type header
  if (responseType === 'auto') {
    responseType = detectResponseType(response.headers.get('content-type'));
    // If parseResponse is set, force JSON parsing
    if (parseResponse) responseType = 'json';
  }

  switch (responseType) {
    case 'json': {
      const text = await response.text();
      if (!text) return undefined;
      try {
        return parseResponse ? parseResponse(text) : JSON.parse(text);
      } catch {
        return text;
      }
    }
    case 'text':
      return response.text();
    case 'blob':
      return response.blob();
    case 'arraybuffer':
      return response.arrayBuffer();
    case 'stream':
      return response.body;
    case 'document': {
      const text = await response.text();
      if (typeof DOMParser !== 'undefined') {
        const parser = new DOMParser();
        const contentType = response.headers.get('content-type') || 'text/html';
        return parser.parseFromString(text, contentType as DOMParserSupportedType);
      }
      return text;
    }
    default:
      return response.text();
  }
}

/** Sleep for ms. */
function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve();
}

// ============================================================
//  Process Response (响应处理 — 业务逻辑层)
// ============================================================

/**
 * Process a fetch response: coerce binary→JSON, check isBackendSuccess,
 * and handle onBackendFail.
 */
async function processResponse<ResponseData>(
  response: FetchResponse<ResponseData>,
  opts: RequestOption<ResponseData>,
  instance: FetchInstance,
  allowBackendFail: boolean
): Promise<FetchResponse> {
  await coerceBinaryToJsonResponse(response);

  const responseType: ResponseType = response.config?.responseType || 'json';

  // Non-JSON response types skip isBackendSuccess.
  // 'auto' is treated like 'json' — the actual type was already resolved during parsing.
  if (responseType !== 'json' && responseType !== 'auto') return response;

  if (opts.isBackendSuccess(response)) return response;

  // Backend failure — try to recover
  if (allowBackendFail && opts.onBackendFail) {
    const fail = await opts.onBackendFail(response, instance);
    if (fail) {
      // Re-validate, but do NOT call onBackendFail again (prevent loops)
      return processResponse(fail as FetchResponse<ResponseData>, opts, instance, false);
    }
  }

  // Still failing → throw BackendError
  const errorMsg = opts.backendErrorMsg || 'Backend request error, please check `isBackendSuccess`.';
  throw new BackendError(errorMsg, response);
}

// ============================================================
//  Create Fetch Instance (创建 Fetch 实例)
// ============================================================

/**
 * Create the core fetch instance with all hooks wired up.
 *
 * The returned `FetchInstance` goes through the full pipeline:
 * 1. Merge config → 2. onRequest → 3. Build URL/headers/body →
 * 4. Fetch with retry & timeout → 5. Parse response → 6. processResponse → 7. Return
 *
 * On error, `onError` is called and the error is re-thrown.
 */
export function createFetchInstance<ResponseData, State extends Record<string, unknown>>(
  defaults: CreateFetchDefaults,
  opts: RequestOption<ResponseData, any, State>
): FetchInstance {
  const resolvedDefaults = resolveDefaults(defaults);

  /** Raw fetch — applies business-level onRequest, then delegates to fetchCore. */
  async function fetchRaw(config: ResolvedFetchRequestConfig): Promise<FetchResponse> {
    // Business-level onRequest hook (from RequestOption)
    let resolvedConfig = config;
    if (opts.onRequest) {
      const result = await opts.onRequest(config);
      if (result) resolvedConfig = result;
    }
    return fetchCore(resolvedConfig);
  }

  // Full instance: fetchRaw + processResponse + onError
  const instance = async function instance(config: Record<string, any>): Promise<FetchResponse> {
    const mergedConfig = mergeConfig(resolvedDefaults, config);

    try {
      const response = await fetchRaw(mergedConfig);
      return await processResponse(response, opts, instance as FetchInstance, true);
    } catch (error) {
      await opts.onError?.(error as FetchError<ResponseData>);
      throw error;
    }
  } as FetchInstance;

  instance.defaults = resolvedDefaults;
  return instance;
}

// Re-export for internal use
export { processResponse };

// ============================================================
//  resolveDefaults & fetchCore (提取的传输层核心 — 供 $fetch 复用)
// ============================================================

/**
 * Resolve a {@link CreateFetchDefaults} into a {@link ResolvedFetchRequestConfig}.
 *
 * 将创建实例的默认配置解析为完整的请求配置。
 */
export function resolveDefaults(defaults: CreateFetchDefaults): ResolvedFetchRequestConfig {
  return {
    baseURL: defaults.baseURL,
    url: defaults.url ?? '',
    method: (defaults.method ?? 'GET').toString().toUpperCase(),
    headers: toHeaders(defaults.headers),
    params: defaults.params,
    data: defaults.data,
    responseType: defaults.responseType ?? 'json',
    timeout: defaults.timeout,
    signal: defaults.signal,
    validateStatus: defaults.validateStatus ?? isHttpSuccess,
    paramsSerializer: defaults.paramsSerializer ?? serializeParams,
    parseResponse: defaults.parseResponse,
    getFileName: defaults.getFileName,
    retry: defaults.retry,
    credentials: defaults.credentials,
    mode: defaults.mode,
    cache: defaults.cache,
    redirect: defaults.redirect,
    referrer: defaults.referrer,
    referrerPolicy: defaults.referrerPolicy,
    integrity: defaults.integrity,
    keepalive: defaults.keepalive,
    adapter: defaults.adapter,
    ignoreResponseError: defaults.ignoreResponseError,
    onRequest: defaults.onRequest as any,
    onRequestError: defaults.onRequestError as any,
    onResponse: defaults.onResponse as any,
    onResponseError: defaults.onResponseError as any
  } as ResolvedFetchRequestConfig;
}

/**
 * Core fetch logic — transport layer only (no business-logic hooks).
 *
 * Handles: transport-level hooks (onRequest/onResponse/onRequestError/onResponseError),
 * retry, timeout, body serialization, response parsing, validateStatus / ignoreResponseError.
 *
 * Both {@link createFetchInstance} (business-logic API) and `$fetch` (ofetch-compatible API)
 * delegate to this function.
 *
 * 核心请求逻辑 —— 仅传输层(无业务逻辑钩子)。
 *
 * 处理:传输层钩子(onRequest/onResponse/onRequestError/onResponseError)、
 * 重试、超时、请求体序列化、响应解析、validateStatus / ignoreResponseError。
 */
export async function fetchCore(config: ResolvedFetchRequestConfig): Promise<FetchResponse> {
  // 1. Transport-level onRequest hook (from config — ofetch-style, supports arrays)
  const context: FetchContext = {
    request: config.url,
    options: config
  };
  if (config.onRequest) {
    await callHooks(context, config.onRequest);
  }

  // 2. Build URL
  const url = buildURL(config);
  context.request = url;

  // 3. Build headers (clone)
  const headers = new Headers(config.headers);

  // 4. Serialize body
  const { body, duplex } = serializeBody(config.data, config.method, headers);

  // 5. Timeout signal
  const { signal, isTimeout } = createTimeoutSignal(config.timeout, config.signal);

  // 6. Retry options
  const retryOpts = createRetryOptions(config.retry);

  // 7. Fetch with retry
  const adapter = config.adapter ?? defaultAdapter;

  for (let attempt = 0; attempt <= retryOpts.retries; attempt++) {
    let nativeResponse: FetchAdapterResponse;
    let request: Request | undefined;

    try {
      // Build adapter request init
      const requestInit: FetchAdapterInit = {
        method: config.method,
        headers,
        body,
        signal
      };
      if (duplex) requestInit.duplex = duplex;
      if (config.credentials !== undefined) requestInit.credentials = config.credentials;
      if (config.mode !== undefined) requestInit.mode = config.mode;
      if (config.cache !== undefined) requestInit.cache = config.cache;
      if (config.redirect !== undefined) requestInit.redirect = config.redirect;
      if (config.referrer !== undefined) requestInit.referrer = config.referrer;
      if (config.referrerPolicy !== undefined) requestInit.referrerPolicy = config.referrerPolicy;
      if (config.integrity !== undefined) requestInit.integrity = config.integrity;
      if (config.keepalive !== undefined) requestInit.keepalive = config.keepalive;

      // Best-effort Request object for metadata (may not exist in all environments)
      if (typeof Request !== 'undefined') {
        try {
          request = new Request(url, requestInit as RequestInit);
        } catch {
          request = undefined;
        }
      }

      nativeResponse = await adapter(url, requestInit);
    } catch (err) {
      // Network error or abort
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const timeout = isTimeout();

      const error: FetchError = new FetchError(
        timeout
          ? `[${config.method}] "${url}": Request timeout of ${config.timeout}ms exceeded`
          : `[${config.method}] "${url}": ${(err as Error).message || 'Network Error'}`,
        {
          code: timeout ? 'ERR_TIMEOUT' : isAbort ? 'ERR_ABORTED' : 'ERR_NETWORK',
          config,
          cause: err
        }
      );

      // Call onRequestError hook (transport layer)
      context.error = error;
      await callHooks(context, config.onRequestError);

      // Don't retry on user-initiated abort (non-timeout)
      if (isAbort && !timeout) throw error;

      if (attempt < retryOpts.retries) {
        const shouldRetry = await retryOpts.retryCondition(error);
        if (shouldRetry) {
          await sleep(retryOpts.retryDelay(attempt + 1, error));
          continue;
        }
      }
      throw error;
    }

    // 8. Parse response body
    const data = await parseResponseBody(nativeResponse, config.responseType, config.parseResponse);

    const fetchResponse: FetchResponse = {
      data,
      status: nativeResponse.status,
      statusText: nativeResponse.statusText,
      headers: nativeResponse.headers,
      config,
      request
    };

    // 9. Call onResponse hook (transport layer)
    context.response = fetchResponse;
    context.error = undefined;
    await callHooks(context, config.onResponse);

    // 10. Check validateStatus (unless ignoreResponseError)
    if (!config.ignoreResponseError) {
      const validateStatus = config.validateStatus ?? isHttpSuccess;
      if (!validateStatus(nativeResponse.status)) {
        const error: FetchError = new FetchError(
          `[${config.method}] "${url}": ${nativeResponse.status} ${nativeResponse.statusText}`,
          {
            code: 'ERR_BAD_RESPONSE',
            config,
            request,
            response: fetchResponse
          }
        );

        // Call onResponseError hook (transport layer)
        context.error = error;
        await callHooks(context, config.onResponseError);

        if (attempt < retryOpts.retries) {
          const shouldRetry = await retryOpts.retryCondition(error);
          if (shouldRetry) {
            await sleep(retryOpts.retryDelay(attempt + 1, error));
            continue;
          }
        }
        throw error;
      }
    }

    // Success
    return fetchResponse;
  }

  // Should not reach here, but just in case
  throw new FetchError(`[${config.method}] "${url}": Request failed: max retries exceeded`, {
    config
  });
}

// ============================================================
//  $Fetch (ofetch 兼容的 fetch 客户端 — 对标 ofetch)
// ============================================================

/**
 * Create a `$fetch` instance with merged defaults.
 *
 * The returned function is an ofetch-compatible fetch client that supports:
 * - Transport-layer hooks (`onRequest`, `onResponse`, `onRequestError`, `onResponseError`)
 * - Retry, timeout, and auto response-type detection
 * - `.raw()` for full {@link FetchResponse} access
 * - `.native` for direct access to the underlying `fetch`
 * - `.create()` for creating new instances with merged defaults
 *
 * 创建一个带有合并默认值的 `$fetch` 实例。
 *
 * 返回的函数是兼容 ofetch 的 fetch 客户端,支持:
 * - 传输层钩子(`onRequest`、`onResponse`、`onRequestError`、`onResponseError`)
 * - 重试、超时、响应类型自动检测
 * - `.raw()` 获取完整 {@link FetchResponse}
 * - `.native` 直接访问底层 `fetch`
 * - `.create()` 创建带合并默认值的新实例
 *
 * @example
 * ```ts
 * // Basic usage
 * const data = await $fetch<User>('/api/users/1');
 *
 * // With options
 * const user = await $fetch<User>('/api/users', {
 *   method: 'POST',
 *   data: { name: 'John' }
 * });
 *
 * // Create a scoped instance
 * const apiFetch = $fetch.create({
 *   baseURL: 'https://api.example.com',
 *   headers: { Authorization: 'Bearer xxx' },
 *   retry: { retries: 3 }
 * });
 * const users = await apiFetch<User[]>('/users');
 *
 * // Raw response (no throw on error status)
 * const response = await $fetch.raw('/api/users/1');
 * console.log(response.status, response.data);
 *
 * // Hooks
 * const loggingFetch = $fetch.create({
 *   onRequest: [{ async ({ request }) { console.log('→', request); } }],
 *   onResponse: [{ async ({ response }) { console.log('←', response.status); } }]
 * });
 * ```
 */
export function createFetch(defaults: FetchRequestConfig = {}): $Fetch {
  const resolvedDefaults = resolveDefaults(defaults);

  const fetchFn = (async <T = any, R extends ResponseType = 'json'>(
    request: string,
    options?: FetchRequestConfig<R>
  ): Promise<MappedType<R, T>> => {
    const config = mergeConfig(resolvedDefaults, { ...options, url: request });
    const response = await fetchCore(config);
    return response.data as MappedType<R, T>;
  }) as $Fetch;

  fetchFn.raw = (async <T = any, R extends ResponseType = 'json'>(
    request: string,
    options?: FetchRequestConfig<R>
  ): Promise<FetchResponse<MappedType<R, T>>> => {
    const config = mergeConfig(resolvedDefaults, { ...options, url: request });
    return fetchCore(config) as Promise<FetchResponse<MappedType<R, T>>>;
  }) as $Fetch['raw'];

  fetchFn.native = fetch;

  fetchFn.create = (newDefaults: FetchRequestConfig): $Fetch => {
    return createFetch({ ...defaults, ...newDefaults });
  };

  return fetchFn;
}

/**
 * The default `$fetch` instance — an ofetch-compatible fetch client.
 *
 * 默认 `$fetch` 实例 —— 兼容 ofetch 的 fetch 客户端。
 *
 * @example
 * ```ts
 * import { $fetch } from '@soybeanjs/fetch';
 *
 * // GET request (auto-detects response type)
 * const user = await $fetch<User>('/api/users/1');
 *
 * // POST request
 * const created = await $fetch<User>('/api/users', {
 *   method: 'POST',
 *   data: { name: 'John' }
 * });
 *
 * // With retry and timeout
 * const data = await $fetch('/api/data', {
 *   retry: { retries: 3 },
 *   timeout: 5000
 * });
 * ```
 */
export const $fetch = createFetch();
