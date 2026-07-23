import type { FetchError } from './error';
import type {
  FetchRequestConfig,
  FetchResponse,
  FlatRequestInstance,
  MappedType,
  RequestInstance,
  ResponseType
} from './types';

// ============================================================
//  Type Helpers (类型辅助工具)
// ============================================================

/** Supported HTTP methods */
export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'options' | 'head' | 'trace';

/**
 * Extract paths that support a given HTTP method.
 * Paths whose method value is `never` or `undefined` (i.e. `method?: never`) are filtered out.
 *
 * 提取支持指定 HTTP 方法的路径。方法值为 `never` 或 `undefined`（即 `method?: never`）的路径会被过滤。
 */
export type PathsWithMethod<Paths extends Record<string, any>, M extends HttpMethod> = {
  [P in keyof Paths]: undefined extends Paths[P][M] ? never : P;
}[keyof Paths];

/**
 * Get the keys of T that are required (not optional, not `undefined`, not `never`).
 *
 * 获取 T 中的必填字段。
 */
export type RequiredKeysOf<T> = {
  [K in keyof T]-?: undefined extends T[K] ? never : K;
}[keyof T];

// ============================================================
//  Operation Content Extractors (操作内容提取器)
// ============================================================

/** Media types recognised in request / response bodies. */
export type SupportedMediaType =
  | 'application/json'
  | 'application/x-www-form-urlencoded'
  | 'multipart/form-data'
  | 'text/plain';

/**
 * Extract the request body type from an operation across multiple media types.
 *
 * Resolution order: `application/json` → `multipart/form-data` →
 * `application/x-www-form-urlencoded` → `text/plain` → `never`.
 *
 * Returns `never` when the operation has no request body (e.g. `requestBody?: never`).
 */
export type OperationRequestBodyContent<T> = [T] extends [{ requestBody?: never }]
  ? never
  : T extends { requestBody?: { content: infer C } }
    ? ResolveMediaType<C>
    : T extends { requestBody: { content: infer C } }
      ? ResolveMediaType<C>
      : never;

/** Pick the first matching media type from a `content` map. */
export type ResolveMediaType<C> = C extends { 'application/json': infer B }
  ? B
  : C extends { 'multipart/form-data': infer B }
    ? B
    : C extends { 'application/x-www-form-urlencoded': infer B }
      ? B
      : C extends { 'text/plain': infer B }
        ? B
        : never;

/** Check whether the request body is optional. */
export type IsOperationRequestBodyOptional<T> = T extends { requestBody: any } ? false : true;

/**
 * Extract the success response data.
 *
 * Resolution order:
 *   200 → 201 → 202 → 204 (treated as `void`) → other 2xx → fallback `never`.
 *
 * For `204 No Content`, returns `void` (the operation succeeded but has no body).
 * For non-JSON media types, falls back to `unknown` so callers can opt into manual typing
 * via the `responseType` config option.
 *
 * 从 operation 中提取成功响应数据。
 *
 * 解析顺序：200 → 201 → 202 → 204（视为 `void`）→ 其他 2xx → 兜底 `never`。
 * 对于 `204 No Content`,返回 `void`(操作成功但无响应体)。
 * 对于非 JSON 媒体类型,降级为 `unknown`,以便调用方通过 `responseType` 自行指定类型。
 */
export type SuccessResponse<T> = T extends { responses: infer R }
  ? R extends Record<200, infer Res>
    ? ExtractMediaTypeBody<Res>
    : R extends Record<201, infer Res>
      ? ExtractMediaTypeBody<Res>
      : R extends Record<202, infer Res>
        ? ExtractMediaTypeBody<Res>
        : R extends Record<204, any>
          ? void
          : ExtractFirst2xx<R>
  : never;

/**
 * Extract the error response body for the first matching 4xx or 5xx status code.
 */
export type ErrorResponse<T> = T extends { responses: infer R } ? ExtractFirstError<R> : never;

/** Extract the JSON body from a response entry, or `unknown` for non-JSON media types. */
export type ExtractMediaTypeBody<Res> = Res extends { content: { 'application/json': infer D } }
  ? D
  : Res extends { content: Record<SupportedMediaType, any> }
    ? unknown
    : unknown;

/** Best-effort: pick the first 2xx status code and extract its body. */
export type ExtractFirst2xx<R> =
  R extends Record<infer Code, any> ? (Code extends `2${string}` ? ExtractMediaTypeBody<R[Code]> : never) : never;

/** Best-effort: pick the first 4xx or 5xx status code and extract its body. */
export type ExtractFirstError<R> =
  R extends Record<infer Code, any>
    ? Code extends `4${string}` | `5${string}`
      ? ExtractMediaTypeBody<R[Code]>
      : never
    : never;

// ============================================================
//  Options Types (请求选项类型)
// ============================================================

/** Extract the full parameters object from an operation. */
export type OperationParams<T> = T extends { parameters: infer P } ? P : Record<string, never>;

/** Extract the query parameters type from an operation. */
export type OperationQueryParams<T> = T extends { parameters: { query: infer Q } } ? NonNullable<Q> : never;

/** Extract the path parameters type from an operation. */
export type OperationPathParams<T> = T extends { parameters: { path: infer P } } ? NonNullable<P> : never;

/** Extract the header parameters type from an operation. */
export type OperationHeaderParams<T> = T extends { parameters: { header: infer H } } ? NonNullable<H> : never;

/** `pathParams` — required when the operation has path params (URL placeholders must be filled). */
export type PathParamsOption<T> = OperationPathParams<T> extends never ? {} : { pathParams: OperationPathParams<T> };

/** `query` — optional, typed from the OpenAPI spec when the operation has query params. */
export type QueryParamsOption<T> = OperationQueryParams<T> extends never ? {} : { query?: OperationQueryParams<T> };

/** `headers` — optional, typed from the OpenAPI spec when the operation has header params. */
export type HeaderParamsOption<T> =
  OperationHeaderParams<T> extends never ? {} : { headers?: OperationHeaderParams<T> };

/** Determine whether the `body` option is required based on the operation. */
export type RequestBodyOption<T> =
  OperationRequestBodyContent<T> extends never
    ? { body?: never }
    : IsOperationRequestBodyOptional<T> extends true
      ? { body?: OperationRequestBodyContent<T> }
      : { body: OperationRequestBodyContent<T> };

/**
 * Full per-request options for an OpenAPI operation.
 *
 * Flattened API — each parameter category is a top-level field:
 * - `pathParams` — path parameters (replaces `{id}` in the URL); required when the
 *   operation has path params
 * - `query` — query parameters; optional, typed from the OpenAPI spec
 * - `headers` — header parameters; optional, typed from the OpenAPI spec
 * - `body` — request body; required/optional per the OpenAPI spec
 * - remaining `FetchRequestConfig` fields (timeout, retry, …) pass through
 *
 * The following fields are omitted from the passthrough because they are managed
 * by the client or provided as typed top-level fields:
 * - `url` / `method` — set by the client itself
 * - `body` / `query` / `headers` — provided as typed top-level fields above
 *
 * The `R` type parameter flows through `responseType` so that callers can opt
 * into a non-JSON response shape (e.g. `responseType: 'text'` → `string`,
 * `responseType: 'blob'` → `FileResponseData<Blob>`). See {@link MappedType}.
 *
 * `R` 参数通过 `responseType` 字段流转,使调用方可以显式选择非 JSON 响应类型
 * (例如 `responseType: 'text'` → `string`、`responseType: 'blob'` → `FileResponseData<Blob>`)。
 * 详见 {@link MappedType}。
 */
export type OpenapiRequestOptions<T, R extends ResponseType = 'json'> = PathParamsOption<T> &
  QueryParamsOption<T> &
  HeaderParamsOption<T> &
  RequestBodyOption<T> &
  Omit<FetchRequestConfig<R>, 'url' | 'method' | 'body' | 'query' | 'headers'>;

// ============================================================
//  Client Method Types (客户端方法类型)
// ============================================================

/** Extract the operation type for a given method from a path entry. */
export type OperationForPath<PathEntry, M extends HttpMethod> = PathEntry extends Record<M, infer Op> ? Op : never;

/**
 * Compute the client return type for an operation.
 *
 * - When `Field` is `''` (default), returns the full {@link SuccessResponse}.
 * - When `Field` is a string literal, extracts that field from the success response.
 */
export type ClientResponse<Op, Field extends string> = Field extends ''
  ? SuccessResponse<Op>
  : SuccessResponse<Op> extends Record<Field, infer V>
    ? V
    : SuccessResponse<Op>;

/**
 * Typed client method (e.g. GET / POST / ...).
 *
 * The `R` type parameter is inferred from the per-request `responseType` option.
 * When set (e.g. `responseType: 'text'`), the return type is mapped via
 * {@link MappedType} (`'text'` → `string`, `'blob'` → `FileResponseData<Blob>`, …).
 * When omitted, `R` defaults to `'json'` and the return type is the OpenAPI
 * success response (or the `Field`-extracted value).
 *
 * `R` 类型参数从单次请求的 `responseType` 选项中推断。
 * 设置时(如 `responseType: 'text'`),返回类型经 {@link MappedType} 映射
 * (`'text'` → `string`、`'blob'` → `FileResponseData<Blob>` 等)。
 * 省略时 `R` 默认为 `'json'`,返回类型为 OpenAPI 成功响应(或 `Field` 提取的值)。
 */
export type ClientMethod<Paths extends Record<string, any>, M extends HttpMethod, Field extends string = ''> = <
  Path extends PathsWithMethod<Paths, M>,
  R extends ResponseType = 'json'
>(
  url: Path,
  ...init: RequiredKeysOf<OpenapiRequestOptions<OperationForPath<Paths[Path], M>, R>> extends never
    ? [init?: OpenapiRequestOptions<OperationForPath<Paths[Path], M>, R>]
    : [init: OpenapiRequestOptions<OperationForPath<Paths[Path], M>, R>]
) => Promise<MappedType<R, ClientResponse<OperationForPath<Paths[Path], M>, Field>>>;

/**
 * Typed **raw** client method — bypasses `transform` and returns the full `FetchResponse`.
 *
 * Like {@link ClientMethod}, the `R` type parameter is inferred from `responseType`
 * and the response `data` is mapped via {@link MappedType}.
 */
export type RawClientMethod<Paths extends Record<string, any>, M extends HttpMethod> = <
  Path extends PathsWithMethod<Paths, M>,
  R extends ResponseType = 'json'
>(
  url: Path,
  ...init: RequiredKeysOf<OpenapiRequestOptions<OperationForPath<Paths[Path], M>, R>> extends never
    ? [init?: OpenapiRequestOptions<OperationForPath<Paths[Path], M>, R>]
    : [init: OpenapiRequestOptions<OperationForPath<Paths[Path], M>, R>]
) => Promise<FetchResponse<MappedType<R, SuccessResponse<OperationForPath<Paths[Path], M>>>>>;

/**
 * The typed client interface, providing a method for each HTTP verb.
 *
 * `Field` controls the return-type extraction (see {@link ClientResponse}).
 * The `raw` property provides the same HTTP verbs but bypasses `transform`.
 */
export type TypedClient<Paths extends Record<string, any>, Field extends string = ''> = {
  [M in HttpMethod]: ClientMethod<Paths, M, Field>;
} & {
  raw: { [M in HttpMethod]: RawClientMethod<Paths, M> };
};

// ============================================================
//  Flat Client Types (扁平化客户端类型)
// ============================================================

/**
 * Flat response for OpenAPI requests — never throws.
 *
 * The `R` type parameter is inferred from the per-request `responseType` option
 * and maps the success `data` via {@link MappedType}. Defaults to `'json'`,
 * yielding `ClientResponse<T, Field>` (the OpenAPI success response shape).
 */
export type FlatOpenapiResponse<T, Field extends string = '', R extends ResponseType = 'json'> =
  | { data: MappedType<R, ClientResponse<T, Field>>; error: null; response: FetchResponse }
  | { data: null; error: FetchError; response?: FetchResponse };

/**
 * Typed flat client method.
 *
 * The `R` type parameter is inferred from `responseType` (see {@link ClientMethod}).
 */
export type FlatClientMethod<Paths extends Record<string, any>, M extends HttpMethod, Field extends string = ''> = <
  Path extends PathsWithMethod<Paths, M>,
  R extends ResponseType = 'json'
>(
  url: Path,
  ...init: RequiredKeysOf<OpenapiRequestOptions<OperationForPath<Paths[Path], M>, R>> extends never
    ? [init?: OpenapiRequestOptions<OperationForPath<Paths[Path], M>, R>]
    : [init: OpenapiRequestOptions<OperationForPath<Paths[Path], M>, R>]
) => Promise<FlatOpenapiResponse<OperationForPath<Paths[Path], M>, Field, R>>;

/**
 * Flat response for **raw** OpenAPI requests — never throws, bypasses `transform`.
 *
 * The `R` type parameter is inferred from `responseType` and maps the response
 * `data` via {@link MappedType}.
 */
export type FlatRawOpenapiResponse<T, R extends ResponseType = 'json'> =
  | {
      data: FetchResponse<MappedType<R, SuccessResponse<T>>>;
      error: null;
      response: FetchResponse<MappedType<R, SuccessResponse<T>>>;
    }
  | { data: null; error: FetchError; response?: FetchResponse };

/**
 * Typed **raw** flat client method.
 */
export type RawFlatClientMethod<Paths extends Record<string, any>, M extends HttpMethod> = <
  Path extends PathsWithMethod<Paths, M>,
  R extends ResponseType = 'json'
>(
  url: Path,
  ...init: RequiredKeysOf<OpenapiRequestOptions<OperationForPath<Paths[Path], M>, R>> extends never
    ? [init?: OpenapiRequestOptions<OperationForPath<Paths[Path], M>, R>]
    : [init: OpenapiRequestOptions<OperationForPath<Paths[Path], M>, R>]
) => Promise<FlatRawOpenapiResponse<OperationForPath<Paths[Path], M>, R>>;

/**
 * The typed flat client interface.
 */
export type FlatTypedClient<Paths extends Record<string, any>, Field extends string = ''> = {
  [M in HttpMethod]: FlatClientMethod<Paths, M, Field>;
} & {
  raw: { [M in HttpMethod]: RawFlatClientMethod<Paths, M> };
};

// ============================================================
//  Implementation (运行时实现)
// ============================================================

/** Regex to match path parameters like `{id}` */
export const PATH_PARAM_RE = /\{([^}]+)\}/g;

/** Replace path parameters (e.g. `{id}`) with actual values from `pathParams`. */
export function replacePathParams(path: string, pathParams?: Record<string, unknown>): string {
  if (!pathParams) return path;

  return path.replace(PATH_PARAM_RE, (_, key: string) => {
    const value = pathParams[key];
    if (value === undefined || value === null) {
      throw new Error(`[openapi-request] Missing required path parameter "${key}" in "${path}"`);
    }
    return String(value);
  });
}

/**
 * Translate the flattened OpenAPI options `{ pathParams, query, headers, body, ...rest }`
 * into a {@link FetchRequestConfig}.
 *
 * `pathParams` is used for URL placeholder replacement; `query`, `headers`, and `body`
 * are passed through directly to the fetch config.
 */
export function buildFetchConfig(
  url: string,
  prefix: string,
  method: HttpMethod,
  options: any
): FetchRequestConfig<'json'> {
  const { pathParams, query, headers, body, ...restConfig } = options || {};

  const resolvedUrl = replacePathParams(`${prefix}${url}`, pathParams);

  return {
    url: resolvedUrl,
    method,
    query,
    body,
    headers,
    ...restConfig
  };
}

export type PathsRemovedPrefix<Paths extends Record<string, any>, Prefix extends string> = {
  [P in keyof Paths as P extends `${Prefix}${infer S}` ? S : never]: Paths[P];
};

/**
 * Create a type-safe client based on the generated `paths` type.
 *
 * Wraps an existing {@link RequestInstance} (created by `createRequest`) and provides
 * typed HTTP methods (`get`, `post`, `put`, `delete`, …) whose URL, params, body,
 * and return type are all inferred from the OpenAPI spec.
 *
 * @example
 * ```typescript
 * import { createRequest } from '@soybeanjs/fetch';
 * import { createTypedClient } from '@soybeanjs/fetch';
 * import type { paths } from './openapi';
 *
 * const request = createRequest({ baseURL: 'https://api.example.com' }, { ... });
 *
 * // No prefix — paths are used verbatim
 * const client = createTypedClient<paths>(request);
 *
 * // With prefix — pass both the type parameter and the runtime argument
 * const client = createTypedClient<paths, '/api/v1'>(request, '/api/v1');
 *
 * // Spec describes envelope { code, data, message }, transform unwraps `data`
 * const client = createTypedClient<paths, '/api/v1', 'data'>(request, '/api/v1');
 *
 * // Fully type-safe — path, query, body, and response are all inferred
 * const menus = await client.get('/menu/list', {
 *   query: { page: 1, pageSize: 10 }
 * });
 *
 * // raw method — bypasses transform, returns full FetchResponse
 * const response = await client.raw.get('/users/1');
 * console.log(response.headers.get('content-type'), response.data);
 * ```
 */
export function createTypedClient<
  Paths extends Record<string, any>,
  Prefix extends string = '',
  Field extends string = ''
>(
  requestInstance: RequestInstance<any>,
  prefix: Prefix = '' as Prefix
): TypedClient<PathsRemovedPrefix<Paths, Prefix>, Field> {
  const methods: readonly HttpMethod[] = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'];

  const client = {} as TypedClient<PathsRemovedPrefix<Paths, Prefix>, Field>;

  for (const method of methods) {
    (client as any)[method] = (url: string, options?: any) => {
      return requestInstance(buildFetchConfig(url, prefix, method, options));
    };
  }

  const rawClient = {} as TypedClient<PathsRemovedPrefix<Paths, Prefix>, Field>['raw'];

  for (const method of methods) {
    (rawClient as any)[method] = (url: string, options?: any) => {
      return requestInstance.raw(buildFetchConfig(url, prefix, method, options));
    };
  }

  client.raw = rawClient;

  return client;
}

/**
 * Create a type-safe flat client based on the generated `paths` type.
 *
 * Wraps an existing {@link FlatRequestInstance} (created by `createFlatRequest`) and provides
 * typed HTTP methods (`get`, `post`, `put`, `delete`, …) that never throw — success or failure
 * is determined through the return value `{ data, error }`.
 *
 * @example
 * ```typescript
 * import { createFlatRequest } from '@soybeanjs/fetch';
 * import { createFlatTypedClient } from '@soybeanjs/fetch';
 * import type { paths } from './openapi';
 *
 * const flatRequest = createFlatRequest({ baseURL: 'https://api.example.com' }, { ... });
 *
 * const client = createFlatTypedClient<paths, '/api/v1', 'data'>(flatRequest, '/api/v1');
 *
 * const { data, error } = await client.get('/menu/list', {
 *   query: { page: 1, pageSize: 10 }
 * });
 *
 * if (error) {
 *   console.error('Request failed:', error.message);
 * } else {
 *   console.log('Menus:', data.list, 'Total:', data.total);
 * }
 * ```
 */
export function createFlatTypedClient<
  Paths extends Record<string, any>,
  Prefix extends string = '',
  Field extends string = ''
>(
  flatRequestInstance: FlatRequestInstance<any, any>,
  prefix: Prefix = '' as Prefix
): FlatTypedClient<PathsRemovedPrefix<Paths, Prefix>, Field> {
  const methods: readonly HttpMethod[] = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'];

  const client = {} as FlatTypedClient<PathsRemovedPrefix<Paths, Prefix>, Field>;

  for (const method of methods) {
    (client as any)[method] = (url: string, options?: any) => {
      return flatRequestInstance(buildFetchConfig(url, prefix, method, options));
    };
  }

  const rawClient = {} as FlatTypedClient<PathsRemovedPrefix<Paths, Prefix>, Field>['raw'];

  for (const method of methods) {
    (rawClient as any)[method] = (url: string, options?: any) => {
      return flatRequestInstance.raw(buildFetchConfig(url, prefix, method, options));
    };
  }

  client.raw = rawClient;

  return client;
}
