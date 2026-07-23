import { describe, it, expect } from 'vitest';
import { isHttpSuccess } from '../src/shared';
import { serializeParams } from '../src/utils';
import { FetchError } from '../src/error';
import { createDefaultOptions, createFetchConfig, createRetryOptions } from '../src/options';
import type { FetchResponse } from '../src/types';

function makeResponse(overrides: Partial<FetchResponse> = {}): FetchResponse {
  return {
    data: null,
    status: 500,
    statusText: 'Internal Server Error',
    headers: new Headers(),
    config: {
      url: '/api',
      method: 'GET',
      headers: new Headers(),
      responseType: 'json'
    } as any,
    ...overrides
  };
}

// ============================================================
//  createDefaultOptions
// ============================================================

describe('createDefaultOptions', () => {
  const baseOption = {
    transform: (r: any) => r.data,
    isBackendSuccess: () => true
  };

  it('applies default backendErrorMsg when not provided', () => {
    const opts = createDefaultOptions(baseOption as any);
    expect(opts.backendErrorMsg).toBe('Backend request error, please check `isBackendSuccess`.');
  });

  it('preserves user-provided backendErrorMsg', () => {
    const opts = createDefaultOptions({ ...baseOption, backendErrorMsg: 'custom error' } as any);
    expect(opts.backendErrorMsg).toBe('custom error');
  });

  it('applies default transform when not provided', () => {
    const opts = createDefaultOptions({ isBackendSuccess: () => true } as any);
    expect(opts.transform).toBeTypeOf('function');
    const response = { data: { x: 1 } } as any;
    expect(opts.transform(response)).toEqual({ x: 1 });
  });

  it('preserves user-provided transform', () => {
    const custom = (r: any) => r.data.value;
    const opts = createDefaultOptions({ isBackendSuccess: () => true, transform: custom } as any);
    expect(opts.transform).toBe(custom);
  });

  it('preserves isBackendSuccess and other fields', () => {
    const isBackendSuccess = (r: any) => r.status === 200;
    const opts = createDefaultOptions({ isBackendSuccess, transform: (r: any) => r.data } as any);
    expect(opts.isBackendSuccess).toBe(isBackendSuccess);
  });
});

// ============================================================
//  createFetchConfig
// ============================================================

describe('createFetchConfig', () => {
  it('adds default Accept header', () => {
    const config = createFetchConfig();
    expect(config.headers).toBeInstanceOf(Headers);
    expect(config.headers.get('accept')).toBe('application/json, text/plain, */*');
  });

  it('merges user headers with defaults', () => {
    const config = createFetchConfig({ headers: { 'x-token': 'abc' } });
    expect(config.headers.get('accept')).toBe('application/json, text/plain, */*');
    expect(config.headers.get('x-token')).toBe('abc');
  });

  it('lets user headers override the default Accept', () => {
    const config = createFetchConfig({ headers: { Accept: 'text/plain' } });
    expect(config.headers.get('accept')).toBe('text/plain');
  });

  it('sets default validateStatus to isHttpSuccess', () => {
    const config = createFetchConfig();
    expect(config.validateStatus).toBe(isHttpSuccess);
  });

  it('sets default paramsSerializer to serializeParams', () => {
    const config = createFetchConfig();
    expect(config.paramsSerializer).toBe(serializeParams);
  });

  it('preserves user validateStatus', () => {
    const validateStatus = (s: number) => s < 400;
    const config = createFetchConfig({ validateStatus });
    expect(config.validateStatus).toBe(validateStatus);
  });

  it('preserves user paramsSerializer', () => {
    const paramsSerializer = (_p: any) => 'x=1';
    const config = createFetchConfig({ paramsSerializer });
    expect(config.paramsSerializer).toBe(paramsSerializer);
  });

  it('accepts a Headers instance as headers', () => {
    const config = createFetchConfig({ headers: new Headers({ 'x-h': '1' }) });
    expect(config.headers.get('x-h')).toBe('1');
    expect(config.headers.get('accept')).toBe('application/json, text/plain, */*');
  });
});

// ============================================================
//  createRetryOptions
// ============================================================

describe('createRetryOptions', () => {
  it('defaults retries to 0', () => {
    expect(createRetryOptions().retries).toBe(0);
  });

  it('respects user retries', () => {
    expect(createRetryOptions({ retries: 5 }).retries).toBe(5);
  });

  it('provides default retryDelay and retryCondition functions', () => {
    const opts = createRetryOptions();
    expect(opts.retryDelay).toBeTypeOf('function');
    expect(opts.retryCondition).toBeTypeOf('function');
  });

  describe('default retryCondition', () => {
    const { retryCondition } = createRetryOptions();

    it('returns true for a network error (no response)', () => {
      const error = new FetchError('network');
      expect(retryCondition(error)).toBe(true);
    });

    it('returns true for 503 status', () => {
      const error = new FetchError('err', { response: makeResponse({ status: 503 }) });
      expect(retryCondition(error)).toBe(true);
    });

    it('returns true for 429 status', () => {
      const error = new FetchError('err', { response: makeResponse({ status: 429 }) });
      expect(retryCondition(error)).toBe(true);
    });

    it('returns true for 500 status', () => {
      const error = new FetchError('err', { response: makeResponse({ status: 500 }) });
      expect(retryCondition(error)).toBe(true);
    });

    it('returns false for 400 status', () => {
      const error = new FetchError('err', { response: makeResponse({ status: 400 }) });
      expect(retryCondition(error)).toBe(false);
    });

    it('returns false for 404 status', () => {
      const error = new FetchError('err', { response: makeResponse({ status: 404 }) });
      expect(retryCondition(error)).toBe(false);
    });
  });

  describe('default retryDelay', () => {
    const { retryDelay } = createRetryOptions();
    const error = new FetchError('err');

    it('is linear: 1s, 2s, 3s', () => {
      expect(retryDelay(1, error)).toBe(1000);
      expect(retryDelay(2, error)).toBe(2000);
      expect(retryDelay(3, error)).toBe(3000);
    });

    it('returns 0 for retryCount 0', () => {
      expect(retryDelay(0, error)).toBe(0);
    });
  });

  it('preserves user retryDelay', () => {
    const retryDelay = () => 500;
    expect(createRetryOptions({ retryDelay }).retryDelay).toBe(retryDelay);
  });

  it('preserves user retryCondition', () => {
    const retryCondition = () => false;
    expect(createRetryOptions({ retryCondition }).retryCondition).toBe(retryCondition);
  });
});
