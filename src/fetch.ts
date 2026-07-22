import { NULL_BODY_STATUS_CODES } from './constant';
import { coerceBinaryToJsonResponse, isHttpSuccess } from './shared';
import { isJSONSerializable, isPayloadMethod, mergeHeaders, resolveURL, serializeParams, toHeaders } from './utils';
import { createRetryOptions } from './options';
import { BackendError as BackendErrorClass, FetchError as FetchErrorClass } from './types';
import type {
  CreateFetchDefaults,
  FetchError,
  FetchInstance,
  FetchResponse,
  RequestOption,
  ResolvedFetchRequestConfig,
  ResponseType
} from './types';

// ============================================================
//  Internal Helpers (内部辅助函数)
// ============================================================

/** Merge per-request config with instance defaults. */
function mergeConfig(defaults: ResolvedFetchRequestConfig, config: Record<string, any>): ResolvedFetchRequestConfig {
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
    timeout: config.timeout ?? defaults.timeout
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
  response: Response,
  responseType: ResponseType,
  parseResponse?: (text: string) => any
): Promise<any> {
  if (NULL_BODY_STATUS_CODES.has(response.status)) return undefined;
  if (response.body === null) return undefined;

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

  // Non-JSON response types skip isBackendSuccess
  if (responseType !== 'json') return response;

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
  throw new BackendErrorClass(errorMsg, response);
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
  // Build resolved default config
  const resolvedDefaults: ResolvedFetchRequestConfig = {
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
    keepalive: defaults.keepalive
  } as ResolvedFetchRequestConfig;

  /** Raw fetch — no processResponse. */
  async function fetchRaw(config: ResolvedFetchRequestConfig): Promise<FetchResponse> {
    // 1. onRequest hook
    let resolvedConfig = config;
    if (opts.onRequest) {
      const result = await opts.onRequest(config);
      if (result) resolvedConfig = result;
    }

    // 2. Build URL
    const url = buildURL(resolvedConfig);

    // 3. Build headers (clone)
    const headers = new Headers(resolvedConfig.headers);

    // 4. Serialize body
    const { body, duplex } = serializeBody(resolvedConfig.data, resolvedConfig.method, headers);

    // 5. Timeout signal
    const { signal, isTimeout } = createTimeoutSignal(resolvedConfig.timeout, resolvedConfig.signal);

    // 6. Retry options
    const retryOpts = createRetryOptions(resolvedConfig.retry);

    // 7. Fetch with retry
    for (let attempt = 0; attempt <= retryOpts.retries; attempt++) {
      let nativeResponse: Response;
      let request: Request;

      try {
        // Build Request init
        const requestInit: RequestInit & { duplex?: 'half' } = {
          method: resolvedConfig.method,
          headers,
          body,
          signal
        };
        if (duplex) requestInit.duplex = duplex;
        if (resolvedConfig.credentials !== undefined) requestInit.credentials = resolvedConfig.credentials;
        if (resolvedConfig.mode !== undefined) requestInit.mode = resolvedConfig.mode;
        if (resolvedConfig.cache !== undefined) requestInit.cache = resolvedConfig.cache;
        if (resolvedConfig.redirect !== undefined) requestInit.redirect = resolvedConfig.redirect;
        if (resolvedConfig.referrer !== undefined) requestInit.referrer = resolvedConfig.referrer;
        if (resolvedConfig.referrerPolicy !== undefined) requestInit.referrerPolicy = resolvedConfig.referrerPolicy;
        if (resolvedConfig.integrity !== undefined) requestInit.integrity = resolvedConfig.integrity;
        if (resolvedConfig.keepalive !== undefined) requestInit.keepalive = resolvedConfig.keepalive;

        request = new Request(url, requestInit as RequestInit);
        nativeResponse = await fetch(request);
      } catch (err) {
        // Network error or abort
        const isAbort = err instanceof Error && err.name === 'AbortError';
        const timeout = isTimeout();

        const error: FetchError = new FetchErrorClass(
          timeout
            ? `Request timeout of ${resolvedConfig.timeout}ms exceeded`
            : (err as Error).message || 'Network Error',
          {
            code: timeout ? 'ERR_TIMEOUT' : isAbort ? 'ERR_ABORTED' : 'ERR_NETWORK',
            config: resolvedConfig,
            cause: err
          }
        );

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
      const data = await parseResponseBody(nativeResponse, resolvedConfig.responseType, resolvedConfig.parseResponse);

      const fetchResponse: FetchResponse = {
        data,
        status: nativeResponse.status,
        statusText: nativeResponse.statusText,
        headers: nativeResponse.headers,
        config: resolvedConfig,
        request
      };

      // 9. Check validateStatus
      const validateStatus = resolvedConfig.validateStatus ?? isHttpSuccess;
      if (!validateStatus(nativeResponse.status)) {
        const error: FetchError = new FetchErrorClass(`Request failed with status code ${nativeResponse.status}`, {
          code: 'ERR_BAD_RESPONSE',
          config: resolvedConfig,
          request,
          response: fetchResponse
        });

        if (attempt < retryOpts.retries) {
          const shouldRetry = await retryOpts.retryCondition(error);
          if (shouldRetry) {
            await sleep(retryOpts.retryDelay(attempt + 1, error));
            continue;
          }
        }
        throw error;
      }

      // Success
      return fetchResponse;
    }

    // Should not reach here, but just in case
    throw new FetchErrorClass('Request failed: max retries exceeded', { config: resolvedConfig });
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
