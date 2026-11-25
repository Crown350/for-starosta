'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const { Engine } = require('../mock/game-club/engine.cjs');
const { createServer } = require('../mock/game-club/server.cjs');

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

test('server blocks all club endpoints until valid access key session is granted and revokes on logout', async (t) => {
  const port = await getFreePort();
  const accessKey = 'starosta-owner-key-' + 'k'.repeat(32);
  const engine = new Engine({ draw: () => 0 });
  const srv = createServer({ engine, port, allowLan: false, accessKeys: [accessKey] });
  await new Promise((resolve) => srv.listen(port, '127.0.0.1', resolve));
  t.after(() => {
    srv.closeAllConnections?.();
    return new Promise((resolve) => srv.close(resolve));
  });

  const base = `http://127.0.0.1:${port}/api/game-club/`;
  const jar = {};
  const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const saveCookies = (res) => {
    const list = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie')].filter(Boolean);
    for (const raw of list) {
      const [kv] = raw.split(';');
      const idx = kv.indexOf('=');
      if (idx === -1) continue;
      const k = kv.slice(0, idx);
      const v = kv.slice(idx + 1);
      if (v) jar[k] = v;
      else delete jar[k];
    }
  };
  const call = (route, body, extraHeaders = {}) =>
    fetch(base + route, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(cookieHeader() ? { Cookie: cookieHeader() } : {}),
        ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() } : {}),
        ...extraHeaders
      },
      body: body ? JSON.stringify(body) : undefined
    });

  // 1. All club routes blocked before access-key verification (even demo/club-demo credentials)
  const unauthState = await call('state');
  assert.equal(unauthState.status, 401);
  assert.equal((await unauthState.json()).error, 'ACCESS_KEY_REQUIRED');

  const unauthLogin = await call('session', { account: 'demo', password: 'club-demo' });
  assert.equal(unauthLogin.status, 401);
  assert.equal((await unauthLogin.json()).error, 'ACCESS_KEY_REQUIRED');

  const unauthCmd = await call('command', { type: 'ticket' });
  assert.equal(unauthCmd.status, 401);

  // 2. Wrong / short / extra-field access key attempts rejected cleanly
  const badPayload = await call('access', { accessKey, extra: 1 });
  assert.equal(badPayload.status, 400);

  const wrongKey = await call('access', { accessKey: 'wrong-key-' + 'x'.repeat(32) });
  assert.equal(wrongKey.status, 401);
  assert.equal((await wrongKey.json()).error, 'ACCESS_KEY_INVALID');

  const evilOrigin = await call('access', { accessKey }, { Origin: 'https://evil.example' });
  assert.equal(evilOrigin.status, 403);

  // 3. Valid access key grants HttpOnly starosta_access cookie -> directly opens club (no demo password step!)
  const granted = await call('access', { accessKey });
  assert.equal(granted.status, 200);
  const rawSetCookie = granted.headers.get('set-cookie') || '';
  assert.match(rawSetCookie, /starosta_access=[a-f0-9]{64}; HttpOnly; SameSite=Strict/);
  saveCookies(granted);

  const clubState = await call('state');
  assert.equal(clubState.status, 200);
  assert.equal((await clubState.json()).account, 'demo');

  // 4. Revoking access via access-logout invalidates both access & club cookies
  const revoked = await call('access-logout', {});
  assert.equal(revoked.status, 200);
  saveCookies(revoked);

  const afterRevoke = await call('state');
  assert.equal(afterRevoke.status, 401);
  assert.equal((await afterRevoke.json()).error, 'ACCESS_KEY_REQUIRED');
});

test('club/app.js has no test login form, locks behind ACCESS_KEY_REQUIRED and opens club directly on key submission', async () => {
  const flush = () => new Promise((r) => setImmediate(r));
  let document;
  const walk = (n) => [n, ...n.children.flatMap(walk)];
  class N {
    constructor(tag) {
      this.tag = tag;
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.dataset = {};
      this.attrs = {};
      this.isConnected = true;
    }
    append(...nodes) { for (const n of nodes.filter(Boolean)) { n.isConnected = true; this.children.push(n); } }
    replaceChildren() { for (const n of this.children) for (const x of walk(n)) x.isConnected = false; this.children = []; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    get textContent() { return this.text ?? this.children.map((n) => n.textContent).join(' '); }
    set textContent(t) { this.text = String(t); }
    addEventListener(k, fn) { this[k] = fn; }
    querySelectorAll() { return []; }
    querySelector() { return null; }
    focus() {}
  }
  const body = new N('body');
  body.dataset.screen = 'gameclub';
  const root = new N('main');
  document = { body, currentScript: { src: 'http://127.0.0.1:8790/club/app.js' }, activeElement: null, createElement: (t) => new N(t) };

  let unlocked = false;
  const sessionStore = new Map();
  const localStore = new Map();
  const calls = [];
  const scope = {
    window: {},
    document,
    crypto,
    URL,
    Date,
    AbortSignal,
    location: { href: 'http://127.0.0.1:8790/club/?from=new' },
    matchMedia: () => ({ matches: false }),
    setTimeout,
    localStorage: { setItem: (k, v) => localStore.set(k, v), getItem: (k) => localStore.get(k) || null },
    sessionStorage: { getItem: (k) => sessionStore.get(k) || null, setItem: (k, v) => sessionStore.set(k, v), removeItem: (k) => sessionStore.delete(k) },
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/access')) {
        const body = JSON.parse(options.body);
        if (body.accessKey === 'valid-access-key-' + 'a'.repeat(20)) {
          unlocked = true;
          return { ok: true, status: 200, json: async () => ({ ok: true, access: true }) };
        }
        return { ok: false, status: 401, json: async () => ({ error: 'ACCESS_KEY_INVALID' }) };
      }
      if (url.endsWith('/state')) {
        if (!unlocked) return { ok: false, status: 401, json: async () => ({ error: 'ACCESS_KEY_REQUIRED' }) };
        return {
          ok: true,
          status: 200,
          json: async () => ({
            account: 'demo',
            name: 'Светлана',
            mock: true,
            balance: 200,
            reserved: 0,
            tickets: 1,
            streak: 1,
            welcome: true,
            misses: 0,
            pity: 8,
            serverTime: 1,
            nextTicketAt: 86400000,
            owned: [],
            equipped: {},
            history: [],
            catalogue: [],
            events: [],
            probabilities: [],
            rounds: [],
            rooms: [],
            ledger: []
          })
        };
      }
      return { ok: false, status: 500, json: async () => ({ error: 'UNEXPECTED' }) };
    }
  };
  vm.createContext(scope);
  const clubSource = fs.readFileSync(require.resolve('../club/app.js'), 'utf8');
  assert.equal(clubSource.includes('club-demo'), false, 'demo fixture password UI removed');
  vm.runInContext(clubSource, scope);
  scope.window.GameClub.mount(root);
  await flush();

  // While locked, no demo hints or games may appear
  assert.ok(root.textContent.includes('Вход по ключу доступа'));
  assert.equal(root.textContent.includes('club-demo'), false);
  assert.equal(root.textContent.includes('Локальные тестовые аккаунты'), false);

  // Submitting valid key directly opens Club without secondary login
  const form = walk(root).find((n) => n.tag === 'form');
  const keyInput = walk(root).find((n) => n.id === 'club-access-key');
  assert.ok(form && keyInput);
  keyInput.value = 'valid-access-key-' + 'a'.repeat(20);
  await form.onsubmit({ preventDefault() {} });
  await flush();

  assert.equal(keyInput.value, '');
  assert.ok(root.textContent.includes('Твой следующий ход'));
  assert.equal(root.textContent.includes('Открой свою коллекцию'), false);
  assert.equal(sessionStore.size, 0);
  assert.equal(localStore.size, 0);
});

test('Starosta viewMore hides Club link for guests and displays it after access-key login', () => {
  for (const [file, hasHref] of [['../v2/app.js', '../club/?from=new'], ['../app.js', 'club/?from=old']]) {
    const source = fs.readFileSync(require.resolve(file), 'utf8');
    const fn = source.slice(source.indexOf('function viewMore(){'), source.indexOf('function pairFromTime('));
    const render = (hasSession) => {
      const ctx = vm.createContext({
        window: { cloudHasSession: () => hasSession, cloudCanEdit: () => hasSession },
        head: () => '',
        S: { group: 'О-26', subjects: [], teachers: [], tpl: [], limit: 3, schedule: { group: 'О-26', week: 'odd' } },
        esc: String,
        APP_V: 11,
        todayISO: () => '2026-10-05',
        bgtuCurrentWeekForDate: () => 'odd',
        bgtuWeekLabel: () => 'нечётная'
      });
      vm.runInContext(fn, ctx);
      return ctx.viewMore();
    };
    const guestHtml = render(false);
    assert.equal(guestHtml.includes(hasHref), false, `${file} guest must not see Club link`);
    assert.equal(guestHtml.includes('Игровой клуб'), false, `${file} guest must not see Club card`);
    const authHtml = render(true);
    assert.equal(authHtml.includes(hasHref), true, `${file} authenticated user must see Club link`);
  }
});
