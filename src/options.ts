import { RETRY_STATUS_CODES } from './constant';
import { isHttpSuccess } from './shared';
import { mergeHeaders, serializeParams } from './utils';
import type { FetchError } from './error';
import type { CreateFetchDefaults, RequestOption, RetryOptions } from './types';

// ============================================================
//  Default Options (默认选项)
// ============================================================

/**
 * Create request options with defaults applied.
 *
 * 为请求选项应用默认值。
 *
 * - `backendErrorMsg` defaults to a standard message if not provided
 * - `transform` defaults to extracting `response.data`
 */
export function createDefaultOptions<ResponseData, ApiData>(
  options: RequestOption<ResponseData, ApiData>
): RequestOption<ResponseData, ApiData> {
  return {
    ...options,
    backendErrorMsg: options.backendErrorMsg ?? 'Backend request error, please check `isBackendSuccess`.',
    transform: options.transform ?? (((response: any) => response.data) as any)
  };
}

// ============================================================
//  Fetch Config Builder (Fetch 配置构建器)
// ============================================================

/**
 * Build the default fetch configuration from user-provided defaults.
 *
 * 从用户提供的默认值构建 fetch 默认配置。
 *
 * - Normalizes headers to a `Headers` instance
 * - Sets default `validateStatus` to {@link isHttpSuccess}
 * - Sets default `paramsSerializer` to {@link serializeParams}
 * - Adds a default `Accept` header
 */
export function createFetchConfig(config?: CreateFetchDefaults): CreateFetchDefaults {
  const headers = mergeHeaders(
    {
      Accept: 'application/json, text/plain, */*'
    },
    config?.headers
  );

  return {
    ...config,
    headers,
    validateStatus: config?.validateStatus ?? isHttpSuccess,
    paramsSerializer: config?.paramsSerializer ?? serializeParams
  };
}

// ============================================================
//  Retry Options Builder (重试选项构建器)
// ============================================================

/**
 * Default retry condition — retries on network errors and specific status codes.
 */
function defaultRetryCondition(error: FetchError): boolean {
  // Network error (no response)
  if (!error.response) return true;

  // Retry on specific status codes
  if (error.response.status && RETRY_STATUS_CODES.has(error.response.status)) {
    return true;
  }

  return false;
}

/**
 * Default retry delay — linear backoff: 1s, 2s, 3s, ...
 */
function defaultRetryDelay(retryCount: number): number {
  return retryCount * 1000;
}

/**
 * Normalize retry options with defaults.
 *
 * 使用默认值规范化重试选项。
 *
 * @param retry User-provided retry options (optional)
 * @returns Normalized retry options with all fields required
 */
export function createRetryOptions(retry?: RetryOptions): Required<RetryOptions> {
  return {
    retries: retry?.retries ?? 0,
    retryDelay: retry?.retryDelay ?? defaultRetryDelay,
    retryCondition: retry?.retryCondition ?? defaultRetryCondition
  };
}
