import { EHALL_HOST, GROUP_TITLE, PORTAL_URL, serviceShowUrl } from './apps.js';
import { CliError, notLoggedIn } from './errors.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const AUTH_PATTERN = /auth\.seu\.edu\.cn|authserver\.seu\.edu\.cn/i;

export async function ensureApp(daemon, app) {
  const current = await daemon.findTab(EHALL_HOST);
  if (current?.url?.includes(app.path)) {
    const state = await readState(daemon);
    if (state.title !== '403' && state.ready !== 'loading') return state;
  }

  const existing = current ?? await daemon.findTab('https://i.seu.edu.cn');
  if (existing) {
    await daemon.navigate(serviceShowUrl(app.wid));
  } else {
    await daemon.navigate(serviceShowUrl(app.wid), { newTab: true, groupTitle: GROUP_TITLE });
  }

  return waitForApp(daemon, app);
}

export async function ensurePortal(daemon) {
  let tab = await daemon.findTab('https://i.seu.edu.cn');
  tab ??= await daemon.findTab(EHALL_HOST);

  if (!tab) {
    await daemon.navigate(PORTAL_URL, { newTab: true, groupTitle: GROUP_TITLE });
  } else if (!tab.url.includes('i.seu.edu.cn')) {
    await daemon.navigate(PORTAL_URL);
  }

  return waitForPortal(daemon);
}

export async function ensureEhall(daemon) {
  const tab = await daemon.findTab(EHALL_HOST);
  if (!tab) {
    const portal = await daemon.findTab('https://i.seu.edu.cn');
    if (portal) await daemon.navigate(`${EHALL_HOST}/new/index.html`);
    else await daemon.navigate(`${EHALL_HOST}/new/index.html`, { newTab: true, groupTitle: GROUP_TITLE });
  } else if (!tab.url.includes('/new/index.html')) {
    await daemon.navigate(`${EHALL_HOST}/new/index.html`);
  }

  let state = await waitForHost(daemon, 'ehall.seu.edu.cn');
  if (await ehallLoggedIn(daemon)) return state;

  const deadline = Date.now() + 25_000;
  let lastClick = 0;

  while (Date.now() < deadline) {
    state = await safeReadState(daemon);
    if (state?.url.includes('ehall.seu.edu.cn')) {
      if (await ehallLoggedIn(daemon)) return state;
      if (Date.now() - lastClick > 3000) {
        const clicked = await daemon.evaluate(
          '(() => { const button = document.querySelector("#ampLoginBtn"); if (button) button.click(); return Boolean(button); })()'
        );
        if (clicked) lastClick = Date.now();
      }
    }
    await sleep(1500);
  }

  throw notLoggedIn('The eHall session could not be established from the current browser login.');
}

async function ehallLoggedIn(daemon) {
  try {
    const raw = await daemon.evaluate(`(async () => {
      const response = await fetch('/jsonp/getUserCategoryAppList.json?_=' + Date.now());
      const text = await response.text();
      if (/"hasLogin":\\s*false/.test(text)) return '0';
      try {
        const json = JSON.parse(text);
        return json && ('hasLogin' in json || 'result' in json) ? '1' : '0';
      } catch {
        return '0';
      }
    })()`);
    return raw === '1';
  } catch {
    return false;
  }
}

export async function readState(daemon) {
  const raw = await daemon.evaluate(
    'JSON.stringify({url:location.href,title:document.title,ready:document.readyState})'
  );
  return JSON.parse(raw);
}

async function waitForApp(daemon, app) {
  const deadline = Date.now() + 30_000;
  let last = null;

  while (Date.now() < deadline) {
    const state = await safeReadState(daemon);
    if (state) {
      if (AUTH_PATTERN.test(state.url)) throw notLoggedIn();
      if (state.title === '403') {
        throw new CliError('APP_LAUNCH_FAILED', `SEU returned 403 while opening ${app.title}.`, {
          hint: 'Confirm your browser can open the same app manually, then run `seu-cli login-status`.'
        });
      }
      if (state.url.includes(app.path) && state.ready !== 'loading') return state;
      last = state;
    }
    await sleep(500);
  }

  throw new CliError('APP_LAUNCH_FAILED', `Timed out opening ${app.title}.`, {
    hint: 'Run `seu-cli login-status`; if that works, retry once.',
    details: last ? { url: last.url, title: last.title } : undefined
  });
}

async function waitForHost(daemon, host, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;

  while (Date.now() < deadline) {
    const state = await safeReadState(daemon);
    if (state) {
      if (AUTH_PATTERN.test(state.url)) throw notLoggedIn();
      if (state.url.includes(host) && state.ready !== 'loading') return state;
      last = state;
    }
    await sleep(500);
  }

  throw new CliError('APP_LAUNCH_FAILED', `Timed out opening ${host}.`, {
    details: last ? { url: last.url, title: last.title } : undefined
  });
}

async function waitForPortal(daemon) {
  const deadline = Date.now() + 20_000;
  let last = null;

  while (Date.now() < deadline) {
    const state = await safeReadState(daemon);
    if (state) {
      if (AUTH_PATTERN.test(state.url)) throw notLoggedIn();
      if (state.url.includes('i.seu.edu.cn') && state.ready !== 'loading') return state;
      last = state;
    }
    await sleep(500);
  }

  throw new CliError('APP_LAUNCH_FAILED', 'Timed out opening the SEU portal.', {
    details: last ? { url: last.url, title: last.title } : undefined
  });
}

async function safeReadState(daemon) {
  try {
    return await readState(daemon);
  } catch {
    return null;
  }
}
