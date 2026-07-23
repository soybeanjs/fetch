import { describe, it, expect, vi } from 'vitest';
import { defaultAdapter, createAdapterResponse, createUploadProgressAdapter } from '../src/adapter';
import { setFetchResponse, getFetchCalls } from './helpers';

// ============================================================
//  Helpers
// ============================================================

/**
 * Drain a ReadableStream to completion.
 *
 * The stream upload adapter wraps the request body in a counting TransformStream.
 * The progress callback only fires once chunks flow through that transform, which
 * happens when the body stream is consumed. The mocked `fetch` never reads the
 * body, so we drain it ourselves to flush progress events deterministically.
 */
async function drainStream(body: unknown): Promise<void> {
  if (!body || typeof (body as ReadableStream).getReader !== 'function') return;
  const reader = (body as ReadableStream).getReader();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
  reader.releaseLock();
}

/** Build a minimal FetchAdapterInit for the given body. */
function makeInit(body?: BodyInit | null) {
  return { method: 'POST', headers: new Headers(), body };
}

// ============================================================
//  defaultAdapter
// ============================================================

describe('defaultAdapter', () => {
  it('calls the native fetch(url, init) and returns its result', async () => {
    setFetchResponse({ status: 200, statusText: 'OK', body: { ok: 1 } });

    const init = makeInit('payload');
    const result = await defaultAdapter('https://example.com/api', init);

    expect(getFetchCalls()).toHaveLength(1);
    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(200);
  });

  it('passes url and init through unchanged', async () => {
    const headers = new Headers({ 'x-test': 'value' });
    const init = { method: 'PUT', headers, body: 'data' };

    await defaultAdapter('https://example.com/path', init);

    const calls = getFetchCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://example.com/path');
    expect(calls[0].init).toBe(init);
    expect(calls[0].init?.method).toBe('PUT');
    expect(calls[0].init?.headers).toBe(headers);
    expect(calls[0].init?.body).toBe('data');
  });

  it('returns whatever Response the native fetch resolves with', async () => {
    // Note: 204/205/304 are null-body statuses and reject a body in the Response
    // constructor, so use 201 to verify status/statusText passthrough.
    setFetchResponse({ status: 201, statusText: 'Created', body: '' });
    const result = await defaultAdapter('https://example.com/empty', makeInit(null));
    expect(result.status).toBe(201);
    expect(result.statusText).toBe('Created');
  });
});

// ============================================================
//  createAdapterResponse
// ============================================================

describe('createAdapterResponse', () => {
  it('creates a response with the provided status, statusText, headers, and body', () => {
    const headers = new Headers({ 'content-type': 'application/json' });
    const stream = new ReadableStream<Uint8Array>();
    const res = createAdapterResponse({
      status: 201,
      statusText: 'Created',
      headers,
      body: stream
    });

    expect(res.status).toBe(201);
    expect(res.statusText).toBe('Created');
    expect(res.headers).toBe(headers);
    expect(res.body).toBe(stream);
  });

  it('defaults statusText to ""', () => {
    const res = createAdapterResponse({ status: 200 });
    expect(res.statusText).toBe('');
  });

  it('defaults headers to a new Headers() instance', () => {
    const res = createAdapterResponse({ status: 200 });
    expect(res.headers).toBeInstanceOf(Headers);
    expect(Array.from(res.headers.entries())).toHaveLength(0);
  });

  it('defaults body to null', () => {
    const res = createAdapterResponse({ status: 200 });
    expect(res.body).toBeNull();
  });

  it('defaults text() to ""', async () => {
    const res = createAdapterResponse({ status: 200 });
    expect(await res.text()).toBe('');
  });

  it('defaults blob() to a new empty Blob()', async () => {
    const res = createAdapterResponse({ status: 200 });
    const blob = await res.blob();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe(0);
  });

  it('defaults arrayBuffer() to a new ArrayBuffer(0)', async () => {
    const res = createAdapterResponse({ status: 200 });
    const buf = await res.arrayBuffer();
    expect(buf).toBeInstanceOf(ArrayBuffer);
    expect(buf.byteLength).toBe(0);
  });

  it('uses custom text/blob/arrayBuffer functions when provided', async () => {
    const text = vi.fn(async () => 'custom-text');
    const blob = vi.fn(async () => new Blob(['custom-blob']));
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(7));

    const res = createAdapterResponse({ status: 200, text, blob, arrayBuffer });

    const textResult = await res.text();
    const blobResult = await res.blob();
    const bufResult = await res.arrayBuffer();

    expect(textResult).toBe('custom-text');
    expect(blobResult).toBeInstanceOf(Blob);
    expect(blobResult.size).toBe(11);
    expect(bufResult).toBeInstanceOf(ArrayBuffer);
    expect(bufResult.byteLength).toBe(7);

    expect(text).toHaveBeenCalledTimes(1);
    expect(blob).toHaveBeenCalledTimes(1);
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
//  createUploadProgressAdapter
// ============================================================

describe('createUploadProgressAdapter', () => {
  it('returns a stream-based adapter in Node.js (no XMLHttpRequest)', () => {
    // Node.js environment: XMLHttpRequest is unavailable, TransformStream is global.
    expect(typeof XMLHttpRequest).toBe('undefined');
    expect(typeof TransformStream).not.toBe('undefined');

    const adapter = createUploadProgressAdapter(vi.fn());
    expect(adapter).toBeDefined();
    expect(typeof adapter).toBe('function');
  });

  it('returns undefined when neither XMLHttpRequest nor TransformStream is available', () => {
    vi.stubGlobal('TransformStream', undefined);
    expect(typeof XMLHttpRequest).toBe('undefined');
    expect(typeof TransformStream).toBe('undefined');

    const adapter = createUploadProgressAdapter(vi.fn());
    expect(adapter).toBeUndefined();
  });

  it('selects the XHR adapter when XMLHttpRequest is available', () => {
    // Simulate a browser-like environment by stubbing XMLHttpRequest.
    vi.stubGlobal('XMLHttpRequest', class FakeXHR {});
    const adapter = createUploadProgressAdapter(vi.fn());
    expect(typeof adapter).toBe('function');
  });

  it('calls onUploadProgress with loaded/total for a string body', async () => {
    const onUploadProgress = vi.fn();
    const adapter = createUploadProgressAdapter(onUploadProgress)!;

    const body = 'hello world'; // 11 ASCII bytes
    await adapter('https://example.com/upload', makeInit(body));

    const calls = getFetchCalls();
    expect(calls).toHaveLength(1);
    await drainStream(calls[0].init?.body);

    expect(onUploadProgress).toHaveBeenCalled();
    const last = onUploadProgress.mock.calls.at(-1)![0];
    expect(last.loaded).toBe(11);
    expect(last.total).toBe(11);
    expect(last.lengthComputable).toBe(true);
    expect(last.progress).toBe(100);
  });

  it('calls onUploadProgress for a Blob body', async () => {
    const onUploadProgress = vi.fn();
    const adapter = createUploadProgressAdapter(onUploadProgress)!;

    const blob = new Blob(['blob-payload']); // 12 bytes
    await adapter('https://example.com/upload', makeInit(blob));

    await drainStream(getFetchCalls()[0].init?.body);

    expect(onUploadProgress).toHaveBeenCalled();
    const last = onUploadProgress.mock.calls.at(-1)![0];
    expect(last.total).toBe(blob.size);
    expect(last.loaded).toBe(blob.size);
    expect(last.lengthComputable).toBe(true);
    expect(last.progress).toBe(100);
  });

  it('calls onUploadProgress for an ArrayBuffer body', async () => {
    const onUploadProgress = vi.fn();
    const adapter = createUploadProgressAdapter(onUploadProgress)!;

    const buf = new ArrayBuffer(8);
    const view = new Uint8Array(buf);
    view.set([1, 2, 3, 4, 5, 6, 7, 8]);

    await adapter('https://example.com/upload', makeInit(buf));

    await drainStream(getFetchCalls()[0].init?.body);

    expect(onUploadProgress).toHaveBeenCalled();
    const last = onUploadProgress.mock.calls.at(-1)![0];
    expect(last.total).toBe(8);
    expect(last.loaded).toBe(8);
    expect(last.lengthComputable).toBe(true);
    expect(last.progress).toBe(100);
  });

  it('falls back to defaultAdapter (no progress) for null/undefined body', async () => {
    const onUploadProgress = vi.fn();
    const adapter = createUploadProgressAdapter(onUploadProgress)!;

    const result = await adapter('https://example.com/get', makeInit(null));

    expect(getFetchCalls()).toHaveLength(1);
    expect(getFetchCalls()[0].init?.body).toBeNull();
    expect(onUploadProgress).not.toHaveBeenCalled();
    expect(result).toBeInstanceOf(Response);
  });

  it('ultimately calls native fetch with a stream body and duplex: "half"', async () => {
    const adapter = createUploadProgressAdapter(vi.fn())!;
    await adapter('https://example.com/upload', makeInit('stream-me'));

    const calls = getFetchCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].init?.body).toBeInstanceOf(ReadableStream);
    expect((calls[0].init as any)?.duplex).toBe('half');
  });

  it('returns the response produced by native fetch', async () => {
    setFetchResponse({ status: 200, statusText: 'OK', body: 'done' });
    const adapter = createUploadProgressAdapter(vi.fn())!;
    const result = await adapter('https://example.com/upload', makeInit('data'));

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(200);
    expect(await result.text()).toBe('done');
  });
});
