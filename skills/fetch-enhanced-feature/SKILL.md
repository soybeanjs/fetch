---
name: 'fetch-enhanced-feature'
description: 'Adds enhanced features (cache, dedupe, concurrency, debounce, throttle, auth, schema, loading) to the fetch pipeline. Invoke when user wants caching, deduplication, concurrency limits, rate limiting, token auth, or response validation.'
---

# Fetch Enhanced Feature

This skill adds opt-in enhanced features to the fetch pipeline via `FetchRequestConfig` fields. All features are implemented in `createEnhancedFetch` (enhanced.ts) and wrap `fetchCore`.

## When to Invoke

- User wants request caching (`cache`)
- User wants in-flight request deduplication (`dedupe`)
- User wants concurrency limits (`concurrency`)
- User wants debounce / throttle (rate limiting)
- User wants automatic token attachment + refresh (`auth`)
- User wants response schema validation (`schema`)
- User wants loading state tracking or slow-request detection
- User wants to add a **new** enhanced feature (modify `enhanced.ts`)

## Key Files

- `src/enhanced.ts` — `createEnhancedFetch`, `createEnhancedState`, `clearCache`, `deleteCache`, `EnhancedState`
- `src/types.ts` — feature option types (`CacheOptions`, `DedupeOptions`, `ConcurrencyOptions`, `AuthOptions`, `DataSchema`, ...)
- `src/fetch.ts` — `createFetchInstance` wires `createEnhancedFetch(fetchCore, enhancedState)`

## Architecture

`createEnhancedFetch(fetchCore, state)` returns a function that wraps `fetchCore` with the feature pipeline:

```
createEnhancedFetch pipeline:
  cache lookup (GET within TTL) → return cached
    ↓ miss
  dedupe lookup (same key in-flight) → share promise
    ↓ miss
  throttle check (one per key per interval) → reject ERR_THROTTLED
    ↓ ok
  debounce wrap (same key within window cancelled + restarted) → reject ERR_DEBOUNCED
    ↓
  concurrency queue (FIFO when active >= maxConcurrent)
    ↓
  attachAuthHeaders (Bearer token from auth.getToken)
    ↓
  fetchCore(authedConfig)  ← transport
    ↓
  on auth.refreshOn (default 401): handleAuthRefresh (single-flight) → re-attach → refetch
    ↓
  schema validation (Standard Schema `~standard.validate()` or plain function; failure throws FetchError `code: ERR_SCHEMA`) — skipped when data is undefined/null
    ↓
  cache store
    ↓
  return FetchResponse
```

## Feature Reference

| Feature      | Config                                                           | Behaviour                                                                                                                                                                                                                      |
| ------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cache        | `cache: { ttl, methods?, max?, key? }` or `false`                | GET cached within TTL; LRU eviction at `max` (default 100); `false` skips cache for one request                                                                                                                                |
| Dedupe       | `dedupe: true \| { key? }`                                       | In-flight requests with the same key share one promise                                                                                                                                                                         |
| Concurrency  | `concurrency: { maxConcurrent }`                                 | Queues excess requests; FIFO                                                                                                                                                                                                   |
| Debounce     | `debounce: ms`                                                   | Same-key requests within the window are cancelled and restarted (rejects with `ERR_DEBOUNCED`)                                                                                                                                 |
| Throttle     | `throttle: ms`                                                   | One request per key per interval; rejects others with `ERR_THROTTLED`                                                                                                                                                          |
| Auth         | `auth: { getToken, refreshToken?, refreshOn?, onUnauthorized? }` | Auto-attaches `Bearer <token>`; on `refreshOn` (default 401) refreshes once (single-flight across concurrent 401s) and retries                                                                                                 |
| Schema       | `schema: StandardSchemaV1 \| ((data) => T)`                      | Validates/transforms parsed data via [Standard Schema](https://github.com/standard-schema/standard-schema) (`~standard.validate()`); failure throws `FetchError` (`code: ERR_SCHEMA`); skipped when data is `undefined`/`null` |
| Loading      | `onLoadingChange`, `onGlobalLoadingChange`                       | Per-request fires on every start/end; global fires only on 0↔1 transitions                                                                                                                                                     |
| Slow request | `slowThreshold`, `onSlowRequest`                                 | Fires once after the threshold; `0` disables                                                                                                                                                                                   |

## Key Generators (important)

- **Cache key** (default): `${METHOD}:${url}:${query}` — uses `serializeParams(config.query)`.
- **Dedupe key** (default): `${METHOD}:${url}:${query}:${JSON.stringify(body)}` — also includes the body. POST requests are deduped by body.

Both read `config.query` / `config.body` (the primary fields). Custom key generators can be provided via `cache.key` / `dedupe.key`.

## EnhancedState

Each fetch instance gets its own `EnhancedState` — all feature state is live and inspectable:

```ts
interface EnhancedState {
  cache: Map<string, CacheEntry>;
  dedupe: Map<string, Promise<FetchResponse>>;
  concurrency: { active: number; queue: (() => void)[] };
  loading: { count: number; entries: Map<string, LoadingEntry> };
  debounce: Map<string, DebounceEntry>;
  throttle: Map<string, number>;
  auth: { refreshing: Promise<string | null> | null };
  messages: MessageStack;
  [key: string]: any;
}
```

Access via `request.state` / `flatRequest.state` / `instance.enhancedState`. Manage cache imperatively: `instance.clearCache()`, `instance.deleteCache(key)`.

## Examples

### Cache + Dedupe

```ts
import { createRequest } from '@soybeanjs/fetch';

const request = createRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: r => r.data.code === 200 });

// Cache GET for 60s, dedupe in-flight
await request.get('/config', {
  cache: { ttl: 60_000, max: 50 },
  dedupe: true
});
```

### Concurrency + Throttle

```ts
await request.get('/search', {
  concurrency: { maxConcurrent: 5 },
  throttle: 1000 // one request per second per key
});
```

### Auth (auto token + refresh)

```ts
const request = createRequest(
  {
    baseURL: 'https://api.example.com',
    auth: {
      getToken: () => localStorage.getItem('token'),
      refreshToken: async () => {
        const res = await fetch('/refresh');
        const { token } = await res.json();
        localStorage.setItem('token', token);
        return token;
      },
      refreshOn: 401, // default
      onUnauthorized: () => router.push('/login')
    }
  },
  { isBackendSuccess: r => r.data.code === 200 }
);
```

### Schema Validation

Accepts any [Standard Schema](https://github.com/standard-schema/standard-schema) (Zod v4+, Valibot, ArkType, ...) or a plain validator function. On failure, throws `FetchError` with `code: ERR_SCHEMA` (message includes all issue paths).

```ts
import { z } from 'zod'; // Zod v4+ implements Standard Schema

const userSchema = z.object({ id: z.number(), name: z.string() });

const user = await request.get('/users/1', {
  schema: userSchema // validates via ~standard.validate(), returns result.value
});

// Plain function (lightweight escape hatch)
const user2 = await request.get('/users/1', {
  schema: data => ({ ...data, validated: true })
});
```

### Loading + Slow Request

```ts
await request.get('/heavy', {
  onLoadingChange: loading => spinner.toggle(loading),
  onGlobalLoadingChange: loading => globalSpinner.toggle(loading),
  slowThreshold: 3000,
  onSlowRequest: ({ url, method, duration }) => {
    console.warn(`Slow: ${method} ${url} took ${duration}ms`);
  }
});
```

## Adding a New Enhanced Feature

When adding a new feature to `enhanced.ts`:

1. Add the option type to `src/types.ts` (e.g. `MyFeatureOptions`) and the config field to `FetchRequestConfig`.
2. Add state to `EnhancedState` and initialize it in `createEnhancedState()`.
3. Add a resolver function (e.g. `resolveMyFeatureOptions(config)`) following the pattern of `resolveCacheOptions` / `resolveDedupeOptions`.
4. Insert the feature logic at the correct position in `createEnhancedFetch`'s pipeline (before or after `fetchCore` as appropriate).
5. If the feature has error semantics, add a new error code to `src/constant.ts` and throw a `FetchError` with that code (see `ERR_DEBOUNCED` / `ERR_THROTTLED` in `enhanced.ts`).
6. Expose any imperative management functions (like `clearCache`/`deleteCache`) on `FetchInstance` in `fetch.ts`.

## Hard Constraints

- Enhanced features are **opt-in** — never enable a feature by default that changes request semantics.
- Auth refresh is **single-flight** — concurrent 401s share one `refreshToken()` call.
- Schema validation is skipped when data is `undefined`/`null`.
- Cache/dedupe key generators read `config.query`/`config.body` (primary fields), not legacy aliases.

## Common Pitfalls

- `cache: false` skips cache for a **single** request (per-request override), not globally.
- Debounce rejects the cancelled request with `ERR_DEBOUNCED` — callers must handle this error.
- Throttle rejects excess requests with `ERR_THROTTLED` — only one request per key per interval succeeds.
- `onGlobalLoadingChange` fires only on 0↔1 transitions; `onLoadingChange` fires for every request start/end.
- Auth refresh retries **once**. If the retried request still gets 401, `onUnauthorized` is called (no infinite refresh loop).
