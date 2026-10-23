import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export function cliHome() {
  return process.env.SEU_CLI_HOME || join(homedir(), '.seu-cli');
}

export function sessionPath() {
  return join(cliHome(), 'session.json');
}

export async function loadSession() {
  try {
    const parsed = JSON.parse(await readFile(sessionPath(), 'utf8'));
    if (!parsed || (!parsed.cookie && !parsed.portalCookie)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveSession({ cookie = '', portalCookie = '', user = null }) {
  const file = sessionPath();
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  const payload = {
    version: 1,
    savedAt: new Date().toISOString(),
    ...(cookie ? { cookie } : {}),
    ...(portalCookie ? { portalCookie } : {}),
    ...(user ? { user } : {})
  };
  await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(tmp, file);
  return file;
}

export async function deleteSession() {
  const existed = Boolean(await loadSession());
  await rm(sessionPath(), { force: true });
  return existed;
}
