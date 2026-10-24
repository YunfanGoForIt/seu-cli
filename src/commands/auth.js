import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { APPS } from '../apps.js';

import { FetchBackend } from '../backends/fetch.js';
import { readBrowserCookies } from '../chrome-cookies.js';
import { CliError, invalidArgument } from '../errors.js';
import { deleteSession, saveSession, sessionPath } from '../session.js';

export async function authImport(_context, options = {}) {
  const cookie = await readCookie(options.cookie, options.cookieFile);
  const portalCookie = await readCookie(options.portalCookie, options.portalCookieFile);
  const itsCookie = await readCookie(options.itsCookie, options.itsCookieFile);
  const libCookie = await readCookie(options.libCookie, options.libCookieFile);

  const hostCookies = {
    ...(itsCookie ? { 'its.seu.edu.cn': itsCookie } : {}),
    ...(libCookie ? { 'libopac.seu.edu.cn': libCookie } : {})
  };

  if (!cookie && !portalCookie && !itsCookie && !libCookie) {
    throw invalidArgument('Provide at least one cookie file: --cookie-file, --portal-cookie-file, --its-cookie-file or --lib-cookie-file.');
  }

  const status = cookie || portalCookie
    ? await new FetchBackend(cookie, portalCookie, hostCookies).loginStatus()
    : null;
  const file = await saveSession({
    cookie,
    portalCookie,
    hostCookies,
    user: status?.user ?? null
  });

  return {
    imported: true,
    user: status?.user ?? null,
    cookieKinds: {
      app: Boolean(cookie),
      portal: Boolean(portalCookie),
      its: Boolean(itsCookie),
      libopac: Boolean(libCookie)
    },
    ...(status ? {} : { validated: false, note: 'Only host cookies were imported; app/portal commands still need an app cookie.' }),
    ...(status?.note ? { note: status.note } : {}),
    sessionPath: file
  };
}

export async function authRefresh(options = {}) {
  let source = await readBrowserCookies(options);
  let status = await tryStatus(source);

  if (!status) {
    await bootstrapBrowser();
    for (let attempt = 0; attempt < 20 && !status; attempt += 1) {
      await sleep(1000);
      try {
        source = await readBrowserCookies(options);
        status = await tryStatus(source);
      } catch {
        status = null;
      }
    }
  }

  if (!status) {
    throw new CliError('NOT_LOGGED_IN', 'Chrome does not have a valid eHall session.', {
      hint: 'Log in to https://ehall.seu.edu.cn in Chrome, then run `seu-cli auth refresh` again.'
    });
  }

  const file = await saveSession({
    cookie: source.cookie,
    portalCookie: source.portalCookie,
    hostCookies: source.hostCookies ?? {},
    user: status.user ?? null
  });

  return {
    refreshed: true,
    user: status.user ?? null,
    source: {
      browser: source.browser,
      profile: source.profile
    },
    sessionPath: file
  };
}

export async function authStatus({ backend }) {
  const status = await backend.loginStatus();
  return {
    ...status,
    sessionPath: sessionPath(),
    backend: backend.kind
  };
}

export async function authLogout() {
  const hadSession = await deleteSession();
  return {
    loggedOut: true,
    hadSession,
    sessionPath: sessionPath()
  };
}

async function readCookie(value, file) {
  if (file) {
    return normalizeCookie(await readFile(file, 'utf8'));
  }
  return normalizeCookie(value ?? '');
}

async function tryStatus(source) {
  try {
    return await new FetchBackend(source.cookie, source.portalCookie, source.hostCookies ?? {}).loginStatus();
  } catch {
    return null;
  }
}

async function bootstrapBrowser() {
  if (process.platform !== 'darwin') return false;
  const show = `https://i.seu.edu.cn/default/index.html#/ServiceShow?isMobile=0&wid=${APPS.course.wid}`;
  try {
    execFileSync('open', ['-a', 'Google Chrome', 'https://i.seu.edu.cn']);
    await sleep(2500);
    execFileSync('open', ['-a', 'Google Chrome', show]);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeCookie(raw) {
  return String(raw)
    .replace(/^cookie:\s*/i, '')
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('; ')
    .replace(/;\s*;/g, ';')
    .replace(/;\s*$/, '')
    .replace(/^;\s*/, '');
}
