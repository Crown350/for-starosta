'use strict';

const http = require('node:http');
const { URL } = require('node:url');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8787);
const BASE = 'https://www.tu-bryansk.ru/education/schedule/';
const AJAX = new URL('schedule.ajax.php', BASE).toString();
const DEFAULTS = {
  group: 'О-26-ИСТ-сии-Б',
  faculty: 'Факультет информационных технологий',
  level: 'бакалавр',
  period: '2026-2027_1_1',
  form: 'очная'
};
const UA = 'Starosta-BGTU/10 (+https://www.tu-bryansk.ru/education/schedule/)';
const CACHE_TTL_MS = 60_000;
const scheduleCache = new Map();

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

function cookieHeader(setCookie) {
  if (!setCookie) return '';
  const pieces = Array.isArray(setCookie) ? setCookie : String(setCookie).split(/,(?=[^;]+?=)/);
  return pieces.map(x => x.split(';')[0].trim()).filter(Boolean).join('; ');
}

async function fetchText(url, options, jar) {
  const headers = new Headers(options?.headers || {});
  headers.set('User-Agent', UA);
  headers.set('Accept', 'text/html,application/xhtml+xml');
  headers.set('Referer', BASE);
  if (jar.cookie) headers.set('Cookie', jar.cookie);
  const response = await fetch(url, { ...options, headers, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  const set = response.headers.getSetCookie ? response.headers.getSetCookie() : response.headers.get('set-cookie');
  const next = cookieHeader(set);
  if (next) jar.cookie = jar.cookie ? `${jar.cookie}; ${next}` : next;
  const text = await response.text();
  if (!response.ok) throw new Error(`БГТУ HTTP ${response.status}`);
  return { response, text };
}

function postForm(data) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) body.set(k, v == null ? '' : String(v));
  return body;
}

function mockSchedule() {
  const lessons = [
    {week:'odd',dow:1,pair:1,time:'08:00 - 09:35',subject:'Основы российской государственности',kind:'Лекции',teacher:'Атаманова Н. В.',room:'ауд.Д'},
    {week:'even',dow:1,pair:1,time:'08:00 - 09:35',subject:'Основы российской государственности',kind:'Лекции',teacher:'Атаманова Н. В.',room:'ауд.Д'},
    {week:'odd',dow:1,pair:2,time:'09:45 - 11:20',subject:'Алгебра и геометрия',kind:'Лекции',teacher:'Кобзев В. М.',room:'Б404'},
    {week:'even',dow:1,pair:2,time:'09:45 - 11:20',subject:'Алгебра и геометрия',kind:'Лекции',teacher:'Кобзев В. М.',room:'Б404'},
    {week:'odd',dow:1,pair:3,time:'11:30 - 13:05',subject:'Математический анализ',kind:'Практические занятия',teacher:'Алейникова А. О.',room:'А213'},
    {week:'even',dow:1,pair:3,time:'11:30 - 13:05',subject:'Математический анализ',kind:'Практические занятия',teacher:'Алейникова А. О.',room:'А213'}
  ];
  return { ok:true, source:'БГТУ (MOCK)', group:DEFAULTS.group, currentWeek:'odd', lessons, fetchedAt:new Date().toISOString(), cached:false, mock:true };
}

async function getSchedule(params) {
  if (process.env.MOCK_BGTU === '1') return mockSchedule();
  const cfg = {
    group: params.group || DEFAULTS.group,
    faculty: params.faculty || DEFAULTS.faculty,
    level: params.level || DEFAULTS.level,
    period: params.period || DEFAULTS.period,
    form: params.form || DEFAULTS.form
  };
  const cacheKey = JSON.stringify(cfg);
  const cached = scheduleCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return { ...cached.data, cached: true };
  const jar = { cookie: '' };

  const page = await fetchText(`${BASE}?form=${encodeURIComponent(cfg.form)}`, { method: 'GET' }, jar);
  const currentWeek = parseCurrentWeek(page.text);
  if (!params.period) {
    const periodSelect = page.text.match(/<select\b[^>]*id=["']period["'][^>]*>([\s\S]*?)<\/select>/i);
    const selected = periodSelect?.[1].match(/<option\b([^>]*\bselected[^>]*)>/i);
    const currentPeriod = selected && attr(selected[1], 'value');
    if (currentPeriod) cfg.period = currentPeriod;
  }

  const groupResp = await fetchText(AJAX, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
    body: postForm({ namedata: 'group', faculty: cfg.faculty, level: cfg.level, period: cfg.period, form: cfg.form })
  }, jar);
  const groupValue = findSelectedGroup(groupResp.text, cfg.group) || findSelectedGroup(page.text, cfg.group);
  if (!groupValue) throw new Error(`Группа «${cfg.group}» не найдена для выбранных параметров`);

  const scheduleResp = await fetchText(AJAX, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
    body: postForm({ namedata: 'schedule', group: groupValue, period: cfg.period, form: cfg.form })
  }, jar);

  const lessons = parseSchedule(scheduleResp.text, currentWeek);
  if (!lessons.length) throw new Error('БГТУ вернуло расписание, но распарсить занятия не удалось');
  const data = { ok: true, source: 'БГТУ', group: cfg.group, currentWeek, period: cfg.period, lessons, fetchedAt: new Date().toISOString(), cached: false };
  scheduleCache.set(cacheKey, { at: Date.now(), data });
  return data;
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function server() {
  const cloud = require('./cloud-server').createCloud();
  const s = http.createServer(async (req, res) => {
    try {
      if (await cloud(req, res)) return;
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, service: 'starosta-bgtu' });
      if (req.method === 'GET' && url.pathname === '/api/bgtu/schedule') {
        const data = await getSchedule(Object.fromEntries(url.searchParams.entries()));
        return json(res, 200, data);
      }
      if (req.method === 'GET') {
        const fs = require('node:fs');
        const path = require('node:path');
        const files = {
          '/': ['index.html','text/html; charset=utf-8'],
          '/index.html': ['index.html','text/html; charset=utf-8'],
          '/data/curriculum.json': ['data/curriculum.json','application/json; charset=utf-8'],
          '/schedule.json': ['schedule.json','application/json; charset=utf-8'],
          '/dialogs.js': ['dialogs.js','application/javascript; charset=utf-8'],
          '/app.js': ['app.js','application/javascript; charset=utf-8'],
          '/vendor/ocr/tesseract.min.js': ['vendor/ocr/tesseract.min.js','application/javascript'],
          '/vendor/ocr/worker.min.js': ['vendor/ocr/worker.min.js','application/javascript'],
          '/vendor/ocr/tesseract-core-lstm.wasm.js': ['vendor/ocr/tesseract-core-lstm.wasm.js','application/javascript'],
          '/vendor/ocr/tesseract-core-simd-lstm.wasm.js': ['vendor/ocr/tesseract-core-simd-lstm.wasm.js','application/javascript'],
          '/vendor/ocr/rus.traineddata.gz': ['vendor/ocr/rus.traineddata.gz','application/gzip'],
          '/cloud.js': ['cloud.js','application/javascript; charset=utf-8'],
          '/local-copy.js': ['local-copy.js','application/javascript; charset=utf-8'],
          '/config.js': ['config.js','application/javascript; charset=utf-8'],
          '/icon-180.png': ['icon-180.png','image/png'],
          '/icon-192.png': ['icon-192.png','image/png'],
          '/icon-512.png': ['icon-512.png','image/png'],
          '/sw.js': ['sw.js','application/javascript; charset=utf-8'],
          '/manifest.webmanifest': ['manifest.webmanifest','application/manifest+json; charset=utf-8']
        };
        const item = files[url.pathname];
        if (item) {
          const full = path.join(__dirname, item[0]);
          if (!fs.existsSync(full) && url.pathname==='/data/curriculum.json'){res.writeHead(204,{'Cache-Control':'no-store'});return res.end();}
          if (!fs.existsSync(full)) return json(res, 404, { ok:false, error:`Файл ${item[0]} не найден` });
          const file = fs.readFileSync(full);
          res.writeHead(200, { 'Content-Type': item[1], 'Cache-Control': url.pathname === '/sw.js' ? 'no-store' : 'no-cache' });
          return res.end(file);
        }
      }
      json(res, 404, { ok: false, error: 'Not found' });
    } catch (e) {
      json(res, 502, { ok: false, error: e?.message || 'Ошибка сервера' });
    }
  });
  s.listen(PORT, HOST, () => console.log(`Starosta BGTU: http://${HOST}:${PORT}`));
  return s;
}

function selfTest() {
  const fixture = `
  <table class="contless">
    <tr><td class="daeweek" colspan="4">Понедельник</td></tr>
    <tr>
      <td class="schtime" rowspan="2">08:00 - 09:35</td>
      <td class="itmles schclass">Основы российской государственности <span class="schtype">Лекции</span></td>
      <td class="itmles schteacher">Атаманова Н. В.</td><td class="itmles">ауд.Д</td>
    </tr>
    <tr>
      <td class="itmles schclass">Основы российской государственности <span class="schtype">Лекции</span></td>
      <td class="itmles schteacher">Атаманова Н. В.</td><td class="itmles">ауд.Д</td>
    </tr>
    <tr>
      <td class="schtime" rowspan="2">09:45 - 11:20</td>
      <td class="itmles schclass">Алгебра и геометрия <span class="schtype">Лекции</span></td>
      <td class="itmles schteacher">Кобзев В. М.</td><td class="itmles">Б404</td>
    </tr>
    <tr>
      <td class="itmles schclass">Алгебра и геометрия <span class="schtype">Лекции</span></td>
      <td class="itmles schteacher">Кобзев В. М.</td><td class="itmles">Б404</td>
    </tr>
    <tr>
      <td class="schtime" rowspan="2">11:30 - 13:05</td>
      <td class="itmles schclass">Математический анализ <span class="schtype">Практические занятия</span></td>
      <td class="itmles schteacher">Алейникова А. О.</td><td class="itmles">А213</td>
    </tr>
    <tr>
      <td class="itmles schclass">Математический анализ <span class="schtype">Практические занятия</span></td>
      <td class="itmles schteacher">Алейникова А. О.</td><td class="itmles">А213</td>
    </tr>
  </table>`;
  const parsed = parseSchedule(fixture);
  const assert = (ok, msg) => { if (!ok) throw new Error(`SELF-TEST: ${msg}`); };
  assert(parsed.length === 6, `ожидалось 6 занятий, получено ${parsed.length}`);
  assert(parsed.filter(x => x.week === 'odd').length === 3, 'нечётная неделя разобрана неверно');
  assert(parsed.filter(x => x.week === 'even').length === 3, 'чётная неделя разобрана неверно');
  assert(parsed[0].subject === 'Основы российской государственности', 'предмет не распознан');
  assert(parsed[2].pair === 2 && parsed[4].pair === 3, 'номер пары определён неверно');

  const group = findSelectedGroup('<option value="O-26-IST-SII-B">О-26-ИСТ-СИИ-Б</option>', 'О-26-ИСТ-СИИ-Б');
  assert(group === 'O-26-IST-SII-B', 'поиск значения группы неверен');
  const singleEven = parseSchedule('<table class="contless"><tr><td class="daeweek">Вторник</td></tr><tr><td class="schtime">09:45 - 11:20</td><td class="schclass">Информатика <span class="schtype">Практические занятия</span></td><td class="schteacher">Иванов И. И.</td><td>А101</td></tr></table>', 'even');
  assert(singleEven.length===1 && singleEven[0].week==='even', 'fallback текущей недели не работает');
  console.log(`SELF-TEST OK: ${parsed.length} rows; odd=${parsed.filter(x=>x.week==='odd').length}; even=${parsed.filter(x=>x.week==='even').length}`);
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) selfTest();
  else server();
}

module.exports = { parseSchedule, findSelectedGroup, parseCurrentWeek, cleanText, getSchedule };
