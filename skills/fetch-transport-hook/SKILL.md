---
name: 'fetch-transport-hook'
description: 'Adds ofetch-style transport hooks (onRequest/onResponse/onRequestError/onResponseError) to fetchCore/$fetch. Invoke when user wants to modify requests/responses at the HTTP transport level, add headers, or log.'
---

# Fetch Transport Hook

This skill adds transport-layer hooks to `fetchCore` / `$fetch` / `createFetch`. These hooks mirror the ofetch design — they receive a mutable `FetchContext` and run **before** any business logic (`RequestOption`).

## When to Invoke

- User wants ofetch-style hooks (`onRequest`, `onResponse`, `onRequestError`, `onResponseError`)
- User wants to modify request headers/URL at the transport level
- User wants to transform the parsed response body before it reaches business logic
- User is working with `$fetch` / `createFetch` (transport-only, no business hooks)
- User wants logging, tracing, or request/response inspection

## Two `onRequest` Signatures (critical)

The library intentionally keeps **two distinct `onRequest` signatures** — do not unify them:

| Layer     | API                                    | Signature                                                | Mode                                        |
| --------- | -------------------------------------- | -------------------------------------------------------- | ------------------------------------------- |
| Transport | `$fetch` / `createFetch` / `fetchCore` | `(context: FetchContext) => void \| Promise<void>`       | **Context-mode** (mutate `context.options`) |
| Business  | `createRequest` / `createFlatRequest`  | `(config) => ResolvedFetchRequestConfig \| Promise<...>` | **Return-value mode** (return new config)   |

For business hooks, use the `fetch-business-hook` skill instead.

## Key Files

- `src/fetch.ts` — `fetchCore` (calls transport hooks), `createFetchInstance` (business wrapper)
- `src/types.ts` — `FetchContext`, `FetchHook`, `FetchHookFn`, `FetchRequestConfig.onRequest/onResponse/...`
- `src/utils.ts` — `callHooks` (handles single function or array)

## FetchContext

```ts
interface FetchContext<T = any> {
  request: string; // the request URL
  options: ResolvedFetchRequestConfig; // mutate to change the request
  response?: FetchResponse<T>; // available in onResponse / onResponseError / onRequestError
  error?: Error; // available in onRequestError / onResponseError
}
```

Hooks mutate the context in place:

- Modify `context.options` (e.g. `context.options.headers.set(...)`) to change the request.
- Modify `context.response.data` to transform the response body.

## Hook Types

```ts
type FetchHookFn<C extends FetchContext = FetchContext> = (context: C) => void | Promise<void>;
type FetchHook<C extends FetchContext = FetchContext> = MaybeArray<FetchHookFn<C>>; // single or array
```

All four hooks accept a **single function or an array** of functions (executed in order):

```ts
interface FetchRequestConfig {
  onRequest?: FetchHook; // before request is sent
  onRequestError?: FetchHook; // request failed (network error, timeout, abort)
  onResponse?: FetchHook; // after response received and parsed
  onResponseError?: FetchHook; // response has error status (failed validateStatus)
}
```

## fetchCore Pipeline (where hooks fire)

```
1. onRequest(context)           ← transport hook (mutate context.options)
2. buildURL (resolveURL + paramsSerializer(query))
3. clone headers; transformRequest(body) if set
4. serializeBody (JSON.stringify for objects; pass-through for native BodyInit)
5. createTimeoutSignal(timeout, userSignal)
6. adapter selection (defaultAdapter, or upload-progress adapter)
7. Retry loop:
   - adapter(url, requestInit) → FetchAdapterResponse
   - on throw → build FetchError (ERR_TIMEOUT / ERR_ABORTED / ERR_NETWORK)
              → onRequestError(context)        ← transport hook
              → user aborts are NEVER retried
   - wrapDownloadProgress if onDownloadProgress
   - parseResponseBody (auto-detect from content-type when responseType: 'auto')
   - transformResponse(data) if set
   - build FetchResponse
   - onResponse(context)                   ← transport hook (mutate context.response.data)
   - validateStatus (skipped when ignoreResponseError: true)
   - on failure → onResponseError(context)  ← transport hook
                → retry or throw ERR_BAD_RESPONSE
8. return FetchResponse
```

## Example: $fetch with Transport Hooks

```ts
import { createFetch } from '@soybeanjs/fetch';

const $fetch = createFetch({
  baseURL: 'https://api.example.com',
  onRequest: [
    context => {
      // Mutate context.options to change the request
      context.options.headers.set('X-Trace-Id', crypto.randomUUID());
    },
    async context => {
      // Async hooks are supported
      const token = await getToken();
      context.options.headers.set('Authorization', `Bearer ${token}`);
    }
  ],
  onResponse: context => {
    // Mutate context.response.data to transform the parsed body
    if (context.response?.data) {
      context.response.data.receivedAt = Date.now();
    }
  },
  onRequestError: context => {
    console.error('Request failed:', context.error?.message);
  },
  onResponseError: context => {
    console.warn(`HTTP ${context.response?.status} on ${context.request}`);
  }
});

const data = await $fetch('/users/1');
```

## Example: $fetch.raw (full FetchResponse, no throw on error status)

```ts
const response = await $fetch.raw('/users/1');
console.log(response.status, response.data);
```

## $fetch API

`$fetch` / `createFetch` is the **transport-only** client (ofetch-compatible). It does **not** include business hooks (`transform`, `isBackendSuccess`, `onBackendFail`).

- `$fetch(url, options)` → parsed response body
- `$fetch.raw(url, options)` → full `FetchResponse` (does not throw on error status)
- `$fetch.native` → direct access to native `fetch`
- `$fetch.create(defaults)` → new instance with merged defaults

## Hard Constraints

- Transport `onRequest` is **context-mode** — it must NOT return a config. Mutate `context.options` instead.
- `fetchCore` is **transport-only**. It must never depend on `RequestOption` (business). Both `createFetchInstance` and `$fetch` reuse it.
- Hooks support arrays — use `callHooks` (from `utils.ts`) to invoke them; it handles both single and array forms.
- `ignoreResponseError: true` skips `validateStatus` AND does **not** call `onResponseError`.

## Common Pitfalls

- Returning a value from transport `onRequest` — it's ignored. The hook is context-mode; mutate `context.options`.
- Expecting `onResponseError` to fire when `ignoreResponseError: true` — it won't. `validateStatus` is skipped entirely.
- Confusing transport `onRequest` (context-mode) with business `onRequest` (return-value mode). They are deliberately different.
- User aborts (`signal.aborted`) are never retried, even if `retry` is configured. Only timeouts and network errors / retryable status codes are retried.
