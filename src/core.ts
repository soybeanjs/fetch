import { FILE_RESPONSE_TYPES } from './constant';
import { parseContentDisposition } from './shared';
import type { FetchError } from './error';
import { createFetchInstance } from './fetch';
import { createDefaultOptions, createFetchConfig } from './options';
import type {
  CreateFetchDefaults,
  FetchInstance,
  FetchResponse,
  FileResponseData,
  FlatRequestInstance,
  FlatResponseData,
  MappedType,
  RequestInstance,
  RequestOption,
  ResponseType
} from './types';

// ============================================================
//  Internal Helpers (内部辅助函数)
// ============================================================

/** Get the response type from a fetch response config. */
function getResponseType(response: FetchResponse): ResponseType {
  return (response.config?.responseType as ResponseType) || 'json';
}

/**
 * Resolve the final data from a response based on its type.
 *
 * - JSON responses: return `response.data` as-is
 * - File responses (blob/arraybuffer/stream): return `{file, filename, contentType}`
 * - Other: return `response.data`
 */
function resolveRequestData(
  response: FetchResponse,
  responseType: ResponseType,
  getFileName?: (response: FetchResponse) => string
): FileResponseData | any {
  if (FILE_RESPONSE_TYPES.includes(responseType)) {
    return getFileData(response, getFileName);
  }
  return response.data;
}

/** Extract file data (file, filename, contentType) from a response. */
function getFileData(response: FetchResponse, getFileName?: (response: FetchResponse) => string): FileResponseData {
  const filename = getFileName?.(response) ?? parseContentDisposition(response.headers.get('content-disposition'));

  const contentType = response.headers.get('content-type') || 'application/octet-stream';

  return {
    file: response.data,
    filename,
    contentType
  };
}

// ============================================================
//  Create Common Request (创建通用请求 — 内部)
// ============================================================

/**
 * Create the common request infrastructure: fetch instance + resolved options + state.
 *
 * This is the internal foundation used by both {@link createRequest} and {@link createFlatRequest}.
 */
export function createCommonRequest<
  ResponseData = any,
  ApiData = ResponseData
>(config?: CreateFetchDefaults, options?: RequestOption<ResponseData, ApiData>) {
  const opts = createDefaultOptions<ResponseData, ApiData>(
    options || ({} as RequestOption<ResponseData, ApiData>)
  );

  const fetchConfig = createFetchConfig(config);

  const instance: FetchInstance = createFetchInstance<ResponseData>(fetchConfig, opts);

  return { instance, opts };
}

// ============================================================
//  Create Request (创建请求实例 — 抛出异常模式)
// ============================================================

/**
 * Create a standard request instance.
 *
 * 创建标准请求实例。
 *
 * The returned function throws on error (both HTTP errors and backend errors).
 * On success, it returns the transformed business data directly.
 *
 * @example
 * ```ts
 * const request = createRequest(
 *   { baseURL: 'https://api.example.com' },
 *   {
 *     transform: (response) => response.data.data,
 *     isBackendSuccess: (response) => response.data.code === 200,
 *     onRequest: (config) => {
 *       config.headers.set('Authorization', `Bearer ${token}`);
 *       return config;
 *     }
 *   }
 * );
 *
 * // Throws on error, returns transformed data on success
 * const data = await request({ url: '/users' });
 *
 * // Convenience methods
 * const user = await request.get('/users/1');
 * const created = await request.post('/users', { name: 'John' });
 *
 * // Get raw response (without transform)
 * const response = await request.raw({ url: '/users' });
 *
 * // Download file
 * const file = await request.get('/download', { responseType: 'blob' });
 * // file: { file: Blob, filename: string, contentType: string }
 * ```
 */
export function createRequest<
  ResponseData = any,
  ApiData = ResponseData
>(
  config?: CreateFetchDefaults,
  options?: RequestOption<ResponseData, ApiData>
): RequestInstance<ApiData> {
  const { instance, opts } = createCommonRequest<ResponseData, ApiData>(config, options);

  const request = async function request<T extends ApiData = ApiData, R extends ResponseType = 'json'>(conf: any) {
    const response: FetchResponse<ResponseData> = await instance(conf);
    const responseType = getResponseType(response);

    if (responseType === 'json') {
      return await opts.transform(response);
    }

    return resolveRequestData(response, responseType, conf.getFileName) as MappedType<R, T>;
  } as RequestInstance<ApiData>;

  request.raw = async function raw<T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    conf: any
  ): Promise<FetchResponse<MappedType<R, T>>> {
    const response: FetchResponse<ResponseData> = await instance(conf);
    const responseType = getResponseType(response);

    if (responseType === 'json') {
      return response as FetchResponse<MappedType<R, T>>;
    }

    const data = resolveRequestData(response, responseType, conf.getFileName);
    (response as FetchResponse<MappedType<R, T>>).data = data;
    return response as FetchResponse<MappedType<R, T>>;
  };

  request.get = function get<T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    url: string,
    conf?: any
  ): Promise<MappedType<R, T>> {
    return request({ ...conf, url, method: 'GET' });
  };

  request.post = function post<T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    url: string,
    data?: any,
    conf?: any
  ): Promise<MappedType<R, T>> {
    return request({ ...conf, url, method: 'POST', data });
  };

  request.put = function put<T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    url: string,
    data?: any,
    conf?: any
  ): Promise<MappedType<R, T>> {
    return request({ ...conf, url, method: 'PUT', data });
  };

  request.delete = function deleteFn<T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    url: string,
    conf?: any
  ): Promise<MappedType<R, T>> {
    return request({ ...conf, url, method: 'DELETE' });
  };

  request.patch = function patch<T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    url: string,
    data?: any,
    conf?: any
  ): Promise<MappedType<R, T>> {
    return request({ ...conf, url, method: 'PATCH', data });
  };

  request.state = instance.enhancedState;
  request.instance = instance;

  return request;
}

// ============================================================
//  Create Flat Request (创建扁平化请求实例 — 不抛异常模式)
// ============================================================

/**
 * Create a flat request instance that never throws.
 *
 * 创建扁平化请求实例,不会抛出异常。
 *
 * The returned function always resolves to a `{ data, error, response }` object:
 * - On success: `{ data: ApiData, error: null, response: FetchResponse }`
 * - On failure: `{ data: null, error: FetchError, response?: FetchResponse }`
 *
 * @example
 * ```ts
 * const request = createFlatRequest(
 *   { baseURL: 'https://api.example.com' },
 *   {
 *     transform: (response) => response.data.data,
 *     isBackendSuccess: (response) => response.data.code === 200,
 *   }
 * );
 *
 * // Never throws — check `error` instead
 * const { data, error } = await request({ url: '/users' });
 * if (error) {
 *   console.error(error.message);
 * } else {
 *   console.log(data);
 * }
 * ```
 */
export function createFlatRequest<
  ResponseData = any,
  ApiData = ResponseData
>(
  config?: CreateFetchDefaults,
  options?: RequestOption<ResponseData, ApiData>
): FlatRequestInstance<ResponseData, ApiData> {
  const { instance, opts } = createCommonRequest<ResponseData, ApiData>(config, options);

  const flatRequest = async function flatRequest<T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    conf: any
  ) {
    try {
      const response: FetchResponse<ResponseData> = await instance(conf);
      const responseType = getResponseType(response);

      if (responseType === 'json') {
        const data = await opts.transform(response);
        return { data, error: null, response } as FlatResponseData<ResponseData, MappedType<R, T>>;
      }

      const data = resolveRequestData(response, responseType, conf.getFileName);
      return { data, error: null, response } as FlatResponseData<ResponseData, MappedType<R, T>>;
    } catch (err) {
      const error = err as FetchError<ResponseData>;
      return {
        data: null,
        error,
        response: error.response as FetchResponse<ResponseData> | undefined
      } as FlatResponseData<ResponseData, MappedType<R, T>>;
    }
  } as FlatRequestInstance<ResponseData, ApiData>;

  flatRequest.raw = async function raw<T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    conf: any
  ): Promise<
    | { data: FetchResponse<MappedType<R, T>>; error: null; response: FetchResponse<MappedType<R, T>> }
    | { data: null; error: FetchError<ResponseData>; response?: FetchResponse<ResponseData> }
  > {
    try {
      const response: FetchResponse<ResponseData> = await instance(conf);
      const responseType = getResponseType(response);

      if (responseType !== 'json') {
        const fileData = resolveRequestData(response, responseType, conf.getFileName);
        (response as FetchResponse<MappedType<R, T>>).data = fileData;
      }

      const typed = response as FetchResponse<MappedType<R, T>>;
      return { data: typed, error: null, response: typed };
    } catch (err) {
      const error = err as FetchError<ResponseData>;
      return {
        data: null,
        error,
        response: error.response as FetchResponse<ResponseData> | undefined
      };
    }
  };

  flatRequest.get = function get<T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    url: string,
    conf?: any
  ): Promise<FlatResponseData<ResponseData, MappedType<R, T>>> {
    return flatRequest({ ...conf, url, method: 'GET' });
  };

  flatRequest.post = function post<T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    url: string,
    data?: any,
    conf?: any
  ): Promise<FlatResponseData<ResponseData, MappedType<R, T>>> {
    return flatRequest({ ...conf, url, method: 'POST', data });
  };

  flatRequest.put = function put<T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    url: string,
    data?: any,
    conf?: any
  ): Promise<FlatResponseData<ResponseData, MappedType<R, T>>> {
    return flatRequest({ ...conf, url, method: 'PUT', data });
  };

  flatRequest.delete = function deleteFn<T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    url: string,
    conf?: any
  ): Promise<FlatResponseData<ResponseData, MappedType<R, T>>> {
    return flatRequest({ ...conf, url, method: 'DELETE' });
  };

  flatRequest.patch = function patch<T extends ApiData = ApiData, R extends ResponseType = 'json'>(
    url: string,
    data?: any,
    conf?: any
  ): Promise<FlatResponseData<ResponseData, MappedType<R, T>>> {
    return flatRequest({ ...conf, url, method: 'PATCH', data });
  };

  flatRequest.state = instance.enhancedState;
  flatRequest.instance = instance;

  return flatRequest;
}
