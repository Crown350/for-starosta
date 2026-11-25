'use strict';

const { createHmac } = require('node:crypto');
const { ClubError } = require('./engine.cjs');
const { makeClubService } = require('./durable-service.cjs');

const readRoutes = new Set(['state', 'recipients']);
const writeRoutes = new Set(['access', 'access-logout', 'agreement', 'data-consent', 'command']);
const maxBody = 4096;

async function readBody(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers.get('content-type') || '')) {
    throw new ClubError('INVALID_CONTENT_TYPE', 415);
  }
  const reader = req.body?.getReader();
  if (!reader) throw new ClubError('INVALID_JSON', 400);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBody) {
        await reader.cancel();
        throw new ClubError('BODY_TOO_LARGE', 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    const body = JSON.parse(text + decoder.decode());
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch (error) {
    if (error instanceof ClubError) throw error;
    throw new ClubError('INVALID_JSON', 400);
  } finally {
    reader.releaseLock();
  }
}

function makeClubHandler({ origin, secret, verifyAccess, storeForGroup }) {
  if (!origin || !secret) throw new Error('Missing club configuration');
  const hash = (purpose, value) => createHmac('sha256', secret).update(purpose + '\0' + value).digest('hex');

  return async function handle(req) {
    const requestOrigin = req.headers.get('origin');
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Origin'
    };
    const respond = (status, body) => new Response(JSON.stringify(body), { status, headers });
    if (requestOrigin && requestOrigin !== origin) return respond(403, { error: 'INVALID_ORIGIN' });
    if (requestOrigin === origin) headers['Access-Control-Allow-Origin'] = origin;
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      ...headers,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, idempotency-key, x-club-account, x-club-key',
      'Access-Control-Max-Age': '600'
    } });

    try {
      const url = new URL(req.url);
      const route = url.pathname.split('/').at(-1);
      if (!readRoutes.has(route) && !writeRoutes.has(route)) throw new ClubError('NOT_FOUND', 404);
      if (req.method !== (readRoutes.has(route) ? 'GET' : 'POST')) {
        throw new ClubError('METHOD_NOT_ALLOWED', 405);
      }
      const key = req.headers.get('idempotency-key');
      if (req.method === 'POST' && !/^[-a-zA-Z0-9]{16,80}$/.test(key || '')) {
        throw new ClubError('INVALID_KEY', 400);
      }
      const body = req.method === 'POST' ? await readBody(req) : undefined;
      if (route === 'access-logout') return respond(200, { ok: true });

      const accessKey = route === 'access' ? body.accessKey : req.headers.get('x-club-key');
      if (typeof accessKey !== 'string') throw new ClubError('ACCESS_KEY_REQUIRED', 401);
      if (accessKey.length < 32 || accessKey.length > 256 || /[\u0000-\u001f\u007f]/.test(accessKey)) {
        throw new ClubError('ACCESS_KEY_INVALID', 401);
      }
      const group = await verifyAccess(accessKey);
      if (typeof group !== 'string' || !group) throw new ClubError('ACCESS_KEY_INVALID', 401);
      const id = hash('club-account', accessKey).slice(0, 32);
      const profile = { id, name: 'Участник ' + id.slice(0, 6).toUpperCase() };
      if (route === 'access') return respond(200, { ok: true });

      const service = makeClubService(storeForGroup(hash('club-group', group)));
      const result = await service.run(profile, route, {
        key, body, query: url.searchParams.get('q'), account: req.headers.get('x-club-account')
      });
      return respond(200, result);
    } catch (error) {
      if (typeof error.code === 'string' && Number.isInteger(error.status) &&
          error.status >= 400 && error.status < 600) {
        return respond(error.status, { error: error.code });
      }
      return respond(503, { error: 'CLUB_UNAVAILABLE' });
    }
  };
}

module.exports = { makeClubHandler };
