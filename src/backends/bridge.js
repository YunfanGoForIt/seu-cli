import { APPS } from '../apps.js';
import { ensureApp, ensureEhall, ensurePortal } from '../launch.js';
import { pageChanged } from '../errors.js';

export class BridgeBackend {
  constructor(daemon) {
    this.kind = 'bridge';
    this.daemon = daemon;
  }

  async loginStatus() {
    const state = await ensurePortal(this.daemon);
    const raw = await this.daemon.evaluate(`(async () => {
      const response = await fetch('/getLoginUser?_=' + Date.now(), {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });
      const text = await response.text();
      return JSON.stringify({ status: response.status, body: text });
    })()`);

    const payload = JSON.parse(raw);
    let parsed = null;
    try {
      parsed = JSON.parse(payload.body);
    } catch {
      parsed = null;
    }

    if (payload.status !== 200 || parsed?.errcode !== '0' || !parsed?.data) {
      const error = new Error('The browser is not logged in to Southeast University.');
      error.code = 'NOT_LOGGED_IN';
      error.hint = 'Open https://auth.seu.edu.cn in the browser and finish login, then retry.';
      throw error;
    }

    const user = parsed.data;
    return {
      logged_in: true,
      user: {
        name: user.userName ?? null,
        account: user.userAccount ?? null,
        category: user.categoryName ?? null,
        department: user.deptName ?? null
      },
      checkedUrl: state.url,
      backend: 'bridge'
    };
  }

  async courseWeek({ week = null, targetDate = null } = {}) {
    const state = await ensureApp(this.daemon, APPS.course);
    const script = `(async () => {
      const post = (path, body) => fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
        body
      }).then((response) => response.json());
      const pad = (value) => String(value).padStart(2, '0');
      const format = (date) => date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
      const iso = (date) => (date.getDay() === 0 ? 7 : date.getDay());
      const monday = (date) => {
        const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        copy.setDate(copy.getDate() - (iso(copy) - 1));
        return copy;
      };

      const termResponse = await post('/jwapp/sys/wdkb/modules/jshkcb/dqxnxq.do', '');
      const term = termResponse?.datas?.dqxnxq?.rows?.[0];
      if (!term) return JSON.stringify({ error: 'NO_TERM' });

      const today = new Date();
      const clockResponse = await post(
        '/jwapp/sys/wdkb/modules/jshkcb/dqzc.do',
        'XN=' + encodeURIComponent(term.XNDM) + '&XQ=' + encodeURIComponent(term.XQDM) + '&RQ=' + format(today)
      );
      const clock = clockResponse?.datas?.dqzc?.rows?.[0] || {};
      const target = ${targetDate ? `new Date(${JSON.stringify(targetDate)} + 'T00:00:00')` : 'today'};
      const delta = Math.round((monday(target) - monday(today)) / 604800000);
      const week = ${week === null ? 'null' : week} ?? (Number(clock.ZC) + delta);
      const weekday = iso(target);
      if (week < 1 || week > 30) {
        return JSON.stringify({
          term: { code: term.DM, label: term.MC },
          currentWeek: Number(clock.ZC),
          week,
          weekday,
          date: format(target),
          rows: [],
          outOfRange: true
        });
      }

      const tableResponse = await post(
        '/jwapp/sys/wdkb/modules/xskcb/xskcb.do',
        '*order=%2BKSJC&XNXQDM=' + encodeURIComponent(term.DM) + '&SKZC=' + week
      );
      return JSON.stringify({
        term: { code: term.DM, label: term.MC },
        currentWeek: Number(clock.ZC),
        week,
        weekday,
        date: format(target),
        rows: tableResponse?.datas?.xskcb?.rows || []
      });
    })()`;

    const payload = JSON.parse(await this.daemon.evaluate(script));
    if (payload.error) {
      throw pageChanged(`Course API did not return a current term (${payload.error}).`);
    }
    return { ...payload, sourceUrl: state.url };
  }

  async courseRange({ fromWeek, toWeek }) {
    const state = await ensureApp(this.daemon, APPS.course);
    const script = `(async () => {
      const post = (path, body) => fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
        body
      }).then((response) => response.json());
      const pad = (value) => String(value).padStart(2, '0');
      const format = (date) => date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
      const iso = (date) => (date.getDay() === 0 ? 7 : date.getDay());
      const monday = (date) => {
        const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        copy.setDate(copy.getDate() - (iso(copy) - 1));
        return copy;
      };

      const termResponse = await post('/jwapp/sys/wdkb/modules/jshkcb/dqxnxq.do', '');
      const term = termResponse?.datas?.dqxnxq?.rows?.[0];
      if (!term) return JSON.stringify({ error: 'NO_TERM' });

      const today = new Date();
      const clockResponse = await post(
        '/jwapp/sys/wdkb/modules/jshkcb/dqzc.do',
        'XN=' + encodeURIComponent(term.XNDM) + '&XQ=' + encodeURIComponent(term.XQDM) + '&RQ=' + format(today)
      );
      const clock = clockResponse?.datas?.dqzc?.rows?.[0] || {};
      const week1 = monday(today);
      week1.setDate(week1.getDate() - (Number(clock.ZC) - 1) * 7);

      const weeks = [];
      const queue = [];
      for (let week = ${fromWeek}; week <= ${toWeek}; week += 1) queue.push(week);
      const worker = async () => {
        while (queue.length) {
          const week = queue.shift();
          const response = await post(
            '/jwapp/sys/wdkb/modules/xskcb/xskcb.do',
            '*order=%2BKSJC&XNXQDM=' + encodeURIComponent(term.DM) + '&SKZC=' + week
          );
          weeks.push({ week, rows: response?.datas?.xskcb?.rows || [] });
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      weeks.sort((a, b) => a.week - b.week);

      return JSON.stringify({
        term: { code: term.DM, label: term.MC },
        currentWeek: Number(clock.ZC),
        week1Monday: format(week1),
        weeks
      });
    })()`;

    const payload = JSON.parse(await this.daemon.evaluate(script));
    if (payload.error) {
      throw pageChanged(`Course API did not return a current term (${payload.error}).`);
    }
    return { ...payload, sourceUrl: state.url };
  }

  async gradeRows(term) {
    const state = await ensureApp(this.daemon, APPS.grade);
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

    const script = `(async () => {
      const querySetting = ${JSON.stringify(filters)};
      const body = 'querySetting=' + encodeURIComponent(JSON.stringify(querySetting))
        + '&*order=-XNXQDM%2C-KCH%2C-KXH&pageSize=500&pageNumber=1';
      const response = await fetch('/jwapp/sys/cjcx/modules/cjcx/xscjcx.do', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
        body
      });
      const json = await response.json();
      return JSON.stringify({
        rows: json?.datas?.xscjcx?.rows || [],
        total: json?.datas?.xscjcx?.totalSize ?? null
      });
    })()`;

    const payload = JSON.parse(await this.daemon.evaluate(script));
    return { ...payload, sourceUrl: state.url };
  }

  async examRows(termOption) {
    const state = await ensureApp(this.daemon, APPS.exam);
    const script = `(async () => {
      const post = (path, body) => fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
        body
      }).then((response) => response.json());

      const termResponse = await post('/jwapp/sys/studentWdksapApp/modules/wdksap/dqxnxq.do', '');
      const current = termResponse?.datas?.dqxnxq?.rows?.[0] || null;
      const term = ${termOption ? JSON.stringify(termOption) : 'null'} ?? current?.DM ?? null;
      if (!term) return JSON.stringify({ error: 'NO_TERM' });

      const response = await post(
        '/jwapp/sys/studentWdksapApp/modules/wdksap/wdksap.do',
        'XNXQDM=' + encodeURIComponent(term) + '&*order=-KSRQ%2C-KSSJMS'
      );
      return JSON.stringify({
        term,
        currentTerm: current ? { code: current.DM, label: current.MC } : null,
        rows: response?.datas?.wdksap?.rows || []
      });
    })()`;

    const payload = JSON.parse(await this.daemon.evaluate(script));
    if (payload.error) {
      throw pageChanged('Exam API did not return a current term.');
    }
    return { ...payload, sourceUrl: state.url };
  }

  async apps() {
    const state = await ensureEhall(this.daemon);
    const script = `(async () => {
      const response = await fetch('/jsonp/getUserCategoryAppList.json?_=' + Date.now());
      const json = await response.json();
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
      return JSON.stringify(apps);
    })()`;

    const payload = JSON.parse(await this.daemon.evaluate(script));
    return { apps: payload, sourceUrl: state.url };
  }
}
