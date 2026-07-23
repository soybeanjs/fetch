import { describe, it, expect } from 'vitest';
import { FetchError, BackendError } from '../src/error';
import type { FetchRequestConfig, FetchResponse } from '../src/types';

function makeResponse<T>(overrides: Partial<FetchResponse<T>> = {}): FetchResponse<T> {
  return {
    data: { code: 500, message: 'fail' } as any,
    status: 500,
    statusText: 'Internal Server Error',
    headers: new Headers({ 'content-type': 'application/json' }),
    config: {
      url: '/api',
      method: 'POST',
      headers: new Headers(),
      responseType: 'json'
    } as any,
    ...overrides
  };
}

describe('FetchError', () => {
  it('constructs with a message only', () => {
    const err = new FetchError('something failed');
    expect(err.message).toBe('something failed');
    expect(err.name).toBe('FetchError');
  });

  it('constructs with all options', () => {
    const response = makeResponse();
    const config = { url: '/api', method: 'GET' } as FetchRequestConfig;
    const request = new Request('https://example.com/api');
    const err = new FetchError('fail', {
      code: 'CUSTOM_CODE',
      config,
      request,
      response,
      cause: new Error('root')
    });
    expect(err.code).toBe('CUSTOM_CODE');
    expect(err.config).toBe(config);
    expect(err.request).toBe(request);
    expect(err.response).toBe(response);
    expect(err.cause).toBeInstanceOf(Error);
  });

  it('getters return response properties', () => {
    const response = makeResponse({
      status: 502,
      statusText: 'Bad Gateway',
      data: { code: 502 } as any
    });
    const err = new FetchError('fail', { response });
    expect(err.status).toBe(502);
    expect(err.statusCode).toBe(502);
    expect(err.statusText).toBe('Bad Gateway');
    expect(err.statusMessage).toBe('Bad Gateway');
    expect(err.data).toEqual({ code: 502 });
  });

  it('getters return undefined when no response', () => {
    const err = new FetchError('network');
    expect(err.status).toBeUndefined();
    expect(err.statusCode).toBeUndefined();
    expect(err.statusText).toBeUndefined();
    expect(err.statusMessage).toBeUndefined();
    expect(err.data).toBeUndefined();
  });

  it("name is 'FetchError'", () => {
    expect(new FetchError('x').name).toBe('FetchError');
  });

  it('is an instance of Error and FetchError', () => {
    const err = new FetchError('x');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(FetchError);
  });

  it('has a configurable code', () => {
    const err = new FetchError('x', { code: 'ECONNRESET' });
    expect(err.code).toBe('ECONNRESET');
  });

  it('preserves cause when provided', () => {
    const root = new Error('root cause');
    const err = new FetchError('wrapped', { cause: root });
    expect(err.cause).toBe(root);
  });
});

describe('BackendError', () => {
  it('constructs with a response', () => {
    const response = makeResponse();
    const err = new BackendError('backend failed', response);
    expect(err.message).toBe('backend failed');
    expect(err.response).toBe(response);
  });

  it("code is 'BACKEND_ERROR'", () => {
    const err = new BackendError('fail', makeResponse());
    expect(err.code).toBe('BACKEND_ERROR');
  });

  it("name is 'BackendError'", () => {
    const err = new BackendError('fail', makeResponse());
    expect(err.name).toBe('BackendError');
  });

  it('is an instance of FetchError and Error', () => {
    const err = new BackendError('fail', makeResponse());
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(FetchError);
    expect(err).toBeInstanceOf(BackendError);
  });

  it('copies config from the response', () => {
    const response = makeResponse();
    const err = new BackendError('fail', response);
    expect(err.config).toBe(response.config);
  });

  it('exposes response data via the data getter', () => {
    const response = makeResponse({ data: { code: 1001, msg: 'no perm' } as any });
    const err = new BackendError('fail', response);
    expect(err.data).toEqual({ code: 1001, msg: 'no perm' });
    expect(err.status).toBe(response.status);
  });
});
