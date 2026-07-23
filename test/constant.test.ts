import { describe, it, expect } from 'vitest';
import {
  FILE_RESPONSE_TYPES,
  DEFAULT_TIMEOUT,
  RETRY_STATUS_CODES,
  NULL_BODY_STATUS_CODES,
  BACKEND_ERROR_FLAG
} from '../src/constant';

// ============================================================
//  FILE_RESPONSE_TYPES
// ============================================================

describe('FILE_RESPONSE_TYPES', () => {
  it('includes blob, arraybuffer, and stream', () => {
    expect(FILE_RESPONSE_TYPES).toContain('blob');
    expect(FILE_RESPONSE_TYPES).toContain('arraybuffer');
    expect(FILE_RESPONSE_TYPES).toContain('stream');
  });

  it('does not include json, text, or document', () => {
    expect(FILE_RESPONSE_TYPES).not.toContain('json');
    expect(FILE_RESPONSE_TYPES).not.toContain('text');
    expect(FILE_RESPONSE_TYPES).not.toContain('document');
  });

  it('has exactly 3 entries', () => {
    expect(FILE_RESPONSE_TYPES).toHaveLength(3);
  });
});

// ============================================================
//  DEFAULT_TIMEOUT
// ============================================================

describe('DEFAULT_TIMEOUT', () => {
  it('is 10000 milliseconds (10 seconds)', () => {
    expect(DEFAULT_TIMEOUT).toBe(10_000);
  });

  it('is a positive number', () => {
    expect(DEFAULT_TIMEOUT).toBeGreaterThan(0);
  });
});

// ============================================================
//  RETRY_STATUS_CODES
// ============================================================

describe('RETRY_STATUS_CODES', () => {
  it('is a Set', () => {
    expect(RETRY_STATUS_CODES).toBeInstanceOf(Set);
  });

  it('includes 408, 409, 425, 429 (client errors worth retrying)', () => {
    expect(RETRY_STATUS_CODES.has(408)).toBe(true);
    expect(RETRY_STATUS_CODES.has(409)).toBe(true);
    expect(RETRY_STATUS_CODES.has(425)).toBe(true);
    expect(RETRY_STATUS_CODES.has(429)).toBe(true);
  });

  it('includes 500, 502, 503, 504 (server errors)', () => {
    expect(RETRY_STATUS_CODES.has(500)).toBe(true);
    expect(RETRY_STATUS_CODES.has(502)).toBe(true);
    expect(RETRY_STATUS_CODES.has(503)).toBe(true);
    expect(RETRY_STATUS_CODES.has(504)).toBe(true);
  });

  it('does not include 400, 401, 403, 404, 422 (non-retryable client errors)', () => {
    expect(RETRY_STATUS_CODES.has(400)).toBe(false);
    expect(RETRY_STATUS_CODES.has(401)).toBe(false);
    expect(RETRY_STATUS_CODES.has(403)).toBe(false);
    expect(RETRY_STATUS_CODES.has(404)).toBe(false);
    expect(RETRY_STATUS_CODES.has(422)).toBe(false);
  });

  it('does not include 200, 201, 204 (success statuses)', () => {
    expect(RETRY_STATUS_CODES.has(200)).toBe(false);
    expect(RETRY_STATUS_CODES.has(201)).toBe(false);
    expect(RETRY_STATUS_CODES.has(204)).toBe(false);
  });
});

// ============================================================
//  NULL_BODY_STATUS_CODES
// ============================================================

describe('NULL_BODY_STATUS_CODES', () => {
  it('is a Set', () => {
    expect(NULL_BODY_STATUS_CODES).toBeInstanceOf(Set);
  });

  it('includes 101, 204, 205, 304', () => {
    expect(NULL_BODY_STATUS_CODES.has(101)).toBe(true);
    expect(NULL_BODY_STATUS_CODES.has(204)).toBe(true);
    expect(NULL_BODY_STATUS_CODES.has(205)).toBe(true);
    expect(NULL_BODY_STATUS_CODES.has(304)).toBe(true);
  });

  it('does not include 200, 201, 400, 500, 404', () => {
    expect(NULL_BODY_STATUS_CODES.has(200)).toBe(false);
    expect(NULL_BODY_STATUS_CODES.has(201)).toBe(false);
    expect(NULL_BODY_STATUS_CODES.has(400)).toBe(false);
    expect(NULL_BODY_STATUS_CODES.has(500)).toBe(false);
    expect(NULL_BODY_STATUS_CODES.has(404)).toBe(false);
  });
});

// ============================================================
//  BACKEND_ERROR_FLAG
// ============================================================

describe('BACKEND_ERROR_FLAG', () => {
  it('is the string "BACKEND_ERROR"', () => {
    expect(BACKEND_ERROR_FLAG).toBe('BACKEND_ERROR');
  });

  it('is a non-empty string', () => {
    expect(typeof BACKEND_ERROR_FLAG).toBe('string');
    expect(BACKEND_ERROR_FLAG.length).toBeGreaterThan(0);
  });
});
