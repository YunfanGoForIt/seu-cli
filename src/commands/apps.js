import { pageChanged } from '../errors.js';

export async function appsList({ backend }, options = {}) {
  const payload = await backend.apps();
  if (!Array.isArray(payload.apps)) {
    throw pageChanged('eHall app list did not return an array.');
  }

  const apps = payload.apps.filter((app) => !app.categories.includes('平台基础') && app.name !== '平台测试');
  const keyword = options.search ? String(options.search).trim().toLowerCase() : null;
  const filtered = keyword
    ? apps.filter((app) => String(app.name).toLowerCase().includes(keyword)
      || String(app.description ?? '').toLowerCase().includes(keyword))
    : apps;
  const limit = options.limit ?? 200;

  filtered.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-CN'));

  return {
    total: filtered.length,
    count: Math.min(filtered.length, limit),
    apps: filtered.slice(0, limit),
    sourceUrl: payload.sourceUrl
  };
}
