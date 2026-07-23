---
name: 'fetch-error-code'
description: 'Adds custom error codes and handles FetchError/BackendError in @soybeanjs/fetch. Invoke when user wants to add a new error code, customize error handling, inspect error fields, or work with the error model.'
---

# Fetch Error Code

This skill works with the error model in `@soybeanjs/fetch` — adding new error codes, handling `FetchError`/`BackendError`, and inspecting error fields.

## When to Invoke

- User wants to add a new error code
- User wants to customize error handling
- User wants to inspect error fields (status, code, data, response)
- User asks about `FetchError` vs `BackendError`
- User wants to handle specific error codes (ERR_NETWORK, ERR_TIMEOUT, ...)

## Key Files

- `src/error.ts` — `FetchError` class, `BackendError` class
- `src/constant.ts` — `BACKEND_ERROR_FLAG` (`'BACKEND_ERROR'`), `ERR_SCHEMA` (`'ERR_SCHEMA'`)
- `src/fetch.ts` — throw sites for `ERR_TIMEOUT`, `ERR_ABORTED`, `ERR_NETWORK`, `ERR_BAD_RESPONSE`
- `src/enhanced.ts` — throw sites for `ERR_DEBOUNCED`, `ERR_THROTTLED`, `ERR_SCHEMA` (schema validation failure)

## Error Model

### FetchError (base)

```ts
class FetchError<T = any> extends Error implements IFetchError<T> {
  code?: string;
  config?: FetchRequestConfig;
  request?: Request;
  response?: FetchResponse<T>;

  constructor(
    message: string,
    options?: {
      code?: string;
      config?: FetchRequestConfig;
      request?: Request;
      response?: FetchResponse<T>;
      cause?: unknown;
    }
  );

  get status(): number | undefined; // response?.status
  get statusCode(): number | undefined; // alias for status (Node.js compat)
  get statusText(): string | undefined; // response?.statusText
  get statusMessage(): string | undefined; // alias for statusText
  get data(): T | undefined; // response?.data
}
```

### BackendError (extends FetchError)

Thrown when `isBackendSuccess` returns false **and** `onBackendFail` does not recover:

```ts
class BackendError<ResponseData = any> extends FetchError<ResponseData> {
  constructor(message: string, response: FetchResponse<ResponseData>);
  // code is always BACKEND_ERROR_FLAG ('BACKEND_ERROR')
  // name is 'BackendError'
}
```

Detect via `error instanceof BackendError` or `error.code === BACKEND_ERROR_FLAG`.

## Error Codes

| Code               | Thrown in         | When                                                      |
| ------------------ | ----------------- | --------------------------------------------------------- |
| `ERR_NETWORK`      | `fetchCore`       | Network error (adapter threw, not a timeout/abort)        |
| `ERR_TIMEOUT`      | `fetchCore`       | Request timeout (`timeout` ms exceeded)                   |
| `ERR_ABORTED`      | `fetchCore`       | User-initiated abort (`signal.aborted`)                   |
| `ERR_BAD_RESPONSE` | `fetchCore`       | Response status failed `validateStatus` (and not ignored) |
| `ERR_DEBOUNCED`    | `enhanced.ts`     | Request cancelled by debounce (same key within window)    |
| `ERR_THROTTLED`    | `enhanced.ts`     | Request rejected by throttle (one per key per interval)   |
| `ERR_SCHEMA`       | `enhanced.ts`     | Standard Schema validation failed (truthy `issues`)       |
| `BACKEND_ERROR`    | `processResponse` | `isBackendSuccess` false + `onBackendFail` didn't recover |

## Handling Errors

### With createRequest (throws)

```ts
import { createRequest, FetchError, BackendError } from '@soybeanjs/fetch';

const request = createRequest(/* ... */);

try {
  const data = await request.get('/users/1');
} catch (err) {
  if (err instanceof BackendError) {
    // Business logic failure (e.g. backend returned code !== 200)
    console.error('Backend error:', err.message, 'data:', err.data);
  } else if (err instanceof FetchError) {
    switch (err.code) {
      case 'ERR_TIMEOUT':
        console.error('Timed out');
        break;
      case 'ERR_ABORTED':
        console.error('Aborted by user');
        break;
      case 'ERR_NETWORK':
        console.error('Network error');
        break;
      case 'ERR_BAD_RESPONSE':
        console.error(`HTTP ${err.status}`);
        break;
      case 'ERR_DEBOUNCED':
        console.log('Debounced (ignore)');
        break;
      case 'ERR_THROTTLED':
        console.log('Throttled (retry later)');
        break;
      case 'ERR_SCHEMA':
        console.error('Schema validation failed:', err.message);
        break;
    }
  }
}
```

### With createFlatRequest (never throws)

```ts
import { createFlatRequest } from '@soybeanjs/fetch';

const request = createFlatRequest(/* ... */);

const { data, error, response } = await request.get('/users/1');
if (error) {
  console.error(error.code, error.message);
  if (error.response) {
    console.error('Status:', error.response.status);
  }
}
```

Note: `response` may be `undefined` for network errors where no response was received.

## Adding a New Error Code

1. **Define the code constant** in `src/constant.ts`:

```ts
export const MY_ERROR_FLAG = 'MY_CUSTOM_ERROR';
```

2. **Throw a `FetchError`** with the code at the appropriate site:
   - Transport-level errors → `src/fetch.ts` (`fetchCore`)
   - Enhanced-feature errors → `src/enhanced.ts` (`createEnhancedFetch`)
   - Business-level errors → `src/fetch.ts` (`processResponse`) — use `BackendError` if it's a backend failure

```ts
throw new FetchError('Descriptive message', {
  code: MY_ERROR_FLAG,
  config,
  response, // include when a response exists
  cause: originalError // include when wrapping another error
});
```

3. **Document the code** in the error code table (AGENTS.md section 8) and update this skill if needed.

4. **Add tests** following project conventions (see `fetch-error-code` throw sites in `test/fetch.test.ts`, `test/enhanced.test.ts`).

## Inspecting Errors

```ts
const err: FetchError = /* ... */;

err.message;      // human-readable message
err.code;         // error code string (e.g. 'ERR_TIMEOUT')
err.status;       // HTTP status (response?.status) — undefined if no response
err.statusCode;   // alias for status (Node.js compat)
err.statusText;   // HTTP status text
err.statusMessage;// alias for statusText
err.data;         // parsed response body (response?.data) — undefined if no response
err.response;     // full FetchResponse — undefined for network errors
err.config;       // the resolved request config
err.request;      // native Request object (if available)
err.cause;        // original error (when wrapping)
err.name;         // 'FetchError' or 'BackendError'
```

## Hard Constraints

- `BackendError` always has `code === BACKEND_ERROR_FLAG` (`'BACKEND_ERROR'`).
- `BackendError` is only thrown from `processResponse` — never from `fetchCore` or `enhanced.ts`.
- Network errors (`ERR_NETWORK`) have **no response** — `error.response` is `undefined`, so `error.status`/`error.data` are `undefined`.
- `ERR_ABORTED` is never retried (user-initiated). `ERR_TIMEOUT` CAN be retried (the timeout aborts internally, but `isTimeout()` distinguishes it from user aborts).

## Common Pitfalls

- Accessing `error.status` on a network error — it's `undefined` because there's no response. Always check `error.response` or `error.code` first.
- Confusing `ERR_BAD_RESPONSE` (HTTP status failure) with `BACKEND_ERROR` (business logic failure). The former is thrown by `validateStatus` in `fetchCore`; the latter by `isBackendSuccess` in `processResponse`.
- `BackendError extends FetchError` — `instanceof FetchError` is true for both. Check `instanceof BackendError` or `error.code === BACKEND_ERROR_FLAG` to distinguish.
- For `createFlatRequest`, the error is captured into `{ data: null, error, response? }` — `onError` is still called before capturing.
