'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const vm = require('node:vm');

const {
  getSchedule,
  validateScheduleSnapshot,
  writeDiskScheduleCache,
  readSnapshotFile,
  scheduleCachePath
} = require('../server');
const { createServer } = require('../mock/game-club/server.cjs');

function sampleSnapshot(overrides = {}) {
  return {
    ok: true,
    source: 'БГТУ',
    group: 'О-26-ИСТ-сии-Б',
    currentWeek: 'even',
    period: '2026-2027_1_1',
    fetchedAt: '2026-10-01T10:00:00.000Z',
    lessons: [
      {
        week: 'odd',
        dow: 1,
        pair: 1,
        time: '08:00 - 09:35',
        subject: 'Математика',
        kind: 'Лекции',
        teacher: 'Иванов И. И.',
        room: 'Б404'
      }
    ],
    ...overrides
  };
}

test('validateScheduleSnapshot enforces bounds, schema, control-char rejection and contentHash', () => {
  const valid = validateScheduleSnapshot(sampleSnapshot());
  assert.ok(valid);
  assert.equal(valid.ok, true);
  assert.equal(valid.lessons.length, 1);
  assert.match(valid.contentHash, /^[a-f0-9]{64}$/);

  assert.equal(validateScheduleSnapshot(null), null);
  assert.equal(validateScheduleSnapshot([]), null);
  assert.equal(validateScheduleSnapshot(sampleSnapshot({ lessons: [] })), null);
  assert.equal(validateScheduleSnapshot(sampleSnapshot({ fetchedAt: 'not-a-date' })), null);
  assert.equal(validateScheduleSnapshot(sampleSnapshot({ currentWeek: 'third' })), null);
  assert.equal(
    validateScheduleSnapshot(sampleSnapshot({
      lessons: Array.from({ length: 201 }, () => sampleSnapshot().lessons[0])
    })),
    null
  );
  assert.equal(
    validateScheduleSnapshot(sampleSnapshot({
      lessons: [{ week: 'bad', dow: 1, time: '08:00', subject: 'X' }]
    })),
    null
  );
  assert.equal(
    validateScheduleSnapshot(sampleSnapshot({
      lessons: [{ week: 'odd', dow: 9, time: '08:00', subject: 'X' }]
    })),
    null
  );
  assert.equal(
    validateScheduleSnapshot(sampleSnapshot({
      lessons: [{ week: 'odd', dow: 1, time: '08:00', subject: 'Математика\x00' }]
    })),
    null
  );
});

test('server writes atomic disk cache and falls back offline safely without cross-group leakage', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'starosta-sched-'));
  const prevDataDir = process.env.DATA_DIR;
  const prevGroup = process.env.GROUP;
  const prevMock = process.env.MOCK_BGTU;
  process.env.DATA_DIR = tmpDir;
  delete process.env.GROUP;
  delete process.env.MOCK_BGTU;

  try {
    const saved = writeDiskScheduleCache(sampleSnapshot({ fetchedAt: '2026-10-05T12:00:00.000Z' }));
    const diskPath = scheduleCachePath();
    assert.equal(diskPath, path.join(tmpDir, 'bgtu-schedule-cache.json'));
    const diskRead = readSnapshotFile(diskPath);
    assert.ok(diskRead);
    assert.equal(diskRead.contentHash, saved.contentHash);

    // Default query with GROUP unset falls back to validated disk cache
    const defaultRes = await getSchedule({});
    assert.equal(defaultRes.ok, true);
    assert.equal(defaultRes.cached, true);
    assert.equal(defaultRes.cacheSource, 'disk');
    assert.equal(defaultRes.group, 'О-26-ИСТ-сии-Б');

    // A non-default period cannot receive the default period's disk snapshot.
    await assert.rejects(getSchedule({ period: '2025-2026_2_2' }), /GROUP/);

    // Malformed query params are rejected with 400
    await assert.rejects(
      () => getSchedule({ group: '<script>alert(1)</script>' }),
      (err) => err && err.status === 400
    );
    await assert.rejects(
      () => getSchedule({ group: 'A'.repeat(150) }),
      (err) => err && err.status === 400
    );

    // Corrupted disk cache gracefully falls back to bundled schedule.json instead of crashing
    fs.writeFileSync(diskPath, '{broken json', 'utf8');
    const bundledRes = await getSchedule({});
    assert.equal(bundledRes.ok, true);
    assert.equal(bundledRes.cached, true);
    assert.equal(bundledRes.cacheSource, 'bundled');
    assert.ok(bundledRes.lessons.length > 0);
  } finally {
    if (prevDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prevDataDir;
    if (prevGroup === undefined) delete process.env.GROUP;
    else process.env.GROUP = prevGroup;
    if (prevMock === undefined) delete process.env.MOCK_BGTU;
    else process.env.MOCK_BGTU = prevMock;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

const net = require('node:net');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close((err) => (err ? reject(err) : resolve(port)));
    });
    s.on('error', reject);
  });
}

test('LAN / dev server serves /api/bgtu/schedule with security headers and 400 validation', async () => {
  const port = await getFreePort();
  const srv = createServer({ port, allowLan: false });
  await new Promise((resolve) => srv.listen(port, '127.0.0.1', resolve));
  const host = `127.0.0.1:${port}`;
  try {
    const okRes = await fetch(`http://${host}/api/bgtu/schedule`, {
      headers: { Host: host }
    });
    assert.equal(okRes.status, 200);
    assert.equal(okRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(okRes.headers.get('cache-control'), 'no-store');
    const body = await okRes.json();
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.lessons) && body.lessons.length > 0);

    const badRes = await fetch(`http://${host}/api/bgtu/schedule?group=${encodeURIComponent('<img src=x>')}`, {
      headers: { Host: host }
    });
    assert.equal(badRes.status, 400);
    const badBody = await badRes.json();
    assert.equal(badBody.ok, false);
  } finally {
    srv.closeAllConnections?.();
    await new Promise((resolve) => srv.close(resolve));
  }
});

function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(String(k), String(v)); },
    removeItem(k) { map.delete(k); }
  };
}

test('v2 offline public schedule cache restores when offline, strips private fields, and respects privacy block', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../v2/app.js'), 'utf8');
  const slice = source.slice(
    source.indexOf('function validateBGTUSnapshot(data){'),
    source.indexOf('async function refreshBGTU(){')
  );
  const storage = createMemoryStorage();
  let blocked = false;
  const ctxState = () => ({
    group: 'О-26-ИСТ-сии-Б',
    students: [],
    teachers: [],
    subjects: [],
    lessons: [],
    works: [],
    funds: [],
    tpl: [],
    att: {},
    subs: {},
    pays: {},
    duty: { idx: 0, log: [] },
    schedule: { group: 'О-26-ИСТ-сии-Б', currentWeek: 'odd', week: 'odd' }
  });

  const context = vm.createContext({
    S: ctxState(),
    localStorage: storage,
    publicBgtuSnapshot: null,
    scheduleLoading: false,
    renderCalled: 0,
    window: {
      STAROSTA_SUPABASE_URL: '',
      cloudScheduleBlocked: () => blocked
    },
    fetch: async () => { throw new TypeError('Offline'); },
    save: () => {},
    render: () => { context.renderCalled += 1; },
    curDate: '2026-10-05',
    todayISO: () => '2026-10-05',
    uid: (p) => `${p}_${Math.random().toString(36).slice(2, 8)}`,
    pairFromTime: () => 1,
    ensureBGTULessonsForDate: () => {},
    bgtuSlot: (value) => {
      const m = String(value).match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
      if (!m) return { s: 0, e: 0 };
      return { s: (+m[1]) * 60 + (+m[2]), e: (+m[3]) * 60 + (+m[4]) };
    }
  });
  vm.runInContext(slice, context);

  // Writing snapshot must strip any accidental private keys
  context.writePublicScheduleCache(sampleSnapshot({
    students: [{ fio: 'Secret Student' }],
    att: { secret: true }
  }));
  const storedRaw = storage.getItem('starosta-public-schedule-v1');
  assert.ok(storedRaw);
  const storedObj = JSON.parse(storedRaw);
  assert.equal(storedObj.students, undefined);
  assert.equal(storedObj.att, undefined);
  assert.equal(storedObj.lessons.length, 1);

  // Offline launch with fresh empty S immediately restores schedule from cache
  context.S = ctxState();
  context.renderCalled = 0;
  await context.loadScheduleSnapshot();
  assert.equal(context.S.tpl.filter((t) => t.source === 'bgtu').length, 1);
  assert.equal(context.S.schedule.lastError, 'Нет сети. Показаны сохранённые данные.');
  assert.ok(context.renderCalled >= 2);

  // Blocked private/guest session must not restore cached schedule
  blocked = true;
  context.S = ctxState();
  await context.loadScheduleSnapshot();
  assert.equal(context.S.tpl.length, 0);

  // Corrupted cache entry is discarded cleanly
  blocked = false;
  storage.setItem('starosta-public-schedule-v1', '{invalid-json');
  assert.equal(context.readPublicScheduleCache(), null);
  assert.equal(storage.getItem('starosta-public-schedule-v1'), null);
});

test('classic app offline public schedule cache restores when offline and purges corrupt data', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  const slice = source.slice(
    source.indexOf('const PUBLIC_SCHEDULE_KEY = '),
    source.indexOf('function viewBGTU(){')
  );
  const storage = createMemoryStorage();
  const context = vm.createContext({
    S: {
      group: 'О-26-ИСТ-сии-Б',
      subjects: [],
      teachers: [],
      tpl: [],
      att: {},
      schedule: { group: 'О-26-ИСТ-сии-Б', currentWeek: 'odd', week: 'odd' }
    },
    localStorage: storage,
    ctx: {},
    curDate: '2026-10-05',
    window: { STAROSTA_SUPABASE_URL: '' },
    fetch: async () => { throw new TypeError('Offline'); },
    norm: (v) => String(v || '').trim().toLowerCase(),
    uid: (p) => `${p}_1`,
    pairFromTime: () => 1,
    todayISO: () => '2026-10-05',
    ensureBGTULessonsForDate: () => {},
    save: () => {},
    render: () => {},
    toast: () => {}
  });
  // Inject classic applyBGTUSchedule helper along with slice from PUBLIC_SCHEDULE_KEY
  const applySlice = source.slice(
    source.indexOf('function applyBGTUSchedule('),
    source.indexOf('function viewBGTU(){')
  );
  vm.runInContext(applySlice, context);

  context.writePublicScheduleCache(sampleSnapshot());
  await context.loadScheduleSnapshot();
  assert.equal(context.S.tpl.filter((t) => t.source === 'bgtu').length, 1);

  storage.setItem('starosta-public-schedule-v1', '{"ok":true,"lessons":[]}');
  assert.equal(context.readPublicScheduleCache(), null);
});
