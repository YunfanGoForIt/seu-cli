import { CliError, notLoggedIn, pageChanged } from '../errors.js';

const EHALL = 'https://ehall.seu.edu.cn';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';
const TIMEOUT_MS = 25_000;

export class FetchBackend {
  constructor(cookie, portalCookie = null, hostCookies = {}) {
    this.kind = 'fetch';
    this.cookie = cookie;
    this.portalCookie = portalCookie;
    this.hostCookies = hostCookies;
  }

  async loginStatus() {
    if (this.cookie) {
      const json = await this.post('/jwapp/sys/wdkb/modules/xskcb/cxxsjbxx.do', '');
      const row = rowsOf(json, 'cxxsjbxx')[0];
      if (!row) {
        throw notLoggedIn('The saved app cookie is missing or expired.');
      }
      return {
        logged_in: true,
        user: {
          name: row.XM ?? null,
          account: row.XH ?? null,
          department: row.YXDM_DISPLAY ?? row.YXMC ?? null,
          class: row.BJMC ?? null,
          grade: row.XZNJMC ?? null
        },
        backend: 'fetch',
        checkedUrl: `${EHALL}/jwapp/sys/wdkb/`
      };
    }

    if (this.portalCookie) {
      const info = await this.portalGet('/jsonp/userDesktopInfo.json?_=' + Date.now());
      if (!info?.userName) {
        throw notLoggedIn('The saved portal cookie is missing or expired.');
      }
      return {
        logged_in: true,
        user: { name: info.userName, account: info.userId ?? null },
        backend: 'fetch',
        note: 'Only a portal cookie is saved; course/grade/exam need an app cookie from a .do request.',
        checkedUrl: `${EHALL}/new/index.html`
      };
    }

    throw notLoggedIn('No eHall cookie is saved.');
  }

  async courseWeek({ week: weekOption = null, targetDate = null } = {}) {
    const term = await this.currentTerm();
    const clock = await this.currentWeek(term);
    const today = new Date();
    const target = targetDate ? parseDate(targetDate) : today;
    const delta = Math.round((mondayOf(target) - mondayOf(today)) / 604800000);
    const week = weekOption ?? (Number(clock.ZC) + delta);
    const weekday = isoWeekday(target);

    if (week < 1 || week > 30) {
      return {
        term: { code: term.DM, label: term.MC },
        currentWeek: Number(clock.ZC),
        week,
        weekday,
        date: formatDate(target),
        rows: [],
        outOfRange: true,
        sourceUrl: `${EHALL}/jwapp/sys/wdkb/`
      };
    }

    const json = await this.post(
      '/jwapp/sys/wdkb/modules/xskcb/xskcb.do',
      `*order=%2BKSJC&XNXQDM=${encodeURIComponent(term.DM)}&SKZC=${week}`
    );
    return {
      term: { code: term.DM, label: term.MC },
      currentWeek: Number(clock.ZC),
      week,
      weekday,
      date: formatDate(target),
      rows: rowsOf(json, 'xskcb'),
      sourceUrl: `${EHALL}/jwapp/sys/wdkb/`
    };
  }

  async courseRange({ fromWeek, toWeek }) {
    const term = await this.currentTerm();
    const clock = await this.currentWeek(term);
    const week1 = mondayOf(new Date());
    week1.setDate(week1.getDate() - (Number(clock.ZC) - 1) * 7);

    const queue = [];
    for (let week = fromWeek; week <= toWeek; week += 1) queue.push(week);
    const weeks = [];

    const worker = async () => {
      while (queue.length) {
        const week = queue.shift();
        const json = await this.post(
          '/jwapp/sys/wdkb/modules/xskcb/xskcb.do',
          `*order=%2BKSJC&XNXQDM=${encodeURIComponent(term.DM)}&SKZC=${week}`
        );
        weeks.push({ week, rows: rowsOf(json, 'xskcb') });
      }
    };

    await Promise.all([worker(), worker(), worker(), worker()]);
    weeks.sort((a, b) => a.week - b.week);

    return {
      term: { code: term.DM, label: term.MC },
      currentWeek: Number(clock.ZC),
      week1Monday: formatDate(week1),
      weeks,
      sourceUrl: `${EHALL}/jwapp/sys/wdkb/`
    };
  }

  async gradeRows(term) {
    const filters = [
      {
        name: 'SFYX',
        caption: '是否有效',
        linkOpt: 'AND',
        builderList: 'cbl_m_List',
        builder: 'm_value_equal',
        value: '1',
        value_display: '是'
      }
    ];
    if (term) {
      filters.unshift({
        name: 'XNXQDM',
        value: term,
        linkOpt: 'and',
        builder: 'm_value_equal'
      });
    }

    const body = 'querySetting=' + encodeURIComponent(JSON.stringify(filters))
      + '&*order=-XNXQDM%2C-KCH%2C-KXH&pageSize=500&pageNumber=1';
    const json = await this.post('/jwapp/sys/cjcx/modules/cjcx/xscjcx.do', body);
    return {
      rows: rowsOf(json, 'xscjcx'),
      total: json?.datas?.xscjcx?.totalSize ?? null,
      sourceUrl: `${EHALL}/jwapp/sys/cjcx/`
    };
  }

  async examRows(termOption) {
    const currentResponse = await this.post('/jwapp/sys/studentWdksapApp/modules/wdksap/dqxnxq.do', '');
    const current = rowsOf(currentResponse, 'dqxnxq')[0] ?? null;
    const term = termOption ?? current?.DM ?? null;
    if (!term) {
      throw pageChanged('Exam API did not return a current term.');
    }

    const json = await this.post(
      '/jwapp/sys/studentWdksapApp/modules/wdksap/wdksap.do',
      `XNXQDM=${encodeURIComponent(term)}&*order=-KSRQ%2C-KSSJMS`
    );
    return {
      term,
      currentTerm: current ? { code: current.DM, label: current.MC } : null,
      rows: rowsOf(json, 'wdksap'),
      sourceUrl: `${EHALL}/jwapp/sys/studentWdksapApp/`
    };
  }

  async apps() {
    if (!this.portalCookie) {
      throw new CliError('PORTAL_COOKIE_REQUIRED', 'Saving an app cookie is not enough for the app catalog.', {
        hint: 'Run `seu-cli auth import --portal-cookie-file portal.txt` with a cookie copied from an ehall.seu.edu.cn/new page request.'
      });
    }
    const json = await this.portalGet('/jsonp/getUserCategoryAppList.json?_=' + Date.now());
    return {
      apps: collectApps(json),
      sourceUrl: `${EHALL}/new/index.html`
    };
  }

  async programShow() {
    const json = await this.post('/jwapp/sys/xsfacx/modules/pyfacxepg/grpyfacx.do', '');
    const row = rowsOf(json, 'grpyfacx')[0];
    if (!row) throw pageChanged('Training program API returned no rows.');
    return row;
  }

  async warnings() {
    const json = await this.post('/jwapp/sys/xyyj/modules/xsxyyjjg/cxxsyjpcjg.do', '');
    return rowsOf(json, 'cxxsyjpcjg');
  }

  async timetableClasses({ term, page = 1, pageSize = 50 } = {}) {
    let selected = term;
    if (!selected) {
      const termJson = await this.post('/jwapp/sys/kcbcx/modules/bjkcb/dqxnxq.do', '');
      selected = rowsOf(termJson, 'dqxnxq')[0]?.DM ?? null;
    }
    if (!selected) throw pageChanged('Timetable API did not return a current term.');

    const json = await this.post(
      '/jwapp/sys/kcbcx/modules/bjkcb/bjcx.do',
      `XNXQDM=${encodeURIComponent(selected)}&SFSY=1&*order=-NJ%2C%2BYXPX%2C%2BZYPX%2C%2BPX&SFYPK=1&pageSize=${pageSize}&pageNumber=${page}`
    );
    return {
      term: selected,
      total: json?.datas?.bjcx?.totalSize ?? null,
      rows: rowsOf(json, 'bjcx')
    };
  }

  async classroomTree() {
    return this.itsPost('/its/crb/back/api/building/booking/tree', {});
  }

  async classroomList(payload) {
    return this.itsPost('/its/crb/back/api/booking/classroom/list', payload);
  }

  async itsPost(path, body) {
    const cookie = this.hostCookies?.['its.seu.edu.cn'];
    if (!cookie) {
      throw new CliError('SYNC_UNAVAILABLE', 'No session for its.seu.edu.cn was found.', {
        hint: 'Open 教室查借 in Chrome once, then run `seu-cli auth refresh`.'
      });
    }

    let response;
    try {
      response = await fetch(`https://its.seu.edu.cn${path}`, {
        method: 'POST',
        headers: {
          'Cookie': cookie,
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'X-Requested-With': 'XMLHttpRequest',
          'Origin': 'https://its.seu.edu.cn',
          'Referer': 'https://its.seu.edu.cn/its/crb/front/',
          'User-Agent': USER_AGENT
        },
        body: JSON.stringify(body ?? {}),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch (cause) {
      throw new CliError('NETWORK_ERROR', `Request to its.seu.edu.cn failed: ${cause?.message ?? cause}`, { cause });
    }

    if (response.status === 401) throw notLoggedIn('its.seu.edu.cn rejected the saved cookie.');
    if (response.status === 403) {
      throw new CliError('PERMISSION_DENIED', `its.seu.edu.cn returned HTTP 403 for ${path}.`);
    }
    if (response.status === 429) {
      throw new CliError('RATE_LIMITED', 'its.seu.edu.cn rate-limited this client.');
    }

    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw pageChanged(`its.seu.edu.cn returned non-JSON content for ${path}.`);
    }
    if (json?.success === false || (json?.code !== undefined && Number(json.code) !== 200)) {
      throw pageChanged(`its.seu.edu.cn returned: ${json?.info ?? 'unknown error'}.`);
    }
    return json?.data;
  }


  async librarySearch(keyword, { page = 1, pageSize = 20 } = {}) {
    const body = {
      searchWords: [{ fieldList: [{ fieldCode: '', fieldValue: keyword }] }],
      filters: [],
      limiter: [],
      sortField: 'relevance',
      sortType: 'desc',
      pageSize,
      pageCount: page,
      locale: 'zh_CN',
      first: page === 1
    };
    const text = await this.libFetch('/opac/ajax_search_adv.php', {
      method: 'POST',
      body: JSON.stringify(body),
      contentType: 'application/json'
    });
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw pageChanged('Library search API did not return JSON.');
    }
    return {
      total: json.total ?? 0,
      page,
      pageSize,
      items: (json.content ?? []).map((item) => ({
        title: item.title ?? null,
        author: item.author ?? null,
        publisher: item.publisher ?? null,
        year: item.pubYear ?? null,
        isbn: item.isbn ?? null,
        callNo: item.callNo ?? null,
        marcNo: item.marcRecNo ?? null,
        docType: item.docTypeName ?? null
      }))
    };
  }

  async libraryItem(marcNo) {
    const html = await this.libFetch(`/opac/item.php?marc_no=${encodeURIComponent(marcNo)}`);
    const fields = parseBiblio(html);
    const titleField = fields['题名/责任者:'] ?? fields['题名/责任者'] ?? '';
    const title = titleField.split(' /')[0].trim()
      || cleanText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '');
    return {
      marcNo,
      title: title || null,
      url: `https://libopac.seu.edu.cn/opac/item.php?marc_no=${marcNo}`,
      fields,
      holdings: parseHoldings(html)
    };
  }

  async libraryLoans() {
    const html = await this.libFetch('/reader/book_lst.php');
    if (isLoginPage(html)) throw notLoggedIn('The library OPAC session is not logged in.');
    const rows = parseRows(html);
    const header = rows.find((row) => row.includes('条码号') && row.includes('应还日期'));
    if (!header) return { count: 0, overdue: 0, loans: [] };
    const today = todayText();
    const loans = rows
      .slice(rows.indexOf(header) + 1)
      .filter((row) => row.length >= header.length && row[0])
      .map((row) => {
        const item = Object.fromEntries(header.map((key, index) => [key, row[index] ?? '']));
        const dueDate = item['应还日期'] ?? null;
        return {
          barcode: item['条码号'] ?? null,
          title: item['题名/责任者'] ?? null,
          borrowDate: item['借阅日期'] ?? null,
          dueDate,
          renewCount: toNumber(item['续借量']),
          location: item['馆藏地'] ?? null,
          overdue: Boolean(dueDate && dueDate < today)
        };
      });
    return {
      count: loans.length,
      overdue: loans.filter((loan) => loan.overdue).length,
      loans
    };
  }

  async libraryHistory(page = 1) {
    const html = await this.libFetch(`/reader/book_hist.php?page=${page}`);
    if (isLoginPage(html)) throw notLoggedIn('The library OPAC session is not logged in.');
    const rows = parseRows(html);
    const header = rows.find((row) => row.includes('条码号') && row.includes('归还日期'));
    if (!header) return { page, count: 0, history: [] };
    const history = rows
      .slice(rows.indexOf(header) + 1)
      .filter((row) => row.length >= header.length && row[0])
      .map((row) => {
        const item = Object.fromEntries(header.map((key, index) => [key, row[index] ?? '']));
        return {
          barcode: item['条码号'] ?? null,
          title: item['题名'] ?? null,
          author: item['责任者'] ?? null,
          borrowDate: item['借阅日期'] ?? null,
          returnDate: item['归还日期'] ?? null,
          location: item['馆藏地'] ?? null
        };
      });
    return { page, count: history.length, history };
  }

  async libFetch(path, { method = 'GET', body, contentType } = {}) {
    const cookie = this.hostCookies?.['libopac.seu.edu.cn'];
    const headers = {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/json,application/xhtml+xml,*/*'
    };
    if (cookie) headers.Cookie = cookie;
    if (contentType) headers['Content-Type'] = contentType;

    let response;
    try {
      response = await fetch(`https://libopac.seu.edu.cn${path}`, {
        method,
        headers,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch (cause) {
      throw new CliError('NETWORK_ERROR', `Request to libopac.seu.edu.cn failed: ${cause?.message ?? cause}`, { cause });
    }
    if (response.status === 401) throw notLoggedIn('libopac.seu.edu.cn rejected the saved cookie.');
    if (response.status === 403) {
      throw new CliError('PERMISSION_DENIED', `libopac.seu.edu.cn returned HTTP 403 for ${path}.`);
    }
    return response.text();
  }

  async currentTerm() {
    const json = await this.post('/jwapp/sys/wdkb/modules/jshkcb/dqxnxq.do', '');
    const term = rowsOf(json, 'dqxnxq')[0];
    if (!term) {
      throw pageChanged('Course API did not return a current term.');
    }
    return term;
  }

  async currentWeek(term) {
    const json = await this.post(
      '/jwapp/sys/wdkb/modules/jshkcb/dqzc.do',
      `XN=${encodeURIComponent(term.XNDM)}&XQ=${encodeURIComponent(term.XQDM)}&RQ=${formatDate(new Date())}`
    );
    return rowsOf(json, 'dqzc')[0] ?? {};
  }

  async post(path, body) {
    return this.request(path, { method: 'POST', body });
  }

  async portalGet(path) {
    return this.request(path, {
      method: 'GET',
      cookie: this.portalCookie,
      referer: `${EHALL}/new/index.html`
    });
  }

  async request(path, { method, body, cookie = this.cookie, referer = `${EHALL}/new/index.html` } = {}) {
    const headers = {
      'Accept': 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': referer,
      'Origin': EHALL,
      'User-Agent': USER_AGENT
    };
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    }

    let response;
    try {
      response = await fetch(`${EHALL}${path}`, {
        method,
        headers,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch (cause) {
      throw new CliError('NETWORK_ERROR', `Request to ehall.seu.edu.cn failed: ${cause?.message ?? cause}`, {
        hint: 'Check campus network or VPN access, then retry.',
        cause
      });
    }

    if (response.status >= 300 && response.status < 400) {
      throw notLoggedIn('eHall redirected to the login page.');
    }
    if (response.status === 401) {
      throw notLoggedIn('eHall rejected the saved cookie (HTTP 401).');
    }
    if (response.status === 403) {
      throw new CliError('PERMISSION_DENIED', `eHall returned HTTP 403 for ${path}.`, {
        hint: 'Confirm this account can open the same page in the browser.'
      });
    }
    if (response.status === 429) {
      throw new CliError('RATE_LIMITED', 'eHall rate-limited this client (HTTP 429).', {
        hint: 'Wait several minutes before retrying. Do not loop.'
      });
    }
    if (response.status >= 500) {
      throw new CliError('UPSTREAM_ERROR', `eHall returned HTTP ${response.status} for ${path}.`, {
        hint: 'The school system may be busy or under maintenance. Retry later, once.'
      });
    }

    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      if (/authserver|统一身份认证|请登录|登录超时/.test(text)) {
        throw notLoggedIn('eHall returned a login page instead of JSON.');
      }
      throw pageChanged(`eHall returned non-JSON content for ${path} (HTTP ${response.status}).`);
    }

    if (json && typeof json === 'object') {
      if (json.hasLogin === false) {
        throw notLoggedIn('eHall session is not established.');
      }
      if ('code' in json && String(json.code) !== '0') {
        const message = String(json.msg ?? json.message ?? '');
        if (String(json.code) === '401' || /登录|超时|重新登录/.test(message)) {
          throw notLoggedIn(`eHall reported: ${message || `code ${json.code}`}`);
        }
        throw pageChanged(`eHall returned code ${json.code} for ${path}: ${message || 'no message'}.`);
      }
    }

    return json;
  }
}


function parseBiblio(html) {
  const fields = {};
  for (const match of html.matchAll(/<dl class="booklist">([\s\S]*?)<\/dl>/gi)) {
    const dt = match[1].match(/<dt>([\s\S]*?)<\/dt>/i);
    const dd = match[1].match(/<dd>([\s\S]*?)<\/dd>/i);
    if (dt && dd) {
      const key = cleanText(dt[1]);
      if (key) fields[key] = cleanText(dd[1]);
    }
  }
  return fields;
}

function parseHoldings(html) {
  const table = html.match(/<table[^>]*id="item"[^>]*>([\s\S]*?)<\/table>/i);
  if (!table) return [];
  const rows = parseRows(table[1]);
  const header = rows.find((row) => row.includes('索书号') && row.includes('馆藏地'));
  if (!header) return [];
  return rows
    .slice(rows.indexOf(header) + 1)
    .filter((row) => row.length >= header.length && row[0])
    .map((row) => {
      const item = Object.fromEntries(header.map((key, index) => [key, row[index] ?? '']));
      return {
        callNo: item['索书号'] ?? null,
        barcode: item['条码号'] ?? null,
        volume: item['年卷期'] ?? null,
        location: item['馆藏地'] ?? null,
        status: item['书刊状态'] ?? null
      };
    });
}

function parseRows(html) {
  const rows = [];
  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => cleanText(cell[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function cleanText(html) {
  return decodeEntities(String(html).replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'");
}

function isLoginPage(html) {
  return /redr_login|读者登录|用户登录/.test(html) && !/当前借阅|借阅历史/.test(html);
}

function todayText() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function rowsOf(json, key) {
  return json?.datas?.[key]?.rows ?? [];
}

function collectApps(json) {
  const apps = [];
  const seen = new Set();

  const walk = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value.appName && (value.appId || value.serviceWid)) {
      const key = String(value.appId ?? value.serviceWid);
      if (!seen.has(key)) {
        seen.add(key);
        apps.push({
          name: value.appName,
          appId: value.appId ? String(value.appId) : null,
          serviceWid: value.serviceWid ? String(value.serviceWid) : null,
          description: value.description ?? null,
          opening: value.opening ?? null,
          favorite: value.favorite ?? null,
          categories: Array.isArray(value.categoryList)
            ? value.categoryList.map((item) => item.categoryName).filter(Boolean)
            : []
        });
      }
    }
    Object.values(value).forEach(walk);
  };

  walk(json);
  return apps;
}


function parseDate(text) {
  const [year, month, day] = text.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function isoWeekday(date) {
  return date.getDay() === 0 ? 7 : date.getDay();
}

function mondayOf(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() - (isoWeekday(copy) - 1));
  return copy;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
