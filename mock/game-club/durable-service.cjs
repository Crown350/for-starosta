'use strict';

const { Engine, ClubError } = require('./engine.cjs');
const { Agreements } = require('./agreements.cjs');

const timestampLimit = 60_000;
const maxRetries = 6;

function makeClubService(store, { now = Date.now, agreements = new Agreements() } = {}) {
  async function run(profile, route, { key, body, query, account } = {}) {
    if (!profile || !/^[a-f0-9]{32}$/.test(profile.id)) {
      throw new ClubError('ACCESS_KEY_REQUIRED', 401);
    }
    if (account && account !== profile.id) {
      throw new ClubError('SESSION_CHANGED', 401);
    }

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const snapshot = await store.read();
      const time = now();
      const rate = snapshot.rate || {};
      const commandTimes = (rate[profile.id]?.command || []).filter(t => t > time - timestampLimit);
      const engine = new Engine({
        initialState: snapshot.state,
        profiles: new Map([[profile.id, { name: profile.name, createdAt: time }]]),
        limits: new Map([[profile.id, commandTimes]]),
        now: () => time
      });
      const user = profile.id;
      const metadata = value => ({
        ...value,
        legal: agreements.view(engine, user),
        rooms: value.rooms.map(room => ({
          ...room,
          members: room.members.map(member => ({
            ...member,
            termsAccepted: agreements.current(engine, member.user)
          }))
        }))
      });
      const recent = (rate[user]?.[route] || []).filter(t => t > time - timestampLimit);
      const max = route === 'state' || route === 'recipients' ? 120 : 20;
      if (route !== 'command' && recent.length >= max) throw new ClubError('RATE_LIMIT', 429);

      let result;
      if (route === 'state') {
        result = metadata(await engine.state(user));
      } else if (route === 'agreement' || route === 'data-consent') {
        result = await agreements.record(engine, user, key, body, route === 'agreement' ? 'terms' : 'consent');
      } else {
        if (!agreements.current(engine, user)) throw new ClubError('TERMS_REQUIRED', 403);
        if (route === 'recipients') {
          result = await engine.search(user, query);
        } else if (route === 'command') {
          if (body?.type === 'roomStart') {
            const room = Object.hasOwn(engine.data.rooms, body.code) && engine.data.rooms[body.code];
            if (room && room.members.some(member => !agreements.current(engine, member.user))) {
              throw new ClubError('TERMS_REQUIRED', 403);
            }
          }
          const command = await engine.command(user, key, body);
          result = { ...command, state: metadata(command.state) };
        } else {
          throw new ClubError('NOT_FOUND', 404);
        }
      }

      // Retain only active counters. A conflicting writer is retried from its committed snapshot.
      const nextRate = {};
      for (const [id, windows] of Object.entries(rate)) {
        const active = Object.entries(windows).map(([name, times]) => [
          name, times.filter(t => t > time - timestampLimit)
        ]).filter(([, times]) => times.length);
        if (active.length) nextRate[id] = Object.fromEntries(active);
      }
      nextRate[user] ??= {};
      nextRate[user][route] = route === 'command'
        ? engine.limits.get(user)
        : [...recent, time];
      if (await store.commit(snapshot.revision, engine.data, nextRate)) return result;
    }

    throw new ClubError('CLUB_BUSY', 503);
  }

  return { run };
}

module.exports = { makeClubService };
