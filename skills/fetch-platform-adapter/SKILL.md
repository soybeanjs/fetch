---
name: 'fetch-platform-adapter'
description: 'Creates custom transport adapters for platforms without native fetch (uniapp, WeChat mini-programs, React Native). Invoke when user wants to support a new platform, build a custom adapter, or implement upload progress tracking.'
---

# Fetch Platform Adapter

This skill creates custom transport adapters for `@soybeanjs/fetch` to support platforms where native `fetch()` is unavailable (uniapp, WeChat mini-programs, React Native, etc.).

## When to Invoke

- User wants to support a new platform (uniapp, wx, React Native, etc.)
- User asks to implement a custom `FetchAdapter`
- User wants upload progress tracking via `createUploadProgressAdapter`
- User mentions "adapter" in the context of this library

## Core Concepts

The adapter is the **only platform-specific seam**. It is **pure transport** — it receives a finalised URL and request init, returns an `FetchAdapterResponse`, and never sees hooks, retry, timeout, or business logic.

### Adapter Signature

```ts
type FetchAdapter = (url: string, init: FetchAdapterInit) => Promise<FetchAdapterResponse>;
```

- `FetchAdapterInit` — mirrors native `RequestInit` (always has `method` + `headers`; plus `body`, `signal`, `credentials`, `duplex`, etc.).
- `FetchAdapterResponse` — the subset of native `Response` the library consumes: `status`, `statusText`, `headers`, `body`, and `text()/blob()/arrayBuffer()` readers.

### Key Files

- `src/adapter.ts` — `defaultAdapter` (native fetch), `createAdapterResponse`, `createUploadProgressAdapter`
- `src/types.ts` — `FetchAdapter`, `FetchAdapterInit`, `FetchAdapterResponse` types

## Implementation Pattern

Always use `createAdapterResponse` to wrap platform-specific responses. Body readers default to no-ops — override only what the platform provides.

```ts
import { createAdapterResponse, type FetchAdapter } from '@soybeanjs/fetch';

export const myPlatformAdapter: FetchAdapter = (url, init) => {
  return new Promise((resolve, reject) => {
    platform.request({
      url,
      method: init.method,
      header: Object.fromEntries(init.headers.entries()),
      data: init.body,
      success: res => {
        const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        resolve(
          createAdapterResponse({
            status: res.statusCode,
            statusText: res.errMsg ?? '',
            headers: new Headers(res.header as Record<string, string>),
            text: () => Promise.resolve(text),
            arrayBuffer: () =>
              Promise.resolve(res.data instanceof ArrayBuffer ? res.data : new TextEncoder().encode(text).buffer),
            blob: () => Promise.resolve(new Blob([text]))
          })
        );
      },
      fail: err => reject(new Error(err.errMsg))
    });
  });
};
```

## Usage

Pass the adapter via the `adapter` config field (per-instance or per-request):

```ts
import { createRequest } from '@soybeanjs/fetch';

const request = createRequest({
  baseURL: 'https://api.example.com',
  adapter: myPlatformAdapter
});
```

## Upload Progress

Native `fetch()` cannot report upload progress. `createUploadProgressAdapter(onUploadProgress)` picks the best mechanism:

- **Browser** → `XMLHttpRequest.upload.progress` (accurate total/progress)
- **Node.js / Bun / Deno / CF Workers** → `TransformStream` byte counting (accurate for known-size bodies; `lengthComputable: false` for FormData/ReadableStream)
- Returns `undefined` when neither is available

For per-request progress, set `onUploadProgress` in the config — `fetchCore` auto-switches to the progress adapter for that request (a custom `adapter` always takes precedence).

```ts
await request.post('/upload', formData, {
  onUploadProgress: ({ progress, loaded, lengthComputable }) => {
    if (lengthComputable) console.log(`Upload: ${progress}%`);
    else console.log(`Uploaded ${loaded} bytes`);
  }
});
```

## Hard Constraints (do not violate)

- The adapter is **transport-only**. Never implement retry, timeout, hooks, or business logic inside an adapter.
- Custom adapters must implement `(url: string, init: FetchAdapterInit) => Promise<FetchAdapterResponse>`.
- `fetchCore` delegates to the configured adapter — never call native `fetch` directly from `fetchCore`.
- Adapter types live in `types.ts`; `defaultAdapter` and `createAdapterResponse` live in `adapter.ts`.
- `204`/`205`/`304` have no body — the adapter must not error on these; `text()` should resolve to `''`.

## Common Pitfalls

- Forgetting to convert platform headers (often a plain object) into a `Headers` instance.
- Not handling `signal.aborted` — reject with an `AbortError` so retry logic can distinguish user aborts from network errors.
- When `onUploadProgress` is set **and** a custom `adapter` is also set, the progress callback is ignored — the custom adapter wins.
