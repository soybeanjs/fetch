import type { FetchAdapter, FetchAdapterResponse } from './types';

// ============================================================
//  Default Adapter (默认适配器 — 原生 fetch)
// ============================================================

/**
 * Default fetch adapter — delegates to the native `fetch()` API.
 *
 * This is used when no custom `adapter` is provided in the request config.
 *
 * 默认 fetch 适配器 —— 委托给原生 `fetch()` API。
 * 当请求配置中未提供自定义 `adapter` 时使用。
 */
export const defaultAdapter: FetchAdapter = (url, init) => fetch(url, init as RequestInit);

// ============================================================
//  Adapter Response Builder (适配器响应构建器)
// ============================================================

/**
 * Create a {@link FetchAdapterResponse} from raw response data.
 *
 * This helper is designed for **custom adapter authors** who need to wrap
 * platform-specific responses (e.g. `uni.request`, `wx.request`) into the
 * shape expected by the library.
 *
 * All body-reading methods (`text`, `blob`, `arrayBuffer`) default to
 * no-op implementations — override them based on what the platform provides.
 *
 * 根据 raw 响应数据创建 {@link FetchAdapterResponse}。
 *
 * 此辅助函数专为**自定义适配器作者**设计,用于将平台特定的响应
 * (如 `uni.request`、`wx.request`)包装为库所期望的结构。
 *
 * 所有 body 读取方法(`text`、`blob`、`arrayBuffer`)默认为空实现 ——
 * 请根据平台实际提供的数据进行覆写。
 *
 * @example
 * ```ts
 * import { createAdapterResponse, type FetchAdapter } from '@soybeanjs/fetch';
 *
 * // A minimal uniapp adapter
 * export const uniappAdapter: FetchAdapter = (url, init) => {
 *   return new Promise((resolve, reject) => {
 *     uni.request({
 *       url,
 *       method: init.method as any,
 *       header: Object.fromEntries(init.headers.entries()),
 *       data: init.body as any,
 *       success: (res) => {
 *         const text = typeof res.data === 'string'
 *           ? res.data
 *           : JSON.stringify(res.data);
 *         resolve(createAdapterResponse({
 *           status: res.statusCode,
 *           headers: new Headers(res.header as Record<string, string>),
 *           text: () => Promise.resolve(text),
 *           arrayBuffer: () => {
 *             const data = res.data;
 *             return Promise.resolve(
 *               data instanceof ArrayBuffer ? data : new TextEncoder().encode(text).buffer
 *             );
 *           },
 *           blob: () => Promise.resolve(new Blob([text]))
 *         }));
 *       },
 *       fail: (err) => reject(new Error(err.errMsg))
 *     });
 *   });
 * };
 * ```
 */
export function createAdapterResponse(options: {
  status: number;
  statusText?: string;
  headers?: Headers;
  body?: ReadableStream<Uint8Array> | null;
  text?: () => Promise<string>;
  blob?: () => Promise<Blob>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
}): FetchAdapterResponse {
  const { status, statusText = '', headers = new Headers(), body = null, text, blob, arrayBuffer } = options;

  return {
    status,
    statusText,
    headers,
    body,
    text: text ?? (() => Promise.resolve('')),
    blob: blob ?? (() => Promise.resolve(new Blob())),
    arrayBuffer: arrayBuffer ?? (() => Promise.resolve(new ArrayBuffer(0)))
  };
}
