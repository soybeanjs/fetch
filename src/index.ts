// ============================================================
//  Main entry (.) — transport, business request, enhanced
//  features, errors, adapters, and shared types.
//
//  OpenAPI typed clients live in the separate `./openapi`
//  subpath entry — see `src/openapi.ts`.
// ============================================================

export { createRequest, createFlatRequest } from './core';
export { $fetch, createFetch } from './fetch';
export { defaultAdapter, createAdapterResponse, createUploadProgressAdapter } from './adapter';
export { createEnhancedFetch, createEnhancedState, clearCache, deleteCache } from './enhanced';
export { parseContentDisposition, downloadFile } from './file';
export { FetchError, BackendError } from './error';
export { BACKEND_ERROR_FLAG, ERR_SCHEMA } from './constant';

export type * from './types';
export type * from './standard-schema';
