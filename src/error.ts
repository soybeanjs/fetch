import { BACKEND_ERROR_FLAG } from './constant';
import type { FetchRequestConfig, FetchResponse, IFetchError } from './types';

/**
 * Fetch error — the base error class for all request failures.
 *
 * Fetch 错误 —— 所有请求失败的基础错误类。
 */
export class FetchError<T = any> extends Error implements IFetchError<T> {
  code?: string;
  config?: FetchRequestConfig;
  request?: Request;
  response?: FetchResponse<T>;

  constructor(
    message: string,
    options?: {
      code?: string;
      config?: FetchRequestConfig;
      request?: Request;
      response?: FetchResponse<T>;
      cause?: unknown;
    }
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'FetchError';

    if (options) {
      this.code = options.code;
      this.config = options.config;
      this.request = options.request;
      this.response = options.response;
    }
  }

  /** Convenience getter for `response?.status` */
  get status(): number | undefined {
    return this.response?.status;
  }

  /** Alias for `status` (Node.js compatibility) */
  get statusCode(): number | undefined {
    return this.response?.status;
  }

  /** Convenience getter for `response?.statusText` */
  get statusText(): string | undefined {
    return this.response?.statusText;
  }

  /** Alias for `statusText` (Node.js compatibility) */
  get statusMessage(): string | undefined {
    return this.response?.statusText;
  }

  /** Convenience getter for `response?.data` */
  get data(): T | undefined {
    return this.response?.data;
  }
}

/**
 * Error thrown when the backend returns a response that fails `isBackendSuccess`.
 *
 * 后端业务错误时抛出的错误,继承自 FetchError,可通过 `instanceof BackendError` 判别。
 */
export class BackendError<ResponseData = any> extends FetchError<ResponseData> {
  constructor(message: string, response: FetchResponse<ResponseData>) {
    super(message, {
      code: BACKEND_ERROR_FLAG,
      config: response.config,
      response
    });
    this.name = 'BackendError';
  }
}
