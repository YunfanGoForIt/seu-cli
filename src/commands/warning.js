import { requireFetchBackend } from '../errors.js';

export async function warningList({ backend }) {
  requireFetchBackend(backend);

  const rows = await backend.warnings();
  const warnings = rows.map((row) => ({
    batch: row.SCPCMC ?? null,
    conclusion: row.SCJLMC ?? null,
    level: row.YJJB ?? null,
    code: row.SCJLDM ?? null,
    date: row.CZRQ ? String(row.CZRQ).slice(0, 10) : null
  }));

  return {
    count: warnings.length,
    warnings
  };
}
