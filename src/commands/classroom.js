import { invalidArgument, requireFetchBackend } from '../errors.js';
import { sectionRange } from '../section-times.js';

export async function classroomEmpty({ backend }, options = {}) {
  requireFetchBackend(backend);

  const tree = await backend.classroomTree();
  const campuses = (tree ?? []).map((item) => ({
    code: String(item.value),
    name: item.label,
    buildings: (item.children ?? []).map((child) => ({
      code: String(child.value),
      name: child.label
    }))
  }));

  let campus = null;
  let building = null;

  if (options.building) {
    for (const item of campuses) {
      const found = item.buildings.find((entry) => matches(entry, options.building));
      if (found) {
        campus = item;
        building = found;
        break;
      }
    }
    if (!building) {
      throw invalidArgument(`Unknown building "${options.building}".`, {
        buildings: campuses.flatMap((item) => item.buildings.map((entry) => entry.name)).slice(0, 30)
      });
    }
  }

  if (options.campus) {
    const found = campuses.find((item) => matches(item, options.campus));
    if (!found) {
      throw invalidArgument(`Unknown campus "${options.campus}".`, {
        campuses: campuses.map((item) => item.name)
      });
    }
    campus = found;
  }

  if (!campus) {
    throw invalidArgument('Specify --campus (and optionally --building).', {
      campuses: campuses.map((item) => item.name)
    });
  }

  const date = options.date ?? formatDate(new Date());
  const { startTime, endTime, sections } = resolveTime(options);

  const rows = await backend.classroomList({
    campusCode: campus.code,
    teachingBuildingCode: building?.code ?? '',
    bookingDateList: [date],
    startTime,
    endTime,
    floor: '',
    classroomName: '',
    orderList: []
  });

  const classrooms = (rows ?? [])
    .map((row) => ({
      classroom: row.classroomName ?? null,
      building: row.teachingBuildingName ?? null,
      campus: row.campusName ?? null,
      floor: row.floor ?? null,
      capacity: toNumber(row.classSeatingCapacity),
      type: row.classroomTypeCodeName ?? null,
      selfStudy: row.allowSelfStudy === '1',
      bookable: row.allowClassBooking === '1'
    }))
    .filter((row) => !options.selfStudy || row.selfStudy)
    .sort((a, b) => String(a.building).localeCompare(String(b.building), 'zh-CN')
      || String(a.classroom).localeCompare(String(b.classroom), 'zh-CN'));

  return {
    campus: { code: campus.code, name: campus.name },
    ...(building ? { building: { code: building.code, name: building.name } } : {}),
    date,
    time: { start: startTime, end: endTime, sections },
    count: classrooms.length,
    classrooms
  };
}

function resolveTime(options) {
  if (options.start && options.end) {
    return { startTime: options.start, endTime: options.end, sections: null };
  }

  const text = options.sections ?? '1-2';
  const match = String(text).match(/^(\d{1,2})(?:-(\d{1,2}))?$/);
  if (!match) {
    throw invalidArgument('--sections must look like 1-2 or 3.');
  }
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  const range = sectionRange(start, end);
  if (!range) {
    throw invalidArgument(`No section time for ${text}. Use --start and --end instead.`);
  }
  return {
    startTime: options.start ?? range.start,
    endTime: options.end ?? range.end,
    sections: start === end ? String(start) : `${start}-${end}`
  };
}

function matches(item, input) {
  const value = String(input).trim();
  const name = String(item.name);
  return item.code === value
    || name === value
    || name.includes(value)
    || name.replace('校区', '').includes(value);
}

function formatDate(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
