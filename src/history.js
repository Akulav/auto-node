/** Deploy history: the last 3 deploys per website, each with its full log. */
import fs from 'node:fs';
import path from 'node:path';
import * as config from './config.js';
import { HttpError, readJsonFile, writeFileAtomic } from './util.js';

export const KEEP = 3;
const MAX_LOG = 512 * 1024;
const listFile = (name) => path.join(config.paths.historyDir, `${name}.json`);
const logDir = (name) => path.join(config.paths.historyDir, name);

const readAll = (name) => {
  const all = readJsonFile(listFile(name), []);
  return Array.isArray(all) ? all : [];
};

/** Newest first. Older versions kept 50: only the newest KEEP are shown. */
export const list = (name) => readAll(name).slice(0, KEEP);

export function add(name, entry, logText = '') {
  const kept = [entry, ...readAll(name)].slice(0, KEEP);
  fs.mkdirSync(logDir(name), { recursive: true, mode: 0o700 });
  writeFileAtomic(path.join(logDir(name), `${entry.id}.log`), logText.length > MAX_LOG ? '…\n' + logText.slice(-MAX_LOG) : logText);
  writeFileAtomic(listFile(name), JSON.stringify(kept));
  // Old logs go only after the list no longer points at them (also the extra ones older versions kept).
  const ids = new Set(kept.map((e) => `${e.id}.log`));
  let files = [];
  try {
    files = fs.readdirSync(logDir(name));
  } catch {}
  for (const f of files) if (f.endsWith('.log') && !ids.has(f)) fs.rmSync(path.join(logDir(name), f), { force: true });
}

export function log(name, id) {
  if (!/^[0-9a-z]+$/.test(String(id))) throw new HttpError(400, 'Invalid id');
  try {
    return fs.readFileSync(path.join(logDir(name), `${id}.log`), 'utf8');
  } catch {
    throw new HttpError(404, 'That log is no longer available.');
  }
}
