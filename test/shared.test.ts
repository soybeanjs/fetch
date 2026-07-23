import { describe, it, expect } from 'vitest';
import {
  isHttpSuccess,
  getContentType,
  isResponseJson,
  transformBlobToJson,
  transformArrayBufferToJson,
  coerceBinaryToJsonResponse,
  parseContentDisposition,
  downloadFile
} from '../src/shared';
import type { FetchResponse } from '../src/types';

function makeResponse(overrides: Partial<FetchResponse> = {}): FetchResponse {
  return {
    data: null,
    status: 200,
    statusText: 'OK',
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
//  HTTP Status Utilities
// ============================================================

describe('isHttpSuccess', () => {
  it('returns true for 2xx', () => {
    expect(isHttpSuccess(200)).toBe(true);
    expect(isHttpSuccess(201)).toBe(true);
    expect(isHttpSuccess(204)).toBe(true);
    expect(isHttpSuccess(299)).toBe(true);
  });

  it('returns true for 304', () => {
    expect(isHttpSuccess(304)).toBe(true);
  });

  it('returns false for 1xx, 3xx (except 304), 4xx, 5xx', () => {
    expect(isHttpSuccess(100)).toBe(false);
    expect(isHttpSuccess(301)).toBe(false);
    expect(isHttpSuccess(400)).toBe(false);
    expect(isHttpSuccess(404)).toBe(false);
    expect(isHttpSuccess(500)).toBe(false);
  });
});

// ============================================================
//  Content Type Utilities
// ============================================================

describe('getContentType', () => {
  it('returns the content-type header', () => {
    const res = makeResponse({ headers: new Headers({ 'content-type': 'application/json' }) });
    expect(getContentType(res)).toBe('application/json');
  });

  it('returns null when not present', () => {
    const res = makeResponse({ headers: new Headers() });
    expect(getContentType(res)).toBe(null);
  });
});

describe('isResponseJson', () => {
  it('returns true when content-type includes application/json', () => {
    const res = makeResponse({
      headers: new Headers({ 'content-type': 'application/json; charset=utf-8' })
    });
    expect(isResponseJson(res)).toBe(true);
  });

  it('returns false for non-json content types', () => {
    const res = makeResponse({ headers: new Headers({ 'content-type': 'text/plain' }) });
    expect(isResponseJson(res)).toBe(false);
  });

  it('returns false when content-type is missing', () => {
    const res = makeResponse({ headers: new Headers() });
    expect(isResponseJson(res)).toBe(false);
  });
});

// ============================================================
//  Binary → JSON Coercion
// ============================================================

describe('transformBlobToJson', () => {
  it('converts a Blob body to JSON in-place', async () => {
    const blob = new Blob([JSON.stringify({ a: 1 })], { type: 'application/json' });
    const res = makeResponse({ data: blob });
    await transformBlobToJson(res);
    expect(res.data).toEqual({ a: 1 });
  });

  it('parses a string body as JSON in-place', async () => {
    const res = makeResponse({ data: JSON.stringify({ b: 2 }) });
    await transformBlobToJson(res);
    expect(res.data).toEqual({ b: 2 });
  });

  it('leaves data untouched when parsing fails', async () => {
    const blob = new Blob(['not-json'], { type: 'text/plain' });
    const res = makeResponse({ data: blob });
    await transformBlobToJson(res);
    expect(res.data).toBe(blob);
  });
});

describe('transformArrayBufferToJson', () => {
  it('converts an ArrayBuffer body to JSON in-place', async () => {
    const buf = new TextEncoder().encode(JSON.stringify({ a: 1 })).buffer;
    const res = makeResponse({ data: buf });
    await transformArrayBufferToJson(res);
    expect(res.data).toEqual({ a: 1 });
  });

  it('parses a string body as JSON in-place', async () => {
    const res = makeResponse({ data: JSON.stringify({ b: 2 }) });
    await transformArrayBufferToJson(res);
    expect(res.data).toEqual({ b: 2 });
  });

  it('leaves data untouched when parsing fails', async () => {
    const buf = new TextEncoder().encode('not-json').buffer;
    const res = makeResponse({ data: buf });
    await transformArrayBufferToJson(res);
    expect(res.data).toBe(buf);
  });
});

describe('coerceBinaryToJsonResponse', () => {
  it('coerces blob to JSON when content-type is json', async () => {
    const blob = new Blob([JSON.stringify({ ok: true })], { type: 'application/json' });
    const res = makeResponse({
      data: blob,
      headers: new Headers({ 'content-type': 'application/json' }),
      config: { url: '/api', method: 'GET', headers: new Headers(), responseType: 'blob' } as any
    });
    await coerceBinaryToJsonResponse(res);
    expect(res.data).toEqual({ ok: true });
  });

  it('coerces arraybuffer to JSON when content-type is json', async () => {
    const buf = new TextEncoder().encode(JSON.stringify({ ok: true })).buffer;
    const res = makeResponse({
      data: buf,
      headers: new Headers({ 'content-type': 'application/json' }),
      config: { url: '/api', method: 'GET', headers: new Headers(), responseType: 'arraybuffer' } as any
    });
    await coerceBinaryToJsonResponse(res);
    expect(res.data).toEqual({ ok: true });
  });

  it('is a no-op for json responseType', async () => {
    const data = { already: 'json' };
    const res = makeResponse({
      data,
      headers: new Headers({ 'content-type': 'application/json' }),
      config: { url: '/api', method: 'GET', headers: new Headers(), responseType: 'json' } as any
    });
    await coerceBinaryToJsonResponse(res);
    expect(res.data).toBe(data);
  });

  it('is a no-op for text responseType', async () => {
    const res = makeResponse({
      data: 'plain text',
      headers: new Headers({ 'content-type': 'application/json' }),
      config: { url: '/api', method: 'GET', headers: new Headers(), responseType: 'text' } as any
    });
    await coerceBinaryToJsonResponse(res);
    expect(res.data).toBe('plain text');
  });

  it('is a no-op for document responseType', async () => {
    const res = makeResponse({
      data: '<doc/>',
      headers: new Headers({ 'content-type': 'application/json' }),
      config: { url: '/api', method: 'GET', headers: new Headers(), responseType: 'document' } as any
    });
    await coerceBinaryToJsonResponse(res);
    expect(res.data).toBe('<doc/>');
  });

  it('is a no-op when content-type is not json', async () => {
    const blob = new Blob(['binary data'], { type: 'application/octet-stream' });
    const res = makeResponse({
      data: blob,
      headers: new Headers({ 'content-type': 'application/octet-stream' }),
      config: { url: '/api', method: 'GET', headers: new Headers(), responseType: 'blob' } as any
    });
    await coerceBinaryToJsonResponse(res);
    expect(res.data).toBe(blob);
  });

  it('defaults responseType to json when config.responseType is missing', async () => {
    const data = { ok: true };
    const res = makeResponse({
      data,
      headers: new Headers({ 'content-type': 'application/json' }),
      config: { url: '/api', method: 'GET', headers: new Headers() } as any
    });
    await coerceBinaryToJsonResponse(res);
    expect(res.data).toBe(data);
  });
});

// ============================================================
//  Content-Disposition Parsing
// ============================================================

describe('parseContentDisposition', () => {
  it('returns empty string for null/undefined/empty', () => {
    expect(parseContentDisposition(null)).toBe('');
    expect(parseContentDisposition(undefined)).toBe('');
    expect(parseContentDisposition('')).toBe('');
  });

  it('extracts filename* (RFC 5987) and decodes it', () => {
    const header = "attachment; filename*=UTF-8''%E6%96%87%E4%BB%B6.txt";
    expect(parseContentDisposition(header)).toBe('文件.txt');
  });

  it('prefers filename* over filename', () => {
    const header = 'attachment; filename="fallback.txt"; filename*=UTF-8\'\'real.txt';
    expect(parseContentDisposition(header)).toBe('real.txt');
  });

  it('extracts a quoted filename', () => {
    const header = 'attachment; filename="my file.txt"';
    expect(parseContentDisposition(header)).toBe('my file.txt');
  });

  it('extracts an unquoted filename', () => {
    const header = 'attachment; filename=report.pdf';
    expect(parseContentDisposition(header)).toBe('report.pdf');
  });

  it('strips quotes from an unquoted filename', () => {
    const header = "attachment; filename=report'.pdf";
    expect(parseContentDisposition(header)).toBe('report.pdf');
  });

  it('returns empty string when no filename is present', () => {
    expect(parseContentDisposition('attachment')).toBe('');
    expect(parseContentDisposition('inline')).toBe('');
  });

  it('handles leading and trailing whitespace', () => {
    const header = '  attachment; filename="x.txt"  ';
    expect(parseContentDisposition(header)).toBe('x.txt');
  });
});

// ============================================================
//  File Download
// ============================================================

describe('downloadFile', () => {
  it('throws in non-browser environments', () => {
    expect(() => downloadFile('data', 'file.txt')).toThrow(/browser environments/);
  });

  it('throws an Error instance mentioning downloadFile', () => {
    try {
      downloadFile(new Blob(['x']), 'file.txt');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toMatch(/downloadFile/);
    }
  });
});
