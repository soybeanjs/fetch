import type { ResponseType } from './types';

/**
 * File response types (响应文件的类型)
 */
export const FILE_RESPONSE_TYPES: ResponseType[] = ['blob', 'arraybuffer', 'stream'];

/**
 * Default request timeout in milliseconds (默认请求超时,毫秒)
 */
export const DEFAULT_TIMEOUT = 10_000;

/**
 * HTTP status codes that should trigger a retry by default.
 *
 * 默认触发重试的 HTTP 状态码。
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
 */
export const RETRY_STATUS_CODES = new Set([
  408, // Request Timeout
  409, // Conflict
  425, // Too Early
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504 // Gateway Timeout
]);

/**
 * HTTP status codes that have no response body.
 *
 * 无响应体的 HTTP 状态码。
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Response/body
 */
export const NULL_BODY_STATUS_CODES = new Set([101, 204, 205, 304]);

/** Backend error flag, used as `error.code` */
export const BACKEND_ERROR_FLAG = 'BACKEND_ERROR';

/** Schema validation failure error code, used as `error.code` */
export const ERR_SCHEMA = 'ERR_SCHEMA';
