export async function termCurrent({ backend }) {
  const payload = await backend.courseWeek({});
  return {
    term: payload.term,
    currentWeek: payload.currentWeek,
    weekday: payload.weekday ?? null,
    date: payload.date ?? null,
    sourceUrl: payload.sourceUrl
  };
}
