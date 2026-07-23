# @soybeanjs/fetch

[English](./README.en_US.md) | 简体中文

一个基于原生 Fetch 封装的轻量级、类型安全的 HTTP 请求库,零运行时依赖,提供优雅的 API 设计和强大的功能支持。

## ✨ 特性

- 🎯 **类型安全**:完整的 TypeScript 类型支持,智能类型推导
- 🚀 **零依赖**:基于原生 `fetch`,无 axios 等运行时依赖
- 🔄 **双实例模式**:支持标准请求实例和扁平化响应实例
- 📦 **文件下载**:自动解析文件名和内容类型,支持多种文件格式
- 🎣 **生命周期钩子**:提供完整的请求生命周期管理(传输层 + 业务层)
- 🔁 **自动重试**:内置重试机制,支持自定义重试条件和延迟
- ⏱️ **超时控制**:基于 `AbortController`,可区分超时和用户取消
- 🛡️ **错误处理**:统一的错误处理机制,支持业务错误和网络错误
- 📝 **响应转换**:灵活的响应数据转换功能
- 🎨 **状态管理**:内置状态管理,可在实例间共享数据
- 🔌 **适配器 API**:可插拔的传输层,支持 uniapp、微信小程序等平台
- 🌐 **$fetch API**:兼容 ofetch 的轻量 fetch 客户端
- 📡 **传输层钩子**:`onRequest` / `onResponse` / `onRequestError` / `onResponseError`,支持数组
- 🔍 **自动响应类型检测**:根据 `Content-Type` 自动判断响应类型(含 SSE 支持)
- 📤 **上传进度**:跨运行时上传进度跟踪,浏览器用 XHR,Node/Bun/Deno/CF 用 TransformStream
- 📥 **下载进度**:基于 `TransformStream` 的下载进度跟踪
- 💾 **请求缓存**:GET 响应缓存,支持 TTL、最大条数、自定义 key
- 🔀 **请求去重**:自动合并相同在途请求,共享 Promise
- 🚦 **并发限制**:限制同时在途请求数量,防止浏览器并发瓶颈
- 📊 **全局 Loading**:自动追踪请求状态,支持慢请求告警

## 🤖 Agent Skills

本项目内置了一组 **Agent Skills**,为 AI 编程助手(Trae / Cursor / Windsurf 等)提供针对本库的开发指导。每个 skill 对应一类常见开发任务,包含关键文件定位、代码模式、硬约束与常见陷阱,确保 AI 生成的代码符合本库的两层架构与约定。

### 安装

在项目根目录执行以下命令即可安装全部 skills:

```bash
npx skills add soybeanjs/fetch
```

安装后 skills 会放在 `skills/` 目录下,AI 助手会在匹配的任务场景中自动调用。

### 可用 Skills

| Skill                    | 覆盖任务                                                                                      | 关键文件                            |
| ------------------------ | --------------------------------------------------------------------------------------------- | ----------------------------------- |
| `fetch-platform-adapter` | 支持新平台(uniapp / 微信小程序 / React Native),自定义适配器,上传进度跟踪                      | `adapter.ts`                        |
| `fetch-business-hook`    | 添加业务钩子(`transform` / `isBackendSuccess` / `onBackendFail` / `onError` / `onRequest`)    | `core.ts` + `fetch.ts`              |
| `fetch-transport-hook`   | 添加 ofetch 风格传输层钩子(`onRequest` / `onResponse` / `onRequestError` / `onResponseError`) | `fetch.ts` + `types.ts`             |
| `fetch-enhanced-feature` | 添加增强功能(cache / dedupe / concurrency / debounce / throttle / auth / schema / loading)    | `enhanced.ts`                       |
| `fetch-retry-timeout`    | 配置重试次数 / 延迟 / 条件、超时控制、自定义重试状态码                                        | `fetch.ts` + `options.ts`           |
| `fetch-openapi-typing`   | 扩展 OpenAPI 类型安全客户端(`createTypedClient` / `createFlatTypedClient`)                    | `openapi.ts`                        |
| `fetch-error-code`       | 添加自定义错误码、处理 `FetchError` / `BackendError` 错误模型                                 | `error.ts` + `constant.ts`          |
| `fetch-test-writer`      | 按项目规范编写测试(vitest + 全局 fetch mock + 类型安全)                                       | `test/helpers.ts` + `test/setup.ts` |

> 每个 skill 的详细内容见 [`skills/`](./skills) 目录下的 `SKILL.md`。

## 📦 安装

```bash
# npm
npm install @soybeanjs/fetch

# yarn
yarn add @soybeanjs/fetch

# pnpm
pnpm add @soybeanjs/fetch
```

> **环境要求**:Node.js 18+ 或现代浏览器(需原生 `fetch` 支持)。

## 🚀 快速开始

### 基础使用

```typescript
import { createRequest } from '@soybeanjs/fetch';
import type { FetchResponse } from '@soybeanjs/fetch';

interface ApiResponse<T = any> {
  code: number;
  data: T;
  message: string;
}

// 创建请求实例
const request = createRequest(
  {
    baseURL: 'https://api.example.com',
    timeout: 10000
  },
  {
    // 转换响应数据
    // !!!注意这里一定要给 response 指定类型,这样才能有类型推导
    transform: (response: FetchResponse<ApiResponse>) => {
      return response.data.data;
    },
    // 请求前拦截
    onRequest: async config => {
      // 添加 token(headers 是原生 Headers 实例,使用 .set())
      config.headers.set('Authorization', `Bearer ${getToken()}`);
      return config;
    },
    // 判断后端业务是否成功
    isBackendSuccess: response => {
      return response.data.code === 200;
    },
    // 后端业务失败处理
    onBackendFail: async (response, instance) => {
      // 处理 token 过期等情况
      if (response.data.code === 401) {
        await refreshToken();
        // 重新发起请求(走完整管道)
        return instance(response.config);
      }
    },
    // 错误处理
    onError: async error => {
      console.error('Request failed:', error.message);
    }
  }
);

// 发起请求
const data = await request({
  url: '/users',
  method: 'GET'
});
```

### 扁平化响应实例

不抛出异常,通过返回值判断成功或失败:

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

### $fetch — 轻量 fetch 客户端(兼容 ofetch)

无需业务逻辑,直接发起请求:

```typescript
import { $fetch } from '@soybeanjs/fetch';

// GET 请求
const user = await $fetch<User>('/api/users/1');

// POST 请求
const created = await $fetch<User>('/api/users', {
  method: 'POST',
  body: { name: 'John' }
});

// 创建带默认值的实例
const apiFetch = $fetch.create({
  baseURL: 'https://api.example.com',
  headers: { Authorization: 'Bearer xxx' },
  retry: { retries: 3 }
});

// 获取完整响应(不抛异常)
const response = await $fetch.raw('/api/users/1');
console.log(response.status, response.data);

// 直接访问原生 fetch
$fetch.native('https://example.com');
```

## 📖 核心概念

### RequestOption 配置项

| 配置项             | 类型       | 必填 | 说明                                                                                   |
| ------------------ | ---------- | ---- | -------------------------------------------------------------------------------------- |
| `transform`        | `Function` | 是   | 转换响应数据为业务数据                                                                 |
| `onRequest`        | `Function` | 否   | 请求前拦截器(业务层,返回值模式),可添加 token 等                                        |
| `isBackendSuccess` | `Function` | 是   | 判断后端业务逻辑是否成功                                                               |
| `onBackendFail`    | `Function` | 否   | 后端业务失败回调,如处理 token 过期。返回新 `FetchResponse` 可触发重试,新响应会再次校验 |
| `onError`          | `Function` | 否   | 请求错误处理,如显示错误提示                                                            |
| `backendErrorMsg`  | `string`   | 否   | 后端错误消息,用于构造 [`BackendError`](#错误判别)                                      |

> 业务错误会以 `BackendError` 实例(继承自 `FetchError`,`error.code === 'BACKEND_ERROR'`)形式抛出,
> 可通过 `instanceof BackendError` 或 `error.code === BACKEND_ERROR_FLAG` 判别,详见 [错误判别](#错误判别)。

### 传输层钩子(对标 ofetch)

除了业务层钩子(`RequestOption`),`FetchRequestConfig` 还支持传输层钩子,支持**单个函数或数组**:

```typescript
const request = createRequest(
  {
    baseURL: 'https://api.example.com',
    // 传输层钩子(每个请求也可单独设置)
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

| 钩子              | 触发时机                | 参数                           |
| ----------------- | ----------------------- | ------------------------------ |
| `onRequest`       | 请求发送前              | `FetchContext`                 |
| `onRequestError`  | 请求失败(网络错误/超时) | `FetchContext` (含 `error`)    |
| `onResponse`      | 响应接收并解析后        | `FetchContext` (含 `response`) |
| `onResponseError` | 响应状态码错误(4xx/5xx) | `FetchContext` (含 `error`)    |

> **与业务层钩子的区别**: 传输层钩子在 `FetchRequestConfig` 中配置,支持数组和 `FetchContext` 模式;业务层钩子在 `RequestOption` 中配置,单个函数,返回值模式。传输层钩子先于业务层执行。

### 错误判别

业务错误(由 `isBackendSuccess` 判定为失败)会构造为 `BackendError` 实例:

```typescript
import { FetchError, BackendError, BACKEND_ERROR_FLAG } from '@soybeanjs/fetch';

try {
  await request({ url: '/users/1' });
} catch (error) {
  if (error instanceof BackendError) {
    // 业务错误,例如 code !== 200
    console.error('业务错误:', error.message);
  } else if (error instanceof FetchError) {
    // 网络 / HTTP 错误
    console.error('网络错误:', error.message);
  }
}

// 或通过 code 判别(等价于 instanceof BackendError)
if (fetchError.code === BACKEND_ERROR_FLAG) {
  // ...
}
```

`FetchError` 提供以下便捷属性:

| 属性         | 说明                                |
| ------------ | ----------------------------------- |
| `status`     | HTTP 状态码(别名 `statusCode`)      |
| `statusText` | HTTP 状态文本(别名 `statusMessage`) |
| `data`       | 响应数据                            |
| `code`       | 错误码                              |
| `response`   | 完整 `FetchResponse`                |
| `config`     | 请求配置                            |

### 请求处理流程

```
用户发起请求
    ↓
传输层 onRequest 钩子(FetchContext 模式)
    ↓
业务层 onRequest 钩子(返回值模式)
    ↓
发送 HTTP 请求(adapter)
    ↓
├─ 网络错误 → 传输层 onRequestError → retry → onError
    ↓
接收响应 → 解析响应体(auto 自动检测类型)
    ↓
传输层 onResponse 钩子
    ↓
validateStatus 检查
    ├─ 错误状态码 → 传输层 onResponseError → retry → onError
    ↓
processResponse(业务逻辑)
    ├─ coerceBinaryToJsonResponse(二进制转 JSON)
    ├─ isBackendSuccess 校验
    │   ├─ 成功 → transform → 返回业务数据
    │   └─ 失败 → onBackendFail → BackendError → onError
    ├─ 文件类型 → 返回文件信息对象
    └─ 其他 → 返回原始数据
```

## 🎯 高级功能

### 1. 文件下载

支持自动解析文件名和内容类型:

```typescript
// 下载文件
const fileData = await request({
  url: '/download/report.pdf',
  method: 'GET',
  responseType: 'blob'
});

// fileData 包含:
// {
//   file: Blob,
//   filename: 'report.pdf',
//   contentType: 'application/pdf'
// }

// 自定义文件名解析
const fileData = await request({
  url: '/download/file',
  responseType: 'blob',
  getFileName: response => {
    // 自定义解析逻辑
    return 'custom-filename.pdf';
  }
});

// 使用内置的 downloadFile 工具函数触发浏览器下载
import { downloadFile } from '@soybeanjs/fetch';

downloadFile(fileData.file, fileData.filename);
```

支持的文件类型:

- `blob` → `FileResponseData<Blob>`
- `arraybuffer` → `FileResponseData<ArrayBuffer>`
- `stream` → `FileResponseData<ReadableStream<Uint8Array>>`

### 2. 响应类型支持

```typescript
// JSON(默认),需要添加一个泛型参数指定业务数据类型,其他类型无需指定
interface UserData {
  id: number;
  name: string;
}
const data = await request<UserData>({
  url: '/users/123'
});

// auto — 根据 Content-Type 自动检测(推荐用于 $fetch)
const data = await $fetch('/api/data', { responseType: 'auto' });

// 文本
const text = await request({
  url: '/data.csv',
  responseType: 'text'
});

// HTML/XML 文档(使用 DOMParser)
const doc = await request({
  url: '/template.html',
  responseType: 'document'
});

// Blob(文件)
const file = await request({
  url: '/download/image.png',
  responseType: 'blob'
});

// ArrayBuffer
const buffer = await request({
  url: '/download/data.bin',
  responseType: 'arraybuffer'
});

// Stream(SSE / 大文件流)
const stream = await request({
  url: '/events',
  responseType: 'stream'
});
```

支持的响应类型:

| 类型          | 说明                                       |
| ------------- | ------------------------------------------ |
| `json`        | JSON(默认)                                 |
| `auto`        | 根据 `Content-Type` 自动检测               |
| `text`        | 文本                                       |
| `blob`        | Blob 文件                                  |
| `arraybuffer` | ArrayBuffer                                |
| `stream`      | ReadableStream(含 SSE `text/event-stream`) |
| `document`    | HTML/XML 文档(DOMParser,浏览器环境)        |

### 3. 状态管理

`request.state` 返回 `EnhancedState`,包含内置运行时状态(cache、loading、dedupe、messages 等),并支持通过索引签名直接扩展自定义字段:

```typescript
const request = createRequest(
  { baseURL: 'https://api.example.com' },
  {
    // ...其他配置
    onRequest: config => {
      config.headers.set('Authorization', `Bearer ${request.state.token}`);
      return config;
    }
  }
);

// 用户自定义状态 —— 直接在 state 上读写
request.state.token = 'new-token';
request.state.userId = 123;

// 内置运行时状态也可访问
request.state.loading.count; // 当前并发请求数
request.state.cache.size; // 缓存条目数
```

#### 消息去重

`request.state.messages` 是内置的 `MessageStack` 实例,用于请求消息去重。当请求在短时间内重复触发时,窗口内相同 key 的消息只通过首次:

```typescript
const request = createRequest(
  { baseURL: 'https://api.example.com' },
  {
    isBackendSuccess: r => r.data.code === 200,
    onError: error => {
      // 3s 内同一 error.message 只展示一次
      if (request.state.messages.push(error.message)) {
        showToast(error.message);
      }
    }
  }
);

// 自定义去重 key(如按错误码去重)
if (request.state.messages.push(error.code, error.message)) {
  showToast(error.message);
}

// 调整时间窗口(默认 3000ms)
request.state.messages.interval = 5000;

// 查看窗口内活跃消息
request.state.messages.getActive();

// 清空消息栈
request.state.messages.clear();
```

### 4. 自动重试

内置重试机制,无需额外依赖:

```typescript
const request = createRequest(
  {
    baseURL: 'https://api.example.com',
    retry: {
      retries: 3,
      retryDelay: retryCount => retryCount * 1000,
      retryCondition: error => {
        // 仅在网络错误或 5xx 错误时重试
        return !error.response || error.response.status >= 500;
      }
    }
  },
  options
);
```

| 配置项           | 类型                                     | 默认值              | 说明           |
| ---------------- | ---------------------------------------- | ------------------- | -------------- |
| `retries`        | `number`                                 | `0`                 | 重试次数       |
| `retryDelay`     | `(count, error) => number`               | 线性退避            | 重试延迟(毫秒) |
| `retryCondition` | `(error) => boolean \| Promise<boolean>` | 网络错误+重试状态码 | 重试条件       |

默认重试状态码: `408, 409, 425, 429, 500, 502, 503, 504`

> 用户主动取消(非超时)不会触发重试。

### 5. 超时控制

基于 `AbortController` 实现,可区分超时和用户取消:

```typescript
const request = createRequest({ timeout: 10000 }, options);

// 超时会抛出 FetchError,code 为 'ERR_TIMEOUT'
// 错误消息格式: [GET] "https://...": Request timeout of 10000ms exceeded

// 用户主动取消(不会重试)
const controller = new AbortController();
const promise = request({
  url: '/users',
  signal: controller.signal
});

// 取消请求
controller.abort();
```

### 6. 类型推导

完整的 TypeScript 类型支持:

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

// ResponseData:后端原始响应类型
// ApiData:业务数据类型
const request = createRequest(
  { baseURL: 'https://api.example.com' },
  {
    transform: (response: FetchResponse<ApiResponse>) => response.data.data
  }
);

// 类型推导:data 的类型是 ApiResponse<User>
const user = await request<User>({
  url: '/users/123'
});
```

### 7. raw 方法 — 获取原始响应

通过 `request.raw()` 可以跳过 `transform` 转换,直接获取完整的 `FetchResponse` 对象。

**与普通 `request()` 的区别:**

| 方法            | 返回值                      | 是否经过 transform |
| --------------- | --------------------------- | ------------------ |
| `request()`     | 转换后的业务数据            | ✅ 是              |
| `request.raw()` | 完整的 `FetchResponse` 对象 | ❌ 否              |

```typescript
// 1. 获取响应头中的自定义信息
const response = await request.raw<User[]>({
  url: '/users',
  method: 'GET'
});

const totalCount = response.headers.get('x-total-count');
const requestId = response.headers.get('x-request-id');
const statusCode = response.status;

// 2. 文件下载时获取原始响应 + 文件信息
const fileResponse = await request.raw({
  url: '/download/report.pdf',
  responseType: 'blob'
});

// fileResponse.data 包含 { file, filename, contentType }
```

> `createFlatRequest` 创建的扁平化实例同样提供 `flatRequest.raw()` 方法,语义一致,但不抛异常。

### 8. 便捷 HTTP 方法

`RequestInstance` 和 `FlatRequestInstance` 都提供了常用 HTTP 动词的快捷方法:

```typescript
// GET 请求
const users = await request.get<User[]>('/users');
const usersWithQuery = await request.get<User[]>('/users', {
  query: { page: 1, pageSize: 10 }
});

// POST 请求
const newUser = await request.post<User>('/users', {
  name: '张三',
  email: 'zhangsan@example.com'
});

// PUT 请求
const updatedUser = await request.put<User>('/users/123', {
  name: '张三(已更新)'
});

// PATCH 请求
const patchedUser = await request.patch<User>('/users/123', {
  email: 'newemail@example.com'
});

// DELETE 请求
await request.delete('/users/123');
```

### 9. 适配器 API — 跨平台支持

通过自定义适配器,可在 uniapp、微信小程序等非标准 fetch 环境中运行:

```typescript
import { createRequest, createAdapterResponse } from '@soybeanjs/fetch';

// uniapp 适配器示例
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

### 10. ignoreResponseError — 忽略响应错误

当 `ignoreResponseError` 为 `true` 时,跳过 `validateStatus` 检查,返回响应而非抛出异常:

```typescript
const response = await $fetch.raw('/api/users/404', {
  ignoreResponseError: true
});

// 即使是 404 也会返回 response,不会抛出 FetchError
console.log(response.status); // 404
console.log(response.data); // 错误页面数据
```

### 11. 类型安全客户端 (Typed Client / OpenAPI)

通过 [openapi-typescript](https://openapi-ts.dev/) 生成 `paths` 类型后,可创建**全类型安全**的请求客户端。

> **前置步骤**:使用 `openapi-typescript` 将 `openapi.json` 生成类型文件:
>
> ```bash
> npx openapi-typescript ./openapi.json -o ./src/openapi.d.ts
> ```

#### createTypedClient

```typescript
import { createRequest, createTypedClient } from '@soybeanjs/fetch';
import type { paths } from './openapi.d.ts';

const request = createRequest({ baseURL: 'https://api.example.com' }, {/* ... */});

// Field = 'data' 用于解包 envelope 结构
const client = createTypedClient<paths, '/api/v1', 'data'>(request, '/api/v1');

// 路径、参数、请求体、返回值均有类型推导
const menus = await client.get('/menu/list', {
  query: { page: 1, pageSize: 10 }
});

// POST 请求
const loginResult = await client.post('/auth/login', {
  body: { username: 'admin', password: '123456' }
});

// 路径参数(替换 URL 中的 {id})
const user = await client.get('/users/{id}', {
  pathParams: { id: 1 }
});

// raw 方法 — 跳过 transform,返回完整 FetchResponse
const response = await client.raw.get('/menu/list', {
  query: { page: 1 }
});
```

#### createFlatTypedClient

包装 `createFlatRequest` 创建的扁平化实例,**不抛出异常**:

```typescript
import { createFlatRequest, createFlatTypedClient } from '@soybeanjs/fetch';

const flatRequest = createFlatRequest({ baseURL: 'https://api.example.com' }, {/* ... */});

const client = createFlatTypedClient<paths, '/api/v1', 'data'>(flatRequest, '/api/v1');

const { data, error } = await client.get('/menu/list', {
  query: { page: 1 }
});

if (error) {
  console.error('请求失败:', error.message);
} else {
  console.log('菜单:', data);
}
```

### 12. 上传进度跟踪

原生 `fetch()` API **不支持上传进度事件**。本库通过 `onUploadProgress` 配置项弥补这一缺陷 —— 设置后库会自动为该请求切换到支持进度跟踪的适配器,无需手动管理适配器。

适用于 `createRequest`、`createFlatRequest`、`$fetch` / `createFetch` 的所有 API,可在实例级或单次请求级使用。

**跨运行时支持**:库根据运行时自动选择最佳方案:

| 运行时               | 机制                             | `total` 精度                                   |
| -------------------- | -------------------------------- | ---------------------------------------------- |
| 浏览器               | `XMLHttpRequest.upload.progress` | 精确                                           |
| Node.js / Bun / Deno | `TransformStream` 字节计数       | 已知大小 body 精确(Blob/ArrayBuffer/string 等) |
| CF Workers           | `TransformStream` 字节计数       | 可能缓冲(进度瞬间跳 100%)                      |

> 对于 `FormData` 和原始 `ReadableStream` body,流式方案无法预知总大小,此时 `lengthComputable` 为 `false`,但 `loaded`(已上传字节数)仍会更新。

#### 基本用法(单次请求)

最常见场景:仅对上传接口设置进度回调。

```typescript
import { createRequest } from '@soybeanjs/fetch';

const request = createRequest({ baseURL: 'https://api.example.com' }, {/* ... */});

async function uploadFile(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  // 只需在请求配置中传入 onUploadProgress 回调
  const result = await request.post('/upload', formData, {
    onUploadProgress: ({ loaded, total, progress }) => {
      console.log(`上传进度: ${progress}% (${loaded}/${total} bytes)`);
    }
  });

  return result;
}
```

`$fetch` 同样支持:

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

#### 进度事件

`onUploadProgress` 回调接收一个 `UploadProgressEvent` 对象:

| 属性               | 类型      | 说明                                                                  |
| ------------------ | --------- | --------------------------------------------------------------------- |
| `loaded`           | `number`  | 已上传的字节数                                                        |
| `total`            | `number`  | 总字节数(不可计算时为 0)                                              |
| `progress`         | `number`  | 上传进度百分比 0-100(不可计算时为 0)                                  |
| `lengthComputable` | `boolean` | 总大小是否已知。`false` 时 `total`/`progress` 为 0,但 `loaded` 仍有效 |

> 浏览器(XHR)模式下,仅当总大小已知时触发回调。流式模式下始终触发,通过 `lengthComputable` 区分。

#### 在 Vue / React 中结合进度条

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
    console.error('上传失败:', error.message);
  } else {
    console.log('上传成功:', data);
  }

  uploadProgress.value = 0; // 重置
}
```

#### 实例级配置(全局上传进度)

如需实例上所有请求都跟踪上传进度,可在创建实例时设置 `onUploadProgress`:

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

#### 高级:createUploadProgressAdapter

`createUploadProgressAdapter` 是底层构建函数,返回一个 `FetchAdapter`。跨运行时自动选择最佳方案(浏览器 XHR,其他环境 TransformStream)。适合需要将上传进度适配器与其他自定义适配器逻辑组合的场景:

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

> 当同时设置了 `adapter` 和 `onUploadProgress` 时,`adapter` 优先,`onUploadProgress` 会被忽略。

### 13. 下载进度跟踪

通过 `onDownloadProgress` 配置项跟踪响应体下载进度。库会将响应体包装为计数的 `TransformStream`,每个 chunk 下载时触发回调。

适用于大文件下载场景,与上传进度对称。

```typescript
// 单次请求
await request.get('/large-file', {
  responseType: 'blob',
  onDownloadProgress: ({ progress, loaded, total, lengthComputable }) => {
    if (lengthComputable) {
      console.log(`下载: ${progress}% (${loaded}/${total} bytes)`);
    } else {
      console.log(`已下载 ${loaded} bytes`);
    }
  }
});

// $fetch 也支持
const blob = await $fetch('/video.mp4', {
  responseType: 'blob',
  onDownloadProgress: ({ progress }) => {
    progressBar.value = progress;
  }
});
```

`onDownloadProgress` 回调接收 `DownloadProgressEvent`(与 `UploadProgressEvent` 结构相同):

| 属性               | 类型      | 说明                                        |
| ------------------ | --------- | ------------------------------------------- |
| `loaded`           | `number`  | 已下载字节数                                |
| `total`            | `number`  | 总字节数(从 `Content-Length` 获取,无则为 0) |
| `progress`         | `number`  | 下载百分比 0-100(不可计算时为 0)            |
| `lengthComputable` | `boolean` | 总大小是否已知                              |

### 14. 请求缓存

通过 `cache` 配置项缓存 GET 响应,避免重复请求。支持 TTL、最大条数、自定义 key 和按方法过滤。

```typescript
const request = createRequest(
  {
    baseURL: '/api',
    cache: {
      ttl: 30000, // 缓存 30 秒
      methods: ['get'], // 仅缓存 GET(默认)
      max: 100 // 最多 100 条(默认),超出淘汰最旧
      // key: (config) => '...' // 自定义缓存 key
    }
  },
  options
);

// 第一次请求:发起网络调用
const a = await request.get('/user');
// 30 秒内的第二次请求:直接返回缓存
const b = await request.get('/user');

// 单次请求跳过缓存
const c = await request.get('/user', { cache: false });
```

**缓存管理**:实例上提供 `clearCache()` 和 `deleteCache(key)` 方法手动管理缓存:

```typescript
// 清除所有缓存
request.clearCache();

// 删除指定 key 的缓存(默认 key 格式为 "METHOD:url:query")
request.deleteCache('GET:/api/user:id=1');

// 更新数据后清除缓存,下次请求将重新拉取
await request.put('/user', newData);
request.clearCache();
```

### 15. 请求去重

通过 `dedupe` 配置项合并相同的在途请求。当多个相同的请求同时在途时,只发起一次网络调用,所有调用者共享同一个 Promise。

```typescript
const request = createRequest(
  {
    baseURL: '/api',
    dedupe: true
  },
  options
);

// 两个并发相同请求 → 只发一次网络调用
const [a, b] = await Promise.all([request.get('/user'), request.get('/user')]);
console.log(a === b); // true(同一个响应)

// 自定义去重 key
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

> 默认去重 key 为 `method:url:query:body`。请求完成后自动从去重表中移除。

### 16. 并发限制

通过 `concurrency` 配置项限制同时在途的请求数量。超出限制的请求排队等待,防止浏览器并发上限(6 个)导致的性能问题。

```typescript
const request = createRequest({
  baseURL: '/api',
  concurrency: {
    maxConcurrent: 6   // 最多同时 6 个请求
  }
}, options);

// 批量上传 100 个文件,但最多同时上传 6 个
const files = [...]; // 100 files
const results = await Promise.all(
  files.map(file => request.post('/upload', file))
);
```

### 17. 全局 Loading 与慢请求追踪

通过 `onGlobalLoadingChange`、`onLoadingChange`、`slowThreshold` 和 `onSlowRequest` 自动追踪请求状态。

```typescript
const request = createRequest(
  {
    baseURL: '/api',
    // 全局 loading:第一个请求开始时 true,最后一个请求结束时 false
    onGlobalLoadingChange: loading => {
      store.globalLoading = loading;
    },
    // 慢请求:超过 10 秒触发告警
    slowThreshold: 10000,
    onSlowRequest: ({ url, method, duration }) => {
      console.warn(`慢请求: ${method} ${url} 已耗时 ${duration}ms`);
      // 上报监控...
    }
  },
  options
);

// 单请求 loading:该请求开始时 true,结束时 false
await request.post('/save', data, {
  onLoadingChange: loading => {
    saveBtnLoading.value = loading;
  }
});
```

| 配置项                  | 类型                                | 说明                                                |
| ----------------------- | ----------------------------------- | --------------------------------------------------- |
| `onGlobalLoadingChange` | `(loading: boolean) => void`        | 全局 loading 状态变化回调(0→1 true,1→0 false)       |
| `onLoadingChange`       | `(loading: boolean) => void`        | 单请求 loading 状态回调(该请求开始 true,结束 false) |
| `slowThreshold`         | `number`                            | 慢请求阈值(ms),0 = 不启用(默认)                     |
| `onSlowRequest`         | `(entry: SlowRequestEntry) => void` | 慢请求回调,含 `url`/`method`/`duration`             |

> **全局 vs 单请求 Loading**:`onGlobalLoadingChange` 在第一个请求开始时触发 `true`,最后一个请求结束时触发 `false`,适合全局 loading 遮罩;`onLoadingChange` 对每个请求独立触发,适合按钮级别的 loading 状态。两者可同时使用。

### 18. 防抖与节流

通过 `debounce` 和 `throttle` 配置项控制请求频率。

**防抖**(`debounce`):延迟请求执行,延迟期间有新请求进入则取消前一个并重新计时。适用于搜索输入。

```typescript
// 搜索输入防抖 300ms — 用户停止输入 300ms 后才发请求
searchInput.addEventListener('input', e => {
  request.get('/search', {
    query: { q: e.target.value },
    debounce: 300
  });
});
```

**节流**(`throttle`):固定间隔内只允许一次请求,额外请求被拒绝(`ERR_THROTTLED`)。适用于按钮防重复点击。

```typescript
// 提交按钮节流 1 秒 — 1 秒内多次点击只发一次
submitButton.addEventListener('click', () => {
  request
    .post('/submit', formData, {
      throttle: 1000
    })
    .catch(err => {
      if (err.code === 'ERR_THROTTLED') return; // 忽略节流拒绝
      throw err;
    });
});
```

> 防抖和节流的 key 默认为 `method:url:query:body`,相同 key 的请求才会互相影响。

### 19. Auth 管理

通过 `auth` 配置项自动附加 Token 和处理 Token 刷新。

```typescript
const request = createRequest(
  {
    baseURL: '/api',
    auth: {
      // 自动附加 Authorization: Bearer <token>
      getToken: () => localStorage.getItem('token'),

      // 刷新 token,返回新 token
      refreshToken: async () => {
        const res = await fetch('/auth/refresh', {
          headers: { 'refresh-token': localStorage.getItem('refreshToken') }
        });
        const { token } = await res.json();
        localStorage.setItem('token', token);
        return token;
      },

      // 何时触发刷新 —— 默认 401,可自定义状态码或判断函数
      // refreshOn: 403,                        // 403 时刷新
      refreshOn: (status, response) => {
        // 自定义判断
        return status === 401 || response.headers.get('x-token-expired') === '1';
      },

      // 刷新失败时调用(如跳转登录页)
      onUnauthorized: () => {
        router.push('/login');
      }
    }
  },
  options
);
```

| 属性             | 类型                                      | 说明                               |
| ---------------- | ----------------------------------------- | ---------------------------------- |
| `getToken`       | `() => string \| Promise<string>`         | 获取当前 token,自动附加到请求头    |
| `refreshToken`   | `() => Promise<string>`                   | 刷新 token,返回新 token            |
| `refreshOn`      | `number \| (status, response) => boolean` | 触发刷新的条件,默认 `401`          |
| `onUnauthorized` | `() => void`                              | 刷新失败或无 `refreshToken` 时调用 |

**并发刷新去重**:多个请求同时触发刷新时,只调用一次 `refreshToken`,所有请求共享同一个刷新 Promise,刷新成功后全部自动重试。

### 20. 响应 Schema 验证

通过 `schema` 配置项在运行时验证响应数据结构,兼容 Zod,也支持普通验证函数。

```typescript
import { z } from 'zod';

// 使用 Zod Schema
const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email()
});

const user = await request.get('/user', { schema: UserSchema });
// user 已通过运行时验证,类型安全

// 使用普通验证函数
const user2 = await request.get('/user', {
  schema: data => {
    if (!data.id) throw new Error('Missing id');
    return data;
  }
});
```

验证失败时抛出异常(如 Zod 的 `ZodError`),可通过 `onError` 统一处理。

### 21. 请求/响应数据转换

通过 `transformRequest` 和 `transformResponse` 全局转换数据格式,如 camelCase ↔ snake_case。

```typescript
import { camelCase, snakeCase } from 'lodash';

const request = createRequest(
  {
    baseURL: '/api',
    // 发送前:camelCase → snake_case
    transformRequest: body => {
      if (typeof body !== 'object' || body === null) return body;
      return Object.fromEntries(Object.entries(body).map(([k, v]) => [snakeCase(k), v]));
    },
    // 接收后:snake_case → camelCase
    transformResponse: data => {
      if (typeof data !== 'object' || data === null) return data;
      return Object.fromEntries(Object.entries(data).map(([k, v]) => [camelCase(k), v]));
    }
  },
  options
);

// 请求发送 { user_name: 'test' } (而非 { userName: 'test' })
// 响应自动转为 { userName: 'test' } (而非 { user_name: 'test' })
await request.post('/user', { userName: 'test' });
```

## 🛠️ 实用工具

### parseContentDisposition

解析 `Content-Disposition` 响应头获取文件名:

```typescript
import { parseContentDisposition } from '@soybeanjs/fetch';

const filename = parseContentDisposition("attachment; filename*=UTF-8''%E6%96%87%E4%BB%B6.pdf");
// '文件.pdf'
```

### downloadFile

在浏览器中触发文件下载:

```typescript
import { downloadFile } from '@soybeanjs/fetch';

downloadFile(blob, 'report.pdf');
```

### createFetch / $fetch

创建 ofetch 兼容的轻量 fetch 客户端:

```typescript
import { $fetch, createFetch } from '@soybeanjs/fetch';

// 使用默认实例
const data = await $fetch('/api/users/1');

// 创建自定义实例
const apiFetch = createFetch({
  baseURL: 'https://api.example.com',
  retry: { retries: 3 },
  onRequest: [({ request }) => console.log('→', request)]
});

// 链式创建
const authFetch = apiFetch.create({
  headers: { Authorization: 'Bearer xxx' }
});
```

### createAdapterResponse

帮助适配器作者构造 `FetchAdapterResponse`:

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

底层函数,创建基于 XHR 的上传进度适配器(详见 [上传进度跟踪](#12-上传进度跟踪))。

> 单次请求推荐直接使用 `onUploadProgress` 配置项,无需手动创建适配器。

```typescript
import { createUploadProgressAdapter } from '@soybeanjs/fetch';
import type { UploadProgressEvent } from '@soybeanjs/fetch';

const adapter = createUploadProgressAdapter((event: UploadProgressEvent) => {
  console.log(`${event.progress}% (${event.loaded}/${event.total})`);
});

// adapter 类型为 FetchAdapter | undefined
// 浏览器环境返回 FetchAdapter,Node.js 返回 undefined
```

## 📝 完整示例

### 带认证的 API 请求

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

      // Token 过期,刷新后重试
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

// 1. 获取用户信息
async function getUser(id: number) {
  const user = await request<User>({ url: `/users/${id}` });
  return user;
}

// 2. 创建用户
async function createUser(data: Partial<User>) {
  const user = await request.post<User>('/users', data);
  return user;
}

// 3. 下载文件
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

// 4. 上传文件
async function uploadFile(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  return await request.post('/upload', formData);
}
```

## 🔧 API 参考

### createRequest

创建标准请求实例。

```typescript
function createRequest<ResponseData, ApiData>(
  config?: FetchRequestConfig,
  options?: RequestOption<ResponseData, ApiData>
): RequestInstance<ApiData>;
```

### createFlatRequest

创建扁平化请求实例,不抛出异常。

```typescript
function createFlatRequest<ResponseData, ApiData>(
  config?: FetchRequestConfig,
  options?: RequestOption<ResponseData, ApiData>
): FlatRequestInstance<ResponseData, ApiData>;
```

### createFetch / $fetch

创建 ofetch 兼容的轻量 fetch 客户端。

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

基于 openapi-typescript 生成的 `paths` 类型创建类型安全的客户端。

```typescript
function createTypedClient<Paths, Prefix = '', Field = ''>(
  requestInstance: RequestInstance<any, any>,
  prefix?: Prefix
): TypedClient<Paths, Prefix, Field>;
```

### createFlatTypedClient

创建类型安全的扁平化客户端,不抛出异常。

```typescript
function createFlatTypedClient<Paths, Prefix = '', Field = ''>(
  flatRequestInstance: FlatRequestInstance<any, any, any>,
  prefix?: Prefix
): FlatTypedClient<Paths, Prefix, Field>;
```

### createUploadProgressAdapter

创建上传进度适配器(底层函数,跨运行时)。浏览器使用 XHR,Node/Bun/Deno/CF 使用 TransformStream。返回 `FetchAdapter`,无可用方案时返回 `undefined`。

> 大多数场景下直接使用 `onUploadProgress` 配置项即可(详见 [上传进度跟踪](#12-上传进度跟踪)),无需手动调用此函数。

```typescript
function createUploadProgressAdapter(onUploadProgress: (event: UploadProgressEvent) => void): FetchAdapter | undefined;
```

### 类型定义

```typescript
// 响应
interface FetchResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
  config: ResolvedFetchRequestConfig;
  request?: Request;
}

// 错误
class FetchError<T = any> extends Error {
  code?: string;
  config?: FetchRequestConfig;
  request?: Request;
  response?: FetchResponse<T>;
  get status(): number | undefined; // 别名 statusCode
  get statusText(): string | undefined; // 别名 statusMessage
  get data(): T | undefined;
}

class BackendError<ResponseData = any> extends FetchError<ResponseData> {
  // error.code === 'BACKEND_ERROR'
}

// 请求配置
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
  // 传输层钩子(支持数组)
  onRequest?: FetchHook;
  onRequestError?: FetchHook;
  onResponse?: FetchHook;
  onResponseError?: FetchHook;
}

// 响应类型
type ResponseType = 'json' | 'auto' | 'blob' | 'arraybuffer' | 'stream' | 'text' | 'document';

// 适配器
type FetchAdapter = (url: string, init: FetchAdapterInit) => Promise<FetchAdapterResponse>;

// 上传进度事件
interface UploadProgressEvent {
  loaded: number; // 已上传字节数
  total: number; // 总字节数(不可计算时为 0)
  progress: number; // 进度百分比 0-100
  lengthComputable: boolean; // 总大小是否已知
}
```

> **@deprecated**:以下废弃名称仍为向后兼容而导出,但将在未来版本中移除:
>
> - `OpenapiClient` → 请使用 `TypedClient`
> - `FlatOpenapiClient` → 请使用 `FlatTypedClient`
> - `createOpenapiClient` → 请使用 `createTypedClient`
> - `createFlatOpenapiClient` → 请使用 `createFlatTypedClient`

## ❓ FAQ

### 与 @soybeanjs/request 的区别?

| 特性         | @soybeanjs/request  | @soybeanjs/fetch              |
| ------------ | ------------------- | ----------------------------- |
| 底层         | Axios               | 原生 Fetch                    |
| 运行时依赖   | axios, axios-retry  | 零依赖                        |
| Headers      | AxiosHeaders(`[]`)  | 原生 Headers(`.set()/.get()`) |
| 重试         | axios-retry         | 内置实现                      |
| 适配器       | 不支持              | ✅ 支持自定义适配器           |
| $fetch API   | 不支持              | ✅ 兼容 ofetch                |
| 传输层钩子   | 不支持              | ✅ onRequest/onResponse/...   |
| 自动响应检测 | 不支持              | ✅ responseType: 'auto'       |
| 业务 API     | ✅ createRequest 等 | ✅ 完全兼容                   |

### 如何从 @soybeanjs/request 迁移?

1. 替换 `import { ... } from '@soybeanjs/request'` → `from '@soybeanjs/fetch'`
2. 替换 `AxiosResponse` → `FetchResponse`
3. 替换 `AxiosError` → `FetchError`
4. 替换 `config.headers.Authorization = 'xxx'` → `config.headers.set('Authorization', 'xxx')`
5. 替换 `'axios-retry'` 配置 → `retry` 配置
6. `instance.request(config)` → `instance(config)`(无 `.request` 方法)
7. 替换 `data` → `body`(请求体)、`params` → `query`(查询参数)

### 为什么需要两种请求实例?

- **createRequest**:适合大多数场景,请求失败会抛出异常,可使用 try-catch 捕获
- **createFlatRequest**:适合需要统一处理成功和失败的场景,不会抛出异常,通过返回值判断

### 什么时候用 $fetch,什么时候用 createRequest?

- **$fetch**:简单的 HTTP 调用,不需要业务逻辑校验(如调用第三方 API)
- **createRequest**:需要业务逻辑(如 `isBackendSuccess`、`transform`、`onBackendFail` 重试)

### 如何实现请求取消?

```typescript
const controller = new AbortController();

const promise = request({
  url: '/users',
  signal: controller.signal
});

// 取消请求(不会触发重试)
controller.abort();
```

## 📄 License

[MIT](./LICENSE) License © 2026 [SoybeanJS](https://github.com/soybeanjs)
