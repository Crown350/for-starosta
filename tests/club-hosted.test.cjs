'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { makeClubHandler } = require('../mock/game-club/edge-handler.cjs');

const origin = 'https://crown350.github.io';
const accessA = 'a'.repeat(40);
const accessB = 'b'.repeat(40);
const accessC = 'c'.repeat(40);

function harness() {
  const groups = new Map();
  let conflicts = 0;
  const handle = makeClubHandler({
    origin, secret: 'isolated-test-secret',
    verifyAccess: key => key === accessA || key === accessB ? 'one' : key === accessC ? 'two' : null,
    storeForGroup(group) {
      if (!groups.has(group)) groups.set(group, { revision: 0, state: { version: 1, users: {}, events: {} }, rate: {} });
      return {
        read: async () => structuredClone(groups.get(group)),
        async commit(revision, state, rate) {
          if (groups.get(group).revision !== revision) {
            conflicts++;
            return false;
          }
          groups.set(group, { revision: revision + 1, state, rate });
          return true;
        }
      };
    }
  });
  async function call(route, access, body, options = {}) {
    return handle(new Request('https://example.test/functions/v1/game-club/' + route, {
      method: body ? 'POST' : 'GET',
      headers: {
        Origin: options.origin || origin,
        ...(access ? { 'X-Club-Key': access } : {}),
        ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': options.key || randomUUID() } : {}),
        ...(options.account ? { 'X-Club-Account': options.account } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    }));
  }
  async function enter(access) {
    const start = await (await call('state', access)).json();
    assert.equal(start.legal.required, true);
    const accepted = await call('agreement', access, {
      version: start.legal.version, hash: start.legal.hash, accept: true, age18: true
    });
    assert.equal(accepted.status, 200);
    return start.account;
  }
  return { call, enter, conflicts: () => conflicts };
}

test('hosted club separates verified accounts and groups and blocks commands before terms', async () => {
  const { call, enter } = harness();
  assert.equal((await call('state')).status, 401);
  assert.equal((await call('state', 'unknown-key'.repeat(4))).status, 401);
  assert.equal((await call('state', accessA, undefined, { origin: 'https://other.example' })).status, 403);
  assert.equal((await call('command', accessA, { type: 'welcome' })).status, 403);

  const one = await enter(accessA);
  const two = await enter(accessB);
  const three = await enter(accessC);
  assert.notEqual(one, two);
  assert.notEqual(one, three);
  assert.equal((await call('state', accessB, undefined, { account: one })).status, 401);
  const denied = await (await call('recipients?q=' + one, accessC)).json();
  assert.deepEqual(denied, []);
  const found = await (await call('recipients?q=' + one, accessB)).json();
  assert.equal(found[0].id, one);
});

test('concurrent hosted retries commit welcome once and retain a settled round', async () => {
  const { call, enter, conflicts } = harness();
  await enter(accessA);
  const key = randomUUID();
  const welcome = { type: 'welcome' };
  const results = await Promise.all([call('command', accessA, welcome, { key }), call('command', accessA, welcome, { key })]);
  const receipts = await Promise.all(results.map(async result => {
    assert.equal(result.status, 200);
    return result.json();
  }));
  assert.equal(receipts.filter(receipt => receipt.replayed).length, 1);
  assert.equal(conflicts(), 1);
  const prepared = await (await call('command', accessA, { type: 'prepare', game: 'coin' })).json();
  const outcome = await call('command', accessA, {
    type: 'start', roundId: prepared.receipt.round.id, amount: 2, choice: 'heads', nonce: randomUUID()
  });
  assert.equal(outcome.status, 200);
  const result = await outcome.json();
  const reloaded = await (await call('state', accessA)).json();
  assert.equal(reloaded.balance, result.state.balance);
  assert.equal(reloaded.reserved, 0);
  assert.equal(reloaded.rounds.find(r => r.id === result.receipt.round.id).status, 'settled');
});
