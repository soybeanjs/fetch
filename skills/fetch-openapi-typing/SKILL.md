---
name: 'fetch-openapi-typing'
description: 'Creates type-safe OpenAPI clients (createTypedClient/createFlatTypedClient) inferred from a generated paths type. Invoke when user wants type-safe API calls, OpenAPI integration, typed path/query/body params, or response field extraction.'
---

# Fetch OpenAPI Typing

This skill creates type-safe OpenAPI clients that infer URL, parameters, body, and response types from a generated `paths` type. It wraps a `RequestInstance` or `FlatRequestInstance` with typed HTTP verbs.

## When to Invoke

- User wants type-safe API clients from an OpenAPI spec
- User mentions `createTypedClient` or `createFlatTypedClient`
- User wants typed path/query/body parameters
- User wants to unwrap a response envelope field (e.g. `data`)
- User wants to extend the OpenAPI type helpers

## Key Files

- `src/openapi.ts` — `createTypedClient`, `createFlatTypedClient`, all type helpers
- `src/types.ts` — `RequestInstance`, `FlatRequestInstance`, `FetchRequestConfig`

## Flattened API (important)

The client uses a **flattened options API** — each OpenAPI parameter category is a top-level field, aligned with `FetchRequestConfig`:

```ts
client.get('/users/{id}', {
  pathParams: { id: 42 },         // path params — replaces {id} in URL (required when path params exist)
  query: { include: 'posts' },     // query params — appended to URL (optional)
  headers: { 'x-trace': 'abc' },  // header params (optional)
  body: { ... },                  // request body (required/optional per spec)
  timeout: 5000                   // passthrough FetchRequestConfig fields
});
```

- `pathParams` replaces `{id}` placeholders — missing required params throw at runtime.
- `query`, `headers`, and `body` are passed through directly to the fetch config.
- The remaining `FetchRequestConfig` fields (timeout, retry, cache, ...) pass through.

## Client Creation

```ts
createTypedClient<Paths, Prefix, Field>(requestInstance, prefix?)
```

- `Paths` — the generated `paths` type from the OpenAPI spec.
- `Prefix` — a string literal type to strip from path keys (e.g. `'/api/v1'`). Must be passed both as a type param **and** a runtime arg.
- `Field` — extracts a single field from the success response (e.g. `'data'` to unwrap an envelope). Default `''` returns the full `SuccessResponse`.

```ts
import { createRequest, createTypedClient } from '@soybeanjs/fetch';
import type { paths } from './openapi';

const request = createRequest(
  { baseURL: 'https://api.example.com' },
  {
    isBackendSuccess: r => r.data.code === 200,
    transform: r => r.data.data // unwrap envelope at business layer
  }
);

// No prefix
const client = createTypedClient<paths>(request);

// With prefix — pass both type param and runtime arg
const client = createTypedClient<paths, '/api/v1'>(request, '/api/v1');

// Field extraction — extracts `data` field from SuccessResponse
const client = createTypedClient<paths, '/api/v1', 'data'>(request, '/api/v1');
```

## Typed Methods

The client exposes typed methods for each HTTP verb (`get`, `post`, `put`, `delete`, `patch`, `options`, `head`, `trace`):

```ts
// Path, query, body, and response are all inferred
const user = await client.get('/users/{id}', {
  pathParams: { id: 42 },
  query: { include: 'posts' }
});

const created = await client.post('/users', {
  body: { name: 'John', email: 'john@example.com' }
});

// raw — bypasses transform, returns full FetchResponse
const response = await client.raw.get('/users/1');
console.log(response.headers.get('content-type'), response.data);
```

When an operation has **no required options** (no path params, optional/no body), the `init` argument is optional:

```ts
const menus = await client.get('/menu/list'); // no init needed
```

## Flat Client (never throws)

`createFlatTypedClient` wraps a `FlatRequestInstance` — success or failure is determined through the return value:

```ts
import { createFlatRequest, createFlatTypedClient } from '@soybeanjs/fetch';

const flatRequest = createFlatRequest(
  { baseURL: 'https://api.example.com' },
  { isBackendSuccess: r => r.data.code === 200 }
);

const client = createFlatTypedClient<paths, '/api/v1', 'data'>(flatRequest, '/api/v1');

const { data, error } = await client.get('/menu/list', {
  query: { page: 1, pageSize: 10 }
});

if (error) {
  console.error('Request failed:', error.message);
} else {
  console.log('Menus:', data.list, 'Total:', data.total);
}
```

## Type Helpers

Key type helpers in `openapi.ts`:

| Type                                | Purpose                                                                |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `PathsWithMethod<Paths, M>`         | Extract paths that support method `M`                                  |
| `SuccessResponse<T>`                | Extract success response body (200 → 201 → 202 → 204→void → other 2xx) |
| `ErrorResponse<T>`                  | Extract first 4xx/5xx error response body                              |
| `OperationRequestBodyContent<T>`    | Extract request body type across media types                           |
| `OperationParams<T>`                | Extract full parameters object                                         |
| `OpenapiRequestOptions<T>`          | Full per-request options (flattened)                                   |
| `ClientMethod<Paths, M, Field>`     | Typed client method signature                                          |
| `FlatClientMethod<Paths, M, Field>` | Typed flat client method signature                                     |

## buildFetchConfig (internal)

`buildFetchConfig(url, prefix, method, options)` translates the flattened options into a `FetchRequestConfig`:

```ts
const { pathParams, query, headers, body, ...restConfig } = options;
const resolvedUrl = replacePathParams(`${prefix}${url}`, pathParams);
return { url: resolvedUrl, method, query, body, headers, ...restConfig };
```

`replacePathParams` replaces `{id}` placeholders — throws if a required path param is missing/null/undefined.

## Extending OpenAPI Typing

When modifying `openapi.ts`:

- `OpenapiRequestOptions<T>` omits `url`/`method`/`body`/`query`/`headers` from `FetchRequestConfig` passthrough to provide typed versions — keep this omission when adding new top-level typed fields.
- `RequiredKeysOf<Init>` determines whether the `init` argument is required or optional (`[init?: Init]` vs `[init: Init]`).
- Media type resolution order: `application/json` → `multipart/form-data` → `application/x-www-form-urlencoded` → `text/plain` → `never`.
- For `204 No Content`, `SuccessResponse` returns `void`.
- For non-JSON media types, falls back to `unknown` so callers can opt into manual typing via `responseType`.

## Hard Constraints

- `pathParams` is **required** when the operation has path params (URL placeholders must be filled).
- `body` is required/optional per the OpenAPI spec (`IsOperationRequestBodyOptional`).
- `query`/`headers` are optional, typed from the spec when present.
- `createTypedClient` wraps a `RequestInstance` (throws); `createFlatTypedClient` wraps a `FlatRequestInstance` (never throws).

## Common Pitfalls

- Forgetting to pass the prefix as **both** a type parameter and a runtime argument: `createTypedClient<paths, '/api/v1'>(request, '/api/v1')`.
- `Field` extraction only works when `SuccessResponse` has that field; otherwise it returns the full `SuccessResponse`.
- `raw` methods bypass `transform` — they return the full `FetchResponse<SuccessResponse>`, not the `Field`-extracted value.
- The client methods are generated by iterating `['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace']` — all verbs are always available, typed by `PathsWithMethod`.
