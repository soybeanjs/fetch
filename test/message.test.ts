import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageStack } from '../src/message';
import type { MessageEntry } from '../src/message';

describe('MessageStack', () => {
  let stack: MessageStack;

  beforeEach(() => {
    vi.useFakeTimers();
    stack = new MessageStack();
  });

  describe('interval defaults', () => {
    it('defaults to 3000ms', () => {
      expect(new MessageStack().interval).toBe(3000);
    });

    it('accepts a custom interval via constructor', () => {
      expect(new MessageStack(5000).interval).toBe(5000);
    });
  });

  describe('push', () => {
    it('returns true on first call (should display)', () => {
      expect(stack.push('key1')).toBe(true);
    });

    it('returns false on duplicate within interval (suppressed)', () => {
      expect(stack.push('key1')).toBe(true);
      expect(stack.push('key1')).toBe(false);
    });

    it('returns true again after the interval passes', () => {
      expect(stack.push('key1')).toBe(true);
      vi.advanceTimersByTime(3000);
      expect(stack.push('key1')).toBe(true);
    });

    it('returns false just before the interval passes and true right after', () => {
      expect(stack.push('key1')).toBe(true);
      vi.advanceTimersByTime(2999);
      expect(stack.push('key1')).toBe(false);
      vi.advanceTimersByTime(1);
      expect(stack.push('key1')).toBe(true);
    });

    it('stores a custom message when provided', () => {
      stack.push('key1', 'custom message');
      expect(stack.getActive()[0].message).toBe('custom message');
    });

    it('defaults message to key when not provided', () => {
      stack.push('key1');
      expect(stack.getActive()[0].message).toBe('key1');
    });

    it('increments count on suppressed duplicates', () => {
      stack.push('key1');
      stack.push('key1');
      stack.push('key1');
      expect(stack.getActive()[0].count).toBe(2);
    });

    it('resets count to 0 when a new window starts', () => {
      stack.push('key1');
      stack.push('key1');
      vi.advanceTimersByTime(3000);
      stack.push('key1');
      expect(stack.getActive()[0].count).toBe(0);
    });

    it('treats different keys independently', () => {
      expect(stack.push('key1')).toBe(true);
      expect(stack.push('key2')).toBe(true);
      expect(stack.push('key1')).toBe(false);
      expect(stack.push('key2')).toBe(false);
    });
  });

  describe('has', () => {
    it('returns true for an active key', () => {
      stack.push('key1');
      expect(stack.has('key1')).toBe(true);
    });

    it('returns false for an unknown key', () => {
      expect(stack.has('unknown')).toBe(false);
    });

    it('returns false for an expired key', () => {
      stack.push('key1');
      vi.advanceTimersByTime(3000);
      expect(stack.has('key1')).toBe(false);
    });

    it('returns true just before expiry', () => {
      stack.push('key1');
      vi.advanceTimersByTime(2999);
      expect(stack.has('key1')).toBe(true);
    });
  });

  describe('clear', () => {
    it('removes all entries', () => {
      stack.push('key1');
      stack.push('key2');
      stack.clear();
      expect(stack.getActive()).toHaveLength(0);
      expect(stack.has('key1')).toBe(false);
      expect(stack.has('key2')).toBe(false);
    });

    it('allows pushing again after clear', () => {
      stack.push('key1');
      stack.clear();
      expect(stack.push('key1')).toBe(true);
    });
  });

  describe('getActive', () => {
    it('returns only entries within the interval window', () => {
      stack.push('active1');
      vi.advanceTimersByTime(1000);
      stack.push('active2');
      vi.advanceTimersByTime(2001); // active1 expired (3001ms), active2 still active (2001ms)
      const active = stack.getActive();
      expect(active).toHaveLength(1);
      expect(active[0].key).toBe('active2');
    });

    it('returns all active entries when multiple are within window', () => {
      stack.push('a');
      vi.advanceTimersByTime(500);
      stack.push('b');
      expect(stack.getActive()).toHaveLength(2);
    });

    it('returns empty array when all entries expired', () => {
      stack.push('a');
      vi.advanceTimersByTime(3000);
      expect(stack.getActive()).toHaveLength(0);
    });

    it('returns entries with the MessageEntry shape', () => {
      stack.push('key1', 'msg');
      const [entry] = stack.getActive();
      expect(entry).toMatchObject({ key: 'key1', message: 'msg' });
      expect(typeof entry.timestamp).toBe('number');
      expect(typeof entry.count).toBe('number');
    });
  });

  describe('interval is mutable', () => {
    it('changing interval affects the push() suppression window', () => {
      stack.interval = 1000;
      expect(stack.push('key1')).toBe(true);
      vi.advanceTimersByTime(999);
      expect(stack.push('key1')).toBe(false);
      vi.advanceTimersByTime(1);
      expect(stack.push('key1')).toBe(true);
    });

    it('changing interval affects has()', () => {
      stack.interval = 500;
      stack.push('key1');
      vi.advanceTimersByTime(500);
      expect(stack.has('key1')).toBe(false);
    });

    it('changing interval affects getActive()', () => {
      stack.interval = 500;
      stack.push('key1');
      vi.advanceTimersByTime(500);
      expect(stack.getActive()).toHaveLength(0);
    });

    it('a larger interval keeps entries active longer', () => {
      stack.interval = 5000;
      stack.push('key1');
      vi.advanceTimersByTime(3000);
      expect(stack.has('key1')).toBe(true);
    });
  });

  describe('MessageEntry shape', () => {
    it('exposes key, message, timestamp, count', () => {
      stack.push('k', 'm');
      const entry: MessageEntry | undefined = stack.getActive()[0];
      expect(entry).toBeDefined();
      expect(entry!.key).toBe('k');
      expect(entry!.message).toBe('m');
      expect(entry!.count).toBe(0);
      expect(entry!.timestamp).toBeTypeOf('number');
    });
  });
});
