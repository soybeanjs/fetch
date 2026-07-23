# @soybeanjs/fetch

English | [简体中文](./README.md)

A lightweight, type-safe HTTP request library built on the native Fetch API, with zero runtime dependencies, elegant API design, and powerful feature support.

## ✨ Features

- 🎯 **Type-Safe**: Full TypeScript support with intelligent type inference
- 🚀 **Zero Dependencies**: Built on native `fetch`, no axios or other runtime deps
- 🔄 **Dual Instance Modes**: Standard request instance and flat response instance
- 📦 **File Downloads**: Auto-parse filenames and content types, multiple formats supported
- 🎣 **Lifecycle Hooks**: Complete request lifecycle management (transport + business layers)
- 🔁 **Auto Retry**: Built-in retry mechanism with custom conditions and delays
- ⏱️ **Timeout Control**: Based on `AbortController`, distinguishes timeout from user abort
- 🛡️ **Error Handling**: Unified error handling for both business and network errors
- 📝 **Response Transform**: Flexible response data transformation
- 🎨 **State Management**: Built-in state sharing across instances
- 🔌 **Adapter API**: Pluggable transport layer for uniapp, WeChat Mini Programs, etc.
- 🌐 **$fetch API**: ofetch-compatible lightweight fetch client
- 📡 **Transport Hooks**: `onRequest` / `onResponse` / `onRequestError` / `onResponseError`, array support
- 🔍 **Auto Response Type Detection**: Auto-detect response type from `Content-Type` (incl. SSE)
- 📤 **Upload Progress**: Cross-runtime upload progress tracking — XHR in browsers, TransformStream in Node/Bun/Deno/CF
- 📥 **Download Progress**: TransformStream-based download progress tracking
- 💾 **Request Cache**: GET response caching with TTL, max entries, custom keys
- 🔀 **Request Dedupe**: Auto-merge identical in-flight requests, shared Promise
- 🚦 **Concurrency Limit**: Limit simultaneous in-flight requests to prevent browser bottleneck
- 📊 **Global Loading**: Auto-track request state with slow request alerts

## 🤖 Agent Skills

This project ships with a set of built-in **Agent Skills** that provide development guidance for AI coding assistants (Trae / Cursor / Windsurf, etc.) working on this library. Each skill covers a common development task — including key file locations, code patterns, hard constraints, and common pitfalls — so that AI-generated code conforms to the library's two-layer architecture and conventions.

### Installation

Run the following command in your project root to install all skills:

```bash
npx skills add soybeanjs/fetch
```

Once installed, the skills are placed in the `skills/` directory and the AI assistant auto-invokes them when matching task scenarios occur.

### Available Skills

| Skill                    | Covered Task                                                                                                    | Key Files                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `fetch-platform-adapter` | Support new platforms (uniapp / WeChat Mini Programs / React Native), custom adapters, upload progress tracking | `adapter.ts`                        |
| `fetch-business-hook`    | Add business hooks (`transform` / `isBackendSuccess` / `onBackendFail` / `onError` / `onRequest`)               | `core.ts` + `fetch.ts`              |
| `fetch-transport-hook`   | Add ofetch-style transport hooks (`onRequest` / `onResponse` / `onRequestError` / `onResponseError`)            | `fetch.ts` + `types.ts`             |
| `fetch-enhanced-feature` | Add enhanced features (cache / dedupe / concurrency / debounce / throttle / auth / schema / loading)            | `enhanced.ts`                       |
| `fetch-retry-timeout`    | Configure retry count / delay / condition, timeout control, custom retryable status codes                       | `fetch.ts` + `options.ts`           |
| `fetch-openapi-typing`   | Extend OpenAPI type-safe clients (`createTypedClient` / `createFlatTypedClient`)                                | `openapi.ts`                        |
| `fetch-error-code`       | Add custom error codes, handle the `FetchError` / `BackendError` error model                                    | `error.ts` + `constant.ts`          |
| `fetch-test-writer`      | Write tests following project conventions (vitest + global fetch mock + type-safe)                              | `test/helpers.ts` + `test/setup.ts` |

> See the `SKILL.md` files in the [`skills/`](./skills) directory for each skill's detailed content.

## 📦 Installation

```bash
# npm
npm install @soybeanjs/fetch

# yarn
yarn add @soybeanjs/fetch

# pnpm
pnpm add @soybeanjs/fetch
```

> **Requirements**: Node.js 18+ or modern browsers (native `fetch` support required).

## 🚀 Quick Start

### Basic Usage

```typescript
import { createRequest } from '@soybeanjs/fetch';
import type { FetchResponse } from '@soybeanjs/fetch';

interface ApiResponse<T = any> {
  code: number;
  data: T;
  message: string;
}

// Create request instance
const request = createRequest(
  {
    baseURL: 'https://api.example.com',
    timeout: 10000
  },
  {
    // Transform response data
    // !!!Make sure to type the response parameter for proper type inference
    transform: (response: FetchResponse<ApiResponse>) => {
      return response.data.data;
    },
    // Pre-request interceptor
    onRequest: async config => {
      // Add token (headers is a native Headers instance, use .set())
      config.headers.set('Authorization', `Bearer ${getToken()}`);
      return config;
    },
    // Check backend business success
    isBackendSuccess: response => {
      return response.data.code === 200;
    },
    // Backend business failure handler
    onBackendFail: async (response, instance) => {
      // Handle token expiration, etc.
      if (response.data.code === 401) {
        await refreshToken();
        // Re-send request (full pipeline)
        return instance(response.config);
      }
    },
    // Error handler
    onError: async error => {
      console.error('Request failed:', error.message);
    }
  }
);

// Make a request
const data = await request({
  url: '/users',
  method: 'GET'
});
```

### Flat Response Instance

Never throws — determine success/failure via the return value:

```typescript
import { createFlatRequest } from '@soybeanjs/fetch';

const flatRequest = createFlatRequest({ baseURL: 'https://api.example.com' }, options);

const { data, error, response } = await flatRequest({
  url: '/users',
  method: 'GET'
});

if (error) {
  console.error('Request failed:', error);
} else {
  console.log('Success:', data);
}
```

### $fetch — Lightweight Fetch Client (ofetch-compatible)

No business logic needed — make requests directly:

```typescript
import { $fetch } from '@soybeanjs/fetch';

// GET request
const user = await $fetch<User>('/api/users/1');

// POST request
const created = await $fetch<User>('/api/users', {
  method: 'POST',
  body: { name: 'John' }
});

// Create instance with defaults
const apiFetch = $fetch.create({
  baseURL: 'https://api.example.com',
  headers: { Authorization: 'Bearer xxx' },
  retry: { retries: 3 }
});

// Get full response (no throw)
const response = await $fetch.raw('/api/users/1');
console.log(response.status, response.data);

// Direct access to native fetch
$fetch.native('https://example.com');
```

## 📖 Core Concepts

### RequestOption

| Option             | Type       | Required | Description                                                                         |
| ------------------ | ---------- | -------- | ----------------------------------------------------------------------------------- |
| `transform`        | `Function` | Yes      | Transform response data to business data                                            |
| `onRequest`        | `Function` | No       | Pre-request interceptor (business layer, return-value mode), e.g. add token         |
| `isBackendSuccess` | `Function` | Yes      | Check if backend business logic succeeded                                           |
| `onBackendFail`    | `Function` | No       | Backend failure callback, e.g. token refresh. Return a new `FetchResponse` to retry |
| `onError`          | `Function` | No       | Request error handler, e.g. show error toast                                        |
| `backendErrorMsg`  | `string`   | No       | Backend error message for constructing [`BackendError`](#error-identification)      |

> Business errors (failed `isBackendSuccess`) are thrown as `BackendError` instances (extends `FetchError`, `error.code === 'BACKEND_ERROR'`).
> Detect via `instanceof BackendError` or `error.code === BACKEND_ERROR_FLAG`, see [Error Identification](#error-identification).

### Transport Hooks (ofetch-compatible)

In addition to business hooks (`RequestOption`), `FetchRequestConfig` supports transport hooks that accept **a single function or an array**:

```typescript
const request = createRequest(
  {
    baseURL: 'https://api.example.com',
    // Transport hooks (can also be set per-request)
    onRequest: [
      ({ request, options }) => {
        console.log('→', request);
      }
    ],
    onResponse: [
      ({ response }) => {
        console.log('←', response.status);
      }
    ],
    onRequestError: [
      ({ error }) => {
        console.error('Request error:', error.message);
      }
    ],
    onResponseError: [
      ({ response, error }) => {
        console.error('Response error:', response.status);
      }
    ]
  },
  options
);
```

| Hook              | Trigger                             | Arguments                        |
| ----------------- | ----------------------------------- | -------------------------------- |
| `onRequest`       | Before request is sent              | `FetchContext`                   |
| `onRequestError`  | Request fails (network/timeout)     | `FetchContext` (with `error`)    |
| `onResponse`      | After response received & parsed    | `FetchContext` (with `response`) |
| `onResponseError` | Response has error status (4xx/5xx) | `FetchContext` (with `error`)    |

> **Difference from business hooks**: Transport hooks are configured in `FetchRequestConfig`, support arrays and the `FetchContext` pattern; business hooks are in `RequestOption`, single function, return-value mode. Transport hooks execute before business hooks.

### Error Identification

Business errors (determined by `isBackendSuccess` as failure) are constructed as `BackendError` instances:

```typescript
import { FetchError, BackendError, BACKEND_ERROR_FLAG } from '@soybeanjs/fetch';

try {
  await request({ url: '/users/1' });
} catch (error) {
  if (error instanceof BackendError) {
    // Business error, e.g. code !== 200
    console.error('Business error:', error.message);
  } else if (error instanceof FetchError) {
    // Network / HTTP error
    console.error('Network error:', error.message);
  }
}

// Or detect via code (equivalent to instanceof BackendError)
if (fetchError.code === BACKEND_ERROR_FLAG) {
  // ...
}
```

`FetchError` provides these convenience properties:

| Property     | Description                              |
| ------------ | ---------------------------------------- |
| `status`     | HTTP status code (alias `statusCode`)    |
| `statusText` | HTTP status text (alias `statusMessage`) |
| `data`       | Response data                            |
| `code`       | Error code                               |
| `response`   | Full `FetchResponse`                     |
| `config`     | Request config                           |

### Request Pipeline

```
User initiates request
    ↓
Transport onRequest hook (FetchContext mode)
    ↓
Business onRequest hook (return-value mode)
    ↓
Send HTTP request (adapter)
    ↓
├─ Network error → Transport onRequestError → retry → onError
    ↓
Receive response → Parse body (auto-detect type)
    ↓
Transport onResponse hook
    ↓
validateStatus check
    ├─ Error status → Transport onResponseError → retry → onError
    ↓
processResponse (business logic)
    ├─ coerceBinaryToJsonResponse (binary → JSON)
    ├─ isBackendSuccess check
    │   ├─ Success → transform → return business data
    │   └─ Failure → onBackendFail → BackendError → onError
    ├─ File types → return file info object
    └─ Other → return raw data
```

## 🎯 Advanced Features

### 1. File Downloads

Auto-parse filenames and content types:

```typescript
// Download file
const fileData = await request({
  url: '/download/report.pdf',
  method: 'GET',
  responseType: 'blob'
});

// fileData contains:
// {
//   file: Blob,
//   filename: 'report.pdf',
//   contentType: 'application/pdf'
// }

// Custom filename parsing
const fileData = await request({
  url: '/download/file',
  responseType: 'blob',
  getFileName: response => {
    // Custom parsing logic
    return 'custom-filename.pdf';
  }
});

// Use built-in downloadFile utility to trigger browser download
import { downloadFile } from '@soybeanjs/fetch';

downloadFile(fileData.file, fileData.filename);
```

Supported file types:

- `blob` → `FileResponseData<Blob>`
- `arraybuffer` → `FileResponseData<ArrayBuffer>`
- `stream` → `FileResponseData<ReadableStream<Uint8Array>>`

### 2. Response Types

```typescript
// JSON (default), add a generic parameter for business data type; other types don't need it
interface UserData {
  id: number;
  name: string;
}
const data = await request<UserData>({
  url: '/users/123'
});

// auto — auto-detect from Content-Type (recommended for $fetch)
const data = await $fetch('/api/data', { responseType: 'auto' });

// Text
const text = await request({
  url: '/data.csv',
  responseType: 'text'
});

// HTML/XML document (using DOMParser)
const doc = await request({
  url: '/template.html',
  responseType: 'document'
});

// Blob (file)
const file = await request({
  url: '/download/image.png',
  responseType: 'blob'
});

// ArrayBuffer
const buffer = await request({
  url: '/download/data.bin',
  responseType: 'arraybuffer'
});

// Stream (SSE / large file streaming)
const stream = await request({
  url: '/events',
  responseType: 'stream'
});
```

Supported response types:

| Type          | Description                                    |
| ------------- | ---------------------------------------------- |
| `json`        | JSON (default)                                 |
| `auto`        | Auto-detect from `Content-Type`                |
| `text`        | Text                                           |
| `blob`        | Blob file                                      |
| `arraybuffer` | ArrayBuffer                                    |
| `stream`      | ReadableStream (incl. SSE `text/event-stream`) |
| `document`    | HTML/XML document (DOMParser, browser only)    |

### 3. State Management

`request.state` returns `EnhancedState`, which includes built-in runtime state (cache, loading, dedupe, messages, etc.) and supports custom fields via index signature:

```typescript
const request = createRequest(
  { baseURL: 'https://api.example.com' },
  {
    // ...other options
    onRequest: config => {
      config.headers.set('Authorization', `Bearer ${request.state.token}`);
      return config;
    }
  }
);

// Custom state — read and write directly on state
request.state.token = 'new-token';
request.state.userId = 123;

// Built-in runtime state is also accessible
request.state.loading.count; // current concurrent request count
request.state.cache.size; // cache entry count
```

#### Message Deduplication

`request.state.messages` is a built-in `MessageStack` instance for request message deduplication. When a request is triggered repeatedly in a short time, only the first occurrence of a message passes through within the window:

```typescript
const request = createRequest(
  { baseURL: 'https://api.example.com' },
  {
    isBackendSuccess: r => r.data.code === 200,
    onError: error => {
      // Only show the same error.message once within 3s
      if (request.state.messages.push(error.message)) {
        showToast(error.message);
      }
    }
  }
);

// Custom dedup key (e.g., by error code)
if (request.state.messages.push(error.code, error.message)) {
  showToast(error.message);
}

// Adjust the time window (default 3000ms)
request.state.messages.interval = 5000;

// View active messages in the window
request.state.messages.getActive();

// Clear the message stack
request.state.messages.clear();
```

### 4. Auto Retry

Built-in retry mechanism, no extra dependencies:

```typescript
const request = createRequest(
  {
    baseURL: 'https://api.example.com',
    retry: {
      retries: 3,
      retryDelay: retryCount => retryCount * 1000,
      retryCondition: error => {
        // Only retry on network errors or 5xx errors
        return !error.response || error.response.status >= 500;
      }
    }
  },
  options
);
```

| Option           | Type                                     | Default                      | Description       |
| ---------------- | ---------------------------------------- | ---------------------------- | ----------------- |
| `retries`        | `number`                                 | `0`                          | Number of retries |
| `retryDelay`     | `(count, error) => number`               | Linear backoff               | Retry delay (ms)  |
| `retryCondition` | `(error) => boolean \| Promise<boolean>` | Network errors + retry codes | Retry condition   |

Default retry status codes: `408, 409, 425, 429, 500, 502, 503, 504`

> User-initiated abort (non-timeout) does not trigger retries.

### 5. Timeout Control

Based on `AbortController`, distinguishes timeout from user abort:

```typescript
const request = createRequest({ timeout: 10000 }, options);

// Timeout throws FetchError with code 'ERR_TIMEOUT'
// Error message format: [GET] "https://...": Request timeout of 10000ms exceeded

// User-initiated abort (no retry)
const controller = new AbortController();
const promise = request({
  url: '/users',
  signal: controller.signal
});

// Cancel request
controller.abort();
```

### 6. Type Inference

Full TypeScript support:

```typescript
interface User {
  id: number;
  name: string;
}

interface ApiResponse<T = any> {
  code: number;
  data: T;
  message: string;
}

// ResponseData: raw backend response type
// ApiData: business data type
const request = createRequest(
  { baseURL: 'https://api.example.com' },
  {
    transform: (response: FetchResponse<ApiResponse>) => response.data.data
  }
);

// Type inference: data is ApiResponse<User>
const user = await request<User>({
  url: '/users/123'
});
```

### 7. raw Method — Get Raw Response

Use `request.raw()` to skip `transform` and get the full `FetchResponse` object.

**Difference from `request()`:**

| Method          | Return Value                | Through transform? |
| --------------- | --------------------------- | ------------------ |
| `request()`     | Transformed business data   | ✅ Yes             |
| `request.raw()` | Full `FetchResponse` object | ❌ No              |

```typescript
// 1. Get custom response headers
const response = await request.raw<User[]>({
  url: '/users',
  method: 'GET'
});

const totalCount = response.headers.get('x-total-count');
const requestId = response.headers.get('x-request-id');
const statusCode = response.status;

// 2. Get raw response + file info for downloads
const fileResponse = await request.raw({
  url: '/download/report.pdf',
  responseType: 'blob'
});

// fileResponse.data contains { file, filename, contentType }
```

> The flat instance created by `createFlatRequest` also provides `flatRequest.raw()` with the same semantics, but never throws.

### 8. HTTP Method Shorthands

Both `RequestInstance` and `FlatRequestInstance` provide shorthand methods for common HTTP verbs:

```typescript
// GET request
const users = await request.get<User[]>('/users');
const usersWithQuery = await request.get<User[]>('/users', {
  query: { page: 1, pageSize: 10 }
});

// POST request
const newUser = await request.post<User>('/users', {
  name: 'John',
  email: 'john@example.com'
});

// PUT request
const updatedUser = await request.put<User>('/users/123', {
  name: 'John (updated)'
});

// PATCH request
const patchedUser = await request.patch<User>('/users/123', {
  email: 'newemail@example.com'
});

// DELETE request
await request.delete('/users/123');
```

### 9. Adapter API — Cross-Platform Support

Use custom adapters to run in non-standard fetch environments like uniapp, WeChat Mini Programs:

```typescript
import { createRequest, createAdapterResponse } from '@soybeanjs/fetch';

// uniapp adapter example
const uniappAdapter = async (url, init) => {
  const res = await uni.request({
    url,
    method: init.method as any,
    header: Object.fromEntries(init.headers.entries()),
    data: init.body,
    responseType: 'arraybuffer'
  });

  return createAdapterResponse({
    status: res.statusCode,
    statusText: '',
    headers: new Headers(res.header),
    body: res.data instanceof ArrayBuffer ? res.data : new ArrayBuffer(0)
  });
};

const request = createRequest(
  {
    baseURL: 'https://api.example.com',
    adapter: uniappAdapter
  },
  options
);
```

### 10. ignoreResponseError — Ignore Response Errors

When `ignoreResponseError` is `true`, skips `validateStatus` check and returns the response instead of throwing:

```typescript
const response = await $fetch.raw('/api/users/404', {
  ignoreResponseError: true
});

// Even 404 returns response without throwing FetchError
console.log(response.status); // 404
console.log(response.data); // Error page data
```

### 11. Type-Safe Client (Typed Client / OpenAPI)

After generating `paths` types with [openapi-typescript](https://openapi-ts.dev/), you can create **fully type-safe** request clients.

> **Prerequisite**: Generate types from `openapi.json` using `openapi-typescript`:
>
> ```bash
> npx openapi-typescript ./openapi.json -o ./src/openapi.d.ts
> ```

#### createTypedClient

```typescript
import { createRequest, createTypedClient } from '@soybeanjs/fetch';
import type { paths } from './openapi.d.ts';

const request = createRequest({ baseURL: 'https://api.example.com' }, {/* ... */});

// Field = 'data' to unwrap envelope structure
const client = createTypedClient<paths, '/api/v1', 'data'>(request, '/api/v1');

// Full type inference for paths, params, body, and return value
const menus = await client.get('/menu/list', {
  query: { page: 1, pageSize: 10 }
});

// POST request
const loginResult = await client.post('/auth/login', {
  body: { username: 'admin', password: '123456' }
});

// Path params (replace {id} in the URL)
const user = await client.get('/users/{id}', {
  pathParams: { id: 1 }
});

// raw method — skip transform, return full FetchResponse
const response = await client.raw.get('/menu/list', {
  query: { page: 1 }
});
```

#### createFlatTypedClient

Wraps a flat instance created by `createFlatRequest`, **never throws**:

```typescript
import { createFlatRequest, createFlatTypedClient } from '@soybeanjs/fetch';

const flatRequest = createFlatRequest({ baseURL: 'https://api.example.com' }, {/* ... */});

const client = createFlatTypedClient<paths, '/api/v1', 'data'>(flatRequest, '/api/v1');

const { data, error } = await client.get('/menu/list', {
  query: { page: 1 }
});

if (error) {
  console.error('Request failed:', error.message);
} else {
  console.log('Menus:', data);
}
```

### 12. Upload Progress Tracking

The native `fetch()` API **does not support upload progress events**. This library bridges that gap via the `onUploadProgress` config option — when set, the library automatically switches to a progress-capable adapter for that request, with no manual adapter management required.

Works with all APIs: `createRequest`, `createFlatRequest`, `$fetch` / `createFetch`. Can be used at the instance level or per-request.

**Cross-runtime support** — the library auto-selects the best mechanism:

| Runtime              | Mechanism                        | `total` accuracy                                         |
| -------------------- | -------------------------------- | -------------------------------------------------------- |
| Browser              | `XMLHttpRequest.upload.progress` | Accurate                                                 |
| Node.js / Bun / Deno | `TransformStream` byte counting  | Accurate for known-size bodies (Blob/ArrayBuffer/string) |
| CF Workers           | `TransformStream` byte counting  | May buffer (jump to 100%)                                |

> For `FormData` and raw `ReadableStream` bodies, the stream-based approach cannot determine the total size in advance. In this case `lengthComputable` is `false`, but `loaded` (bytes uploaded) still updates.

#### Basic Usage (Per-Request)

The most common scenario: set a progress callback only on upload endpoints.

```typescript
import { createRequest } from '@soybeanjs/fetch';

const request = createRequest({ baseURL: 'https://api.example.com' }, {/* ... */});

async function uploadFile(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  // Simply pass the onUploadProgress callback in the request config
  const result = await request.post('/upload', formData, {
    onUploadProgress: ({ loaded, total, progress }) => {
      console.log(`Upload: ${progress}% (${loaded}/${total} bytes)`);
    }
  });

  return result;
}
```

`$fetch` works the same way:

```typescript
import { $fetch } from '@soybeanjs/fetch';

await $fetch('/upload', {
  method: 'POST',
  body: formData,
  onUploadProgress: ({ progress }) => {
    progressBar.value = progress;
  }
});
```

#### Progress Event

The `onUploadProgress` callback receives an `UploadProgressEvent` object:

| Property           | Type      | Description                                                                                     |
| ------------------ | --------- | ----------------------------------------------------------------------------------------------- |
| `loaded`           | `number`  | Bytes uploaded so far                                                                           |
| `total`            | `number`  | Total bytes (0 if not computable)                                                               |
| `progress`         | `number`  | Upload percentage 0-100 (0 if not computable)                                                   |
| `lengthComputable` | `boolean` | Whether total size is known. When `false`, `total`/`progress` are 0 but `loaded` is still valid |

> In browser (XHR) mode, the callback fires only when the total size is known. In stream mode, it always fires — use `lengthComputable` to distinguish.

#### With Vue / React Progress Bar

```typescript
import { ref } from 'vue';
import { createFlatRequest } from '@soybeanjs/fetch';

const uploadProgress = ref(0);

const request = createFlatRequest({ baseURL: 'https://api.example.com' }, {/* ... */});

async function handleUpload(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  const { data, error } = await request.post('/upload', formData, {
    onUploadProgress: ({ progress }) => {
      uploadProgress.value = progress;
    }
  });

  if (error) {
    console.error('Upload failed:', error.message);
  } else {
    console.log('Upload success:', data);
  }

  uploadProgress.value = 0; // reset
}
```

#### Instance-Level Config (Global Upload Progress)

To track upload progress on all requests of an instance, set `onUploadProgress` when creating the instance:

```typescript
const request = createRequest(
  {
    baseURL: 'https://api.example.com',
    onUploadProgress: ({ progress }) => {
      console.log(`Upload: ${progress}%`);
    }
  },
  options
);
```

#### Advanced: createUploadProgressAdapter

`createUploadProgressAdapter` is the lower-level building block that returns a `FetchAdapter`. It auto-selects the best mechanism per runtime (XHR in browsers, TransformStream elsewhere). Useful when you need to combine the upload progress adapter with other custom adapter logic:

```typescript
import { createRequest, createUploadProgressAdapter } from '@soybeanjs/fetch';

const request = createRequest(
  {
    baseURL: 'https://api.example.com',
    adapter: createUploadProgressAdapter(({ progress, loaded, lengthComputable }) => {
      if (lengthComputable) {
        console.log(`Upload: ${progress}%`);
      } else {
        console.log(`Uploaded ${loaded} bytes`);
      }
    })
  },
  options
);
```

> When both `adapter` and `onUploadProgress` are set, `adapter` takes precedence and `onUploadProgress` is ignored.

### 13. Download Progress Tracking

Track download progress via the `onDownloadProgress` config option. The library wraps the response body in a counting `TransformStream`, triggering the callback for each chunk downloaded.

Ideal for large file downloads — symmetric with upload progress.

```typescript
// Per-request
await request.get('/large-file', {
  responseType: 'blob',
  onDownloadProgress: ({ progress, loaded, total, lengthComputable }) => {
    if (lengthComputable) {
      console.log(`Download: ${progress}% (${loaded}/${total} bytes)`);
    } else {
      console.log(`Downloaded ${loaded} bytes`);
    }
  }
});

// $fetch also supported
const blob = await $fetch('/video.mp4', {
  responseType: 'blob',
  onDownloadProgress: ({ progress }) => {
    progressBar.value = progress;
  }
});
```

The `onDownloadProgress` callback receives a `DownloadProgressEvent` (same shape as `UploadProgressEvent`):

| Property           | Type      | Description                                           |
| ------------------ | --------- | ----------------------------------------------------- |
| `loaded`           | `number`  | Bytes downloaded so far                               |
| `total`            | `number`  | Total bytes (from `Content-Length`, 0 if unavailable) |
| `progress`         | `number`  | Download percentage 0-100 (0 if not computable)       |
| `lengthComputable` | `boolean` | Whether total size is known                           |

### 14. Request Cache

Cache GET responses via the `cache` config option to avoid redundant requests. Supports TTL, max entries, custom keys, and method filtering.

```typescript
const request = createRequest(
  {
    baseURL: '/api',
    cache: {
      ttl: 30000, // cache for 30 seconds
      methods: ['get'], // cache GET only (default)
      max: 100 // max 100 entries (default), evicts oldest
      // key: (config) => '...' // custom cache key
    }
  },
  options
);

// First request: makes a network call
const a = await request.get('/user');
// Second request within 30s: returns cached response
const b = await request.get('/user');

// Skip cache for a specific request
const c = await request.get('/user', { cache: false });
```

**Cache management**: the instance provides `clearCache()` and `deleteCache(key)` methods for manual cache management:

```typescript
// Clear all cached responses
request.clearCache();

// Delete a specific cache entry by key (default key format: "METHOD:url:query")
request.deleteCache('GET:/api/user:id=1');

// Clear cache after updating data — next request will re-fetch
await request.put('/user', newData);
request.clearCache();
```

### 15. Request Dedupe

Merge identical in-flight requests via the `dedupe` config option. When multiple identical requests are in flight simultaneously, only one network call is made — all callers share the same Promise.

```typescript
const request = createRequest(
  {
    baseURL: '/api',
    dedupe: true
  },
  options
);

// Two concurrent identical requests → one network call
const [a, b] = await Promise.all([request.get('/user'), request.get('/user')]);
console.log(a === b); // true (same response)

// Custom dedupe key
const request2 = createRequest(
  {
    baseURL: '/api',
    dedupe: {
      key: config => `${config.method}:${config.url}`
    }
  },
  options
);
```

> Default dedupe key is `method:url:query:body`. Entries are automatically removed from the dedupe map when the request settles.

### 16. Concurrency Limit

Limit simultaneous in-flight requests via the `concurrency` config option. Excess requests are queued, preventing browser concurrency limits (6 connections) from causing performance issues.

```typescript
const request = createRequest({
  baseURL: '/api',
  concurrency: {
    maxConcurrent: 6   // max 6 simultaneous requests
  }
}, options);

// Upload 100 files, but at most 6 at a time
const files = [...]; // 100 files
const results = await Promise.all(
  files.map(file => request.post('/upload', file))
);
```

### 17. Global Loading & Slow Request Tracking

Automatically track request state via `onGlobalLoadingChange`, `onLoadingChange`, `slowThreshold`, and `onSlowRequest`.

```typescript
const request = createRequest(
  {
    baseURL: '/api',
    // Global loading: true when first request starts, false when last finishes
    onGlobalLoadingChange: loading => {
      store.globalLoading = loading;
    },
    // Slow request: alert after 10 seconds
    slowThreshold: 10000,
    onSlowRequest: ({ url, method, duration }) => {
      console.warn(`Slow request: ${method} ${url} took ${duration}ms`);
      // Report to monitoring...
    }
  },
  options
);

// Per-request loading: true when this request starts, false when it finishes
await request.post('/save', data, {
  onLoadingChange: loading => {
    saveBtnLoading.value = loading;
  }
});
```

| Option                  | Type                                | Description                                            |
| ----------------------- | ----------------------------------- | ------------------------------------------------------ |
| `onGlobalLoadingChange` | `(loading: boolean) => void`        | Global loading state callback (0→1 true, 1→0 false)    |
| `onLoadingChange`       | `(loading: boolean) => void`        | Per-request loading callback (starts true, ends false) |
| `slowThreshold`         | `number`                            | Slow request threshold (ms), 0 = disabled              |
| `onSlowRequest`         | `(entry: SlowRequestEntry) => void` | Slow request callback with `url`/`method`/`duration`   |

> **Global vs Per-request Loading**: `onGlobalLoadingChange` fires `true` when the first request starts and `false` when the last finishes — ideal for global loading overlays. `onLoadingChange` fires independently for each request — ideal for button-level loading states. Both can be used simultaneously.

## 🛠️ Utilities

### parseContentDisposition

Parse `Content-Disposition` header to extract filename:

```typescript
import { parseContentDisposition } from '@soybeanjs/fetch';

const filename = parseContentDisposition("attachment; filename*=UTF-8''%E6%96%87%E4%BB%B6.pdf");
// '文件.pdf'
```

### downloadFile

Trigger file download in browser:

```typescript
import { downloadFile } from '@soybeanjs/fetch';

downloadFile(blob, 'report.pdf');
```

### createFetch / $fetch

Create an ofetch-compatible lightweight fetch client:

```typescript
import { $fetch, createFetch } from '@soybeanjs/fetch';

// Use default instance
const data = await $fetch('/api/users/1');

// Create custom instance
const apiFetch = createFetch({
  baseURL: 'https://api.example.com',
  retry: { retries: 3 },
  onRequest: [({ request }) => console.log('→', request)]
});

// Chain creation
const authFetch = apiFetch.create({
  headers: { Authorization: 'Bearer xxx' }
});
```

### createAdapterResponse

Helper for adapter authors to construct `FetchAdapterResponse`:

```typescript
import { createAdapterResponse } from '@soybeanjs/fetch';

const response = createAdapterResponse({
  status: 200,
  statusText: 'OK',
  headers: new Headers({ 'content-type': 'application/json' }),
  body: responseBody
});
```

### createUploadProgressAdapter

Lower-level function that creates an XHR-based upload progress adapter (see [Upload Progress Tracking](#12-upload-progress-tracking)).

> For per-request usage, prefer the `onUploadProgress` config option directly — no need to manually create an adapter.

```typescript
import { createUploadProgressAdapter } from '@soybeanjs/fetch';
import type { UploadProgressEvent } from '@soybeanjs/fetch';

const adapter = createUploadProgressAdapter((event: UploadProgressEvent) => {
  console.log(`${event.progress}% (${event.loaded}/${event.total})`);
});

// adapter type: FetchAdapter | undefined
// Returns FetchAdapter in browsers, undefined in Node.js
```

## 📝 Complete Example

### Authenticated API Requests

```typescript
import { createRequest } from '@soybeanjs/fetch';
import type { FetchResponse } from '@soybeanjs/fetch';

interface ApiResponse<T = any> {
  code: number;
  data: T;
  message: string;
}

interface User {
  id: number;
  name: string;
  email: string;
}

const request = createRequest(
  {
    baseURL: 'https://api.example.com',
    timeout: 10000
  },
  {
    transform: (response: FetchResponse<ApiResponse>) => {
      return response.data.data;
    },
    onRequest: async config => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.set('Authorization', `Bearer ${token}`);
      }
      return config;
    },
    isBackendSuccess: response => {
      return response.data.code === 200;
    },
    onBackendFail: async (response, instance) => {
      const { code } = response.data;

      // Token expired, refresh and retry
      if (code === 401) {
        const newToken = await refreshToken();
        localStorage.setItem('token', newToken);
        response.config.headers.set('Authorization', `Bearer ${newToken}`);
        return instance(response.config);
      }
    },
    onError: async error => {
      console.error(error.message);
    }
  }
);

// 1. Get user info
async function getUser(id: number) {
  const user = await request<User>({ url: `/users/${id}` });
  return user;
}

// 2. Create user
async function createUser(data: Partial<User>) {
  const user = await request.post<User>('/users', data);
  return user;
}

// 3. Download file
async function downloadReport(reportId: string) {
  const fileData = await request.get('/download/report.pdf', {
    responseType: 'blob'
  });

  const url = URL.createObjectURL(fileData.file);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileData.filename;
  a.click();
  URL.revokeObjectURL(url);
}

// 4. Upload file
async function uploadFile(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  return await request.post('/upload', formData);
}
```

## 🔧 API Reference

### createRequest

Create a standard request instance.

```typescript
function createRequest<ResponseData, ApiData>(
  config?: FetchRequestConfig,
  options?: RequestOption<ResponseData, ApiData>
): RequestInstance<ApiData>;
```

### createFlatRequest

Create a flat request instance that never throws.

```typescript
function createFlatRequest<ResponseData, ApiData>(
  config?: FetchRequestConfig,
  options?: RequestOption<ResponseData, ApiData>
): FlatRequestInstance<ResponseData, ApiData>;
```

### createFetch / $fetch

Create an ofetch-compatible lightweight fetch client.

```typescript
function createFetch(defaults?: FetchRequestConfig): $Fetch;

interface $Fetch {
  <T = any, R extends ResponseType = 'json'>(
    request: string,
    options?: FetchRequestConfig<R>
  ): Promise<MappedType<R, T>>;
  raw<T = any, R extends ResponseType = 'json'>(
    request: string,
    options?: FetchRequestConfig<R>
  ): Promise<FetchResponse<MappedType<R, T>>>;
  native: typeof fetch;
  create(defaults: FetchRequestConfig): $Fetch;
}
```

### createTypedClient

Create a type-safe client based on `paths` types generated by openapi-typescript.

```typescript
function createTypedClient<Paths, Prefix = '', Field = ''>(
  requestInstance: RequestInstance<any, any>,
  prefix?: Prefix
): TypedClient<Paths, Prefix, Field>;
```

### createFlatTypedClient

Create a type-safe flat client that never throws.

```typescript
function createFlatTypedClient<Paths, Prefix = '', Field = ''>(
  flatRequestInstance: FlatRequestInstance<any, any, any>,
  prefix?: Prefix
): FlatTypedClient<Paths, Prefix, Field>;
```

### createUploadProgressAdapter

Create an upload progress adapter (lower-level, cross-runtime). Uses XHR in browsers, TransformStream in Node/Bun/Deno/CF. Returns a `FetchAdapter`, or `undefined` if no mechanism is available.

> For most cases, use the `onUploadProgress` config option directly (see [Upload Progress Tracking](#12-upload-progress-tracking)).

```typescript
function createUploadProgressAdapter(onUploadProgress: (event: UploadProgressEvent) => void): FetchAdapter | undefined;
```

### Type Definitions

```typescript
// Response
interface FetchResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
  config: ResolvedFetchRequestConfig;
  request?: Request;
}

// Error
class FetchError<T = any> extends Error {
  code?: string;
  config?: FetchRequestConfig;
  request?: Request;
  response?: FetchResponse<T>;
  get status(): number | undefined; // alias statusCode
  get statusText(): string | undefined; // alias statusMessage
  get data(): T | undefined;
}

class BackendError<ResponseData = any> extends FetchError<ResponseData> {
  // error.code === 'BACKEND_ERROR'
}

// Request config
interface FetchRequestConfig<R extends ResponseType = 'json'> extends Omit<
  RequestInit,
  'method' | 'headers' | 'body' | 'signal'
> {
  baseURL?: string;
  url?: string;
  method?: HttpMethod | string;
  headers?: Headers | Record<string, string>;
  query?: Record<string, any>;
  body?: BodyInit | Record<string, any> | null;
  responseType?: R;
  timeout?: number;
  signal?: AbortSignal;
  validateStatus?: (status: number) => boolean;
  paramsSerializer?: (params: Record<string, any>) => string;
  parseResponse?: (text: string) => any;
  getFileName?: (response: FetchResponse) => string;
  retry?: RetryOptions;
  adapter?: FetchAdapter;
  onUploadProgress?: (event: UploadProgressEvent) => void;
  ignoreResponseError?: boolean;
  // Transport hooks (array support)
  onRequest?: FetchHook;
  onRequestError?: FetchHook;
  onResponse?: FetchHook;
  onResponseError?: FetchHook;
}

// Response type
type ResponseType = 'json' | 'auto' | 'blob' | 'arraybuffer' | 'stream' | 'text' | 'document';

// Adapter
type FetchAdapter = (url: string, init: FetchAdapterInit) => Promise<FetchAdapterResponse>;

// Upload progress event
interface UploadProgressEvent {
  loaded: number; // bytes uploaded
  total: number; // total bytes (0 if not computable)
  progress: number; // percentage 0-100
  lengthComputable: boolean; // whether total size is known
}
```

> **@deprecated**: The following deprecated names are still exported for backward compatibility but will be removed in a future version:
>
> - `OpenapiClient` → use `TypedClient`
> - `FlatOpenapiClient` → use `FlatTypedClient`
> - `createOpenapiClient` → use `createTypedClient`
> - `createFlatOpenapiClient` → use `createFlatTypedClient`

## ❓ FAQ

### Difference from @soybeanjs/request?

| Feature                 | @soybeanjs/request    | @soybeanjs/fetch                 |
| ----------------------- | --------------------- | -------------------------------- |
| Underlying              | Axios                 | Native Fetch                     |
| Runtime deps            | axios, axios-retry    | Zero dependencies                |
| Headers                 | AxiosHeaders (`[]`)   | Native Headers (`.set()/.get()`) |
| Retry                   | axios-retry           | Built-in                         |
| Adapter                 | Not supported         | ✅ Custom adapters               |
| $fetch API              | Not supported         | ✅ ofetch-compatible             |
| Transport hooks         | Not supported         | ✅ onRequest/onResponse/...      |
| Auto response detection | Not supported         | ✅ responseType: 'auto'          |
| Business API            | ✅ createRequest etc. | ✅ Fully compatible              |

### How to migrate from @soybeanjs/request?

1. Replace `import { ... } from '@soybeanjs/request'` → `from '@soybeanjs/fetch'`
2. Replace `AxiosResponse` → `FetchResponse`
3. Replace `AxiosError` → `FetchError`
4. Replace `config.headers.Authorization = 'xxx'` → `config.headers.set('Authorization', 'xxx')`
5. Replace `'axios-retry'` config → `retry` config
6. `instance.request(config)` → `instance(config)` (no `.request` method)
7. Replace `data` → `body` (request body), `params` → `query` (query parameters)

### Why two request instances?

- **createRequest**: For most scenarios, throws on failure, use try-catch to handle
- **createFlatRequest**: For scenarios needing unified success/failure handling, never throws, judge by return value

### When to use $fetch vs createRequest?

- **$fetch**: Simple HTTP calls without business logic validation (e.g. calling third-party APIs)
- **createRequest**: When you need business logic (e.g. `isBackendSuccess`, `transform`, `onBackendFail` retry)

### How to cancel a request?

```typescript
const controller = new AbortController();

const promise = request({
  url: '/users',
  signal: controller.signal
});

// Cancel request (does not trigger retry)
controller.abort();
```

## 📄 License

[MIT](./LICENSE) License © 2026 [SoybeanJS](https://github.com/soybeanjs)
