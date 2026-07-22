import type { FetchError } from './error';

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

export type ResponseType = keyof ResponseMap | 'json' | 'auto';

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
  /** Alias for `status` (Node.js compatibility) */
  statusCode?: number;
  /** Alias for `statusText` (Node.js compatibility) */
  statusMessage?: string;
}

// ============================================================
//  Fetch Context & Hooks (传输层上下文与钩子 — 对标 ofetch)
// ============================================================

/**
 * Fetch context — passed to transport-layer hooks.
 *
 * Hooks can mutate `context.options` (e.g. add headers) and `context.response.data`
 * (e.g. transform response body). This mirrors ofetch's `FetchContext` design.
 *
 * Fetch 上下文 —— 传递给传输层钩子。
 * 钩子可以修改 `context.options`(如添加请求头)和 `context.response.data`(如转换响应体)。
 */
export interface FetchContext<T = any> {
  /** The request URL (请求 URL) */
  request: string;
  /** The resolved request options (解析后的请求配置) */
  options: ResolvedFetchRequestConfig;
  /** The response — available in onResponse / onResponseError / onRequestError (响应对象) */
  response?: FetchResponse<T>;
  /** The error — available in onRequestError / onResponseError (错误对象) */
  error?: Error;
}

/** A single value or an array of values (单个值或数组) */
export type MaybeArray<T> = T | T[];

/** A single fetch hook function (单个 fetch 钩子函数) */
export type FetchHookFn<C extends FetchContext = FetchContext> = (context: C) => void | Promise<void>;

/** A fetch hook — single function or array of functions (fetch 钩子 —— 单个函数或函数数组) */
export type FetchHook<C extends FetchContext = FetchContext> = MaybeArray<FetchHookFn<C>>;

// ============================================================
//  Upload Progress (上传进度)
// ============================================================

/**
 * Upload progress event — passed to {@link UploadProgressHandler}.
 *
 * 上传进度事件 —— 传递给 {@link UploadProgressHandler}。
 */
export interface UploadProgressEvent {
  /** Number of bytes uploaded so far (已上传的字节数) */
  loaded: number;
  /** Total number of bytes to upload, 0 if not computable (总字节数,不可计算时为 0) */
  total: number;
  /** Upload progress percentage 0-100 (上传进度百分比 0-100,不可计算时为 0) */
  progress: number;
  /** Whether the total size is known (总大小是否已知。`false` 时 `total`/`progress` 为 0,但 `loaded` 仍有效) */
  lengthComputable: boolean;
}

/**
 * Handler invoked during upload to report progress.
 *
 * 上传过程中调用的进度回调函数。
 */
export type UploadProgressHandler = (event: UploadProgressEvent) => void;

/**
 * Download progress event — structurally identical to {@link UploadProgressEvent}.
 *
 * 下载进度事件 —— 与 {@link UploadProgressEvent} 结构相同。
 */
export type DownloadProgressEvent = UploadProgressEvent;

/**
 * Download progress handler.
 *
 * 下载进度回调函数。
 */
export type DownloadProgressHandler = UploadProgressHandler;

// ============================================================
//  Fetch Adapter (Fetch 适配器 — 可插拔的底层传输层)
// ============================================================

/**
 * Adapter response — the subset of the native `Response` API that the library actually uses.
 *
 * Custom adapters (e.g. for uniapp, WeChat mini-programs) only need to implement this interface;
 * they do **not** need to create real `Response` objects.
 *
 * 适配器响应 —— 库实际使用的原生 `Response` API 子集。
 * 自定义适配器（如 uniapp、微信小程序）只需实现此接口,无需创建真实的 `Response` 对象。
 */
export interface FetchAdapterResponse {
  /** HTTP status code */
  readonly status: number;
  /** HTTP status text */
  readonly statusText: string;
  /** Response headers */
  readonly headers: Headers;
  /** Response body stream, or `null` if not available */
  readonly body: ReadableStream<Uint8Array> | null;
  /** Read the response body as text */
  text(): Promise<string>;
  /** Read the response body as a Blob */
  blob(): Promise<Blob>;
  /** Read the response body as an ArrayBuffer */
  arrayBuffer(): Promise<ArrayBuffer>;
}

/**
 * Request init passed to the adapter.
 *
 * The library always provides `method` and `headers`; other fields are optional
 * and mirror the native `RequestInit` (plus `duplex` for streaming bodies).
 *
 * 传递给适配器的请求初始化对象。
 * 库始终提供 `method` 和 `headers`,其他字段可选,与原生 `RequestInit` 一致(额外支持 `duplex`)。
 */
export interface FetchAdapterInit {
  method: string;
  headers: Headers;
  body?: BodyInit | null;
  signal?: AbortSignal | null;
  credentials?: RequestCredentials;
  mode?: RequestMode;
  cache?: RequestCache;
  redirect?: RequestRedirect;
  referrer?: string;
  referrerPolicy?: ReferrerPolicy;
  integrity?: string;
  keepalive?: boolean;
  duplex?: 'half';
}

/**
 * Fetch adapter — a pluggable HTTP transport function.
 *
 * The default adapter uses native `fetch()`. Custom adapters can be provided via the
 * `adapter` config field to support platforms where `fetch` is unavailable (e.g. uniapp,
 * WeChat mini-programs, React Native).
 *
 * The adapter is **transport-only**: it receives the finalised URL and request init, and
 * returns an {@link FetchAdapterResponse}. The library handles everything else — retry,
 * timeout, response parsing, and business-logic hooks.
 *
 * Fetch 适配器 —— 可插拔的 HTTP 传输函数。
 *
 * 默认适配器使用原生 `fetch()`。通过 `adapter` 配置字段可传入自定义适配器,以支持
 * `fetch` 不可用的平台(如 uniapp、微信小程序、React Native)。
 *
 * 适配器仅负责传输层:接收最终 URL 和请求初始化对象,返回 {@link FetchAdapterResponse}。
 * 库负责其余所有逻辑 —— 重试、超时、响应解析、业务钩子。
 *
 * @example
 * ```ts
 * // Use a custom adapter for uniapp
 * import { createRequest } from '@soybeanjs/fetch';
 * import { uniappAdapter } from 'my-uniapp-adapter';
 *
 * const request = createRequest({
 *   baseURL: 'https://api.example.com',
 *   adapter: uniappAdapter
 * });
 * ```
 */
export type FetchAdapter = (url: string, init: FetchAdapterInit) => Promise<FetchAdapterResponse>;

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

// ============================================================
//  Cache (请求缓存)
// ============================================================

/**
 * Cache options for request caching.
 *
 * 请求缓存选项。
 */
export interface CacheOptions {
  /** Time-to-live in milliseconds (缓存有效期,毫秒) */
  ttl: number;
  /** HTTP methods to cache (要缓存的 HTTP 方法,默认 ['get']) */
  methods?: HttpMethod[];
  /** Maximum number of cached entries (最大缓存条数,默认 100) */
  max?: number;
  /** Custom cache key generator (自定义缓存 key 生成函数) */
  key?: (config: ResolvedFetchRequestConfig) => string;
}

// ============================================================
//  Dedupe (请求去重)
// ============================================================

/**
 * Dedupe options for in-flight request deduplication.
 *
 * 在途请求去重选项。
 */
export interface DedupeOptions {
  /** Custom dedupe key generator (自定义去重 key 生成函数) */
  key?: (config: ResolvedFetchRequestConfig) => string;
}

// ============================================================
//  Concurrency (并发限制)
// ============================================================

/**
 * Concurrency control options.
 *
 * 并发控制选项。
 */
export interface ConcurrencyOptions {
  /** Maximum number of concurrent in-flight requests (最大并发请求数) */
  maxConcurrent: number;
}

// ============================================================
//  Loading & Slow Request (加载状态与慢请求追踪)
// ============================================================

/**
 * Slow request entry passed to the `onSlowRequest` callback.
 *
 * 传递给 `onSlowRequest` 回调的慢请求条目。
 */
export interface SlowRequestEntry {
  /** Request URL (请求 URL) */
  url: string;
  /** HTTP method (HTTP 方法) */
  method: string;
  /** Duration in milliseconds (耗时,毫秒) */
  duration: number;
}

// ============================================================
//  Auth (认证 — Token 管理)
// ============================================================

/**
 * Authentication options for automatic token attachment and refresh.
 *
 * 自动 Token 附加与刷新的认证选项。
 */
export interface AuthOptions {
  /** Get the current auth token (获取当前 token) */
  getToken?: () => string | null | undefined | Promise<string | null | undefined>;
  /** Refresh the token and return the new one (刷新 token 并返回新 token) */
  refreshToken?: () => Promise<string | null>;
  /** Condition to trigger token refresh — status code or custom predicate (触发刷新的条件,默认 401) */
  refreshOn?: number | ((status: number, response: FetchResponse) => boolean);
  /** Called when refresh fails or no refreshToken is available (刷新失败或无 refreshToken 时调用) */
  onUnauthorized?: () => void;
}

// ============================================================
//  Schema Validation (响应 Schema 验证)
// ============================================================

/**
 * A Zod-like schema interface (兼容 Zod 风格的 Schema)。
 */
interface ZodLikeSchema<T = any> {
  parse(data: unknown): T;
}

/**
 * Response schema for runtime validation — accepts Zod schemas or plain validator functions.
 *
 * 响应 Schema 验证类型 — 兼容 Zod Schema 或普通验证函数。
 */
export type DataSchema<T = any> = ZodLikeSchema<T> | ((data: unknown) => T);

// ============================================================
//  Request Config (请求配置)
// ============================================================

/**
 * Request configuration — the fetch equivalent of AxiosRequestConfig.
 *
 * 请求配置 —— 相当于 AxiosRequestConfig 的 fetch 版本。
 */
export interface FetchRequestConfig<R extends ResponseType = 'json'> extends Omit<
  RequestInit,
  'method' | 'headers' | 'body' | 'signal' | 'cache'
> {
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
  /**
   * Native fetch cache mode (原生 fetch 缓存模式,对应 RequestInit.cache)
   * @default undefined (browser default)
   */
  requestCache?: RequestCache;
  /**
   * Custom fetch adapter — pluggable HTTP transport.
   *
   * When omitted, the default adapter (native `fetch()`) is used. Provide a custom adapter
   * to support platforms like uniapp, WeChat mini-programs, etc.
   *
   * 自定义 fetch 适配器 —— 可插拔的 HTTP 传输层。
   *
   * 省略时使用默认适配器(原生 `fetch()`)。传入自定义适配器可支持 uniapp、微信小程序等平台。
   */
  adapter?: FetchAdapter;
  /**
   * Upload progress callback.
   *
   * The native `fetch()` API does not support upload progress events. When this
   * callback is provided, the library automatically switches to a progress-capable
   * adapter for this request:
   *
   * - **Browser**: uses `XMLHttpRequest` (accurate `total` / `progress`)
   * - **Node.js / Bun / Deno / CF Workers**: uses `TransformStream` byte counting
   *   (accurate for known-size bodies like `Blob`; `lengthComputable: false` for
   *   `FormData` / `ReadableStream`)
   *
   * Ignored when a custom `adapter` is also set — the custom adapter takes
   * precedence. For global/instance-level upload progress, use
   * {@link createUploadProgressAdapter} instead.
   *
   * 上传进度回调。
   *
   * 原生 `fetch()` API 不支持上传进度事件。设置此回调后,库会自动为该请求
   * 切换到支持进度跟踪的适配器:
   *
   * - **浏览器**:使用 `XMLHttpRequest`(`total` / `progress` 精确)
   * - **Node.js / Bun / Deno / CF Workers**:使用 `TransformStream` 字节计数
   *   (对 `Blob` 等已知大小的 body 精确;`FormData` / `ReadableStream` 时
   *   `lengthComputable` 为 `false`)
   *
   * 当同时设置了自定义 `adapter` 时,此选项会被忽略 —— 自定义适配器优先。
   * 如需全局/实例级别的上传进度,请使用 {@link createUploadProgressAdapter}。
   *
   * @example
   * ```ts
   * await request.post('/upload', formData, {
   *   onUploadProgress: ({ progress, loaded, lengthComputable }) => {
   *     if (lengthComputable) {
   *       console.log(`Upload: ${progress}%`);
   *     } else {
   *       console.log(`Uploaded ${loaded} bytes`);
   *     }
   *   }
   * });
   * ```
   */
  onUploadProgress?: UploadProgressHandler;
  /**
   * Download progress callback.
   *
   * Wraps the response body in a counting `TransformStream` so that each chunk
   * downloaded triggers the callback. Uses `Content-Length` for `total` when
   * available.
   *
   * 下载进度回调。将响应体包装为计数的 `TransformStream`,每个 chunk 下载时触发回调。
   * 有 `Content-Length` 时用于计算 `total`。
   *
   * @example
   * ```ts
   * await request.get('/large-file', {
   *   responseType: 'blob',
   *   onDownloadProgress: ({ progress, loaded, lengthComputable }) => {
   *     if (lengthComputable) console.log(`Download: ${progress}%`);
   *     else console.log(`Downloaded ${loaded} bytes`);
   *   }
   * });
   * ```
   */
  onDownloadProgress?: DownloadProgressHandler;
  /**
   * Whether to ignore response errors (4xx / 5xx) and return the response instead of throwing.
   *
   * When `true`, `validateStatus` is skipped and `onResponseError` is **not** called.
   * Useful when you want to handle error status codes yourself.
   *
   * 是否忽略响应错误(4xx / 5xx),返回响应而非抛出异常。
   *
   * 为 `true` 时跳过 `validateStatus` 检查,且**不会**调用 `onResponseError`。
   * 适用于需要自行处理错误状态码的场景。
   *
   * @default false
   */
  ignoreResponseError?: boolean;
  // ----- Transport-layer hooks (传输层钩子,对标 ofetch) -----
  /**
   * Hook called before the request is sent. Can be a single function or an array.
   *
   * Hooks receive a mutable {@link FetchContext} — modify `context.options` to change the request.
   *
   * 请求发送前调用的钩子。支持单个函数或数组。钩子接收可变的 {@link FetchContext} —— 修改 `context.options` 可改变请求。
   */
  onRequest?: FetchHook;
  /**
   * Hook called when the request fails (network error, timeout, abort). Can be a single function or an array.
   *
   * 请求失败时调用的钩子(网络错误、超时、取消)。支持单个函数或数组。
   */
  onRequestError?: FetchHook;
  /**
   * Hook called after the response is received and parsed. Can be a single function or an array.
   *
   * Hooks can mutate `context.response.data` to transform the response body.
   *
   * 响应接收并解析后调用的钩子。支持单个函数或数组。
   * 钩子可修改 `context.response.data` 来转换响应体。
   */
  onResponse?: FetchHook;
  /**
   * Hook called when the response has an error status (failed `validateStatus`). Can be a single function or an array.
   *
   * 响应状态码错误(failed `validateStatus`)时调用的钩子。支持单个函数或数组。
   */
  onResponseError?: FetchHook;

  // ----- Enhanced features (增强功能) -----

  /**
   * Request cache options. Set to `false` to skip cache for a single request.
   *
   * 请求缓存选项。设为 `false` 可在单次请求中跳过缓存。
   */
  cache?: CacheOptions | false;

  /**
   * In-flight request deduplication. Set to `true` to use default key, or provide options with custom key.
   *
   * 在途请求去重。设为 `true` 使用默认 key,或传入带自定义 key 的选项。
   */
  dedupe?: boolean | DedupeOptions;

  /**
   * Concurrency control — limits the number of simultaneous in-flight requests.
   *
   * 并发控制 — 限制同时在途的请求数量。
   */
  concurrency?: ConcurrencyOptions;

  /**
   * Debounce delay in milliseconds. Requests with the same key within the delay window are cancelled and restarted.
   *
   * 防抖延迟(毫秒)。延迟窗口内相同 key 的请求会被取消并重新计时。
   */
  debounce?: number;

  /**
   * Throttle interval in milliseconds. Only one request per key is allowed within the interval; others are rejected with ERR_THROTTLED.
   *
   * 节流间隔(毫秒)。间隔内相同 key 只允许一次请求,其余被拒绝并抛出 ERR_THROTTLED。
   */
  throttle?: number;

  /**
   * Authentication options for automatic token attachment and refresh.
   *
   * 认证选项,用于自动附加 Token 和刷新 Token。
   */
  auth?: AuthOptions;

  /**
   * Response schema for runtime validation. Compatible with Zod schemas (`.parse()`) and plain validator functions.
   *
   * 响应 Schema 运行时验证。兼容 Zod Schema(`.parse()`)和普通验证函数。
   */
  schema?: DataSchema;

  /**
   * Transform request data before serialization (e.g., camelCase → snake_case).
   *
   * 序列化前转换请求数据(如 camelCase → snake_case)。
   */
  transformRequest?: (data: any, config: ResolvedFetchRequestConfig) => any;

  /**
   * Transform response data after parsing (e.g., snake_case → camelCase).
   *
   * 解析后转换响应数据(如 snake_case → camelCase)。
   */
  transformResponse?: (data: any, config: ResolvedFetchRequestConfig) => any;

  /**
   * Global loading state change callback. Fires `true` on the first request start, `false` on the last request end.
   *
   * 全局 loading 状态变化回调。第一个请求开始时 `true`,最后一个请求结束时 `false`。
   */
  onGlobalLoadingChange?: (loading: boolean) => void;

  /**
   * Per-request loading state change callback. Fires `true` when this request starts, `false` when it ends.
   *
   * 单请求 loading 状态变化回调。该请求开始时 `true`,结束时 `false`。
   */
  onLoadingChange?: (loading: boolean) => void;

  /**
   * Slow request threshold in milliseconds. Requests exceeding this duration trigger `onSlowRequest`.
   * `0` disables slow request detection (default).
   *
   * 慢请求阈值(毫秒)。超过此时长的请求会触发 `onSlowRequest`。`0` 表示不启用(默认)。
   */
  slowThreshold?: number;

  /**
   * Callback triggered when a request exceeds `slowThreshold`.
   *
   * 请求超过 `slowThreshold` 时触发的回调。
   */
  onSlowRequest?: (entry: SlowRequestEntry) => void;
}

/**
 * Resolved request config — after merging defaults with per-request config.
 * All fields are guaranteed to be present.
 *
 * 解析后的请求配置 —— 合并默认值与单次请求配置后,所有字段保证存在。
 */
export interface ResolvedFetchRequestConfig<R extends ResponseType = 'json'> extends Omit<
  FetchRequestConfig<R>,
  'url' | 'method' | 'headers' | 'responseType'
> {
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
  onRequest?: (config: ResolvedFetchRequestConfig) => ResolvedFetchRequestConfig | Promise<ResolvedFetchRequestConfig>;
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
  /** Clear all cached responses (清除所有缓存响应) */
  clearCache: () => void;
  /** Delete a specific cache entry by key (按 key 删除特定缓存条目) */
  deleteCache: (key: string) => void;
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
export interface RequestInstance<
  ApiData = any,
  State extends Record<string, unknown> = Record<string, unknown>
> extends RequestInstanceCommon<State> {
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
export type BodyMethodConfig<R extends ResponseType = 'json'> = Omit<FetchRequestConfig<R>, 'url' | 'method' | 'data'>;

// ============================================================
//  $Fetch Interface ($Fetch 接口 — 对标 ofetch)
// ============================================================

/**
 * `$fetch` — a lightweight, ofetch-compatible fetch client.
 *
 * Created via {@link createFetch}. Supports transport-layer hooks, retry, timeout,
 * and auto response-type detection. Does **not** include business-logic hooks
 * (use {@link createRequest} / {@link createFlatRequest} for that).
 *
 * `$fetch` —— 轻量级、兼容 ofetch 的 fetch 客户端。
 *
 * 通过 {@link createFetch} 创建。支持传输层钩子、重试、超时、响应类型自动检测。
 * **不**包含业务逻辑钩子(请使用 {@link createRequest} / {@link createFlatRequest})。
 */
export interface $Fetch {
  /**
   * Perform a request and return the parsed response body.
   *
   * @example
   * ```ts
   * const data = await $fetch<User>('/api/users/1');
   * const text = await $fetch('/api/data', { responseType: 'text' });
   * ```
   */
  <T = any, R extends ResponseType = 'json'>(
    request: string,
    options?: FetchRequestConfig<R>
  ): Promise<MappedType<R, T>>;
  /**
   * Perform a request and return the full {@link FetchResponse} (without throwing on error status).
   */
  raw<T = any, R extends ResponseType = 'json'>(
    request: string,
    options?: FetchRequestConfig<R>
  ): Promise<FetchResponse<MappedType<R, T>>>;
  /** Direct access to the native `fetch` (直接访问原生 fetch) */
  native: typeof fetch;
  /**
   * Create a new `$fetch` instance with merged defaults.
   *
   * @example
   * ```ts
   * const apiFetch = $fetch.create({ baseURL: 'https://api.example.com', headers: { 'X-Token': 'xxx' } });
   * ```
   */
  create(defaults: FetchRequestConfig): $Fetch;
}
