export const SECTION_TIMES = {
  1: ['08:00', '08:45'],
  2: ['08:50', '09:35'],
  3: ['09:50', '10:35'],
  4: ['10:40', '11:25'],
  5: ['11:30', '12:15'],
  6: ['14:00', '14:45'],
  7: ['14:50', '15:35'],
  8: ['15:50', '16:35'],
  9: ['16:40', '17:25'],
  10: ['17:30', '18:15'],
  11: ['18:30', '19:15'],
  12: ['19:20', '20:05'],
  13: ['20:10', '20:55']
};

export function sectionRange(start, end) {
  const from = SECTION_TIMES[start];
  const to = SECTION_TIMES[end];
  if (!from || !to) return null;
  return { start: from[0], end: to[1] };
}
