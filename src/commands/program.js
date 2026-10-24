import { requireFetchBackend } from '../errors.js';

export async function programShow({ backend }) {
  requireFetchBackend(backend);

  const row = await backend.programShow();
  const required = toNumber(row.ZSYQXF);
  const completed = toNumber(row.YWCXF);
  const degreeRequired = toNumber(row.ZSYQXFXSZ);

  return {
    plan: {
      name: row.PYFAMC ?? null,
      major: row.ZYDM_DISPLAY ?? null,
      grade: row.XZNJ_DISPLAY ?? null,
      department: row.YXDM_DISPLAY ?? null,
      track: row.XDLXDM_DISPLAY ?? null
    },
    credits: {
      required,
      completed,
      degreeRequired,
      remaining: required !== null && completed !== null ? round(required - completed) : null,
      percent: required ? round((completed / required) * 100) : null
    }
  };
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
