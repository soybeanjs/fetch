import { vi } from 'vitest';
import type { FetchAdapterResponse } from '../src/types';

// ============================================================
//  Mock Response Builder
// ============================================================

export interface MockResponseOptions {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: any;
  contentType?: string;
}

/**
 * Build a FetchAdapterResponse-compatible object (the shape returned by adapters
 * and consumed by fetchCore).
 */
export function createMockAdapterResponse(options: MockResponseOptions = {}): FetchAdapterResponse {
  const {
    status = 200,
    statusText = 'OK',
    headers = {},
    body = '',
    contentType = 'application/json'
  } = options;

  const responseHeaders = new Headers({ 'content-type': contentType, ...headers });
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  const blob = new Blob([bodyStr], { type: contentType });

  return {
    status,
    statusText,
    headers: responseHeaders,
    body: blob.stream(),
    text: () => Promise.resolve(bodyStr),
    blob: () => Promise.resolve(blob),
    arrayBuffer: () => blob.arrayBuffer()
  };
}

/**
 * Build a native Response object (what `fetch()` returns).
 */
export function createMockFetchResponse(options: MockResponseOptions = {}): Response {
  const {
    status = 200,
    statusText = 'OK',
    headers = {},
    body = '',
    contentType = 'application/json'
  } = options;

  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  const responseHeaders = new Headers({ 'content-type': contentType, ...headers });

  // Null-body statuses (204, 205, 304) cannot have a body in the Response constructor
  const nullBodyStatuses = new Set([101, 204, 205, 304]);
  if (nullBodyStatuses.has(status)) {
    return new Response(null, { status, statusText, headers: responseHeaders });
  }

  return new Response(bodyStr, {
    status,
    statusText,
    headers: responseHeaders
  });
}

// ============================================================
//  Global Fetch Mock
// ============================================================

/**
 * The shared mock fetch function. Tests can configure its behavior via
 * `setFetchResponse()` or `setFetchImplementation()`.
 */
const fetchCalls: { url: string; init?: RequestInit }[] = [];

let customImplementation: ((url: string, init?: RequestInit) => Response | Promise<Response>) | null = null;
let defaultResponseOptions: MockResponseOptions = {};

export const mockFetch = vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
  fetchCalls.push({ url, init });

  if (customImplementation) {
    return customImplementation(url, init);
  }

  return createMockFetchResponse(defaultResponseOptions);
});

/** Set the default response for all subsequent fetch calls. */
export function setFetchResponse(options: MockResponseOptions = {}): void {
  defaultResponseOptions = options;
  customImplementation = null;
}

/** Set a custom implementation that controls the response per call. */
export function setFetchImplementation(fn: (url: string, init?: RequestInit) => Response | Promise<Response>): void {
  customImplementation = fn;
}

/** Reset the mock state (called automatically in setup.ts beforeEach). */
export function resetFetchMock(): void {
  fetchCalls.length = 0;
  customImplementation = null;
  defaultResponseOptions = {};
  mockFetch.mockClear();
}

/** Get all recorded fetch calls. */
export function getFetchCalls(): readonly { url: string; init?: RequestInit }[] {
  return fetchCalls;
}

/** Get the number of fetch calls. */
export function getFetchCallCount(): number {
  return fetchCalls.length;
}

// ============================================================
//  Misc Test Utilities
// ============================================================

/** Wait for all pending microtasks/timers to flush. */
export function flushMicrotasks(): Promise<void> {
  return new Promise(resolve => queueMicrotask(resolve));
}

/** Create a promise that resolves after a delay (fake-timer friendly). */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
