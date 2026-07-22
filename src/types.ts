// ============================================================
//  Content Types & HTTP Methods (内容类型与 HTTP 方法)
// ============================================================

export type ContentType =
  | 'text/html'
  | 'text/plain'
  | 'multipart/form-data'
  | 'application/json'
  | 'application/x-www-form-urlencoded'
  | 'application/octet-stream';

export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'options' | 'head' | 'trace';

export type ResponseTransform<Input = any, Output = any> = (input: Input) => Output | Promise<Output>;

// ============================================================
//  Response Types (响应类型)
// ============================================================

/**
 * File response data (文件响应数据)
 *
 * Contains file content, filename, and content type
 */
export interface FileResponseData<T = Blob | ArrayBuffer | ReadableStream<Uint8Array>> {
  /** File data (文件数据) */
  file: T;
  /** Filename parsed from Content-Disposition header (从 Content-Disposition 头解析的文件名) */
  filename: string;
  /** Content type from response header (响应头中的内容类型) */
  contentType: string;
}

interface ResponseMap {
  blob: FileResponseData<Blob>;
  arraybuffer: FileResponseData<ArrayBuffer>;
  /**
   * Stream response. Only supported in Node.js — browsers do not support `responseType: 'stream'`.
   *
   * Stream 响应。仅在 Node.js 中支持,浏览器不支持 `responseType: 'stream'`,
   * 请在浏览器中使用 `blob` / `arraybuffer`。
   */
  stream: FileResponseData<ReadableStream<Uint8Array>>;
  text: string;
  document: Document;
}

export type ResponseType = keyof ResponseMap | 'json';

export type MappedType<R extends ResponseType, JsonType = any> = R extends keyof ResponseMap
  ? ResponseMap[R]
  : JsonType;

// ============================================================
//  Fetch Response & Error (Fetch 响应与错误)
// ============================================================

/**
 * Fetch response — mimics the shape of AxiosResponse for a familiar API.
 *
 * Fetch 响应 —— 模仿 AxiosResponse 的结构以提供熟悉的 API。
 */
export interface FetchResponse<T = any> {
  /** Parsed response body (解析后的响应体) */
  data: T;
  /** HTTP status code (HTTP 状态码) */
  status: number;
  /** HTTP status text (HTTP 状态文本) */
  statusText: string;
  /** Response headers (响应头) */
  headers: Headers;
  /** The resolved request config (解析后的请求配置) */
  config: ResolvedFetchRequestConfig;
  /** The native Request object, if available (原生 Request 对象) */
  request?: Request;
}

export interface IFetchError<T = any> {
  message: string;
  code?: string;
  config?: FetchRequestConfig;
  request?: Request;
  response?: FetchResponse<T>;
  data?: T;
  status?: number;
  statusText?: string;
}

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

  /** Convenience getter for `response?.statusText` */
  get statusText(): string | undefined {
    return this.response?.statusText;
  }

  /** Convenience getter for `response?.data` */
  get data(): T | undefined {
    return this.response?.data;
  }
}

/** Backend error flag, used as `error.code` for {@link BackendError}. */
export const BACKEND_ERROR_FLAG = 'BACKEND_ERROR';

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

// ============================================================
//  Request Config (请求配置)
// ============================================================

/**
 * Retry options (重试选项)
 */
export interface RetryOptions {
  /** Number of retry attempts (重试次数,默认 0) */
  retries?: number;
  /** Delay between retries in ms (重试延迟,毫秒) */
  retryDelay?: (retryCount: number, error: FetchError) => number;
  /** Condition to determine if a retry should happen (重试条件) */
  retryCondition?: (error: FetchError) => boolean | Promise<boolean>;
}

/**
 * Request configuration — the fetch equivalent of AxiosRequestConfig.
 *
 * 请求配置 —— 相当于 AxiosRequestConfig 的 fetch 版本。
 */
export interface FetchRequestConfig<R extends ResponseType = 'json'>
  extends Omit<RequestInit, 'method' | 'headers' | 'body' | 'signal'> {
  baseURL?: string;
  url?: string;
  method?: HttpMethod | string;
  headers?: Headers | Record<string, string>;
  params?: Record<string, any>;
  /** Request body — auto-serialized for JSON objects (请求体 —— JSON 对象自动序列化) */
  data?: any;
  responseType?: R;
  timeout?: number;
  signal?: AbortSignal;
  validateStatus?: (status: number) => boolean;
  paramsSerializer?: (params: Record<string, any>) => string;
  parseResponse?: (responseText: string) => any;
  /**
   * get filename from response (从响应中获取文件名)
   *
   * @default use built-in function `parseContentDisposition` to parse filename from Content-Disposition header
   */
  getFileName?: (response: FetchResponse) => string;
  retry?: RetryOptions;
}

/**
 * Resolved request config — after merging defaults with per-request config.
 * All fields are guaranteed to be present.
 *
 * 解析后的请求配置 —— 合并默认值与单次请求配置后,所有字段保证存在。
 */
export interface ResolvedFetchRequestConfig<R extends ResponseType = 'json'>
  extends Omit<FetchRequestConfig<R>, 'url' | 'method' | 'headers' | 'responseType'> {
  url: string;
  method: string;
  headers: Headers;
  responseType: R;
}

/**
 * Defaults for creating a fetch instance (创建 fetch 实例的默认配置)
 */
export type CreateFetchDefaults = FetchRequestConfig;

// ============================================================
//  Request Options / Hooks (请求选项 / 钩子)
// ============================================================

export interface RequestOption<
  ResponseData = any,
  ApiData = ResponseData,
  State extends Record<string, unknown> = Record<string, unknown>
> {
  /** The default state (默认状态) */
  defaultState?: State;
  /**
   * transform the response data to the api data (转换响应数据为接口数据)
   *
   * @param response Fetch response (响应)
   */
  transform: ResponseTransform<FetchResponse<ResponseData>, ApiData>;
  /**
   * The hook before request (请求前的钩子)
   *
   * For example: You can add header token in this hook (例如：你可以在此钩子中添加请求头的 token)
   *
   * Note: headers is a native `Headers` instance — use `config.headers.set(key, value)`.
   *
   * @param config resolved request config (解析后的请求配置)
   */
  onRequest?: (
    config: ResolvedFetchRequestConfig
  ) => ResolvedFetchRequestConfig | Promise<ResolvedFetchRequestConfig>;
  /**
   * The hook to check backend response is success or not (检查后端响应是否成功的钩子)
   *
   * @param response Fetch response (响应)
   */
  isBackendSuccess: (response: FetchResponse<ResponseData>) => boolean;
  /**
   * The backend error message (表示后端请求错误信息)
   *
   * @default 'Backend request error, please check `isBackendSuccess`.'
   */
  backendErrorMsg?: string;
  /**
   * The hook after backend request fail (后端请求失败后的钩子)
   *
   * Return a new `FetchResponse` to retry the request — the new response will go through
   * `isBackendSuccess` again, but **will not** re-trigger `onBackendFail` to avoid infinite loops.
   *
   * The `instance` parameter is the underlying fetch instance function. Call `instance(config)`
   * to re-fetch (goes through the full pipeline including onRequest and processResponse).
   *
   * 返回新的 `FetchResponse` 用于重试请求 — 新响应会再次经过 `isBackendSuccess` 校验,
   * 但**不会**再次触发 `onBackendFail`,以避免无限循环。
   *
   * @param response Fetch response (响应)
   * @param instance fetch instance function (fetch 实例函数)
   */
  onBackendFail?: (
    response: FetchResponse<ResponseData>,
    instance: FetchInstance
  ) => Promise<FetchResponse | null | void>;
  /**
   * The hook to handle error (after request fail) (处理错误的钩子（请求失败后）)
   *
   * @param error 错误对象
   */
  onError?: (error: FetchError<ResponseData>) => void | Promise<void>;
}

// ============================================================
//  Fetch Instance (Fetch 实例)
// ============================================================

/**
 * The underlying fetch instance function (底层 fetch 实例函数)
 *
 * Calling `instance(config)` goes through the full pipeline:
 * onRequest → fetch (with retry/timeout) → parse response → processResponse (isBackendSuccess/onBackendFail).
 */
export interface FetchInstance {
  (config: FetchRequestConfig): Promise<FetchResponse>;
  /** The resolved default config (解析后的默认配置) */
  defaults: ResolvedFetchRequestConfig;
}

// ============================================================
//  Request Instances (请求实例)
// ============================================================

export interface RequestInstanceCommon<State extends Record<string, unknown>> {
  /** you can set custom state in the request instance */
  state: State;
  /**
   * The underlying fetch instance (底层 fetch 实例)
   *
   * Exposed for advanced scenarios such as making raw requests that go through the full pipeline.
   */
  instance: FetchInstance;
}

/** The request instance */
export interface RequestInstance<ApiData = any, State extends Record<string, unknown> = Record<string, unknown>>
  extends RequestInstanceCommon<State> {
  <T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    config: FetchRequestConfig<R>
  ): Promise<MappedType<R, T>>;
  raw<T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    config: FetchRequestConfig<R>
  ): Promise<FetchResponse<MappedType<R, T>>>;
  get<T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    url: string,
    config?: SimpleMethodConfig<R>
  ): Promise<MappedType<R, T>>;
  post<T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    url: string,
    data?: any,
    config?: BodyMethodConfig<R>
  ): Promise<MappedType<R, T>>;
  put<T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    url: string,
    data?: any,
    config?: BodyMethodConfig<R>
  ): Promise<MappedType<R, T>>;
  delete<T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    url: string,
    config?: SimpleMethodConfig<R>
  ): Promise<MappedType<R, T>>;
  patch<T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    url: string,
    data?: any,
    config?: BodyMethodConfig<R>
  ): Promise<MappedType<R, T>>;
}

// ============================================================
//  Flat Request Instance (扁平化请求实例)
// ============================================================

export type FlatResponseSuccessData<ResponseData, ApiData> = {
  data: ApiData;
  error: null;
  response: FetchResponse<ResponseData>;
};

export type FlatResponseFailData<ResponseData> = {
  data: null;
  error: FetchError<ResponseData>;
  /**
   * The raw fetch response. May be `undefined` for network errors where no response was received.
   *
   * 原始 fetch 响应。网络错误等无响应场景下为 `undefined`。
   */
  response?: FetchResponse<ResponseData>;
};

export type FlatResponseData<ResponseData, ApiData> =
  | FlatResponseSuccessData<ResponseData, ApiData>
  | FlatResponseFailData<ResponseData>;

export interface FlatRequestInstance<
  ResponseData = any,
  ApiData = ResponseData,
  State extends Record<string, unknown> = Record<string, unknown>
> extends RequestInstanceCommon<State> {
  <T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    config: FetchRequestConfig<R>
  ): Promise<FlatResponseData<ResponseData, MappedType<R, T>>>;
  /**
   * Perform a request that returns the full {@link FetchResponse} without running `transform`.
   *
   * Never throws — failures are returned as `{ data: null, error, response? }`.
   */
  raw<T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    config: FetchRequestConfig<R>
  ): Promise<
    | { data: FetchResponse<MappedType<R, T>>; error: null; response: FetchResponse<MappedType<R, T>> }
    | { data: null; error: FetchError<ResponseData>; response?: FetchResponse<ResponseData> }
  >;
  get<T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    url: string,
    config?: SimpleMethodConfig<R>
  ): Promise<FlatResponseData<ResponseData, MappedType<R, T>>>;
  post<T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    url: string,
    data?: any,
    config?: BodyMethodConfig<R>
  ): Promise<FlatResponseData<ResponseData, MappedType<R, T>>>;
  put<T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    url: string,
    data?: any,
    config?: BodyMethodConfig<R>
  ): Promise<FlatResponseData<ResponseData, MappedType<R, T>>>;
  delete<T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    url: string,
    config?: SimpleMethodConfig<R>
  ): Promise<FlatResponseData<ResponseData, MappedType<R, T>>>;
  patch<T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    url: string,
    data?: any,
    config?: BodyMethodConfig<R>
  ): Promise<FlatResponseData<ResponseData, MappedType<R, T>>>;
}

// ============================================================
//  Method Config Types (方法配置类型)
// ============================================================

/**
 * Config for convenience methods without a request body (GET / DELETE).
 */
export type SimpleMethodConfig<R extends ResponseType = 'json'> = Omit<FetchRequestConfig<R>, 'url' | 'method'>;

/**
 * Config for convenience methods with a request body (POST / PUT / PATCH).
 */
export type BodyMethodConfig<R extends ResponseType = 'json'> = Omit<
  FetchRequestConfig<R>,
  'url' | 'method' | 'data'
>;
