// ============================================================
//  Message Stack (消息栈 — 请求消息去重)
// ============================================================

/**
 * A single message entry in the message stack.
 *
 * 消息栈中的一条消息记录。
 */
export interface MessageEntry {
  /** Deduplication key (去重 key) */
  key: string;
  /** Message content (消息内容) */
  message: string;
  /** Timestamp when the message was first pushed (首次推入的时间戳) */
  timestamp: number;
  /** Number of times this message was suppressed within the interval (窗口内被抑制的次数) */
  count: number;
}

/**
 * Message stack for request message deduplication.
 *
 * When a request is triggered repeatedly in a short time, only the first
 * occurrence of a message passes through; subsequent duplicates within the
 * `interval` window are silently suppressed.
 *
 * 请求消息去重栈。
 *
 * 当请求在短时间内重复触发时，窗口内相同 key 的消息只通过首次，
 * 后续重复消息被静默抑制。
 *
 * @example
 * ```ts
 * const request = createRequest(
 *   { baseURL: 'https://api.example.com' },
 *   {
 *     isBackendSuccess: r => r.data.code === 200,
 *     onError: error => {
 *       // 3s 内同一 error.message 只展示一次
 *       if (request.state.messages.push(error.message)) {
 *         showToast(error.message);
 *       }
 *     }
 *   }
 * );
 *
 * // 自定义去重 key（如按错误码去重）
 * if (request.state.messages.push(error.code, error.message)) {
 *   showToast(error.message);
 * }
 *
 * // 调整时间窗口（默认 3000ms）
 * request.state.messages.interval = 5000;
 *
 * // 查看窗口内活跃消息
 * request.state.messages.getActive();
 *
 * // 清空
 * request.state.messages.clear();
 * ```
 */
export class MessageStack {
  private entries = new Map<string, MessageEntry>();

  /** Deduplication window in milliseconds (去重时间窗口，毫秒) */
  interval: number;

  constructor(interval = 3000) {
    this.interval = interval;
  }

  /**
   * Push a message into the stack.
   *
   * - Returns `true` if the message should be displayed (first occurrence in window).
   * - Returns `false` if the message is suppressed (duplicate within `interval`).
   *
   * 推入一条消息。
   *
   * - 返回 `true` 表示应展示（窗口内首次出现）
   * - 返回 `false` 表示已抑制（窗口内重复）
   *
   * @param key Deduplication key (去重 key，通常用 error.message 或 error.code)
   * @param message Optional message content, defaults to `key` (消息内容，默认同 key)
   */
  push(key: string, message?: string): boolean {
    const now = Date.now();
    const existing = this.entries.get(key);
    if (existing && now - existing.timestamp < this.interval) {
      existing.count++;
      return false;
    }
    this.entries.set(key, {
      key,
      message: message ?? key,
      timestamp: now,
      count: 0
    });
    return true;
  }

  /**
   * Check if a key is currently active (within the interval window)
   * without pushing a new entry.
   *
   * 检查某 key 是否在窗口内已存在（不推入新记录）。
   */
  has(key: string): boolean {
    const entry = this.entries.get(key);
    return !!entry && Date.now() - entry.timestamp < this.interval;
  }

  /**
   * Clear all message entries.
   *
   * 清空所有消息记录。
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Get all active entries (within the interval window).
   *
   * 获取窗口内所有活跃消息。
   */
  getActive(): MessageEntry[] {
    const now = Date.now();
    return [...this.entries.values()].filter(e => now - e.timestamp < this.interval);
  }
}
