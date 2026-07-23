import { describe, it, expect, vi } from 'vitest';
import { createRequest, createFlatRequest } from '../src/core';
import { BackendError, FetchError } from '../src/error';
import { MessageStack } from '../src/message';
import { setFetchResponse, setFetchImplementation, getFetchCallCount, getFetchCalls } from './helpers';

// ============================================================
//  createRequest
// ============================================================

describe('createRequest', () => {
  // ----------------------------------------------------------
  //  basic
  // ----------------------------------------------------------
  describe('basic', () => {
    it('Returns transformed data on success', async () => {
      setFetchResponse({
        status: 200,
        body: { code: 200, data: { id: 1, name: 'John' }, message: 'ok' }
      });

      const request = createRequest(
        { baseURL: 'https://api.example.com' },
        {
          transform: response => response.data.data,
          isBackendSuccess: response => response.data.code === 200
        }
      );

      const data = await request({ url: '/users/1' });
      expect(data).toEqual({ id: 1, name: 'John' });
    });

    it('Default transform is `response => response.data`', async () => {
      setFetchResponse({
        status: 200,
        body: { hello: 'world' }
      });

      const request = createRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });

      const data = await request({ url: '/test' });
      expect(data).toEqual({ hello: 'world' });
    });

    it('Custom transform extracts nested field (e.g. `response.data.data`)', async () => {
      setFetchResponse({
        status: 200,
        body: { code: 200, data: { id: 1, name: 'John' }, message: 'ok' }
      });

      const request = createRequest(
        { baseURL: 'https://api.example.com' },
        {
          transform: response => response.data.data,
          isBackendSuccess: response => response.data.code === 200
        }
      );

      const data = await request({ url: '/users/1' });
      expect(data).toEqual({ id: 1, name: 'John' });
    });

    it('Throws BackendError when isBackendSuccess returns false', async () => {
      setFetchResponse({
        status: 200,
        body: { code: 401, message: 'Unauthorized' }
      });

      const request = createRequest(
        { baseURL: 'https://api.example.com' },
        { isBackendSuccess: response => response.data.code === 200 }
      );

      await expect(request({ url: '/test' })).rejects.toBeInstanceOf(BackendError);
    });

    it('Throws FetchError on HTTP error (e.g. 500)', async () => {
      setFetchResponse({ status: 500, body: 'Internal Server Error' });

      const request = createRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });

      try {
        await request({ url: '/test' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(FetchError);
        expect(error).not.toBeInstanceOf(BackendError);
        expect((error as FetchError).code).toBe('ERR_BAD_RESPONSE');
      }
    });

    it('Throws FetchError on network error', async () => {
      setFetchImplementation(() => {
        throw new Error('Network failed');
      });

      const request = createRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });

      try {
        await request({ url: '/test' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(FetchError);
        expect((error as FetchError).code).toBe('ERR_NETWORK');
      }
    });
  });

  // ----------------------------------------------------------
  //  onError
  // ----------------------------------------------------------
  describe('onError', () => {
    it('onError is called with FetchError on HTTP error', async () => {
      setFetchResponse({ status: 500, body: 'Internal Server Error' });

      const onError = vi.fn();
      const request = createRequest(
        { baseURL: 'https://api.example.com' },
        {
          isBackendSuccess: () => true,
          onError
        }
      );

      await expect(request({ url: '/test' })).rejects.toThrow();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]).toBeInstanceOf(FetchError);
    });

    it('onError is called with BackendError on backend failure', async () => {
      setFetchResponse({
        status: 200,
        body: { code: 401, message: 'Unauthorized' }
      });

      const onError = vi.fn();
      const request = createRequest(
        { baseURL: 'https://api.example.com' },
        {
          isBackendSuccess: response => response.data.code === 200,
          onError
        }
      );

      await expect(request({ url: '/test' })).rejects.toThrow();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]).toBeInstanceOf(BackendError);
    });

    it('Error is re-thrown after onError', async () => {
      setFetchResponse({ status: 500, body: 'Internal Server Error' });

      const onError = vi.fn();
      const request = createRequest(
        { baseURL: 'https://api.example.com' },
        {
          isBackendSuccess: () => true,
          onError
        }
      );

      await expect(request({ url: '/test' })).rejects.toBeInstanceOf(FetchError);
      expect(onError).toHaveBeenCalledTimes(1);
    });
  });

  // ----------------------------------------------------------
  //  onRequest
  // ----------------------------------------------------------
  describe('onRequest', () => {
    it('onRequest is called with config before fetch', async () => {
      setFetchResponse({ status: 200, body: { ok: true } });

      const onRequest = vi.fn(config => config);
      const request = createRequest(
        { baseURL: 'https://api.example.com' },
        {
          isBackendSuccess: () => true,
          onRequest
        }
      );

      await request({ url: '/test' });
      expect(onRequest).toHaveBeenCalledTimes(1);
      const config = onRequest.mock.calls[0][0];
      expect(config.url).toBe('/test');
    });

    it('onRequest can modify headers', async () => {
      setFetchResponse({ status: 200, body: { ok: true } });

      const request = createRequest(
        { baseURL: 'https://api.example.com' },
        {
          isBackendSuccess: () => true,
          onRequest: config => {
            config.headers.set('Authorization', 'Bearer token123');
            return config;
          }
        }
      );

      await request({ url: '/test' });

      expect(getFetchCallCount()).toBe(1);
      const calls = getFetchCalls();
      const headers = calls[0].init?.headers as Headers;
      expect(headers).toBeInstanceOf(Headers);
      expect(headers.get('Authorization')).toBe('Bearer token123');
    });

    it('onRequest return value replaces config', async () => {
      setFetchResponse({ status: 200, body: { ok: true } });

      const request = createRequest(
        { baseURL: 'https://api.example.com' },
        {
          isBackendSuccess: () => true,
          onRequest: config => ({
            ...config,
            url: '/replaced-url'
          })
        }
      );

      await request({ url: '/original-url' });

      const calls = getFetchCalls();
      expect(calls[0].url).toContain('/replaced-url');
      expect(calls[0].url).not.toContain('/original-url');
    });
  });

  // ----------------------------------------------------------
  //  onBackendFail
  // ----------------------------------------------------------
  describe('onBackendFail', () => {
    it('onBackendFail is called when isBackendSuccess returns false', async () => {
      setFetchResponse({
        status: 200,
        body: { code: 401, message: 'Unauthorized' }
      });

      const onBackendFail = vi.fn(async () => null);
      const request = createRequest(
        { baseURL: 'https://api.example.com' },
        {
          isBackendSuccess: response => response.data.code === 200,
          onBackendFail
        }
      );

      await expect(request({ url: '/test' })).rejects.toBeInstanceOf(BackendError);
      expect(onBackendFail).toHaveBeenCalledTimes(1);
    });

    it('If onBackendFail returns a response, it is re-validated', async () => {
      setFetchResponse({
        status: 200,
        body: { code: 401, message: 'Unauthorized' }
      });

      const request = createRequest(
        { baseURL: 'https://api.example.com' },
        {
          transform: response => response.data,
          isBackendSuccess: response => response.data.code === 200,
          onBackendFail: async response => ({
            ...response,
            data: { code: 200, data: { recovered: true } }
          })
        }
      );

      const data = await request({ url: '/test' });
      expect(data).toEqual({ code: 200, data: { recovered: true } });
    });

    it('If onBackendFail returns falsy, BackendError is thrown', async () => {
      setFetchResponse({
        status: 200,
        body: { code: 401, message: 'Unauthorized' }
      });

      const request = createRequest(
        { baseURL: 'https://api.example.com' },
        {
          isBackendSuccess: response => response.data.code === 200,
          onBackendFail: async () => null
        }
      );

      await expect(request({ url: '/test' })).rejects.toBeInstanceOf(BackendError);
    });

    it('onBackendFail is NOT called again on retry (prevent loops)', async () => {
      setFetchResponse({
        status: 200,
        body: { code: 401, message: 'Unauthorized' }
      });

      const onBackendFail = vi.fn(async response => ({
        ...response,
        // Still failing isBackendSuccess
        data: { code: 401, message: 'Still failing' }
      }));

      const request = createRequest(
        { baseURL: 'https://api.example.com' },
        {
          isBackendSuccess: response => response.data.code === 200,
          onBackendFail
        }
      );

      await expect(request({ url: '/test' })).rejects.toBeInstanceOf(BackendError);
      // Should only be called once, not again on the re-validated response
      expect(onBackendFail).toHaveBeenCalledTimes(1);
    });
  });

  // ----------------------------------------------------------
  //  convenience methods
  // ----------------------------------------------------------
  describe('convenience methods', () => {
    it('.get(url, conf?) sends GET request', async () => {
      setFetchResponse({ status: 200, body: { ok: true } });

      const request = createRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });

      const data = await request.get('/users');
      expect(data).toEqual({ ok: true });

      expect(getFetchCallCount()).toBe(1);
      const calls = getFetchCalls();
      expect(calls[0].init?.method).toBe('GET');
    });

    it('.post(url, data?, conf?) sends POST request', async () => {
      setFetchResponse({ status: 200, body: { ok: true } });

      const request = createRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });

      const data = await request.post('/users', { name: 'John' });
      expect(data).toEqual({ ok: true });

      const calls = getFetchCalls();
      expect(calls[0].init?.method).toBe('POST');
    });

    it('.put(url, data?, conf?) sends PUT request', async () => {
      setFetchResponse({ status: 200, body: { ok: true } });

      const request = createRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });

      const data = await request.put('/users/1', { name: 'John' });
      expect(data).toEqual({ ok: true });

      const calls = getFetchCalls();
      expect(calls[0].init?.method).toBe('PUT');
    });

    it('.delete(url, conf?) sends DELETE request', async () => {
      setFetchResponse({ status: 200, body: { ok: true } });

      const request = createRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });

      const data = await request.delete('/users/1');
      expect(data).toEqual({ ok: true });

      const calls = getFetchCalls();
      expect(calls[0].init?.method).toBe('DELETE');
    });

    it('.patch(url, data?, conf?) sends PATCH request', async () => {
      setFetchResponse({ status: 200, body: { ok: true } });

      const request = createRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });

      const data = await request.patch('/users/1', { name: 'John' });
      expect(data).toEqual({ ok: true });

      const calls = getFetchCalls();
      expect(calls[0].init?.method).toBe('PATCH');
    });
  });

  // ----------------------------------------------------------
  //  .raw()
  // ----------------------------------------------------------
  describe('.raw()', () => {
    it('Returns full FetchResponse without transform', async () => {
      setFetchResponse({
        status: 200,
        body: { code: 200, data: { id: 1 }, message: 'ok' }
      });

      const request = createRequest(
        { baseURL: 'https://api.example.com' },
        {
          transform: response => response.data.data,
          isBackendSuccess: response => response.data.code === 200
        }
      );

      const response = await request.raw({ url: '/test' });
      expect(response.status).toBe(200);
      // data should be the original parsed body, NOT transformed
      expect(response.data).toEqual({ code: 200, data: { id: 1 }, message: 'ok' });
    });

    it('For JSON response, returns response with original data', async () => {
      setFetchResponse({
        status: 200,
        body: { hello: 'world' }
      });

      const request = createRequest(
        { baseURL: 'https://api.example.com' },
        {
          transform: response => response.data.hello,
          isBackendSuccess: () => true
        }
      );

      const response = await request.raw({ url: '/test' });
      expect(response.data).toEqual({ hello: 'world' });
    });

    it('For file response (blob), returns { file, filename, contentType }', async () => {
      setFetchResponse({
        status: 200,
        body: 'file content',
        contentType: 'application/octet-stream',
        headers: { 'content-disposition': 'attachment; filename="test.txt"' }
      });

      const request = createRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });

      const response = await request.raw({ url: '/download', responseType: 'blob' });
      expect(response.data).toHaveProperty('file');
      expect(response.data).toHaveProperty('filename', 'test.txt');
      expect(response.data).toHaveProperty('contentType', 'application/octet-stream');
    });
  });

  // ----------------------------------------------------------
  //  .state
  // ----------------------------------------------------------
  describe('.state', () => {
    it('request.state is the EnhancedState', () => {
      const request = createRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });
      expect(request.state).toBeDefined();
      expect(request.state.cache).toBeInstanceOf(Map);
      expect(request.state.loading).toBeDefined();
      expect(request.state.messages).toBeInstanceOf(MessageStack);
    });

    it('request.state.cache is a Map', () => {
      const request = createRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });
      expect(request.state.cache).toBeInstanceOf(Map);
    });

    it('request.state.loading has count and entries', () => {
      const request = createRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });
      expect(request.state.loading).toHaveProperty('count');
      expect(typeof request.state.loading.count).toBe('number');
      expect(request.state.loading).toHaveProperty('entries');
      expect(request.state.loading.entries).toBeInstanceOf(Map);
    });

    it('request.state.messages is a MessageStack instance', () => {
      const request = createRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });
      expect(request.state.messages).toBeInstanceOf(MessageStack);
    });

    it('Custom fields can be set on state (index signature)', () => {
      const request = createRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });
      request.state.customField = 'custom-value';
      expect(request.state.customField).toBe('custom-value');
    });

    it('State is shared across requests from the same instance', async () => {
      setFetchResponse({ status: 200, body: { ok: true } });

      const request = createRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });

      const stateRef = request.state;
      await request({ url: '/a' });
      expect(request.state).toBe(stateRef);
      await request({ url: '/b' });
      expect(request.state).toBe(stateRef);
    });
  });

  // ----------------------------------------------------------
  //  messages integration
  // ----------------------------------------------------------
  describe('messages integration', () => {
    it('request.state.messages.push() works in onError for deduplication', async () => {
      setFetchResponse({ status: 500, body: 'Internal Server Error' });

      const shown: string[] = [];
      const request = createRequest(
        { baseURL: 'https://api.example.com' },
        {
          isBackendSuccess: () => true,
          onError: error => {
            if (request.state.messages.push(error.message)) {
              shown.push(error.message);
            }
          }
        }
      );

      await expect(request({ url: '/test' })).rejects.toThrow();
      expect(shown).toHaveLength(1);
    });

    it('First error message passes through', async () => {
      setFetchResponse({
        status: 200,
        body: { code: 500, message: 'Server error' }
      });

      const shown: string[] = [];
      const request = createRequest(
        { baseURL: 'https://api.example.com' },
        {
          isBackendSuccess: response => response.data.code === 200,
          onError: error => {
            if (request.state.messages.push(error.message)) {
              shown.push(error.message);
            }
          }
        }
      );

      await expect(request({ url: '/test' })).rejects.toThrow();
      expect(shown).toHaveLength(1);
      expect(shown[0]).toBe('Backend request error, please check `isBackendSuccess`.');
    });

    it('Second identical error within interval is suppressed', async () => {
      setFetchResponse({
        status: 200,
        body: { code: 500, message: 'Server error' }
      });

      const shown: string[] = [];
      const request = createRequest(
        { baseURL: 'https://api.example.com' },
        {
          isBackendSuccess: response => response.data.code === 200,
          onError: error => {
            if (request.state.messages.push(error.message)) {
              shown.push(error.message);
            }
          }
        }
      );

      // First call — message passes through
      await expect(request({ url: '/test' })).rejects.toThrow();
      expect(shown).toHaveLength(1);

      // Second call — same error message, should be suppressed
      await expect(request({ url: '/test' })).rejects.toThrow();
      expect(shown).toHaveLength(1);
    });
  });
});

// ============================================================
//  createFlatRequest
// ============================================================

describe('createFlatRequest', () => {
  // ----------------------------------------------------------
  //  basic
  // ----------------------------------------------------------
  describe('basic', () => {
    it('Returns { data, error: null, response } on success', async () => {
      setFetchResponse({
        status: 200,
        body: { code: 200, data: { id: 1, name: 'John' }, message: 'ok' }
      });

      const request = createFlatRequest(
        { baseURL: 'https://api.example.com' },
        {
          transform: response => response.data.data,
          isBackendSuccess: response => response.data.code === 200
        }
      );

      const result = await request({ url: '/users/1' });
      expect(result.data).toEqual({ id: 1, name: 'John' });
      expect(result.error).toBeNull();
      expect(result.response).toBeDefined();
      expect(result.response?.status).toBe(200);
    });

    it('Returns { data: null, error, response? } on failure', async () => {
      setFetchResponse({ status: 500, body: 'Internal Server Error' });

      const request = createFlatRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });

      const result = await request({ url: '/test' });
      expect(result.data).toBeNull();
      expect(result.error).toBeInstanceOf(FetchError);
      expect(result.response).toBeDefined();
      expect(result.response?.status).toBe(500);
    });

    it('Never throws (catches all errors)', async () => {
      setFetchImplementation(() => {
        throw new Error('Network failed');
      });

      const request = createFlatRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });

      const result = await request({ url: '/test' });
      expect(result.data).toBeNull();
      expect(result.error).toBeInstanceOf(FetchError);
      expect(result.response).toBeUndefined();
    });

    it('Custom transform is applied', async () => {
      setFetchResponse({
        status: 200,
        body: { code: 200, data: { id: 1, name: 'John' }, message: 'ok' }
      });

      const request = createFlatRequest(
        { baseURL: 'https://api.example.com' },
        {
          transform: response => response.data.data,
          isBackendSuccess: response => response.data.code === 200
        }
      );

      const result = await request({ url: '/users/1' });
      expect(result.data).toEqual({ id: 1, name: 'John' });
    });

    it('Default transform is `response => response.data`', async () => {
      setFetchResponse({ status: 200, body: { hello: 'world' } });

      const request = createFlatRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });

      const result = await request({ url: '/test' });
      expect(result.data).toEqual({ hello: 'world' });
      expect(result.error).toBeNull();
    });
  });

  // ----------------------------------------------------------
  //  backend failure
  // ----------------------------------------------------------
  describe('backend failure', () => {
    it('Returns error as BackendError when isBackendSuccess fails', async () => {
      setFetchResponse({
        status: 200,
        body: { code: 401, message: 'Unauthorized' }
      });

      const request = createFlatRequest(
        { baseURL: 'https://api.example.com' },
        { isBackendSuccess: response => response.data.code === 200 }
      );

      const result = await request({ url: '/test' });
      expect(result.data).toBeNull();
      expect(result.error).toBeInstanceOf(BackendError);
    });

    it('error has code BACKEND_ERROR', async () => {
      setFetchResponse({
        status: 200,
        body: { code: 401, message: 'Unauthorized' }
      });

      const request = createFlatRequest(
        { baseURL: 'https://api.example.com' },
        { isBackendSuccess: response => response.data.code === 200 }
      );

      const result = await request({ url: '/test' });
      expect(result.error?.code).toBe('BACKEND_ERROR');
    });
  });

  // ----------------------------------------------------------
  //  convenience methods
  // ----------------------------------------------------------
  describe('convenience methods', () => {
    it('.get() works like createRequest but returns flat response', async () => {
      setFetchResponse({ status: 200, body: { ok: true } });

      const request = createFlatRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });

      const result = await request.get('/users');
      expect(result.data).toEqual({ ok: true });
      expect(result.error).toBeNull();
      expect(getFetchCallCount()).toBe(1);
    });

    it('.post() works like createRequest but returns flat response', async () => {
      setFetchResponse({ status: 200, body: { ok: true } });

      const request = createFlatRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });

      const result = await request.post('/users', { name: 'John' });
      expect(result.data).toEqual({ ok: true });
      expect(result.error).toBeNull();
    });

    it('.put() works like createRequest but returns flat response', async () => {
      setFetchResponse({ status: 200, body: { ok: true } });

      const request = createFlatRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });

      const result = await request.put('/users/1', { name: 'John' });
      expect(result.data).toEqual({ ok: true });
      expect(result.error).toBeNull();
    });

    it('.delete() works like createRequest but returns flat response', async () => {
      setFetchResponse({ status: 200, body: { ok: true } });

      const request = createFlatRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });

      const result = await request.delete('/users/1');
      expect(result.data).toEqual({ ok: true });
      expect(result.error).toBeNull();
    });

    it('.patch() works like createRequest but returns flat response', async () => {
      setFetchResponse({ status: 200, body: { ok: true } });

      const request = createFlatRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });

      const result = await request.patch('/users/1', { name: 'John' });
      expect(result.data).toEqual({ ok: true });
      expect(result.error).toBeNull();
    });
  });

  // ----------------------------------------------------------
  //  .raw()
  // ----------------------------------------------------------
  describe('.raw()', () => {
    it('Returns full FetchResponse on success', async () => {
      setFetchResponse({
        status: 200,
        body: { code: 200, data: { id: 1 }, message: 'ok' }
      });

      const request = createFlatRequest(
        { baseURL: 'https://api.example.com' },
        {
          transform: response => response.data.data,
          isBackendSuccess: response => response.data.code === 200
        }
      );

      const result = await request.raw({ url: '/test' });
      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      // Discriminated union: data is null when error is set, so narrow for TS.
      const data = result.data!;
      expect(data.status).toBe(200);
      // data.data is the original parsed body (not transformed)
      expect(data.data).toEqual({ code: 200, data: { id: 1 }, message: 'ok' });
    });

    it('Returns error on failure', async () => {
      setFetchResponse({ status: 500, body: 'Internal Server Error' });

      const request = createFlatRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });

      const result = await request.raw({ url: '/test' });
      expect(result.data).toBeNull();
      expect(result.error).toBeInstanceOf(FetchError);
    });
  });

  // ----------------------------------------------------------
  //  .state
  // ----------------------------------------------------------
  describe('.state', () => {
    it('Same as createRequest.state — EnhancedState with all fields', () => {
      const request = createFlatRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });
      expect(request.state.cache).toBeInstanceOf(Map);
      expect(request.state.loading).toHaveProperty('count');
      expect(request.state.loading).toHaveProperty('entries');
      expect(request.state.loading.entries).toBeInstanceOf(Map);
      expect(request.state.messages).toBeInstanceOf(MessageStack);
    });
  });
});

// ============================================================
//  File download
// ============================================================

describe('File download', () => {
  it('request.get("/download", { responseType: "blob" }) returns { file, filename, contentType }', async () => {
    setFetchResponse({
      status: 200,
      body: 'file content',
      contentType: 'application/octet-stream',
      headers: { 'content-disposition': 'attachment; filename="report.pdf"' }
    });

    const request = createRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });

    const result = await request.get('/download', { responseType: 'blob' });
    expect(result).toHaveProperty('file');
    expect(result).toHaveProperty('filename', 'report.pdf');
    expect(result).toHaveProperty('contentType', 'application/octet-stream');
  });

  it('filename is parsed from content-disposition header', async () => {
    setFetchResponse({
      status: 200,
      body: 'file content',
      contentType: 'application/octet-stream',
      headers: { 'content-disposition': 'attachment; filename="data.csv"' }
    });

    const request = createRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });

    const result = await request.get('/download', { responseType: 'blob' });
    expect(result.filename).toBe('data.csv');
  });

  it('custom getFileName overrides content-disposition', async () => {
    setFetchResponse({
      status: 200,
      body: 'file content',
      contentType: 'application/octet-stream',
      headers: { 'content-disposition': 'attachment; filename="original.txt"' }
    });

    const request = createRequest({ baseURL: 'https://api.example.com' }, { isBackendSuccess: () => true });

    const result = await request.get('/download', {
      responseType: 'blob',
      getFileName: () => 'custom-name.txt'
    });
    expect(result.filename).toBe('custom-name.txt');
  });
});
