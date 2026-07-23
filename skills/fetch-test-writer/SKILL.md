---
name: 'fetch-test-writer'
description: 'Writes type-clean vitest tests for @soybeanjs/fetch using the global fetch mock. Invoke when user wants to add/modify tests, mock responses, or test retry/timeout/abort/adapter behavior.'
---

# Fetch Test Writer

This skill writes tests for `@soybeanjs/fetch` following the project's established conventions. Tests use `vitest` with a global fetch mock and must pass both `pnpm test` and `pnpm typecheck` with zero errors.

## When to Invoke

- User wants to add or modify tests in `test/`
- User wants to mock fetch responses
- User wants to test retry, timeout, or abort behavior
- User wants to test adapters or upload/download progress
- User asks about test conventions or helpers

## Key Files

- `test/setup.ts` — global setup: stubs `global.fetch` with `mockFetch`, resets before each test, restores after
- `test/helpers.ts` — mock builders and utilities
- `test/*.test.ts` — per-module test files (one per source module)

## Test Helpers (test/helpers.ts)

### Mock Response Builders

```ts
// Builds a FetchAdapterResponse (shape consumed by fetchCore)
createMockAdapterResponse(options: MockResponseOptions): FetchAdapterResponse

// Builds a native Response (what fetch() returns)
createMockFetchResponse(options: MockResponseOptions): Response
```

`MockResponseOptions`:

```ts
interface MockResponseOptions {
  status?: number; // default 200
  statusText?: string; // default 'OK'
  headers?: Record<string, string>;
  body?: any; // string or object (JSON.stringify'd)
  contentType?: string; // default 'application/json'
}
```

### Controlling the Mock

```ts
// Set the default response for ALL subsequent fetch calls
setFetchResponse({ status: 200, body: { id: 1 } });

// Set a custom implementation that controls the response PER CALL
// (for retry/timeout/abort tests where different calls return different things)
setFetchImplementation((url, init) => {
  return createMockFetchResponse({ status: 500, body: { error: 'fail' } });
});

// Inspect recorded fetch calls
getFetchCalls(); // readonly { url, init }[]
getFetchCallCount(); // number
```

### Utilities

```ts
flushMicrotasks(); // queueMicrotask flush — for async resolution
delay(ms); // Promise that resolves after ms (fake-timer friendly)
```

## Global Fetch Mock (test/setup.ts)

The global `fetch` is stubbed with `mockFetch` before each test and reset/unstubbed after:

```ts
beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  resetFetchMock();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers(); // safety net for fake timers
});
```

- `resetFetchMock()` clears recorded calls, custom implementation, and default response.
- You do **not** need to manually stub `fetch` in each test — `setup.ts` handles it.

## Test File Conventions

- One test file per source module: `test/<module>.test.ts` mirrors `src/<module>.ts`.
- Use `describe` blocks to group related tests.
- Import helpers from `./helpers`; import source from `../src/<module>`.
- Tests must be **type-clean** — `tsconfig.json` includes `test/` (only excludes `node_modules`/`dist`).

## Common Test Patterns

### Basic Request + Response Mock

```ts
import { $fetch } from '../src/fetch';
import { setFetchResponse, getFetchCalls } from './helpers';

it('GET returns parsed JSON', async () => {
  setFetchResponse({ body: { id: 1, name: 'John' } });
  const data = await $fetch('/api/users/1');
  expect(data).toEqual({ id: 1, name: 'John' });
});

it('POST sends JSON body', async () => {
  setFetchResponse({ body: { created: true } });
  await $fetch('/api/users', { method: 'POST', body: { name: 'John' } });
  const call = getFetchCalls()[0];
  expect(call.init?.body).toBe(JSON.stringify({ name: 'John' }));
});
```

### Retry / Sequential Responses

Use `setFetchImplementation` to control each call (return different responses on retry):

```ts
import { setFetchImplementation, getFetchCallCount } from './helpers';

it('retries on 500 then succeeds', async () => {
  let calls = 0;
  setFetchImplementation(() => {
    calls++;
    if (calls < 3) return createMockFetchResponse({ status: 500, body: { error: 'fail' } });
    return createMockFetchResponse({ status: 200, body: { ok: true } });
  });

  const data = await $fetch('/flaky', { retry: { retries: 2, retryDelay: () => 0 } });
  expect(data).toEqual({ ok: true });
  expect(getFetchCallCount()).toBe(3);
});
```

### Timeout / Abort (fake timers)

```ts
import { vi } from 'vitest';

it('times out', async () => {
  vi.useFakeTimers();
  setFetchImplementation(() => new Promise(() => {})); // never resolves

  const promise = $fetch('/slow', { timeout: 1000 });
  vi.advanceTimersByTime(1000);

  await expect(promise).rejects.toMatchObject({ code: 'ERR_TIMEOUT' });
  vi.useRealTimers(); // restore (also done in setup.ts afterEach)
});
```

### Adapter / Upload Progress

For adapter tests, use `createMockAdapterResponse` directly and **drain the body stream** so progress callbacks fire deterministically (see `drainStream` in `test/adapter.test.ts`):

```ts
import { createUploadProgressAdapter } from '../src/adapter';
import { createMockAdapterResponse } from './helpers';

async function drainStream(stream: ReadableStream<Uint8Array> | null) {
  if (!stream) return;
  const reader = stream.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}
```

### Null-Body Statuses (204/205/304)

`Response` constructor rejects a body for these statuses — `createMockFetchResponse` handles this by passing `null`:

```ts
setFetchResponse({ status: 204 }); // body omitted → Response(null, ...)
const data = await $fetch('/no-content');
expect(data).toBeUndefined();
```

## TypeScript Constraints in Tests

- `noUnusedLocals` is on — every import and variable must be used.
- `strictNullChecks` is on — `headers` may be `undefined`, flat `data` may be `null`; tests must narrow.
- `getFetchCalls()` returns `readonly` — do not mutate.
- Test files are type-checked by `tsc` (no separate test tsconfig). Keep tests type-clean.

## Verification Commands

```bash
pnpm test          # vitest run — all tests must pass
pnpm typecheck     # tsc --noEmit --skipLibCheck — zero errors
pnpm test:coverage # with coverage report
pnpm test:watch    # watch mode
```

Tests must pass **both** `pnpm test` and `pnpm typecheck` with zero errors.

## Hard Constraints

- Always pair `vi.useFakeTimers()` with `vi.useRealTimers()` in `afterEach` (or at test end). `setup.ts` also restores real timers as a safety net.
- For null-body statuses (204/205/304), use `new Response(null, ...)` — never pass a body. `createMockFetchResponse` handles this.
- User aborts are never retried — when testing abort, do not expect retry behavior.
- For upload-progress tests, drain the body stream so `TransformStream` progress callbacks fire deterministically.

## Common Pitfalls

- Forgetting to `setFetchResponse` / `setFetchImplementation` — the default mock returns `{}` with status 200.
- Not resetting fake timers — leaks into subsequent tests. Use `afterEach(() => vi.useRealTimers())`.
- Mutating `getFetchCalls()` — it returns a `readonly` array; copy if you need to mutate.
- Leaving unused imports — `noUnusedLocals` fails the typecheck.
- Expecting `response.data` for null-body responses — it's `undefined` (no body to parse).
