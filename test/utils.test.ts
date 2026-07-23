import { describe, it, expect, vi } from 'vitest';
import {
  joinURL,
  withBase,
  isAbsoluteURL,
  resolveURL,
  withQuery,
  serializeParams,
  isPayloadMethod,
  isJSONSerializable,
  detectResponseType,
  isNullBodyStatus,
  toHeaders,
  mergeHeaders,
  callHooks
} from '../src/utils';
import type { FetchContext } from '../src/types';

// ============================================================
//  URL Utilities
// ============================================================

describe('URL utilities', () => {
  describe('joinURL', () => {
    it('joins base and path with a single slash', () => {
      expect(joinURL('https://api.example.com', '/users')).toBe('https://api.example.com/users');
    });

    it('adds a leading slash to path when missing', () => {
      expect(joinURL('https://api.example.com', 'users')).toBe('https://api.example.com/users');
    });

    it('removes a trailing slash from base', () => {
      expect(joinURL('https://api.example.com/', '/users')).toBe('https://api.example.com/users');
    });

    it('handles both trailing base slash and missing path slash', () => {
      expect(joinURL('https://api.example.com/', 'users')).toBe('https://api.example.com/users');
    });

    it('preserves multiple path segments', () => {
      expect(joinURL('https://api.example.com', '/a/b/c')).toBe('https://api.example.com/a/b/c');
    });
  });

  describe('withBase', () => {
    it('prepends base when input does not start with base', () => {
      expect(withBase('users', 'https://api.example.com')).toBe('https://api.example.com/users');
    });

    it('returns input unchanged when it already starts with base', () => {
      expect(withBase('https://api.example.com/users', 'https://api.example.com')).toBe(
        'https://api.example.com/users'
      );
    });

    it('returns input unchanged when base is empty', () => {
      expect(withBase('users', '')).toBe('users');
    });

    it('adds a leading slash to input when missing', () => {
      expect(withBase('users', 'https://api.example.com')).toBe('https://api.example.com/users');
    });
  });

  describe('isAbsoluteURL', () => {
    it('returns true for http://', () => {
      expect(isAbsoluteURL('http://example.com')).toBe(true);
    });

    it('returns true for https://', () => {
      expect(isAbsoluteURL('https://example.com')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(isAbsoluteURL('HTTP://example.com')).toBe(true);
      expect(isAbsoluteURL('Https://example.com')).toBe(true);
    });

    it('returns false for relative urls', () => {
      expect(isAbsoluteURL('/api/users')).toBe(false);
      expect(isAbsoluteURL('api/users')).toBe(false);
    });

    it('returns false for protocol-relative urls', () => {
      expect(isAbsoluteURL('//example.com/api')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isAbsoluteURL('')).toBe(false);
    });
  });

  describe('resolveURL', () => {
    it('returns url when no baseURL is provided', () => {
      expect(resolveURL('/users')).toBe('/users');
    });

    it('returns url when it is absolute, ignoring baseURL', () => {
      expect(resolveURL('https://other.com/users', 'https://api.example.com')).toBe(
        'https://other.com/users'
      );
    });

    it('prepends baseURL otherwise', () => {
      expect(resolveURL('users', 'https://api.example.com')).toBe('https://api.example.com/users');
    });

    it('returns url when baseURL is empty', () => {
      expect(resolveURL('users', '')).toBe('users');
    });
  });
});

// ============================================================
//  Query String Utilities
// ============================================================

describe('query string utilities', () => {
  describe('withQuery', () => {
    it('returns input when query is undefined', () => {
      expect(withQuery('/api')).toBe('/api');
    });

    it('returns input when query is an empty object', () => {
      expect(withQuery('/api', {})).toBe('/api');
    });

    it('appends a single primitive param', () => {
      expect(withQuery('/api', { a: '1' })).toBe('/api?a=1');
    });

    it('appends multiple primitive params', () => {
      expect(withQuery('/api', { a: '1', b: '2' })).toBe('/api?a=1&b=2');
    });

    it('appends numeric and boolean values', () => {
      expect(withQuery('/api', { n: 5, flag: true })).toBe('/api?n=5&flag=true');
    });

    it('appends array values as repeated keys', () => {
      expect(withQuery('/api', { tags: ['x', 'y'] })).toBe('/api?tags=x&tags=y');
    });

    it('skips null and undefined values', () => {
      expect(withQuery('/api', { a: null, b: undefined, c: '1' })).toBe('/api?c=1');
    });

    it('skips null and undefined items inside arrays', () => {
      expect(withQuery('/api', { tags: ['x', null, undefined, 'y'] })).toBe('/api?tags=x&tags=y');
    });

    it('JSON-stringifies object values', () => {
      expect(withQuery('/api', { filter: { k: 'v' } })).toBe('/api?filter=%7B%22k%22%3A%22v%22%7D');
    });

    it('serializes Date values to ISO strings', () => {
      const date = new Date('2024-01-02T03:04:05.000Z');
      expect(withQuery('/api', { at: date })).toBe('/api?at=2024-01-02T03%3A04%3A05.000Z');
    });

    it('appends with & when input already has a query string', () => {
      expect(withQuery('/api?x=1', { y: '2' })).toBe('/api?x=1&y=2');
    });

    it('encodes special characters in values', () => {
      expect(withQuery('/api', { q: 'a b' })).toBe('/api?q=a+b');
    });

    it('handles empty string values', () => {
      expect(withQuery('/api', { e: '' })).toBe('/api?e=');
    });
  });

  describe('serializeParams', () => {
    it('returns empty string for undefined', () => {
      expect(serializeParams(undefined)).toBe('');
    });

    it('returns empty string for an empty object', () => {
      expect(serializeParams({})).toBe('');
    });

    it('serializes params without a leading ?', () => {
      expect(serializeParams({ a: '1', b: '2' })).toBe('a=1&b=2');
    });

    it('serializes arrays as repeated keys', () => {
      expect(serializeParams({ tags: ['x', 'y'] })).toBe('tags=x&tags=y');
    });

    it('skips null and undefined values', () => {
      expect(serializeParams({ a: null, b: '2' })).toBe('b=2');
    });
  });
});

// ============================================================
//  HTTP Method Utilities
// ============================================================

describe('HTTP method utilities', () => {
  describe('isPayloadMethod', () => {
    it('returns true for POST, PUT, PATCH, DELETE', () => {
      for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        expect(isPayloadMethod(m)).toBe(true);
      }
    });

    it('is case-insensitive', () => {
      expect(isPayloadMethod('post')).toBe(true);
      expect(isPayloadMethod('Put')).toBe(true);
      expect(isPayloadMethod('patch')).toBe(true);
      expect(isPayloadMethod('delete')).toBe(true);
    });

    it('returns false for GET, HEAD, OPTIONS', () => {
      expect(isPayloadMethod('GET')).toBe(false);
      expect(isPayloadMethod('HEAD')).toBe(false);
      expect(isPayloadMethod('OPTIONS')).toBe(false);
    });

    it('returns false for unknown methods', () => {
      expect(isPayloadMethod('TRACE')).toBe(false);
    });
  });
});

// ============================================================
//  Body Serialization Utilities
// ============================================================

describe('body serialization utilities', () => {
  describe('isJSONSerializable', () => {
    it('returns true for strings, numbers, booleans', () => {
      expect(isJSONSerializable('s')).toBe(true);
      expect(isJSONSerializable(1)).toBe(true);
      expect(isJSONSerializable(true)).toBe(true);
    });

    it('returns true for null', () => {
      expect(isJSONSerializable(null)).toBe(true);
    });

    it('returns false for undefined', () => {
      expect(isJSONSerializable(undefined)).toBe(false);
    });

    it('returns true for plain objects and arrays', () => {
      expect(isJSONSerializable({ a: 1 })).toBe(true);
      expect(isJSONSerializable([1, 2])).toBe(true);
    });

    it('returns false for FormData', () => {
      expect(isJSONSerializable(new FormData())).toBe(false);
    });

    it('returns false for Blob', () => {
      expect(isJSONSerializable(new Blob(['x']))).toBe(false);
    });

    it('returns false for ArrayBuffer', () => {
      expect(isJSONSerializable(new ArrayBuffer(8))).toBe(false);
    });

    it('returns false for URLSearchParams', () => {
      expect(isJSONSerializable(new URLSearchParams())).toBe(false);
    });

    it('returns false for ReadableStream', () => {
      expect(isJSONSerializable(new ReadableStream())).toBe(false);
    });

    it('returns false for Buffer', () => {
      expect(isJSONSerializable(Buffer.from('x'))).toBe(false);
    });

    it('returns false for functions', () => {
      expect(isJSONSerializable(() => {})).toBe(false);
    });
  });

  describe('detectResponseType', () => {
    it('returns json when content-type is null', () => {
      expect(detectResponseType(null)).toBe('json');
    });

    it('returns json for application/json', () => {
      expect(detectResponseType('application/json')).toBe('json');
    });

    it('returns json for application/ld+json', () => {
      expect(detectResponseType('application/ld+json')).toBe('json');
    });

    it('returns json for application/vnd.api+json', () => {
      expect(detectResponseType('application/vnd.api+json')).toBe('json');
    });

    it('returns json for application/json with charset', () => {
      expect(detectResponseType('application/json; charset=utf-8')).toBe('json');
    });

    it('returns stream for text/event-stream', () => {
      expect(detectResponseType('text/event-stream')).toBe('stream');
    });

    it('returns document for text/html', () => {
      expect(detectResponseType('text/html')).toBe('document');
    });

    it('returns text for text/plain', () => {
      expect(detectResponseType('text/plain')).toBe('text');
    });

    it('returns text for text/csv', () => {
      expect(detectResponseType('text/csv')).toBe('text');
    });

    it('returns document for application/xml', () => {
      expect(detectResponseType('application/xml')).toBe('document');
    });

    it('returns document for +xml suffix', () => {
      expect(detectResponseType('application/atom+xml')).toBe('document');
    });

    it('returns blob for application/octet-stream', () => {
      expect(detectResponseType('application/octet-stream')).toBe('blob');
    });

    it('returns blob for image/png', () => {
      expect(detectResponseType('image/png')).toBe('blob');
    });

    it('is case-insensitive', () => {
      expect(detectResponseType('APPLICATION/JSON')).toBe('json');
    });
  });

  describe('isNullBodyStatus', () => {
    it('returns true for 101, 204, 205, 304', () => {
      expect(isNullBodyStatus(101)).toBe(true);
      expect(isNullBodyStatus(204)).toBe(true);
      expect(isNullBodyStatus(205)).toBe(true);
      expect(isNullBodyStatus(304)).toBe(true);
    });

    it('returns false for 200, 201, 400, 500', () => {
      expect(isNullBodyStatus(200)).toBe(false);
      expect(isNullBodyStatus(201)).toBe(false);
      expect(isNullBodyStatus(400)).toBe(false);
      expect(isNullBodyStatus(500)).toBe(false);
    });
  });
});

// ============================================================
//  Headers Utilities
// ============================================================

describe('headers utilities', () => {
  describe('toHeaders', () => {
    it('returns empty Headers for undefined', () => {
      const h = toHeaders(undefined);
      expect(h).toBeInstanceOf(Headers);
      expect(Array.from(h.entries())).toHaveLength(0);
    });

    it('returns empty Headers for null', () => {
      expect(Array.from(toHeaders(null).entries())).toHaveLength(0);
    });

    it('converts a Record to Headers', () => {
      const h = toHeaders({ 'content-type': 'application/json', 'x-test': '1' });
      expect(h).toBeInstanceOf(Headers);
      expect(h.get('content-type')).toBe('application/json');
      expect(h.get('x-test')).toBe('1');
    });

    it('returns a copy when given a Headers instance', () => {
      const original = new Headers({ 'x-test': '1' });
      const copy = toHeaders(original);
      expect(copy.get('x-test')).toBe('1');
      copy.set('x-test', '2');
      expect(original.get('x-test')).toBe('1');
    });
  });

  describe('mergeHeaders', () => {
    it('merges multiple record sources', () => {
      const merged = mergeHeaders({ a: '1' }, { b: '2' });
      expect(merged.get('a')).toBe('1');
      expect(merged.get('b')).toBe('2');
    });

    it('later sources override earlier ones', () => {
      const merged = mergeHeaders({ 'x-test': '1' }, { 'x-test': '2' });
      expect(merged.get('x-test')).toBe('2');
    });

    it('merges Headers instances and records together', () => {
      const merged = mergeHeaders(new Headers({ a: '1' }), { b: '2' });
      expect(merged.get('a')).toBe('1');
      expect(merged.get('b')).toBe('2');
    });

    it('skips null and undefined sources', () => {
      const merged = mergeHeaders(null, undefined, { a: '1' }, null);
      expect(merged.get('a')).toBe('1');
    });

    it('skips undefined header values in records', () => {
      const merged = mergeHeaders({ a: '1', b: undefined } as any);
      expect(merged.get('a')).toBe('1');
      expect(merged.has('b')).toBe(false);
    });

    it('returns empty Headers when no sources are provided', () => {
      expect(Array.from(mergeHeaders().entries())).toHaveLength(0);
    });
  });
});

// ============================================================
//  Hook Utilities
// ============================================================

describe('callHooks', () => {
  const makeContext = (): FetchContext =>
    ({
      request: '/api',
      options: {
        url: '/api',
        method: 'GET',
        headers: new Headers(),
        responseType: 'json'
      }
    } as any);

  it('does nothing when hooks are undefined', async () => {
    await expect(callHooks(makeContext(), undefined)).resolves.toBeUndefined();
  });

  it('calls a single hook function with the context', async () => {
    const hook = vi.fn();
    const ctx = makeContext();
    await callHooks(ctx, hook);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledWith(ctx);
  });

  it('calls each hook in an array in order', async () => {
    const order: string[] = [];
    const hook1 = vi.fn(() => order.push('1'));
    const hook2 = vi.fn(() => order.push('2'));
    const hook3 = vi.fn(() => order.push('3'));
    await callHooks(makeContext(), [hook1, hook2, hook3]);
    expect(order).toEqual(['1', '2', '3']);
  });

  it('awaits async hooks sequentially', async () => {
    const order: string[] = [];
    const asyncHook = vi.fn(async () => {
      await Promise.resolve();
      order.push('async');
    });
    const syncHook = vi.fn(() => order.push('sync'));
    await callHooks(makeContext(), [asyncHook, syncHook]);
    expect(order).toEqual(['async', 'sync']);
  });

  it('passes the same context to each hook in an array', async () => {
    const ctx = makeContext();
    const hook = vi.fn();
    await callHooks(ctx, [hook]);
    expect(hook).toHaveBeenCalledWith(ctx);
  });
});
