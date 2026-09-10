const DAY_MAP = {
  воскресенье: 0,
  понедельник: 1,
  вторник: 2,
  среда: 3,
  четверг: 4,
  пятница: 5,
  суббота: 6
};

const TIME_TO_PAIR = new Map([
  ['08:00', 1], ['09:45', 2], ['11:30', 3], ['13:20', 4],
  ['15:05', 5], ['16:50', 6], ['18:40', 7], ['20:10', 8], ['20:25', 8]
]);

function cleanText(input) {
  let s = String(input || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

function normalize(s) {
  return cleanText(s).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

function attr(attrs, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']*)["']`, 'i');
  const m = String(attrs || '').match(re);
  return m ? m[1] : '';
}

function classHas(attrs, className) {
  const escaped = String(className).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, 'i').test(attr(attrs, 'class'));
}

function innerByClass(inner, className) {
  const escaped = String(className).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<([a-z0-9]+)\\b([^>]*\\bclass\\s*=\\s*["'][^"']*\\b${escaped}\\b[^"']*["'][^>]*)>([\\s\\S]*?)<\\/\\1>`, 'i');
  const m = String(inner || '').match(re);
  return m ? cleanText(m[3]) : '';
}

function parseCells(rowHtml) {
  const cells = [];
  const re = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(rowHtml))) {
    cells.push({ attrs: m[2], html: m[3], text: cleanText(m[3]), rowspan: Number(attr(m[2], 'rowspan') || 1) || 1 });
  }
  return cells;
}

function extractTables(html) {
  const out = [];
  const re = /<table\b([^>]*\bclass\s*=\s*["'][^"']*\bcontless\b[^"']*["'][^>]*)>[\s\S]*?<\/table>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) out.push(m[0]);
  return out.length ? out : [String(html || '')];
}

function parseCurrentWeek(pageHtml) {
  const m = String(pageHtml || '').match(/Расписание\s+занятий\s*\(([^)]*неделя)[^)]*\)/i);
  if (!m) throw new Error('БГТУ: не удалось определить текущую неделю');
  if (/неч[её]т/i.test(m[1])) return 'odd';
  return /ч[её]т/i.test(m[1]) ? 'even' : 'odd';
}

function findSelectedGroup(groupHtml, desiredGroup) {
  const wanted = normalize(desiredGroup);
  const re = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
  let m;
  while ((m = re.exec(String(groupHtml || '')))) {
    const text = cleanText(m[2]);
    if (normalize(text) === wanted) return attr(m[1], 'value') || text;
  }
  return null;
}

function parseSchedule(html, fallbackWeek = 'odd') {
  const rows = [];
  const occurrence = new Map();

  for (const table of extractTables(html)) {
    const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let tr;
    let day = null;
    let currentTime = '';

    while ((tr = trRe.exec(table))) {
      const cells = parseCells(tr[1]);
      if (!cells.length) continue;

      const dayCell = cells.find(c => classHas(c.attrs, 'daeweek'));
      if (dayCell) {
        const d = normalize(dayCell.text).replace(/\s*\d.*$/, '').trim();
        if (DAY_MAP[d] !== undefined) day = DAY_MAP[d];
        currentTime = '';
        continue;
      }

      const timeCell = cells.find(c => classHas(c.attrs, 'schtime'));
      if (timeCell && timeCell.text) currentTime = timeCell.text.replace(/[–—]/g, '-');
      if (day === null || !currentTime) continue;

      const classCell = cells.find(c => classHas(c.attrs, 'schname')) || cells.find(c => classHas(c.attrs, 'schclass'));
      const teacherCell = cells.find(c => classHas(c.attrs, 'schteacher'));
      if (!classCell && !teacherCell) continue;

      const kind = classCell ? innerByClass(classCell.html, 'schtype') : '';
      let subject = classCell ? classCell.text : '';
      if (kind && normalize(subject).endsWith(normalize(kind))) {
        subject = subject.slice(0, subject.length - kind.length).trim();
      }

      const teacher = teacherCell ? teacherCell.text : '';
      const roomCandidates = cells
        .filter(c => c !== timeCell && c !== classCell && c !== teacherCell)
        .map(c => c.text)
        .filter(Boolean);
      const room = roomCandidates.length ? roomCandidates[roomCandidates.length - 1] : '';

      let explicitWeek = '';
      const allRowText = normalize(tr[1]);
      if (/неч[её]т/i.test(allRowText)) explicitWeek = 'odd';
      else if (/ч[её]т/i.test(allRowText)) explicitWeek = 'even';

      const slotKey = `${day}|${currentTime}`;
      const idx = occurrence.get(slotKey) || 0;
      occurrence.set(slotKey, idx + 1);

      const m = currentTime.match(/^(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})$/);
      const pair = m ? (TIME_TO_PAIR.get(m[1]) || 0) : 0;
      if (!subject) continue;
      rows.push({
        _slotKey: slotKey,
        _idx: idx,
        explicitWeek,
        week: explicitWeek || '',
        dow: day,
        pair: pair || undefined,
        time: currentTime,
        subject,
        kind,
        teacher,
        room
      });
    }
  }

  const slotCounts = new Map();
  for (const r of rows) slotCounts.set(r._slotKey, (slotCounts.get(r._slotKey) || 0) + 1);
  for (const r of rows) {
    if (r.week) continue;
    const count = slotCounts.get(r._slotKey) || 0;
    if ((occurrence.get(r._slotKey) || count) === 1) r.week = fallbackWeek === 'even' ? 'even' : 'odd';
    else r.week = (r._idx % 2 === 1) ? 'even' : 'odd';
    delete r._slotKey;
    delete r._idx;
    delete r.explicitWeek;
  }

  const seen = new Set();
  return rows.filter(r => {
    const key = [r.week, r.dow, r.time, normalize(r.subject), normalize(r.kind), normalize(r.teacher), normalize(r.room)].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


module.exports={parseSchedule,parseCurrentWeek,findSelectedGroup,attr};
