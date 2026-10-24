import { requireFetchBackend } from '../errors.js';

export async function timetableClasses({ backend }, options = {}) {
  requireFetchBackend(backend);

  const limit = options.limit ?? 50;
  const payload = await backend.timetableClasses({
    term: options.term,
    page: options.page ?? 1,
    pageSize: limit
  });

  let rows = payload.rows.map((row) => ({
    classCode: row.BJDM ?? null,
    className: row.BJMC ?? null,
    grade: row.NJ_DISPLAY ?? null,
    major: row.ZYDM_DISPLAY ?? null,
    department: row.YXDM_DISPLAY ?? null,
    students: toNumber(row.SJRS),
    capacity: toNumber(row.CSRS)
  }));

  if (options.search) {
    const keyword = String(options.search).toLowerCase();
    rows = rows.filter((row) => [row.classCode, row.className, row.major, row.department]
      .some((value) => String(value ?? '').toLowerCase().includes(keyword)));
  }

  return {
    term: payload.term,
    total: payload.total,
    count: rows.length,
    classes: rows.slice(0, limit)
  };
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
