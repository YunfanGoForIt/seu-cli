export async function examList({ backend }, options = {}) {
  const payload = await backend.examRows(options.term);

  return {
    term: payload.term,
    currentTerm: payload.currentTerm,
    count: payload.rows.length,
    exams: payload.rows.map(normalizeRow),
    ...(payload.rows.length === 0
      ? { note: '该学期暂无已发布的考试安排；可用 --term 查询其他学期。' }
      : {}),
    sourceUrl: payload.sourceUrl
  };
}

export async function examUpcoming({ backend }, options = {}) {
  const payload = await backend.examRows(options.term);
  const today = formatDate(new Date());
  const limit = options.limit ?? 10;
  const upcoming = payload.rows
    .map(normalizeRow)
    .filter((exam) => exam.date && exam.date >= today)
    .map((exam) => ({ ...exam, daysUntil: daysBetween(today, exam.date) }))
    .filter((exam) => options.days === undefined || exam.daysUntil <= options.days)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);

  return {
    term: payload.term,
    currentTerm: payload.currentTerm,
    today,
    count: upcoming.length,
    next: upcoming[0] ?? null,
    exams: upcoming,
    ...(upcoming.length === 0
      ? { note: '当前学期没有未来考试；可用 --term 查询其他学期。' }
      : {}),
    sourceUrl: payload.sourceUrl
  };
}

function normalizeRow(row) {
  return {
    term: row.XNXQDM ?? null,
    courseName: row.KCM ?? null,
    courseCode: row.KCH ?? null,
    examName: row.KSMC ?? null,
    time: row.KSSJMS ?? null,
    date: row.KSRQ ? String(row.KSRQ).slice(0, 10) : null,
    location: row.JASMC ?? null,
    seat: row.ZWH ?? null,
    teacher: row.ZJJSXM ?? null,
    credit: toNumber(row.XF),
    published: row.SFFBSJ === '1'
  };
}

function formatDate(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function daysBetween(fromText, toText) {
  const [fromYear, fromMonth, fromDay] = fromText.split('-').map(Number);
  const [toYear, toMonth, toDay] = toText.split('-').map(Number);
  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / 86400000
  );
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
