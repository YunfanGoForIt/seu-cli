import { Daemon } from '../daemon.js';
import { invalidArgument, notLoggedIn } from '../errors.js';
import { loadSession } from '../session.js';
import { BridgeBackend } from './bridge.js';
import { FetchBackend } from './fetch.js';

export async function getBackend({ daemonUrl, backend } = {}) {
  const session = await loadSession();
  const mode = backend ?? process.env.SEU_BACKEND ?? (session ? 'fetch' : 'bridge');

  if (mode === 'fetch') {
    if (!session) {
      throw notLoggedIn('No saved eHall cookie. Run `seu-cli auth import --cookie-file cookies.txt` first.');
    }
    return new FetchBackend(session.cookie ?? '', session.portalCookie ?? null);
  }

  if (mode === 'bridge') {
    return new BridgeBackend(new Daemon(daemonUrl));
  }

  throw invalidArgument(`Unknown backend "${mode}". Use fetch or bridge.`);
}
