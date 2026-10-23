import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { pageChanged } from '../errors.js';

export async function gradeList({ backend }, options = {}) {
  const { grades, sourceUrl } = await loadGrades(backend, options.term);
  const summary = summarize(grades);

  if (options.out) {
    const file = resolve(options.out);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `\uFEFF${toCsv(grades)}`, 'utf8');
    return {
      term: options.term ?? null,
      count: grades.length,
      summary,
      file,
      sourceUrl
    };
  }

  return {
    term: options.term ?? null,
    count: grades.length,
    summary,
    grades,
    sourceUrl
  };
}

export async function gradeSummary({ backend }, options = {}) {
  const { grades, sourceUrl } = await loadGrades(backend, options.term);
  const byTerm = new Map();

  for (const grade of grades) {
    const key = grade.term ?? 'unknown';
    if (!byTerm.has(key)) {
      byTerm.set(key, { term: grade.term, termLabel: grade.termLabel, grades: [] });
    }
    byTerm.get(key).grades.push(grade);
  }

  const terms = [...byTerm.values()]
    .map((item) => ({
      term: item.term,
      termLabel: item.termLabel,
      ...summarize(item.grades)
    }))
    .sort((a, b) => String(b.term).localeCompare(String(a.term)));

  return {
    term: options.term ?? null,
    count: grades.length,
    overall: summarize(grades),
    terms,
    sourceUrl
  };
}

async function loadGrades(backend, term) {
  const payload = await backend.gradeRows(term);
  if (!Array.isArray(payload.rows)) {
    throw pageChanged('Grade API did not return a row list.');
  }

  const grades = payload.rows.map(normalizeRow).sort((a, b) => {
    const termOrder = String(b.term).localeCompare(String(a.term));
    return termOrder || String(a.courseCode).localeCompare(String(b.courseCode), 'zh-CN');
  });

  return { grades, sourceUrl: payload.sourceUrl };
}

function normalizeRow(row) {
  return {
    term: row.XNXQDM ?? null,
    termLabel: row.XNXQDM_DISPLAY ?? null,
    courseName: row.KCM ?? null,
    courseCode: row.KCH ?? null,
    credit: toNumber(row.XF),
    score: row.ZCJ ?? null,
    grade: row.DJCJMC ?? null,
    nature: row.KCXZDM_DISPLAY ?? null,
    category: row.KCLBDM_DISPLAY ?? null,
    department: row.KKDWDM_DISPLAY ?? null,
    examType: row.CXCKDM_DISPLAY ?? null,
    passed: row.SFJG_DISPLAY ?? null,
    hours: toNumber(row.XS)
  };
}

function summarize(grades) {
  let credits = 0;
  let weighted = 0;
  let gradedCredits = 0;
  let passed = 0;
  let failed = 0;

  for (const entry of grades) {
    if (entry.credit) credits += entry.credit;
    const score = toNumber(entry.score);
    if (entry.credit && score !== null) {
      gradedCredits += entry.credit;
      weighted += entry.credit * score;
    }
    if (entry.passed === '是') passed += 1;
    else if (entry.passed === '否') failed += 1;
  }

  return {
    courses: grades.length,
    totalCredits: round(credits),
    gradedCredits: round(gradedCredits),
    weightedAverage: gradedCredits > 0 ? round(weighted / gradedCredits) : null,
    passed,
    failed
  };
}

const CSV_COLUMNS = [
  ['term', '学期代码'],
  ['termLabel', '学期'],
  ['courseCode', '课程号'],
  ['courseName', '课程名'],
  ['credit', '学分'],
  ['score', '成绩'],
  ['grade', '等级'],
  ['nature', '课程性质'],
  ['category', '课程类别'],
  ['department', '开课院系'],
  ['examType', '修读方式'],
  ['passed', '是否通过'],
  ['hours', '学时']
];

function toCsv(grades) {
  const header = CSV_COLUMNS.map(([, label]) => csvCell(label)).join(',');
  const rows = grades.map((grade) => CSV_COLUMNS
    .map(([key]) => csvCell(grade[key]))
    .join(','));
  return `${[header, ...rows].join('\r\n')}\r\n`;
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
