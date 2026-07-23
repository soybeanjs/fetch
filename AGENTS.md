# AGENTS.md

Guidance for AI agents (and humans) working on `@soybeanjs/fetch`.

`@soybeanjs/fetch` is a lightweight, type-safe HTTP request library built on the native `fetch` API. It is the fetch-based successor to `@soybeanjs/request`, with an ofetch-compatible transport layer (`$fetch`) and a pluggable adapter system for non-browser platforms (uniapp, WeChat mini-programs, React Native).

---

## 1. Project Layout

```
src/
├── constant.ts        # Shared constants (status codes, error flags, file types)
├── types.ts           # All public types & interfaces (single source of truth for types)
├── error.ts           # FetchError + BackendError classes
├── message.ts        # MessageStack — request message deduplication
├── shared.ts         # HTTP utilities (isHttpSuccess, content-disposition, binary→JSON coercion, downloadFile)
├── utils.ts          # Low-level utilities (URL joining, query serialization, headers, hooks, response detection)
├── options.ts        # Default options/config/retry builders
├── adapter.ts        # Pluggable transport adapters (default native fetch, upload-progress adapters)
├── enhanced.ts       # Enhanced features (cache, dedupe, concurrency, loading, debounce, throttle, auth, schema)
├── fetch.ts          # Core transport: fetchCore, createFetchInstance, mergeConfig, $fetch / createFetch
├── core.ts           # Business-logic layer: createRequest, createFlatRequest, createCommonRequest
├── openapi.ts        # Type-safe OpenAPI client generators (createTypedClient, createFlatTypedClient)
└── index.ts          # Public re-exports

test/
├── setup.ts          # Global vitest setup — stubs global fetch with a mock
├── helpers.ts        # Mock builders (createMockAdapterResponse, createMockFetchResponse, mockFetch, setFetchResponse...)
└── *.test.ts         # Per-module test files
```

---

## 2. Architecture: Two-Layer Design

The library deliberately separates **transport** from **business logic**. Never collapse the two layers — `createRequest` and `$fetch` share `fetchCore` for transport, but each adds its own pipeline.

```
                          ┌─────────────────────────────────────────────┐
   User code              │  createRequest / createFlatRequest          │
                          │  (business: transform, isBackendSuccess,   │
                          │   onBackendFail, onError, onRequest[opts])  │
                          └──────────────────┬──────────────────────────┘
                                             │ createFetchInstance (fetch.ts)
                                             ▼
                          ┌─────────────────────────────────────────────┐
                          │  createEnhancedFetch (enhanced.ts)          │
                          │  cache · dedupe · concurrency · loading      │
                          │  debounce · throttle · auth · schema         │
                          └──────────────────┬──────────────────────────┘
                                             │
                          ┌──────────────────▼──────────────────────────┐
   $fetch / createFetch ──────────────────────┤  fetchCore (fetch.ts)  │
   (transport-only, ofetch-style)            │  transport hooks       │
                                             │  (onRequest/onResponse/ │
                                             │   onRequestError/       │
                                             │   onResponseError)      │
                                             │  retry · timeout · body  │
                                             │  serialization · parse   │
                                             │  validateStatus          │
                                             └──────────┬──────────────┘
                                                        │ adapter (FetchAdapter)
                                                        ▼
                                             native fetch / uniapp / XHR / ...
```

### Key invariants

- **`fetchCore` is transport-only.** It must never depend on `RequestOption` (business). Both `createFetchInstance` and `$fetch` reuse it.
- **`createFetchInstance` wraps `fetchCore` with `opts.onRequest` + `processResponse`** (business hooks). Merging `createRequest` into `createFetch` would break the `onBackendFail` retry chain because the business pipeline (`opts.onRequest` + `processResponse`) would be skipped.
- **Two `onRequest` signatures, intentionally distinct:**
  - Transport-layer (`FetchRequestConfig.onRequest`): context-mode — `(context: FetchContext) => void | Promise<void>`. Mirrors ofetch.
  - Business-layer (`RequestOption.onRequest`): return-value mode — `(config) => ResolvedFetchRequestConfig | Promise<...>`. Mirrors `@soybeanjs/request`.
- **Adapter is pure transport.** Custom adapters implement `(url, init) => Promise<FetchAdapterResponse>`. They never see hooks, retry, or business logic.

---

## 3. Public API Surface

| Export                                                                    | Purpose                                                                            |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `createRequest(config?, options?)`                                        | Business request instance — **throws** on error; returns transformed `ApiData`.    |
| `createFlatRequest(config?, options?)`                                    | Business request instance — **never throws**; returns `{ data, error, response }`. |
| `createCommonRequest(config?, options?)`                                  | Internal foundation shared by the two above.                                       |
| `$fetch` / `createFetch(defaults?)`                                       | ofetch-compatible transport client. `.raw()`, `.native`, `.create()`.              |
| `fetchCore(config)`                                                       | Low-level transport (rarely called directly).                                      |
| `defaultAdapter`, `createAdapterResponse`, `createUploadProgressAdapter`  | Adapter toolkit.                                                                   |
| `createEnhancedFetch`, `createEnhancedState`, `clearCache`, `deleteCache` | Enhanced-feature primitives.                                                       |
| `MessageStack`                                                            | Request message dedup stack (used in `onError`).                                   |
| `createTypedClient`, `createFlatTypedClient`                              | OpenAPI type-safe clients.                                                         |
| `FetchError`, `BackendError`, `BACKEND_ERROR_FLAG`                        | Error model.                                                                       |
| `parseContentDisposition`, `downloadFile`                                 | File helpers.                                                                      |

### Convenience methods

`RequestInstance` / `FlatRequestInstance` expose `.get/.post/.put/.delete/.patch` and `.raw()`. `.state` exposes the `EnhancedState` (cache, loading, messages, ...). `.instance` exposes the underlying `FetchInstance` for advanced use.

---

## 4. Type System Essentials

- **`FetchRequestConfig<R extends ResponseType = 'json'>`** — the AxiosRequestConfig equivalent. `R` drives `MappedType<R, T>` so `responseType: 'blob'` returns `FileResponseData<Blob>`.
  - **Primary body/query API**: `body?: BodyInit | Record<string, any>` (auto-serialized to JSON for plain objects) and `query?: Record<string, any>` (appended to URL via `paramsSerializer`).
- **`ResolvedFetchRequestConfig`** — every field is present (defaults applied). `fetchCore`, `mergeConfig`, and `processResponse` only ever receive this.
- **`FetchAdapterResponse`** — the subset of native `Response` the library consumes. Custom adapters only need to implement this; they do **not** need real `Response` objects.
- **`FetchContext`** — passed to transport-layer hooks. Mutating `context.options` mutates the request; mutating `context.response.data` transforms the response body.
- **`RequestOption<ResponseData, ApiData>`** — business hooks. `transform` has a default (`response => response.data`) applied by `createDefaultOptions`, so it can be omitted at call sites.
- **`MappedType<R, JsonType>`** — maps `responseType` to the runtime return type. File types become `FileResponseData<...>`.
- OpenAPI types in `openapi.ts` (`PathsWithMethod`, `SuccessResponse`, `OperationRequestBodyContent`, ...) infer paths/bodies/responses from a generated `paths` type.

---

## 5. Request Pipeline (end-to-end)

### `createRequest` pipeline

1. `mergeConfig(resolvedDefaults, userConfig)` → `ResolvedFetchRequestConfig`
2. Business `opts.onRequest(config)` — may return a new config (return-value mode)
3. `createEnhancedFetch`:
   - cache lookup → dedupe → throttle check → debounce wrap → concurrency queue
   - `attachAuthHeaders` (Bearer token from `auth.getToken`)
   - **`fetchCore(authedConfig)`** (transport — see below)
   - on `auth.refreshOn` (default 401): `handleAuthRefresh` (single-flight) → re-attach token → refetch
   - `schema` validation (Zod-like `.parse` or function)
   - cache store
4. `processResponse(response, opts, instance, allowBackendFail)`:
   - `coerceBinaryToJsonResponse` (blob/arraybuffer → JSON when server returned `application/json`)
   - non-JSON response types skip business logic
   - `opts.isBackendSuccess(response)` → success
   - else: `opts.onBackendFail(response, instance)` — may return a new `FetchResponse` to retry (re-validated, but `onBackendFail` is **not** re-called to prevent loops)
   - else: throw `BackendError`
5. `opts.onError(error)` on failure, then re-throw (or, for flat, capture into `{ data: null, error }`)

### `fetchCore` pipeline (transport)

1. Transport `onRequest` hook(s) — context-mode, supports arrays
2. `buildURL` — `resolveURL(url, baseURL)` + `paramsSerializer(query)`
3. Clone headers; `transformRequest(body, config)` if set
4. `serializeBody` — pass-through for native body types; JSON.stringify for JSON; `duplex: 'half'` for streams
5. `createTimeoutSignal(timeout, userSignal)` — aborts with `ERR_TIMEOUT` flag
6. Adapter selection: `config.adapter ?? defaultAdapter`; auto-switch to `createUploadProgressAdapter` when `onUploadProgress` is set and no custom adapter
7. Retry loop (`attempt <= retryOpts.retries`):
   - call `adapter(url, requestInit)` → `FetchAdapterResponse`
   - on throw: build `FetchError` (`ERR_TIMEOUT` / `ERR_ABORTED` / `ERR_NETWORK`), call `onRequestError`; **user aborts are never retried**
   - `wrapDownloadProgress` if `onDownloadProgress`
   - `parseResponseBody` (auto-detect from content-type when `responseType: 'auto'`)
   - `transformResponse(data, config)` if set
   - build `FetchResponse`, call `onResponse`
   - `validateStatus` (skipped when `ignoreResponseError: true`); on failure call `onResponseError`, then retry or throw `ERR_BAD_RESPONSE`

---

## 6. Adapter System

The adapter is the only platform-specific seam. It must:

- accept `(url: string, init: FetchAdapterInit) => Promise<FetchAdapterResponse>`
- return an object with `status`, `statusText`, `headers`, `body`, and `text()/blob()/arrayBuffer()` readers
- **not** implement retry, timeout, hooks, or business logic — those are the library's job

Use `createAdapterResponse({ status, statusText, headers, body, text, blob, arrayBuffer })` to wrap platform responses. Body readers default to empty no-ops — override only what the platform provides.

### Upload progress

Native `fetch()` cannot report upload progress. `createUploadProgressAdapter(onUploadProgress)` picks the best available mechanism:

- Browser → `XMLHttpRequest.upload.progress` (accurate `total`/`progress`)
- Node.js / Bun / Deno / CF Workers → `TransformStream` byte counting (accurate for `Blob`/`ArrayBuffer`/`string`; `lengthComputable: false` for `FormData`/`ReadableStream`)
- Returns `undefined` when neither is available

When `onUploadProgress` is set per-request **and** no custom `adapter` is set, `fetchCore` auto-switches to the progress adapter for that request. A custom `adapter` always takes precedence (the per-request progress is ignored).

---

## 7. Enhanced Features (`enhanced.ts`)

Each feature is opt-in via `FetchRequestConfig`:

| Feature      | Config                                                           | Behaviour                                                                                                                      |
| ------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Cache        | `cache: { ttl, methods?, max?, key? }` or `false`                | GET cached within TTL; LRU eviction at `max` (default 100); `false` skips cache for one request                                |
| Dedupe       | `dedupe: true \| { key? }`                                       | In-flight requests with the same key share one promise                                                                         |
| Concurrency  | `concurrency: { maxConcurrent }`                                 | Queues excess requests; FIFO                                                                                                   |
| Debounce     | `debounce: ms`                                                   | Same-key requests within the window are cancelled and restarted (rejects with `ERR_DEBOUNCED`)                                 |
| Throttle     | `throttle: ms`                                                   | One request per key per interval; rejects others with `ERR_THROTTLED`                                                          |
| Auth         | `auth: { getToken, refreshToken?, refreshOn?, onUnauthorized? }` | Auto-attaches `Bearer <token>`; on `refreshOn` (default 401) refreshes once (single-flight across concurrent 401s) and retries |
| Schema       | `schema: ZodSchema \| ((data) => T)`                             | Validates/transforms parsed data; skipped when data is `undefined`/`null`                                                      |
| Loading      | `onLoadingChange`, `onGlobalLoadingChange`                       | Per-request fires on every start/end; global fires only on 0↔1 transitions                                                     |
| Slow request | `slowThreshold`, `onSlowRequest`                                 | Fires once after the threshold; `0` disables                                                                                   |

`state.cache` / `state.dedupe` / `state.concurrency` / `state.loading` / `state.debounce` / `state.throttle` / `state.auth` / `state.messages` are all live and inspectable. `instance.clearCache()` / `instance.deleteCache(key)` manage cache imperatively.

---

## 8. Error Model

- `FetchError` — base error. Carries `code`, `config`, `request`, `response`, `cause`. Getters: `status`/`statusCode`, `statusText`/`statusMessage`, `data`.
- `BackendError extends FetchError` — thrown when `isBackendSuccess` returns false and `onBackendFail` does not recover. `code === BACKEND_ERROR_FLAG` (`'BACKEND_ERROR'`).
- Codes: `ERR_NETWORK`, `ERR_TIMEOUT`, `ERR_ABORTED`, `ERR_BAD_RESPONSE`, `ERR_DEBOUNCED`, `ERR_THROTTLED`, `BACKEND_ERROR`.

---

## 9. OpenAPI Layer (`openapi.ts`)

`createTypedClient<Paths, Prefix, Field>(requestInstance, prefix?)` wraps a `RequestInstance` and exposes typed HTTP verbs inferred from a generated `paths` type. `createFlatTypedClient` does the same for `FlatRequestInstance` (never-throws semantics).

The options use a **flattened API** — each OpenAPI parameter category is a top-level field, aligned with `FetchRequestConfig`:

```ts
client.get('/users/{id}', {
  pathParams: { id: 42 },         // path params — replaces {id} in the URL (required when path params exist)
  query: { include: 'posts' },     // query params — appended to URL (optional)
  headers: { 'x-trace': 'abc' },  // header params (optional)
  body: { ... },                  // request body (required/optional per spec)
  timeout: 5000                   // passthrough FetchRequestConfig fields
})
```

- `pathParams` replaces `{id}` placeholders — missing required params throw.
- `query`, `headers`, and `body` are passed through directly to the fetch config.
- `Field` extracts a single field from the success response (e.g. `'data'` to unwrap an envelope).

---

## 10. Build & Tooling

- **Package manager:** `pnpm` (workspace). `packageManager: pnpm@11.15.1`.
- **TypeScript:** `strict` + `strictNullChecks` + `noUnusedLocals` + `isolatedModules`. `moduleResolution: bundler`. `target: ESNext`, `lib: ["DOM", "ESNext"]`.
- **Build:** `pnpm build` → `vp pack` (vite-plus).
- **Lint:** `pnpm lint` → `vp lint --fix`.
- **Typecheck:** `pnpm typecheck` → `tsc --noEmit --skipLibCheck`. Must be zero errors.
- **Tests:** `pnpm test` → `vitest run`. `pnpm test:watch` / `pnpm test:coverage`.
- **No runtime dependencies.** Everything is built on native `fetch`, `Headers`, `AbortController`, `TransformStream`, `XMLHttpRequest` (browser only).

### tsconfig gotchas

- `noUnusedLocals` is on — every import and variable must be used.
- `strictNullChecks` is on — `headers` may be `undefined`, flat `data` may be `null`; tests must narrow.
- Test files are type-checked by `tsc` because `tsconfig.json` only excludes `node_modules`/`dist`. Keep tests type-clean.

---

## 11. Testing Conventions

- **Global fetch mock** is installed in `test/setup.ts` via `vi.stubGlobal('fetch', mockFetch)`. It is reset before each test and restored after.
- **`setFetchResponse(options)`** sets the default response for all subsequent `fetch` calls. **`setFetchImplementation(fn)`** controls the response per call (for retry/timeout/abort tests).
- **`getFetchCalls()`** returns the recorded `{ url, init }` pairs; `getFetchCallCount()` the count.
- **`createMockAdapterResponse(...)`** builds a `FetchAdapterResponse`; **`createMockFetchResponse(...)`** builds a native `Response`.
- For retry/timeout tests that use `vi.useFakeTimers()`, always pair with `vi.useRealTimers()` in `afterEach` (or at the end of the test) — `setup.ts` also restores real timers as a safety net.
- For tests that exercise adapter/upload-progress, drain the body stream (`drainStream` in `adapter.test.ts`) so progress callbacks fire deterministically.
- Tests must **pass `pnpm typecheck` with zero errors** in addition to `pnpm test`.

---

## 12. Hard Constraints (do not violate)

- The adapter API is a **pure transport abstraction**. It only handles HTTP send/response return.
- Custom adapters must implement `FetchAdapter = (url: string, init: FetchAdapterInit) => Promise<FetchAdapterResponse>`.
- `createRequest` must keep the **dual-parameter design** (`config` for transport, `options` for business). Do not merge it into `createFetch`.
- `onRequest` hooks keep **distinct signatures**: context-mode for transport (`createFetch`), return-value mode for business (`createRequest`).
- Adapter types (`FetchAdapterResponse`, `FetchAdapterInit`, `FetchAdapter`) live in `types.ts`. `defaultAdapter` and `createAdapterResponse` live in `adapter.ts`.
- Core fetch logic delegates to the configured adapter — never call native `fetch` directly from `fetchCore`.
- `fetchCore` is the **shared transport** for both `createFetchInstance` (business) and `createFetch` (`$fetch`).

---

## 13. Common Pitfalls

- **`204`/`205`/`304` have no body.** `Response` constructor rejects a body for these statuses; use `new Response(null, ...)` (see `createMockFetchResponse`).
- **`responseType: 'auto'`** detects the type from `content-type`. Setting `parseResponse` forces JSON parsing.
- **User aborts are not retried.** Only timeouts (which abort internally) and network errors / retryable status codes are retried.
- **`onBackendFail` retry is single-shot.** The recovered response is re-validated by `isBackendSuccess`, but `onBackendFail` will not run again — prevents infinite loops.
- **Auth refresh is single-flight.** Concurrent 401s share one `refreshToken()` call.
- **Cache key** defaults to `METHOD:url:query`. **Dedupe key** also includes `JSON.stringify(body)`. POST requests are deduped by body.
- **`transform` has a default** (`response => response.data`) applied by `createDefaultOptions`; it can be omitted when creating a request instance.
- **`mergeHeaders`** — later sources override earlier ones; `undefined` values in records are skipped.

---

## 14. Where to Look First

| You want to...                | Start in                                                                |
| ----------------------------- | ----------------------------------------------------------------------- |
| Add a business hook           | `core.ts` (`RequestOption`) and `fetch.ts` (`processResponse`)          |
| Add a transport hook          | `fetch.ts` (`fetchCore`) and `types.ts` (`FetchContext`/`FetchHook`)    |
| Support a new platform        | `adapter.ts` — implement `FetchAdapter`                                 |
| Add an enhanced feature       | `enhanced.ts` (`createEnhancedFetch`)                                   |
| Change retry/timeout behavior | `fetch.ts` (`fetchCore`) + `options.ts` (`createRetryOptions`)          |
| Change response parsing       | `fetch.ts` (`parseResponseBody`, `serializeBody`)                       |
| Extend OpenAPI typing         | `openapi.ts`                                                            |
| Add a new error code          | `error.ts` + `constant.ts` + the throw site in `fetch.ts`/`enhanced.ts` |
