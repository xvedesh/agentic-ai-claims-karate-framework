'use strict';

/**
 * In-memory store for the sandbox.
 *
 * - Loads seed-data.json at startup.
 * - Loads codes.json, bundles.json, mue-limits.json as read-only reference data.
 * - Reset endpoint reloads from disk so test runs are deterministic.
 *
 * No database. No persistence across restarts. Synthetic data only.
 */

const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, 'data');

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function pad(n, width = 5) {
  return String(n).padStart(width, '0');
}

const state = {
  members: new Map(),
  providers: new Map(),
  encounters: new Map(),
  claims: new Map(),
  // Phase 2 additions:
  adjudications: new Map(), // claimId -> adjudication record (1:1 in this sandbox)
  alerts: [], // append-only list; filtered on read
  events: [], // append-only pipeline event log
  cursors: {
    memberSeq: 0,
    providerSeq: 0,
    encounterSeq: 0,
    claimSeq: 0,
    ackSeq: 0,
    adjudicationSeq: 0,
    alertSeq: 0,
    eventSeq: 0,
    trnSeq: 0,
  },
  refData: { codes: null, bundles: null, mue: null },
};

function loadSeed() {
  state.members.clear();
  state.providers.clear();
  state.encounters.clear();
  state.claims.clear();
  state.adjudications.clear();
  state.alerts.length = 0;
  state.events.length = 0;

  const seed = readJson('seed-data.json');
  for (const m of seed.members) state.members.set(m.memberId, deepClone(m));
  for (const p of seed.providers) state.providers.set(p.providerId, deepClone(p));
  for (const e of seed.encounters) state.encounters.set(e.encounterId, deepClone(e));
  for (const c of seed.claims) state.claims.set(c.claimId, deepClone(c));

  state.cursors = { ...state.cursors, ...seed._idCursors };

  state.refData.codes = readJson('codes.json');
  state.refData.bundles = readJson('bundles.json');
  state.refData.mue = readJson('mue-limits.json');
}

const ID_PREFIX = {
  member: 'MBR',
  provider: 'PRV',
  encounter: 'ENC',
  claim: 'CLM',
  ack: 'ACK',
  adjudication: 'ADJ',
  alert: 'ALT',
  event: 'EVT',
  trn: 'TRN',
};

function nextId(kind) {
  const key = `${kind}Seq`;
  if (!(key in state.cursors)) throw new Error(`Unknown id kind: ${kind}`);
  state.cursors[key] += 1;
  const prefix = ID_PREFIX[kind];
  if (!prefix) throw new Error(`No prefix configured for id kind: ${kind}`);
  return `${prefix}-${pad(state.cursors[key])}`;
}

const members = {
  list: () => Array.from(state.members.values()).map(deepClone),
  get: (id) => (state.members.has(id) ? deepClone(state.members.get(id)) : null),
  create: (data) => {
    const memberId = data.memberId || nextId('member');
    if (state.members.has(memberId)) {
      const err = new Error('Member already exists');
      err.code = 'DUPLICATE_ID';
      throw err;
    }
    const record = { memberId, active: true, ...data, memberId };
    state.members.set(memberId, record);
    return deepClone(record);
  },
};

const providers = {
  list: () => Array.from(state.providers.values()).map(deepClone),
  get: (id) => (state.providers.has(id) ? deepClone(state.providers.get(id)) : null),
  create: (data) => {
    const providerId = data.providerId || nextId('provider');
    if (state.providers.has(providerId)) {
      const err = new Error('Provider already exists');
      err.code = 'DUPLICATE_ID';
      throw err;
    }
    const record = { providerId, active: true, ...data, providerId };
    state.providers.set(providerId, record);
    return deepClone(record);
  },
};

const encounters = {
  list: () => Array.from(state.encounters.values()).map(deepClone),
  get: (id) => (state.encounters.has(id) ? deepClone(state.encounters.get(id)) : null),
  create: (data) => {
    const encounterId = data.encounterId || nextId('encounter');
    if (state.encounters.has(encounterId)) {
      const err = new Error('Encounter already exists');
      err.code = 'DUPLICATE_ID';
      throw err;
    }
    const record = { encounterId, ...data, encounterId };
    state.encounters.set(encounterId, record);
    return deepClone(record);
  },
};

const claims = {
  list: () => Array.from(state.claims.values()).map(deepClone),
  get: (id) => (state.claims.has(id) ? deepClone(state.claims.get(id)) : null),
  create: (data) => {
    const claimId = data.claimId || nextId('claim');
    if (state.claims.has(claimId)) {
      const err = new Error('Claim already exists');
      err.code = 'DUPLICATE_ID';
      throw err;
    }
    const now = new Date().toISOString();
    const record = {
      claimId,
      status: 'DRAFT',
      statusHistory: [{ status: 'DRAFT', at: now }],
      createdAt: now,
      ...data,
      claimId,
    };
    state.claims.set(claimId, record);
    return deepClone(record);
  },
  // Internal mutator used only by the pipeline. Returns the updated clone.
  update: (id, patch) => {
    if (!state.claims.has(id)) return null;
    const current = state.claims.get(id);
    const next = { ...current, ...patch, claimId: id };
    state.claims.set(id, next);
    return deepClone(next);
  },
  // Append a status transition (mutates in place + records history).
  transition: (id, nextStatus) => {
    if (!state.claims.has(id)) return null;
    const current = state.claims.get(id);
    const at = new Date().toISOString();
    current.status = nextStatus;
    current.statusHistory = [...(current.statusHistory || []), { status: nextStatus, at }];
    return deepClone(current);
  },
};

const adjudications = {
  getByClaimId: (claimId) =>
    state.adjudications.has(claimId) ? deepClone(state.adjudications.get(claimId)) : null,
  save: (record) => {
    state.adjudications.set(record.claimId, deepClone(record));
    return deepClone(record);
  },
};

const alerts = {
  list: ({ claimId, category, severity, ruleCode } = {}) => {
    return state.alerts
      .filter((a) => (claimId ? a.claimId === claimId : true))
      .filter((a) => (category ? a.category === category : true))
      .filter((a) => (severity ? a.severity === severity : true))
      .filter((a) => (ruleCode ? a.ruleCode === ruleCode : true))
      .map(deepClone);
  },
  add: (alert) => {
    const record = { ...alert };
    state.alerts.push(record);
    return deepClone(record);
  },
};

const events = {
  list: ({ claimId, eventType } = {}) => {
    return state.events
      .filter((e) => (claimId ? e.claimId === claimId : true))
      .filter((e) => (eventType ? e.eventType === eventType : true))
      .map(deepClone);
  },
  append: (event) => {
    state.events.push({ ...event });
    return deepClone(event);
  },
};

const refData = {
  codes: () => state.refData.codes,
  procedures: () => state.refData.codes.procedures,
  diagnoses: () => state.refData.codes.diagnoses,
  procedureByCode: (code) => state.refData.codes.procedures.find((p) => p.code === code) || null,
  diagnosisByCode: (code) => state.refData.codes.diagnoses.find((d) => d.code === code) || null,
  bundles: () => state.refData.bundles.bundles,
  mueLimit: (code) => state.refData.mue.limits[code] ?? null,
  frequencyWindow: (code) => state.refData.mue._frequencyWindows?.[code] ?? null,
};

module.exports = {
  loadSeed,
  reset: loadSeed,
  nextId,
  members,
  providers,
  encounters,
  claims,
  adjudications,
  alerts,
  events,
  refData,
};
