// ステップ8: カレンダー連携(リアルタイムAPI連携なし。Googleカレンダーの追加リンク or .ics)
const ymd = (s) => s.replaceAll('-', '');
const nextDay = (s) => {
  const d = new Date(`${s}T00:00:00`);
  d.setDate(d.getDate() + 1);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
};

export function googleCalendarUrl(date, title, details) {
  const q = new URLSearchParams({ action: 'TEMPLATE', text: title, details, dates: `${ymd(date)}/${nextDay(date)}` });
  return `https://calendar.google.com/calendar/render?${q}`;
}

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

export function buildIcs(date, title, details) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ADOC-S Goal App//JP', 'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@adocs-goal-app`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(date)}`, `DTEND;VALUE=DATE:${nextDay(date)}`,
    `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(details)}`, 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadIcs(date, title, details) {
  const blob = new Blob([buildIcs(date, title, details)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `振り返り日_${date}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
