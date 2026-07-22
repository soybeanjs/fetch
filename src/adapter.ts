import type { FetchAdapter, FetchAdapterInit, FetchAdapterResponse, UploadProgressHandler } from './types';

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

// ============================================================
//  Upload Progress Adapter (上传进度适配器 — 跨运行时)
// ============================================================

/**
 * Convert a `BodyInit` to a `ReadableStream<Uint8Array>` with a known total size.
 *
 * Returns `{ stream: null, total: 0 }` for empty or unconvertible bodies.
 * For `FormData`, the multipart `Content-Type` header (with boundary) is extracted
 * from a synthetic `Response` so the runtime can send it correctly when the body
 * is a stream rather than a `FormData` instance.
 *
 * 将 `BodyInit` 转换为已知总大小的 `ReadableStream<Uint8Array>`。
 * 对于 `FormData`,从合成的 `Response` 中提取 multipart `Content-Type`(含 boundary),
 * 以便 body 为流时运行时仍能正确发送。
 */
function bodyToStream(body: BodyInit | null | undefined): {
  stream: ReadableStream<Uint8Array> | null;
  total: number;
  headers?: Headers;
} {
  if (body === null || body === undefined) {
    return { stream: null, total: 0 };
  }

  // Blob (includes File)
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return { stream: body.stream(), total: body.size };
  }

  // ArrayBuffer
  if (body instanceof ArrayBuffer) {
    const bytes = new Uint8Array(body);
    return {
      stream: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }),
      total: body.byteLength
    };
  }

  // TypedArray / DataView
  if (ArrayBuffer.isView(body)) {
    const view = body as ArrayBufferView;
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    return {
      stream: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }),
      total: view.byteLength
    };
  }

  // string
  if (typeof body === 'string') {
    const encoded = new TextEncoder().encode(body);
    return {
      stream: new ReadableStream({ start(c) { c.enqueue(encoded); c.close(); } }),
      total: encoded.byteLength
    };
  }

  // URLSearchParams
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    const encoded = new TextEncoder().encode(body.toString());
    return {
      stream: new ReadableStream({ start(c) { c.enqueue(encoded); c.close(); } }),
      total: encoded.byteLength
    };
  }

  // ReadableStream — already a stream, total unknown
  if (body instanceof ReadableStream) {
    return { stream: body, total: 0 };
  }

  // FormData — serialize via Response to get stream + Content-Type (with boundary)
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const response = new Response(body);
    const stream = response.body;
    const contentType = response.headers.get('content-type');
    const headers = contentType ? new Headers({ 'content-type': contentType }) : undefined;
    return { stream: stream ?? null, total: 0, headers };
  }

  // Fallback: try Blob
  try {
    const blob = new Blob([body as BlobPart]);
    return { stream: blob.stream(), total: blob.size };
  } catch {
    return { stream: null, total: 0 };
  }
}

/**
 * Create an XHR-based upload progress adapter (browser only).
 *
 * Uses `XMLHttpRequest.upload.progress` for accurate, native upload progress events.
 */
function createXhrUploadAdapter(onUploadProgress: UploadProgressHandler): FetchAdapter {
  return (url, init) => {
    return new Promise<FetchAdapterResponse>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(init.method, url, true);
      xhr.responseType = 'blob';

      // Apply headers
      init.headers.forEach((value, key) => {
        xhr.setRequestHeader(key, value);
      });

      // Credentials
      if (init.credentials === 'include') {
        xhr.withCredentials = true;
      }

      // Upload progress
      xhr.upload.addEventListener('progress', (event: ProgressEvent) => {
        onUploadProgress({
          loaded: event.loaded,
          total: event.lengthComputable ? event.total : 0,
          progress: event.lengthComputable && event.total > 0
            ? Math.round((event.loaded / event.total) * 100)
            : 0,
          lengthComputable: event.lengthComputable
        });
      });

      // Abort support — reject with an AbortError so retry logic can distinguish it
      if (init.signal) {
        if (init.signal.aborted) {
          xhr.abort();
        } else {
          init.signal.addEventListener(
            'abort',
            () => {
              xhr.abort();
            },
            { once: true }
          );
        }
      }

      xhr.addEventListener('load', () => {
        const headers = new Headers();
        const headerStr = xhr.getAllResponseHeaders() || '';
        const headerLines = headerStr.trim().split(/\r\n/);
        for (const line of headerLines) {
          const idx = line.indexOf(': ');
          if (idx > 0) {
            headers.append(line.slice(0, idx), line.slice(idx + 2));
          }
        }

        const blob = xhr.response as Blob;
        resolve(
          createAdapterResponse({
            status: xhr.status,
            statusText: xhr.statusText,
            headers,
            body: blob.stream(),
            text: () => blob.text(),
            blob: () => Promise.resolve(blob),
            arrayBuffer: () => blob.arrayBuffer()
          })
        );
      });

      xhr.addEventListener('error', () => {
        reject(new TypeError('Network request failed'));
      });

      xhr.addEventListener('timeout', () => {
        reject(new TypeError('Network request timed out'));
      });

      xhr.addEventListener('abort', () => {
        reject(new DOMException('The user aborted a request.', 'AbortError'));
      });

      // @ts-expect-error XHR send accepts BodyInit
      xhr.send(init.body ?? null);
    });
  };
}

/**
 * Create a stream-based upload progress adapter.
 *
 * Works in Node.js, Bun, Deno, and Cloudflare Workers — anywhere with
 * `TransformStream` and `fetch`. Wraps the request body in a counting
 * `TransformStream` so that each chunk flowing through triggers the progress
 * callback.
 *
 * For body types with a known size (`Blob`, `ArrayBuffer`, `string`, etc.) the
 * `total` and `progress` fields are accurate. For `FormData` and raw
 * `ReadableStream` bodies, `total` is 0 and `lengthComputable` is `false` — but
 * `loaded` (bytes streamed) still updates, allowing "uploaded X bytes" UIs.
 */
function createStreamUploadAdapter(onUploadProgress: UploadProgressHandler): FetchAdapter {
  return async (url, init) => {
    const { stream, total, headers: extraHeaders } = bodyToStream(init.body);

    // If body can't be converted to a stream, fall back to default adapter
    if (!stream) {
      return defaultAdapter(url, init);
    }

    // Merge extra headers (e.g. multipart Content-Type from FormData)
    const finalHeaders = new Headers(init.headers);
    if (extraHeaders) {
      extraHeaders.forEach((value, key) => {
        if (!finalHeaders.has(key)) finalHeaders.set(key, value);
      });
    }

    // Create a counting transform stream
    let loaded = 0;
    const countingTransform = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        loaded += chunk.byteLength;
        onUploadProgress({
          loaded,
          total,
          progress: total > 0 ? Math.round((loaded / total) * 100) : 0,
          lengthComputable: total > 0
        });
        controller.enqueue(chunk);
      }
    });

    const countedStream = stream.pipeThrough(countingTransform);

    const streamInit: FetchAdapterInit = {
      ...init,
      headers: finalHeaders,
      body: countedStream,
      duplex: 'half'
    };

    return defaultAdapter(url, streamInit);
  };
}

/**
 * Create a {@link FetchAdapter} that tracks upload progress.
 *
 * 创建一个跟踪上传进度的 {@link FetchAdapter}。
 *
 * The native `fetch()` API does not support upload progress events. This function
 * automatically selects the best available mechanism based on the runtime:
 *
 * 原生 `fetch()` API 不支持上传进度事件。此函数根据运行时自动选择最佳方案:
 *
 * | Runtime              | Mechanism                        | `total` accuracy                 |
 * | -------------------- | -------------------------------- | -------------------------------- |
 * | Browser              | `XMLHttpRequest.upload.progress` | Accurate                         |
 * | Node.js / Bun / Deno | `TransformStream` byte counting  | Accurate for known-size bodies   |
 * | CF Workers           | `TransformStream` byte counting  | May buffer (jump to 100%)        |
 *
 * The returned adapter can be passed to the `adapter` config field, or — more
 * conveniently — use the `onUploadProgress` config option for per-request progress
 * (the library calls this function internally).
 *
 * 返回的适配器可传入 `adapter` 配置字段;或更便捷地使用 `onUploadProgress`
 * 配置项实现单次请求进度跟踪(库内部会调用此函数)。
 *
 * @param onUploadProgress Callback invoked during upload
 * @returns A {@link FetchAdapter}, or `undefined` if neither XHR nor `TransformStream` is available
 *
 * @example
 * ```ts
 * import { createRequest, createUploadProgressAdapter } from '@soybeanjs/fetch';
 *
 * const request = createRequest(
 *   {
 *     baseURL: 'https://api.example.com',
 *     adapter: createUploadProgressAdapter(({ progress, loaded, lengthComputable }) => {
 *       if (lengthComputable) {
 *         console.log(`Upload: ${progress}%`);
 *       } else {
 *         console.log(`Uploaded ${loaded} bytes`);
 *       }
 *     })
 *   },
 *   options
 * );
 * ```
 */
export function createUploadProgressAdapter(
  onUploadProgress: UploadProgressHandler
): FetchAdapter | undefined {
  // Priority 1: XHR (browser) — most accurate, native upload progress events
  if (typeof XMLHttpRequest !== 'undefined') {
    return createXhrUploadAdapter(onUploadProgress);
  }

  // Priority 2: TransformStream (Node.js, Bun, Deno, CF Workers)
  if (typeof TransformStream !== 'undefined') {
    return createStreamUploadAdapter(onUploadProgress);
  }

  return undefined;
}
