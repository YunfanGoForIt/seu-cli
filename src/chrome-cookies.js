import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { copyFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import { CliError } from './errors.js';

const SOURCES = {
  chrome: {
    dir: 'Google/Chrome',
    service: 'Chrome Safe Storage',
    account: 'Chrome'
  },
  edge: {
    dir: 'Microsoft Edge',
    service: 'Microsoft Edge Safe Storage',
    account: 'Microsoft Edge'
  }
};

const CHROME_EPOCH_OFFSET = 11_644_473_600;

export async function readBrowserCookies(options = {}) {
  if (process.platform !== 'darwin') {
    throw new CliError('SYNC_UNSUPPORTED', 'Automatic cookie sync is currently supported on macOS only.', {
      hint: 'Use `seu-cli auth import --cookie-file ...` on this platform.'
    });
  }

  const browser = options.browser ?? process.env.SEU_BROWSER ?? 'chrome';
  const profile = options.profile ?? process.env.SEU_CHROME_PROFILE ?? 'Default';
  const source = SOURCES[browser];
  if (!source) {
    throw new CliError('SYNC_UNSUPPORTED', `Unknown browser "${browser}". Use chrome or edge.`);
  }

  const dbPath = join(
    homedir(),
    'Library',
    'Application Support',
    source.dir,
    profile,
    'Cookies'
  );

  try {
    await stat(dbPath);
  } catch {
    throw new CliError('SYNC_UNAVAILABLE', `No cookie database found at ${dbPath}.`, {
      hint: 'Check the browser profile name, or use `seu-cli auth import --cookie-file ...`.'
    });
  }

  const key = readKey(source);
  const temp = await mkdtemp(join(tmpdir(), 'seu-cli-cookies-'));
  try {
    const copy = join(temp, 'Cookies');
    await copyFile(dbPath, copy);
    await copySidecar(`${dbPath}-wal`, `${copy}-wal`);
    await copySidecar(`${dbPath}-shm`, `${copy}-shm`);

    const rows = queryCookies(copy);
    const cookies = rows
      .map((row) => decryptRow(row, key))
      .filter((cookie) => cookie && cookie.value && !isExpired(cookie.expiresUtc));

    const ehall = dedupe(cookies.filter((cookie) => cookie.host.endsWith('ehall.seu.edu.cn')));
    const appCookie = buildHeader(ehall, ['route', 'EMAP_LANG', 'GS_SESSIONID', '_WEU', 'amp.locale', 'JSESSIONID']);
    const portalCookie = buildHeader(ehall, ['amp.locale', 'JSESSIONID', 'asessionid']);
    const itsCookie = buildHeader(
      dedupe(cookies.filter((cookie) => cookie.host.endsWith('its.seu.edu.cn'))),
      ['CRBJSESSIONID', 'crbjsessionid']
    );
    const libCookie = buildAll(
      dedupe(cookies.filter((cookie) => cookie.host.endsWith('libopac.seu.edu.cn')))
    );

    if (!appCookie && !portalCookie) {
      throw new CliError('SYNC_UNAVAILABLE', 'No eHall cookies were found in the browser profile.', {
        hint: 'Open https://ehall.seu.edu.cn and log in, then retry `seu-cli auth refresh`.'
      });
    }

    return {
      cookie: appCookie,
      portalCookie,
      hostCookies: {
        ...(itsCookie ? { 'its.seu.edu.cn': itsCookie } : {}),
        ...(libCookie ? { 'libopac.seu.edu.cn': libCookie } : {})
      },
      browser,
      profile
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

function readKey(source) {
  let password;
  try {
    password = execFileSync(
      '/usr/bin/security',
      ['find-generic-password', '-w', '-s', source.service, '-a', source.account],
      { timeout: 20_000 }
    ).toString().trim();
  } catch (cause) {
    throw new CliError('SYNC_UNAVAILABLE', `Could not read the ${source.service} key from Keychain.`, {
      hint: 'Allow Keychain access when prompted, or use `seu-cli auth import --cookie-file ...`.',
      cause
    });
  }

  if (!password) {
    throw new CliError('SYNC_UNAVAILABLE', 'The browser cookie key is empty.');
  }
  return crypto.pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
}

function queryCookies(dbPath) {
  const sql = `select host_key, name, path, expires_utc, hex(encrypted_value), value
from cookies
where host_key like '%seu.edu.cn'
order by last_access_utc desc;`;
  let output;
  try {
    output = execFileSync('sqlite3', ['-separator', '\t', dbPath, sql], {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024
    });
  } catch (cause) {
    throw new CliError('SYNC_UNAVAILABLE', 'Could not read the browser cookie database.', { cause });
  }

  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [host, name, path, expires, encrypted, plain] = line.split('\t');
      return { host, name, path, expires, encrypted, plain };
    });
}

function decryptRow(row, key) {
  if (!row.host.endsWith('seu.edu.cn')) return null;
  if (row.plain) {
    return { host: row.host, name: row.name, value: row.plain, path: row.path, expiresUtc: Number(row.expires) };
  }
  if (!row.encrypted) return null;

  const buffer = Buffer.from(row.encrypted, 'hex');
  const prefix = buffer.subarray(0, 3).toString();
  if (prefix !== 'v10' && prefix !== 'v11') {
    throw new CliError('SYNC_UNSUPPORTED', `Unsupported cookie encryption format: ${prefix}.`, {
      hint: 'Use `seu-cli auth import --cookie-file ...` instead.'
    });
  }

  let plain;
  try {
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, ' '));
    plain = Buffer.concat([decipher.update(buffer.subarray(3)), decipher.final()]);
  } catch {
    return null;
  }

  const hash = crypto.createHash('sha256').update(row.host).digest();
  if (plain.length > 32 && plain.subarray(0, 32).equals(hash)) {
    plain = plain.subarray(32);
  }

  return {
    host: row.host,
    name: row.name,
    value: plain.toString('utf8'),
    path: row.path,
    expiresUtc: Number(row.expires)
  };
}

function dedupe(cookies) {
  const seen = new Set();
  const output = [];
  for (const cookie of cookies) {
    const key = `${cookie.host}|${cookie.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(cookie);
  }
  return output;
}

function buildAll(cookies) {
  return cookies
    .filter((cookie) => cookie.name && cookie.value)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

function buildHeader(cookies, names) {
  const values = new Map(cookies.map((cookie) => [cookie.name, cookie.value]));
  return names
    .filter((name) => values.has(name))
    .map((name) => `${name}=${values.get(name)}`)
    .join('; ');
}

function isExpired(expiresUtc) {
  if (!expiresUtc) return false;
  const unix = expiresUtc / 1_000_000 - CHROME_EPOCH_OFFSET;
  return unix <= Date.now() / 1000;
}

async function copySidecar(from, to) {
  try {
    await copyFile(from, to);
  } catch {
    // WAL/SHM are optional.
  }
}
