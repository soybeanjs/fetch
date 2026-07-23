---
name: 'fetch-business-hook'
description: 'Adds business-logic hooks (transform, isBackendSuccess, onBackendFail, onError, onRequest) to createRequest/createFlatRequest. Invoke when user wants business response handling, backend error recovery, or data transformation.'
---

# Fetch Business Hook

This skill adds business-logic hooks via `RequestOption` — the second parameter of `createRequest` / `createFlatRequest`. Business hooks run **after** the transport layer and operate on parsed `FetchResponse` objects.

## When to Invoke

- User wants to add `transform`, `isBackendSuccess`, `onBackendFail`, `onError`, or business-level `onRequest`
- User wants to unwrap a response envelope (e.g. `{ code, data, message }` → `data`)
- User wants backend-error recovery (e.g. refresh token on backend failure, retry once)
- User asks about `createRequest` vs `createFlatRequest` business options

## Two-Layer Architecture (critical)

The library deliberately separates **transport** from **business logic**. Never collapse the two layers:

- **Transport layer** (`fetchCore`, `$fetch`): hooks are context-mode `(context) => void`. Use the `fetch-transport-hook` skill instead.
- **Business layer** (`createRequest`/`createFlatRequest`): hooks are in `RequestOption`. This skill.

`createRequest` must keep the **dual-parameter design** (`config` for transport, `options` for business). Do not merge it into `createFetch` — doing so breaks the `onBackendFail` retry chain by skipping `opts.onRequest` and `processResponse`.

## Key Files

- `src/core.ts` — `createRequest`, `createFlatRequest` (`createCommonRequest` is the internal foundation, not exported from the barrel)
- `src/fetch.ts` — `processResponse` (runs `isBackendSuccess` → `onBackendFail` → throw `BackendError`)
- `src/options.ts` — `createDefaultOptions` (applies default `transform` + `backendErrorMsg`)
- `src/types.ts` — `RequestOption` interface

## RequestOption Interface

```ts
interface RequestOption<ResponseData = any, ApiData = ResponseData> {
  transform?: (response: FetchResponse<ResponseData>) => ApiData | Promise<ApiData>;
  onRequest?: (config: ResolvedFetchRequestConfig) => ResolvedFetchRequestConfig | Promise<ResolvedFetchRequestConfig>;
  isBackendSuccess: (response: FetchResponse<ResponseData>) => boolean;
  backendErrorMsg?: string;
  onBackendFail?: (
    response: FetchResponse<ResponseData>,
    instance: FetchInstance
  ) => Promise<FetchResponse | null | void>;
  onError?: (error: FetchError<ResponseData>) => void | Promise<void>;
}
```

### Hook Details

- **`transform`** — Optional. Defaults to `response => response.data` (applied by `createDefaultOptions`). Unwrap envelopes here.
- **`onRequest`** — **Return-value mode**: must return the (possibly mutated) config. Use `config.headers.set(key, value)` to add headers (headers is a native `Headers` instance). This is **distinct** from transport-layer `onRequest` which is context-mode.
- **`isBackendSuccess`** — **Required.** Checks the backend business code (e.g. `response.data.code === 200`), not HTTP status.
- **`onBackendFail`** — Recovery hook. Return a new `FetchResponse` to retry; the new response is re-validated by `isBackendSuccess` but `onBackendFail` is **NOT** re-called (prevents infinite loops). Call `instance(config)` to re-fetch.
- **`onError`** — Called on any failure (HTTP error or BackendError), then the error is re-thrown. For `createFlatRequest`, the error is captured into `{ data: null, error }` instead.

## Pipeline

```
1. mergeConfig(defaults, userConfig) → ResolvedFetchRequestConfig
2. Business opts.onRequest(config) — return-value mode
3. createEnhancedFetch → fetchCore (transport)
4. processResponse(response, opts, instance, allowBackendFail=true):
   - coerceBinaryToJsonResponse (blob/arraybuffer → JSON when server returned application/json)
   - non-JSON response types skip business logic
   - opts.isBackendSuccess(response) → success
   - else: opts.onBackendFail(response, instance) → may return new FetchResponse to retry (re-validated, onBackendFail NOT re-called)
   - else: throw BackendError (code === 'BACKEND_ERROR')
5. opts.onError(error) on failure, then re-throw (or capture for flat)
```

## Example: Standard Request with Envelope

```ts
import { createRequest } from '@soybeanjs/fetch';

const request = createRequest(
  { baseURL: 'https://api.example.com' },
  {
    transform: response => response.data.data,
    isBackendSuccess: response => response.data.code === 200,
    onRequest: config => {
      config.headers.set('Authorization', `Bearer ${token}`);
      return config;
    },
    onBackendFail: async (response, instance) => {
      // e.g. backend returned code 401 → refresh token and retry once
      if (response.data.code === 401) {
        const newToken = await refreshToken();
        token = newToken;
        return instance(response.config); // re-fetch; goes through full pipeline
      }
      return null; // give up → throws BackendError
    },
    onError: error => {
      console.error('Request failed:', error.message);
    }
  }
);

// Throws on error, returns transformed data on success
const data = await request.get('/users/1');
```

## Example: Flat Request (never throws)

```ts
import { createFlatRequest } from '@soybeanjs/fetch';

const request = createFlatRequest(
  { baseURL: 'https://api.example.com' },
  {
    isBackendSuccess: response => response.data.code === 200,
    transform: response => response.data.data
  }
);

const { data, error } = await request.get('/users/1');
if (error) {
  console.error(error.message);
} else {
  console.log(data);
}
```

## createRequest vs createFlatRequest

| Feature        | `createRequest`        | `createFlatRequest`                            |
| -------------- | ---------------------- | ---------------------------------------------- |
| On error       | Throws                 | Resolves to `{ data: null, error, response? }` |
| Return value   | Transformed `ApiData`  | `{ data, error, response }`                    |
| `onError` hook | Called, then re-throws | Called, then captured into `error`             |

Both expose `.get/.post/.put/.delete/.patch`, `.raw()` (bypasses `transform`), `.state` (EnhancedState), and `.instance` (underlying FetchInstance).

## Hard Constraints

- `onRequest` keeps **distinct signatures**: context-mode for transport (`createFetch`), return-value mode for business (`createRequest`). Do not unify them.
- `onBackendFail` retry is **single-shot**. The recovered response is re-validated by `isBackendSuccess`, but `onBackendFail` will not run again.
- `transform` has a default (`response => response.data`) — it can be omitted at call sites.
- Non-JSON response types (`blob`/`arraybuffer`/`stream`/`text`) skip `isBackendSuccess`/`onBackendFail`/`transform` — they return `FileResponseData` or raw data directly.

## Common Pitfalls

- Forgetting to `return config` in business `onRequest` (return-value mode, unlike transport context-mode).
- Calling `instance(config)` inside `onBackendFail` re-runs the **full** pipeline including `onRequest` and `processResponse` — but `onBackendFail` itself won't re-trigger.
- `isBackendSuccess` checks the **business** code, not HTTP status. HTTP success (2xx) with a business error code is a "backend failure".
