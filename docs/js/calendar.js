// カレンダー連携(リアルタイムAPI連携なし。Googleカレンダーの追加リンク or .ics)
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

// events: [{ date: 'YYYY-MM-DD', title, details }]  すべて終日の予定
export function buildIcs(events) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const body = events.flatMap((e) => [
    'BEGIN:VEVENT', `UID:${crypto.randomUUID()}@adocs-goal-app`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${nextDay(e.date)}`,
    `SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(e.details)}`, 'END:VEVENT',
  ]);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ADOC-S Goal App//JP', ...body, 'END:VCALENDAR'].join('\r\n');
}

export function downloadIcs(events) {
  const blob = new Blob([buildIcs(events)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ADOC-S_日程_${events.map((e) => e.date).join('_')}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
