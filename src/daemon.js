import { CliError } from './errors.js';

const SESSION = 'seu';
const DEFAULT_TIMEOUT_MS = 90_000;

export class Daemon {
  constructor(baseUrl) {
    this.baseUrl = String(baseUrl ?? '').replace(/\/+$/, '');
  }

  async send(action, args = {}) {
    let response;
    try {
      response = await fetch(`${this.baseUrl}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, args, session: SESSION }),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
      });
    } catch (cause) {
      throw new CliError('DAEMON_UNAVAILABLE', `Cannot reach the browser bridge at ${this.baseUrl}.`, {
        hint: 'Run `~/.kimi-webbridge/bin/kimi-webbridge start`, then retry.',
        cause
      });
    }

    let payload;
    try {
      payload = await response.json();
    } catch (cause) {
      throw new CliError('DAEMON_ERROR', `Browser bridge returned HTTP ${response.status} without JSON.`, {
        hint: 'Check that --daemon-url points at the Kimi WebBridge daemon.',
        cause
      });
    }

    if (!payload.ok) {
      const code = payload.error?.code ?? 'DAEMON_ERROR';
      const message = payload.error?.message ?? 'Browser bridge request failed.';
      if (code === 'extension_not_connected') {
        throw new CliError('EXTENSION_NOT_CONNECTED', 'The Kimi Browser Extension is not connected.', {
          hint: 'Open the Kimi side panel in your browser and enable local agent remote control.'
        });
      }
      throw new CliError('DAEMON_ERROR', message, { details: { bridgeCode: code } });
    }

    return payload.data;
  }

  async evaluate(code) {
    const data = await this.send('evaluate', { code });
    return data.value;
  }

  async navigate(url, { newTab = false, groupTitle } = {}) {
    const args = { url };
    if (newTab) args.newTab = true;
    if (groupTitle) args.group_title = groupTitle;
    return this.send('navigate', args);
  }

  async findTab(url) {
    try {
      return await this.send('find_tab', { url });
    } catch (error) {
      if (error instanceof CliError && /no tab matching|not found|no_tab/i.test(error.message)) {
        return null;
      }
      throw error;
    }
  }
}
