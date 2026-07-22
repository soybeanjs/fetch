import { NULL_BODY_STATUS_CODES } from './constant';
import type { ResponseType } from './types';

// ============================================================
//  URL Utilities (URL 工具)
// ============================================================

/**
 * Ensure a single leading "/" on a path segment.
 */
function withLeadingSlash(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

/**
 * Ensure no trailing "/" on a base URL.
 */
function withoutTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Join a base URL and a path, ensuring exactly one "/" between them.
 *
 * 连接 base URL 和路径,确保中间恰好有一个 "/"。
 */
export function joinURL(base: string, path: string): string {
  return withoutTrailingSlash(base) + withLeadingSlash(path);
}

/**
 * Prepend a base URL to the input, unless the input already starts with the base
 * or is an absolute URL (http:// or https://).
 *
 * 除非输入已经是绝对 URL 或以 base 开头,否则将 base 前置到输入。
 */
export function withBase(input: string, base: string): string {
  if (!base || input.startsWith(base)) return input;
  return joinURL(base, input);
}

/**
 * Check if a URL is absolute (starts with http:// or https://).
 *
 * 判断 URL 是否为绝对路径（以 http:// 或 https:// 开头）。
 */
export function isAbsoluteURL(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * Resolve the final URL from baseURL and url.
 *
 * If `url` is absolute, `baseURL` is ignored.
 */
export function resolveURL(url: string, baseURL?: string): string {
  if (!baseURL || isAbsoluteURL(url)) return url;
  return withBase(url, baseURL);
}

// ============================================================
//  Query String Utilities (查询字符串工具)
// ============================================================

/**
 * Normalize a query parameter value to a string.
 */
function normalizeQueryValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  // Objects/arrays → JSON string
  return JSON.stringify(value);
}

/**
 * Append query parameters to a URL.
 *
 * 向 URL 追加查询参数。
 *
 * - Primitives are appended as `key=value`
 * - Arrays are appended as repeated keys: `key=v1&key=v2`
 * - Objects are JSON-stringified
 * - `null` / `undefined` values are skipped
 *
 * @param input The base URL
 * @param query Query parameters object
 * @returns The URL with query string appended
 */
export function withQuery(input: string, query?: Record<string, any>): string {
  if (!query || Object.keys(query).length === 0) return input;

  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) continue;
        searchParams.append(key, normalizeQueryValue(item));
      }
    } else {
      searchParams.set(key, normalizeQueryValue(value));
    }
  }

  const queryString = searchParams.toString();
  if (!queryString) return input;

  return input.includes('?') ? `${input}&${queryString}` : `${input}?${queryString}`;
}

/**
 * Serialize params to a query string (without the leading "?").
 *
 * 将参数序列化为查询字符串（不含前导 "?"）。
 *
 * Used as the default `paramsSerializer`.
 */
export function serializeParams(params?: Record<string, any>): string {
  if (!params) return '';
  const url = withQuery('', params);
  return url.startsWith('?') ? url.slice(1) : url;
}

// ============================================================
//  HTTP Method Utilities (HTTP 方法工具)
// ============================================================

const PAYLOAD_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Check if the HTTP method typically has a request body.
 *
 * 判断 HTTP 方法是否通常包含请求体。
 */
export function isPayloadMethod(method: string): boolean {
  return PAYLOAD_METHODS.has(method.toUpperCase());
}

// ============================================================
//  Body Serialization Utilities (请求体序列化工具)
// ============================================================

const TEXT_TYPES = new Set([
  'image/svg',
  'application/xml',
  'application/xhtml+xml',
  'application/rss+xml',
  'application/atom+xml',
  'application/json',
  'application/ld+json',
  'application/xml'
]);

/**
 * Check if a value can be serialized as JSON.
 *
 * 判断值是否可以序列化为 JSON。
 *
 * - Strings, numbers, booleans, null, plain objects, arrays → true
 * - FormData, Blob, ArrayBuffer, URLSearchParams, ReadableStream → false
 */
export function isJSONSerializable(value: unknown): boolean {
  if (value === undefined) return false;
  if (value === null) return true;

  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return true;

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return false;
  if (value instanceof ArrayBuffer) return false;
  if (value instanceof Blob) return false;
  if (value instanceof FormData) return false;
  if (value instanceof URLSearchParams) return false;
  if (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream) return false;

  if (t === 'object') return true;

  return false;
}

/**
 * Detect the appropriate response type from the Content-Type header.
 *
 * 根据 Content-Type 头部检测合适的响应类型。
 */
export function detectResponseType(contentType: string | null): ResponseType {
  if (!contentType) return 'json';

  const mime = contentType.toLowerCase();

  if (mime.includes('application/json') || mime.includes('+json')) return 'json';
  if (mime.includes('text/html')) return 'document';
  if (mime.includes('text/')) return 'text';
  if (mime.includes('application/xml') || mime.includes('+xml')) return 'document';
  if (TEXT_TYPES.has(mime)) return 'text';

  // Everything else → blob (binary)
  return 'blob';
}

/**
 * Check if a response has no body (based on status code).
 *
 * 根据状态码判断响应是否无响应体。
 */
export function isNullBodyStatus(status: number): boolean {
  return NULL_BODY_STATUS_CODES.has(status);
}

// ============================================================
//  Headers Utilities (请求头工具)
// ============================================================

/**
 * Convert a `Record<string, string>` to a `Headers` instance.
 */
export function toHeaders(headers?: Headers | Record<string, string> | null): Headers {
  if (!headers) return new Headers();
  if (headers instanceof Headers) return new Headers(headers);
  return new Headers(headers);
}

/**
 * Merge multiple header sources into a single `Headers` instance.
 * Later sources override earlier ones.
 *
 * 将多个头部源合并为一个 `Headers` 实例。后出现的覆盖先出现的。
 */
export function mergeHeaders(...sources: (Headers | Record<string, string> | null | undefined)[]): Headers {
  const merged = new Headers();
  for (const source of sources) {
    if (!source) continue;
    if (source instanceof Headers) {
      source.forEach((value, key) => merged.set(key, value));
    } else {
      for (const [key, value] of Object.entries(source)) {
        if (value !== undefined) merged.set(key, value);
      }
    }
  }
  return merged;
}
