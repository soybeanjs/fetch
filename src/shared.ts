import type { FetchResponse, ResponseType } from './types';

// ============================================================
//  HTTP Status Utilities (HTTP 状态工具)
// ============================================================

/**
 * Check if the HTTP status code indicates success (2xx or 304).
 *
 * 判断 HTTP 状态码是否表示成功（2xx 或 304）。
 *
 * Used as the default `validateStatus` function.
 */
export function isHttpSuccess(status: number): boolean {
  return (status >= 200 && status < 300) || status === 304;
}

// ============================================================
//  Content Type Utilities (内容类型工具)
// ============================================================

/**
 * Get the content type from a response (从响应中获取内容类型)
 */
export function getContentType(response: FetchResponse): string | null {
  return response.headers.get('content-type');
}

/**
 * Check if the response content type is JSON.
 *
 * 判断响应内容类型是否为 JSON。
 */
export function isResponseJson(response: FetchResponse): boolean {
  const contentType = getContentType(response);
  return Boolean(contentType && contentType.includes('application/json'));
}

// ============================================================
//  Binary → JSON Coercion (二进制转 JSON)
// ============================================================

/**
 * Convert a Blob response body to JSON in-place.
 *
 * 将 Blob 响应体转换为 JSON（原地修改）。
 */
export async function transformBlobToJson(response: FetchResponse): Promise<void> {
  try {
    let data = response.data;

    if (typeof data === 'string') {
      data = JSON.parse(data);
    }

    if (Object.prototype.toString.call(data) === '[object Blob]') {
      const text = (data as Blob).text ? await (data as Blob).text() : await (data as Blob).text();
      data = JSON.parse(text);
    }

    response.data = data;
  } catch {
    // If parsing fails, leave the original data untouched
    // 解析失败时保留原始数据
  }
}

/**
 * Convert an ArrayBuffer response body to JSON in-place.
 *
 * 将 ArrayBuffer 响应体转换为 JSON（原地修改）。
 */
export async function transformArrayBufferToJson(response: FetchResponse): Promise<void> {
  try {
    let data = response.data;

    if (typeof data === 'string') {
      data = JSON.parse(data);
    }

    if (data instanceof ArrayBuffer) {
      const text = new TextDecoder().decode(data);
      data = JSON.parse(text);
    }

    response.data = data;
  } catch {
    // If parsing fails, leave the original data untouched
    // 解析失败时保留原始数据
  }
}

/**
 * Coerce a binary (blob/arraybuffer) response to JSON when the server returns
 * `application/json` content type.
 *
 * This is useful when you request a file (blob/arraybuffer) but the server
 * returns a JSON error response instead.
 *
 * 当服务器返回 `application/json` 内容类型时,将二进制（blob/arraybuffer）响应转换为 JSON。
 * 这在你请求文件但服务器返回 JSON 错误响应时非常有用。
 *
 * **Only mutates `response.data` — does not change `response.config.responseType`.**
 */
export async function coerceBinaryToJsonResponse(response: FetchResponse): Promise<void> {
  const responseType: ResponseType = response.config?.responseType || 'json';

  // No coercion needed for json or text responses
  if (responseType === 'json' || responseType === 'text' || responseType === 'document') {
    return;
  }

  // Only coerce when the server actually returned JSON
  if (!isResponseJson(response)) {
    return;
  }

  if (responseType === 'blob') {
    await transformBlobToJson(response);
  } else if (responseType === 'arraybuffer') {
    await transformArrayBufferToJson(response);
  }
}
