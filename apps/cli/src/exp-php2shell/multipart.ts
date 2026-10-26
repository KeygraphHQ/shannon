/**
 * Multipart body construction for the php2shell probe.
 *
 * Both bodies are valid `multipart/form-data`. The control is a single well-formed field, the healthy
 * baseline. The probe is one part with no `Content-Disposition` header, flooded with MIME headers: the
 * two default guards (`max_input_vars`, `max_multipart_body_parts`) do not count such a part, so header
 * parsing exhausts the default 128 MB `memory_limit` on an unpatched runtime. The body stays under the
 * default 8 MB `post_max_size`, and carries nothing that would advance the code-execution step.
 */

import { randomBytes } from 'node:crypto';

/** Headers in the full-size probe part (~7.4 MB, under the default 8 MB post_max_size). */
export const PROBE_HEADER_COUNT = 540000;

/** Headers in the smaller first-attempt probe (~1 MiB), for targets with a lowered post_max_size. */
export const PROBE_SMALL_HEADER_COUNT = 80000;

export interface MultipartBody {
  readonly contentType: string;
  readonly body: Buffer;
}

/** A multipart boundary token that cannot collide with the ASCII field data below. */
function freshBoundary(): string {
  return `----shannonPhp2shellProbe${randomBytes(16).toString('hex')}`;
}

/** A single benign field with a proper Content-Disposition. The baseline a healthy worker answers. */
export function buildControlBody(): MultipartBody {
  const boundary = freshBoundary();
  const payload = `--${boundary}\r\nContent-Disposition: form-data; name="probe"\r\n\r\ncontrol\r\n--${boundary}--\r\n`;
  return { contentType: `multipart/form-data; boundary=${boundary}`, body: Buffer.from(payload, 'utf8') };
}

/**
 * The crafted probe body: one part with no Content-Disposition, flooded with `headerCount` headers
 * (default {@link PROBE_HEADER_COUNT}). Structurally valid HTTP, not an exploit payload.
 */
export function buildProbeBody(headerCount: number = PROBE_HEADER_COUNT): MultipartBody {
  const boundary = freshBoundary();
  const chunks: string[] = [`--${boundary}\r\n`];
  for (let index = 0; index < headerCount; index += 1) {
    chunks.push(`X-h${index}: a\r\n`);
  }
  chunks.push(`\r\nprobe\r\n--${boundary}--\r\n`);
  return { contentType: `multipart/form-data; boundary=${boundary}`, body: Buffer.from(chunks.join(''), 'utf8') };
}
