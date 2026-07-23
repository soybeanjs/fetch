// ============================================================
//  Content-Disposition Parsing (Content-Disposition 解析)
// ============================================================

/**
 * Parse the filename from a `Content-Disposition` header value.
 *
 * 从 `Content-Disposition` 头部值中解析文件名。
 *
 * Supports both `filename` and `filename*` (RFC 5987) parameters,
 * and handles various quoting and encoding scenarios.
 *
 * @param contentDisposition The Content-Disposition header value
 * @returns The parsed filename, or empty string if not found
 */
export function parseContentDisposition(contentDisposition: string | null | undefined): string {
  if (!contentDisposition) return '';

  const disposition = contentDisposition.trim();

  // Try filename* (RFC 5987) first — it takes precedence
  const filenameStarMatch = disposition.match(/filename\*\s*=\s*[^']*''([^;]+)/i);
  if (filenameStarMatch?.[1]) {
    return decodeURIComponent(filenameStarMatch[1].trim());
  }

  // Try filename="..."
  const quotedMatch = disposition.match(/filename\s*=\s*"([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1].trim();
  }

  // Try filename=... (unquoted)
  const unquotedMatch = disposition.match(/filename\s*=\s*([^;]+)/i);
  if (unquotedMatch?.[1]) {
    return unquotedMatch[1].trim().replace(/["']/g, '');
  }

  return '';
}

// ============================================================
//  File Download (文件下载)
// ============================================================

/**
 * Trigger a file download in the browser.
 *
 * 在浏览器中触发文件下载。
 *
 * @param file The file data (Blob, ArrayBuffer, or string)
 * @param filename The filename for the download
 */
export function downloadFile(file: Blob | ArrayBuffer | string, filename: string): void {
  if (typeof document === 'undefined') {
    throw new Error('downloadFile is only available in browser environments.');
  }

  const blob = file instanceof Blob ? file : new Blob([file]);
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Revoke the URL after a short delay to ensure the download starts
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
