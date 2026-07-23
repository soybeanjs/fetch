---
name: 'fetch-retry-timeout'
description: 'Configures retry and timeout behavior in fetchCore. Invoke when user wants to change retry count/delay/condition, set request timeouts, customize retryable status codes, or debug retry/abort behavior.'
---

# Fetch Retry & Timeout

This skill configures retry and timeout behavior in the transport layer (`fetchCore`). Both `$fetch` and `createRequest` share the same retry/timeout logic.

## When to Invoke

- User wants to configure retry count, delay, or condition
- User wants to set or change request timeouts
- User wants to customize which status codes trigger retries
- User wants to understand why a request is/isn't being retried
- User is debugging abort/timeout/retry behavior

## Key Files

- `src/fetch.ts` — `fetchCore` (retry loop + `createTimeoutSignal`), `mergeConfig`
- `src/options.ts` — `createRetryOptions` (normalizes retry options with defaults)
- `src/constant.ts` — `RETRY_STATUS_CODES` (default retryable statuses), `DEFAULT_TIMEOUT`

## RetryOptions

```ts
interface RetryOptions {
  retries?: number; // default 0 (no retries)
  retryDelay?: (retryCount: number, error: FetchError) => number; // default: linear 1s, 2s, 3s...
  retryCondition?: (error: FetchError) => boolean | Promise<boolean>; // default: see below
}
```

`createRetryOptions(retry)` normalizes to `Required<RetryOptions>`:

- `retries`: `retry?.retries ?? 0`
- `retryDelay`: `retry?.retryDelay ?? defaultRetryDelay` (linear backoff: `retryCount * 1000`)
- `retryCondition`: `retry?.retryCondition ?? defaultRetryCondition`

### Default Retry Condition

```ts
function defaultRetryCondition(error: FetchError): boolean {
  if (!error.response) return true; // network error (no response)
  if (error.response.status && RETRY_STATUS_CODES.has(error.response.status)) return true;
  return false;
}
```

`RETRY_STATUS_CODES` = `{ 408, 409, 425, 429, 500, 502, 503, 504 }`.

## Timeout

Set via `timeout` (ms). When unset, no timeout is applied.

`createTimeoutSignal(timeout, userSignal)` creates an `AbortController` that aborts after `timeout` ms. It tracks whether the timeout fired (vs. a user-initiated abort) via `isTimeout()`:

- **Timeout** → `FetchError` with `code: 'ERR_TIMEOUT'`
- **User abort** (`signal.aborted`) → `FetchError` with `code: 'ERR_ABORTED'`
- **Network error** → `FetchError` with `code: 'ERR_NETWORK'`

```ts
const { signal, isTimeout } = createTimeoutSignal(config.timeout, config.signal);
```

If the user provides their own `signal`, it is linked: when the user aborts, the timeout timer is cleared and the controller aborts with the user's reason.

## Retry Loop (in fetchCore)

```
for (attempt = 0; attempt <= retryOpts.retries; attempt++):
  try:
    adapter(url, requestInit) → FetchAdapterResponse
  catch err:
    isAbort = err.name === 'AbortError'
    timeout = isTimeout()
    error = new FetchError(..., code: timeout ? 'ERR_TIMEOUT' : isAbort ? 'ERR_ABORTED' : 'ERR_NETWORK')
    onRequestError(context)   ← transport hook
    if (isAbort && !timeout) throw error   ← user aborts are NEVER retried
    if (attempt < retries):
      shouldRetry = await retryCondition(error)
      if shouldRetry: sleep(retryDelay(attempt+1, error)); continue
    throw error

  ... parse response, build FetchResponse ...
  onResponse(context)

  if (!ignoreResponseError && !validateStatus(status)):
    error = new FetchError(..., code: 'ERR_BAD_RESPONSE', response)
    onResponseError(context)
    if (attempt < retries):
      shouldRetry = await retryCondition(error)
      if shouldRetry: sleep(retryDelay(attempt+1, error)); continue
    throw error

  return fetchResponse  ← success
```

## Examples

### Basic Retry

```ts
import { createRequest } from '@soybeanjs/fetch';

const request = createRequest(
  {
    baseURL: 'https://api.example.com',
    retry: {
      retries: 3,
      retryDelay: count => count * 1000, // 1s, 2s, 3s
      retryCondition: error => error.code === 'ERR_NETWORK' || (error.status ? error.status >= 500 : false)
    },
    timeout: 5000
  },
  { isBackendSuccess: r => r.data.code === 200 }
);
```

### Exponential Backoff

```ts
retry: {
  retries: 5,
  retryDelay: (count) => Math.pow(2, count) * 1000,  // 2s, 4s, 8s, 16s, 32s
  retryCondition: (error) => {
    if (!error.response) return true;                  // network error
    return [429, 500, 502, 503, 504].includes(error.status);
  }
}
```

### Per-Request Override

```ts
await request.get('/flaky-endpoint', {
  retry: { retries: 5, retryDelay: c => c * 500 },
  timeout: 10_000
});
```

### User Abort (never retried)

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 100);

try {
  await request.get('/slow', { signal: controller.signal });
} catch (err) {
  // err.code === 'ERR_ABORTED' — NOT retried, even if retry.retries > 0
}
```

## Changing Default Retryable Status Codes

Edit `RETRY_STATUS_CODES` in `src/constant.ts`:

```ts
export const RETRY_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
```

Or provide a custom `retryCondition` per request/instance that checks `error.status` against your own set.

## Hard Constraints

- **User aborts are never retried.** Only timeouts (which abort internally) and network errors / retryable status codes are retried.
- `retry.retries` defaults to `0` — retry is opt-in.
- `retryDelay` receives `(retryCount, error)` where `retryCount` starts at 1 for the first retry.
- The retry loop runs `attempt <= retries` times (0 = initial attempt, 1..retries = retries).

## Common Pitfalls

- Setting `retry.retries: 3` means up to **4** total attempts (1 initial + 3 retries).
- A timeout produces `ERR_TIMEOUT`, not `ERR_ABORTED` — even though it aborts internally. The `isTimeout()` flag distinguishes them so timeouts CAN be retried while user aborts cannot.
- `ignoreResponseError: true` skips `validateStatus` entirely, so error-status retries never trigger — the response is returned as success.
- `retryCondition` can be async — it's `await`ed in the loop.
