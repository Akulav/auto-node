/**
 * Chunked, resumable uploads.
 *
 * The browser splits a file into pieces and PUTs each one with its byte offset.
 * Writes are idempotent (same offset → same bytes), so a failed piece can simply
 * be sent again, and an interrupted upload resumes from GET /api/chunk?id=…
 * Finished uploads are moved into place by the caller (website files, backups).
 */
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import * as config from './config.js';
import { HttpError } from './util.js';

export const CHUNK_LIMIT = 32 * 1024 * 1024; // the browser sends 8 MB; allow headroom
const ID_RE = /^[a-f0-9]{16,64}$/;
const STALE_MS = 24 * 3600_000;

const dir = () => path.join(config.paths.tmpDir, 'uploads');

function fileFor(id) {
  if (!ID_RE.test(String(id || ''))) throw new HttpError(400, 'Invalid upload id.');
  return path.join(dir(), `${id}.part`);
}

function sizeOf(file) {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

function cleanupStale() {
  let entries = [];
  try {
    entries = fs.readdirSync(dir());
  } catch {}
  for (const e of entries) {
    const p = path.join(dir(), e);
    try {
      if (Date.now() - fs.statSync(p).mtimeMs > STALE_MS) fs.rmSync(p, { force: true });
    } catch {}
  }
}

/** How many bytes of this upload the server already has. */
export function received(id) {
  return { received: sizeOf(fileFor(id)) };
}

export async function writeChunk(id, offsetRaw, totalRaw, req) {
  const file = fileFor(id);
  const offset = Number(offsetRaw);
  const total = Number(totalRaw);
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(total) || total < 0) throw new HttpError(400, 'Invalid offset or size.');
  const length = Number(req.headers['content-length']);
  if (!Number.isSafeInteger(length) || length < 0) throw new HttpError(411, 'Missing Content-Length.');
  if (length > CHUNK_LIMIT) throw new HttpError(413, 'Piece is too large.');
  if (offset + length > total) throw new HttpError(400, 'Piece goes past the end of the file.');

  fs.mkdirSync(dir(), { recursive: true, mode: 0o700 });
  const have = sizeOf(file);
  if (offset === 0 && have === 0) {
    cleanupStale();
    // Fail early instead of filling the disk.
    try {
      const s = fs.statfsSync(dir());
      if (total > s.bavail * s.bsize) throw new HttpError(507, 'There is not enough free disk space for this file.');
    } catch (err) {
      if (err instanceof HttpError) throw err;
    }
  }
  if (offset > have) throw new HttpError(409, `Out of order: the server has ${have} bytes.`);

  fs.closeSync(fs.openSync(file, 'a')); // create if missing
  await pipeline(req, fs.createWriteStream(file, { flags: 'r+', start: offset }));
  return { received: sizeOf(file) };
}

/** Hand over a completed upload's temp file (caller moves or deletes it). */
export function take(id, total) {
  const file = fileFor(id);
  const size = sizeOf(file);
  if (!fs.existsSync(file)) throw new HttpError(404, 'Upload not found. Please try again.');
  if (total != null && size !== Number(total)) throw new HttpError(409, `Upload is incomplete (${size} of ${total} bytes).`);
  return file;
}

export function discard(id) {
  fs.rmSync(fileFor(id), { force: true });
}

/** Move a file, falling back to copy when crossing filesystems. */
export function moveFile(from, to) {
  try {
    fs.renameSync(from, to);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    fs.copyFileSync(from, to);
    fs.rmSync(from, { force: true });
  }
}
