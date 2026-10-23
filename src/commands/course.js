import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { invalidArgument } from '../errors.js';
import { buildIcs, eventTimes } from '../ics.js';
import { sectionRange } from '../section-times.js';

const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export async function courseToday({ backend }, options = {}) {
  const payload = await backend.courseWeek({ targetDate: options.date ?? null });
  const entries = normalizeRows(payload.rows, payload.term.code)
    .filter((entry) => entry.weekday === payload.weekday);

  return {
    term: payload.term,
    date: payload.date,
    week: payload.week,
    currentWeek: payload.currentWeek,
    weekday: payload.weekday,
    weekdayName: WEEKDAY_NAMES[payload.weekday - 1] ?? null,
    count: entries.length,
    courses: mergeSections(entries),
    ...(payload.outOfRange ? { note: '日期不在当前学期教学周范围内。' } : {}),
    sourceUrl: payload.sourceUrl
  };
}

export async function courseWeek({ backend }, options = {}) {
  const payload = await backend.courseWeek({ week: options.week ?? null });
  let entries = normalizeRows(payload.rows, payload.term.code);
  if (options.weekday) {
    entries = entries.filter((entry) => entry.weekday === options.weekday);
  }

  return {
    term: payload.term,
    week: payload.week,
    currentWeek: payload.currentWeek,
    ...(options.weekday
      ? { weekday: options.weekday, weekdayName: WEEKDAY_NAMES[options.weekday - 1] ?? null }
      : {}),
    count: entries.length,
    courses: mergeSections(entries),
    ...(payload.outOfRange ? { note: '该周不在当前学期教学周范围内。' } : {}),
    sourceUrl: payload.sourceUrl
  };
}

export async function courseExportIcs({ backend }, options = {}) {
  const current = await backend.courseWeek({});
  const fromWeek = options.week ?? options.fromWeek ?? current.currentWeek;
  const toWeek = options.week ?? options.toWeek ?? fromWeek;

  if (!Number.isInteger(fromWeek) || fromWeek < 1) {
    throw invalidArgument('--from-week must be a positive integer.');
  }
  if (!Number.isInteger(toWeek) || toWeek < fromWeek) {
    throw invalidArgument('--to-week must be >= --from-week.');
  }
  if (toWeek - fromWeek > 25) {
    throw invalidArgument('Week span must be <= 25 weeks.');
  }

  const range = await backend.courseRange({ fromWeek, toWeek });
  const events = [];

  for (const { week, rows } of range.weeks) {
    for (const entry of mergeSections(normalizeRows(rows, range.term.code))) {
      const times = sectionRange(entry.startSection, entry.endSection);
      if (!times) continue;
      const date = addDays(range.week1Monday, (week - 1) * 7 + (entry.weekday - 1));
      const { start, end } = eventTimes(date, times.start, times.end);
      events.push({
        uid: `${entry.classId ?? entry.courseCode}-${date}-${entry.startSection}@seu-cli`,
        start,
        end,
        summary: entry.courseName,
        location: entry.location,
        description: [entry.teacher, entry.weeks, entry.courseCode].filter(Boolean).join(' | ')
      });
    }
  }

  const ics = buildIcs({ calendarName: `SEU ${range.term.label}`, events });
  const outFile = options.out ? resolve(options.out) : null;
  if (outFile) {
    await mkdir(dirname(outFile), { recursive: true });
    await writeFile(outFile, ics, 'utf8');
  }

  return {
    term: range.term,
    fromWeek,
    toWeek,
    eventCount: events.length,
    ...(outFile ? { file: outFile } : { ics }),
    sourceUrl: range.sourceUrl
  };
}

function normalizeRows(rows, termCode) {
  return rows
    .map((row) => ({
      term: row.XNXQDM ?? termCode,
      courseName: row.KCM ?? null,
      courseCode: row.KCH ?? null,
      teacher: row.SKJS ?? null,
      location: row.JASMC ?? null,
      weekday: Number(row.SKXQ) || null,
      weekdayName: WEEKDAY_NAMES[Number(row.SKXQ) - 1] ?? null,
      startSection: Number(row.KSJC) || null,
      endSection: Number(row.JSJC) || null,
      weeks: row.ZCMC ?? null,
      classId: row.JXBID ?? null
    }))
    .sort((a, b) => a.weekday - b.weekday
      || a.startSection - b.startSection
      || String(a.courseName).localeCompare(String(b.courseName), 'zh-CN'));
}

function mergeSections(entries) {
  const output = [];
  for (const entry of entries) {
    const previous = output[output.length - 1];
    const sameCourse = previous
      && previous.weekday === entry.weekday
      && previous.courseName === entry.courseName
      && previous.teacher === entry.teacher
      && previous.location === entry.location
      && previous.classId === entry.classId
      && previous.endSection + 1 === entry.startSection;

    if (sameCourse) {
      previous.endSection = entry.endSection;
      previous.sections = `${previous.startSection}-${previous.endSection}`;
    } else {
      output.push({
        ...entry,
        sections: entry.startSection === entry.endSection
          ? String(entry.startSection)
          : `${entry.startSection}-${entry.endSection}`
      });
    }
  }
  return output;
}

function addDays(dateText, days) {
  const [year, month, day] = dateText.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
