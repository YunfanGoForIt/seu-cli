import { readFile } from 'node:fs/promises';

import { FetchBackend } from '../backends/fetch.js';
import { invalidArgument } from '../errors.js';
import { deleteSession, saveSession, sessionPath } from '../session.js';

export async function authImport(_context, options = {}) {
  const cookie = await readCookie(options.cookie, options.cookieFile);
  const portalCookie = await readCookie(options.portalCookie, options.portalCookieFile);

  if (!cookie && !portalCookie) {
    throw invalidArgument('Provide --cookie-file <path> (app cookie) or --portal-cookie-file <path> (portal cookie).');
  }

  const status = await new FetchBackend(cookie, portalCookie).loginStatus();
  const file = await saveSession({
    cookie,
    portalCookie,
    user: status.user ?? null
  });

  return {
    imported: true,
    user: status.user ?? null,
    cookieKinds: {
      app: Boolean(cookie),
      portal: Boolean(portalCookie)
    },
    ...(status.note ? { note: status.note } : {}),
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
