/** Deploy history: the last 50 deploys per website, each with its full log. */
import fs from 'node:fs';
import path from 'node:path';
import * as config from './config.js';
import { HttpError } from './util.js';

const KEEP = 50;
const MAX_LOG = 512 * 1024;
const listFile = (name) => path.join(config.paths.historyDir, `${name}.json`);
const logDir = (name) => path.join(config.paths.historyDir, name);

export function list(name) {
  try {
    return JSON.parse(fs.readFileSync(listFile(name), 'utf8'));
  } catch {
    return [];
  }
}

export function add(name, entry, logText = '') {
  const all = [entry, ...list(name)];
  fs.mkdirSync(logDir(name), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(logDir(name), `${entry.id}.log`), logText.length > MAX_LOG ? '…\n' + logText.slice(-MAX_LOG) : logText, { mode: 0o600 });
  for (const old of all.slice(KEEP)) fs.rmSync(path.join(logDir(name), `${old.id}.log`), { force: true });
  fs.writeFileSync(listFile(name), JSON.stringify(all.slice(0, KEEP)), { mode: 0o600 });
}

export function log(name, id) {
  if (!/^[0-9a-z]+$/.test(String(id))) throw new HttpError(400, 'Invalid id');
  try {
    return fs.readFileSync(path.join(logDir(name), `${id}.log`), 'utf8');
  } catch {
    throw new HttpError(404, 'That log is no longer available.');
  }
}
