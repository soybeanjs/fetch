import { afterEach, beforeEach, vi } from 'vitest';
import { mockFetch, resetFetchMock } from './helpers';

beforeEach(() => {
  // Install a fresh global fetch mock before each test
  vi.stubGlobal('fetch', mockFetch);
  resetFetchMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
