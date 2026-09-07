/**
 * events.test.js (E3) — SPEC §5.1 row `events` + the data-lint expectations for events/headlines/awards.
 *
 * Runs directly:  node kicker/test/events.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load');
const efx = require('./fixtures/events');
const sfx = require('./fixtures/schema');

const RTG = load();
const { Events, Data, Tuning, Schema, Player } = RTG;
const EV = Tuning.events;

const STAGES = ['HS', 'COLLEGE', 'DRAFT', 'NFL', 'RETIRED'];
const PHASES = ['SHOWCASE', 'OFFERS', 'PRE', 'REG', 'POST', 'AWARDS', 'OFF', 'DECLARE', 'COMBINE', 'DRAFT', 'UDFA', 'LEGACY'];
const SENDERS = ['coach', 'agent', 'gm', 'press', 'fan', 'family', 'teammate', 'sponsor'];
const EFFECT_KEYS = ['morale', 'trust', 'fans', 'fame', 'js', 'xp', 'money', 'attrs', 'mods', 'flags', 'action', 'headline', 'trait', 'injury'];
const ACTIONS = ['TRANSFER', 'TRADE', 'HOLDOUT', 'RETIRE', 'CHANGE_TEAM', 'CAMP_BATTLE', 'SKIP_GAME', 'INJURY', 'HALFTIME70'];
const MOD_KEYS = ['sigma', 'windDrift', 'pressure', 'block', 'range', 'trainMult', 'moraleTarget', 'injury', 'iceImmune'];
const TAGS = ['postgame_win', 'postgame_loss', 'game_winner', 'decisive_miss', 'doink', 'blocked', 'shank', 'fifty_plus', 'perfect_day',
  'bad_day', 'slump', 'hot_streak', 'award', 'contract', 'draft', 'fa', 'cut', 'injury', 'event_consequence', 'weekly_flavor', 'rare'];

const rngOf = (seed) => RTG.RNG.create(seed >>> 0);
/** deepEqual across vm realms (objects built inside the engine context have a different Object prototype). */
const same = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg);
/** Wrap an rng so draws can be counted. */
function counting(rng) {
  let n = 0;
  const next = rng.next.bind(rng);
  rng.next = function () { n++; return next(); };
  return { count: () => n, reset: () => { n = 0; } };
}
const publicEvents = () => Data.events.filter((e) => !e.internal);
const softOk = (p) => ['morale', 'trust', 'fans', 'js'].every((k) => Number.isFinite(p[k]) && p[k] >= 0 && p[k] <= 100) && p.fame >= 0 && p.fame <= Tuning.soft.fame.max;
function assertValid(state, label) {
  const v = Schema.validate(state);
  assert.ok(v.ok, (label || 'state') + ' invalid: ' + v.errors.slice(0, 5).join(' | '));
}
function allEffects(choice) {
  const out = [choice.effects || {}];
  for (const b of choice.branches || []) { out.push(b.effects || {}); if (b.else) out.push(b.else.effects || {}); }
  return out;
}
/** Rich vars so every headline slot resolves from the caller side too. */
const RICH_VARS = { dist: 52, pct: '88 %', score: '24-21', line: '3-for-3', n: 12, award: 'Golden Boot Award', money: 3.4, years: 4, round: 4,
  pick: 118, injury: 'plant-leg strain', title: 'NIL Offer', choice: 'Sign', record: 'longFG', holder: 'Otis Grimm', weather: 'snow' };

// ───────────────────────────── catalog lint ─────────────────────────────

test('catalog: 39 catalog events (incl. 9b), unique ids, ≥ 1 choice each, valid enums', () => {
  const evs = publicEvents();
  assert.equal(evs.length, 39, 'catalog size');
  assert.equal(new Set(evs.map((e) => e.id)).size, evs.length, 'unique ids');
  assert.equal(new Set(evs.map((e) => e.n)).size, evs.length, 'unique catalog numbers');
  for (const e of Data.events) {
    assert.ok(typeof e.id === 'string' && e.title && e.text, e.id + ' fields');
    assert.equal(typeof e.cond, 'function', e.id + ' cond fn');
    assert.ok(Array.isArray(e.stage) && e.stage.length && e.stage.every((s) => STAGES.includes(s)), e.id + ' stage');
    assert.ok(Array.isArray(e.phase) && e.phase.length && e.phase.every((p) => PHASES.includes(p)), e.id + ' phase');
    assert.equal(typeof e.once, 'boolean', e.id + ' once');
    assert.ok(typeof e.weight === 'number' || typeof e.weight === 'function', e.id + ' weight');
    assert.ok(SENDERS.includes(e.sender), e.id + ' sender ' + e.sender);
    assert.ok(Array.isArray(e.choices) && e.choices.length >= 1, e.id + ' choices');
    for (const c of e.choices) {
      assert.ok(c.label && typeof c.preview === 'string', e.id + ' choice label/preview');
      assert.ok(c.effects && typeof c.effects === 'object', e.id + ' effects object');
      for (const eff of allEffects(c)) for (const k of Object.keys(eff)) assert.ok(EFFECT_KEYS.includes(k), `${e.id}: unknown effect key "${k}"`);
      for (const b of c.branches || []) assert.ok(b.p > 0 && b.p < 1, e.id + ' branch p');
    }
  }
  assert.ok(Data.eventsById.NIL_TRUCK && Data.eventsById.COACH_SHOPPING && Data.eventsById.ENDORSEMENT_DRINK);
});

test('catalog: effect values are well-typed (mods keys/ops/expiry, actions, attrs, flags)', () => {
  const s = efx.collegeReg(RTG);
  for (const e of Data.events) for (const c of e.choices) for (const eff of allEffects(c)) {
    for (const k of ['morale', 'trust', 'fans', 'fame', 'js', 'xp', 'injury']) if (eff[k] !== undefined) assert.equal(typeof eff[k], 'number', e.id + ' ' + k);
    if (eff.money !== undefined) assert.ok(typeof eff.money === 'number' || typeof eff.money === 'function', e.id + ' money');
    if (eff.action !== undefined) {
      const a = typeof eff.action === 'function' ? eff.action(s) : eff.action;
      assert.ok(ACTIONS.includes(a), e.id + ' action ' + a);
    }
    if (eff.attrs) for (const a of Object.keys(eff.attrs)) assert.ok(Tuning.progression.attrs.includes(a), e.id + ' attr ' + a);
    if (eff.flags) assert.equal(typeof eff.flags, 'object', e.id + ' flags');
    if (eff.trait) assert.ok(Object.keys(Tuning.progression.traits.creationWeights).concat(['ICE_VEINS', 'COLD_WEATHER', 'DOME_BABY', 'DOINK_KING']).includes(eff.trait), e.id + ' trait');
    for (const m of eff.mods || []) {
      assert.ok(MOD_KEYS.includes(m.key), e.id + ' mod key ' + m.key);
      assert.ok(['mul', 'add'].includes(m.op), e.id + ' mod op');
      assert.equal(typeof m.value, 'number', e.id + ' mod value');
      assert.ok(['week', 'game', 'season', 'never'].includes(m.expires.type), e.id + ' mod expiry');
      if (m.expires.type === 'week' || m.expires.type === 'game') assert.ok(m.expires.n > 0 || m.expires.at >= 0, e.id + ' relative n');
    }
  }
});

test('catalog: §2.10.2 spot checks (effects are the table numbers)', () => {
  const E = Data.eventsById;
  same(E.NIL_TRUCK.choices[0].effects.money, 40);
  assert.equal(E.NIL_TRUCK.choices[0].effects.fame, 30);
  assert.equal(E.NIL_TRUCK.choices[2].branches[0].p, 0.6);
  assert.equal(E.PORTAL_WHISPER.choices[0].effects.action, 'TRANSFER');
  assert.equal(E.HOLDOUT.choices[0].branches[0].p, EV.holdout.extensionProb);
  assert.equal(E.MENTOR.choices[0].effects.xp, 90);
  assert.equal(E.DOINK_VIRAL.choices[0].effects.trait, 'DOINK_KING');
  assert.equal(E.WIND_TUNNEL.choices[0].effects.mods[0].expires.type, 'never');
  assert.equal(E.GURU.choices[0].effects.mods[0].value, EV.guru.sigma);
  assert.equal(E.ENDORSEMENT_DRINK.choices[0].effects.money, 250);
  assert.equal(E.ENDORSEMENT_DRINK.choices[0].branches[0].p, 0.05);
  assert.equal(E.FAN_MAIL.choices.length, 1);
  assert.equal(E.FOG_DELAY.choices.length, 1);
  same(E.HALFTIME_70.choices[0].effects.action, 'HALFTIME70');
  assert.ok(E.WIND_TUNNEL.once && E.MENTOR.once && E.SLEEP_STUDY.once && E.PSYCH.once && E.AGENT_UPGRADE.once);
});

// ───────────────────────────── cond on every stage fixture ─────────────────────────────

test('every cond evaluates on every stage fixture without throwing and returns a boolean-ish', () => {
  const st = efx.stages(RTG);
  for (const name of Object.keys(st)) {
    for (const e of Data.events) {
      let r;
      assert.doesNotThrow(() => { r = e.cond(st[name]); }, `${e.id}.cond threw on ${name}`);
      assert.ok(r === true || r === false || r === null || r === undefined || typeof r === 'number' || typeof r === 'boolean', e.id + ' cond result');
    }
  }
});

test('fixtures: forEvent makes every catalog event eligible; every fixture validates', () => {
  for (const e of publicEvents()) {
    const s = efx.forEvent(RTG, e.id);
    assertValid(s, e.id + ' fixture');
    const ids = Events.eligible(s, s.phase === 'OFF' ? 'offseason' : 'week').map((x) => x.id);
    assert.ok(ids.includes(e.id), e.id + ' should be eligible on its fixture; eligible = ' + ids.join(','));
  }
});

// ───────────────────────────── apply: every choice, clamps, headlines ─────────────────────────────

test('every choice applies: soft stats clamped, state validates, pending cleared, headline + timeline pushed, JSON-safe', () => {
  for (const e of Data.events) {
    for (let ci = 0; ci < e.choices.length; ci++) {
      const s = efx.forEvent(RTG, e.id);
      const rng = rngOf(100 + ci);
      const hl0 = s.headlines.length, tl0 = s.history.timeline.length;
      const inst = Events.force(s, rng, e.id);
      assert.equal(s.pending.kind, 'EVENT');
      assert.equal(inst.choices.length, e.choices.length);
      assert.ok(!/\{/.test(inst.text) && !/\{/.test(inst.title), e.id + ' rendered text has unresolved slot: ' + inst.text);
      for (const c of inst.choices) assert.ok(!/\{/.test(c.label + c.preview), e.id + ' choice text slot');
      const out = Events.apply(s, rng, ci);
      assert.equal(out.id, e.id);
      assert.ok(softOk(s.player), `${e.id}[${ci}] soft stats out of range`);
      assert.ok(Array.isArray(out.actions));
      for (const a of out.actions) assert.ok(ACTIONS.includes(a) && a !== 'HALFTIME70', e.id + ' action ' + a);
      if (out.session) assert.equal(s.pending.kind, 'KICKS'); else assert.equal(s.pending, null, e.id + ' pending cleared');
      assert.equal(s.headlines.length, hl0 + 1, e.id + ' one consequence headline');
      assert.ok(out.headline && out.headline.text && !/\{/.test(out.headline.text), e.id + ' headline text: ' + (out.headline && out.headline.text));
      assert.equal(out.headline.tag, 'event_consequence');
      assert.equal(s.history.timeline.length, tl0 + 1, e.id + ' timeline entry');
      assert.equal(s.history.timeline[tl0].kind, 'EVENT');
      assert.ok(s.recentEventIds.includes(e.id));
      assert.equal((s.flags.eventsFired || {})[e.id], 1);
      assertValid(s, `${e.id}[${ci}] after apply`);
      const clone = JSON.parse(JSON.stringify(s));
      assert.ok(RTG.Util.deepEqual(clone, s), e.id + ' state not JSON-safe');
    }
  }
});

test('clamps: fans → 100, fame → 1000, morale → 0, attrs respect POT/99', () => {
  let s = efx.forEvent(RTG, 'KID_LESSON'); s.player.fans = 98;
  Events.force(s, rngOf(1), 'KID_LESSON'); let out = Events.apply(s, rngOf(1), 0);
  assert.equal(s.player.fans, 100); assert.equal(out.effects.fans, 2);
  s = efx.forEvent(RTG, 'NIL_TRUCK'); s.player.fame = 990;
  Events.force(s, rngOf(1), 'NIL_TRUCK'); out = Events.apply(s, rngOf(1), 0);
  assert.equal(s.player.fame, 1000); assert.equal(out.effects.fame, 10);
  s = efx.forEvent(RTG, 'FAMILY_ILLNESS'); s.player.morale = 3;
  Events.force(s, rngOf(1), 'FAMILY_ILLNESS'); Events.apply(s, rngOf(1), 1);
  assert.equal(s.player.morale, 0);
  assert.equal(s.player.flags.guilt, 3);
});

test('branches respect probabilities (10k trials ±3 %) and pick the branch headline', () => {
  const cases = [['NIL_TRUCK', 2, 0.60], ['PODCAST', 0, 0.20], ['MEDIA_SCRUM_MISS', 2, 0.50], ['ENDORSEMENT_DRINK', 0, 0.05], ['HOLDER_BEEF', 1, 0.10]];
  for (const [id, ci, p] of cases) {
    const s = efx.forEvent(RTG, id);
    const rng = rngOf(4242);
    let hits = 0;
    const N = 10000;
    for (let i = 0; i < N; i++) {
      Events.force(s, rng, id);
      const out = Events.apply(s, rng, ci);
      assert.equal(out.branches.length, 1);
      if (out.branches[0]) hits++;
      s.flags.eventsFired = {};
    }
    const rate = hits / N;
    assert.ok(Math.abs(rate - p) <= 0.03, `${id}[${ci}] branch rate ${rate} vs ${p}`);
    assert.ok(s.headlines.length <= Tuning.save.headlinesCap && s.history.timeline.length <= Tuning.save.timelineCap);
  }
  // headline follows the branch outcome
  const s = efx.forEvent(RTG, 'NIL_TRUCK');
  const rng = rngOf(9);
  const cnt = counting(rng);
  Events.force(s, rng, 'NIL_TRUCK');
  const out = Events.apply(s, rng, 2);
  assert.equal(cnt.count(), 1, 'one draw per branch, none for the headline');
  const tpl = Data.eventsById.NIL_TRUCK.choices[2].branches[0];
  const expected = Events.renderText(out.branches[0] ? tpl.headline : tpl.else.headline, s, {});
  assert.equal(out.headline.text, expected);
});

test('apply: RNG draw order — 0 draws without branches, 1 fallback draw when no headline template exists', () => {
  const s = efx.forEvent(RTG, 'KID_LESSON');
  const rng = rngOf(3); const cnt = counting(rng);
  Events.force(s, rng, 'KID_LESSON'); Events.apply(s, rng, 0);
  assert.equal(cnt.count(), 0);
  // strip the headline template to hit the event_consequence fallback (1 draw)
  const def = Data.eventsById.KID_LESSON;
  const saved = def.choices[1].headline;
  def.choices[1].headline = undefined;
  try {
    cnt.reset(); Events.force(s, rng, 'KID_LESSON'); const out = Events.apply(s, rng, 1);
    assert.equal(cnt.count(), 1);
    assert.equal(out.headline.tag, 'event_consequence');
    assert.ok(!/\{/.test(out.headline.text));
  } finally { def.choices[1].headline = saved; }
});

test('apply: throws without a pending event or with a bad choice index', () => {
  const s = efx.collegeReg(RTG);
  assert.throws(() => Events.apply(s, rngOf(1), 0), /no pending event/);
  Events.force(s, rngOf(1), 'KID_LESSON');
  assert.throws(() => Events.apply(s, rngOf(1), 5), /out of range/);
  assert.equal(s.pending.kind, 'EVENT');
  assert.throws(() => Events.force(s, rngOf(1), 'NOPE'), /unknown event/);
});

// ───────────────────────────── once / recency / roll ─────────────────────────────

test('once respected; recent-event ring (12) excludes and never grows past 12', () => {
  const s = efx.forEvent(RTG, 'SLEEP_STUDY');
  assert.ok(Events.eligible(s, 'week').some((e) => e.id === 'SLEEP_STUDY'));
  Events.force(s, rngOf(1), 'SLEEP_STUDY'); Events.apply(s, rngOf(1), 1);   // "Nah" — no flag set, but once
  s.recentEventIds = [];
  assert.ok(!Events.eligible(s, 'week').some((e) => e.id === 'SLEEP_STUDY'), 'once event never returns');
  // recency: a repeatable event disappears while in the ring
  assert.ok(Events.eligible(s, 'week').some((e) => e.id === 'FAN_MAIL'));
  Events.force(s, rngOf(1), 'FAN_MAIL'); Events.apply(s, rngOf(1), 0);
  assert.ok(!Events.eligible(s, 'week').some((e) => e.id === 'FAN_MAIL'));
  s.recentEventIds = [];
  assert.ok(Events.eligible(s, 'week').some((e) => e.id === 'FAN_MAIL'));
  for (let i = 0; i < 30; i++) { Events.force(s, rngOf(i), publicEvents()[i % 39].id); s.pending = null; }
  assert.equal(s.recentEventIds.length, Tuning.save.recentEventIds);
  assert.equal(new Set(s.recentEventIds).size, s.recentEventIds.length);
});

test('roll: 1 fire draw + 1 pick draw; fires at p = 0.40 (0.55 at Star fame); null with 0 draws when pending exists', () => {
  const base = efx.collegeReg(RTG);
  const rng = rngOf(77); const cnt = counting(rng);
  let fired = 0, N = 3000;
  for (let i = 0; i < N; i++) {
    const s = base; s.pending = null; s.recentEventIds = [];
    cnt.reset();
    const inst = Events.roll(s, rng, 'week');
    if (inst) {
      fired++;
      assert.equal(cnt.count(), 2, 'fire + pick');
      assert.equal(s.pending.kind, 'EVENT'); assert.equal(s.pending.event.id, inst.id);
      assert.equal(inst.rolledWeek, s.week); assert.equal(inst.rolledYear, s.year);
      assert.ok(Data.eventsById[inst.id].cond(s));
    } else assert.equal(cnt.count(), 1, 'fire only');
    delete s.player.flags.eventTick;
  }
  assert.ok(Math.abs(fired / N - EV.weekProb) < 0.04, 'fire rate ' + fired / N);
  // pending → null, 0 draws
  base.pending = { kind: 'DECISION', decision: { kind: 'REDSHIRT', payload: {}, options: [] } };
  cnt.reset(); assert.equal(Events.roll(base, rng, 'week'), null); assert.equal(cnt.count(), 0);
  base.pending = null;
  // Star fame → 0.55
  base.player.fame = 600; fired = 0;
  for (let i = 0; i < N; i++) { base.pending = null; base.recentEventIds = []; delete base.player.flags.eventTick; if (Events.roll(base, rng, 'week')) fired++; }
  assert.ok(Math.abs(fired / N - (EV.weekProb + EV.weekProbFameAdd)) < 0.04, 'star fire rate ' + fired / N);
});

test('roll: offseason slot fires with p = 1 and only offers OFF-phase events; nothing eligible → null after 1 draw', () => {
  const s = efx.collegeOff(RTG);
  const rng = rngOf(5); const cnt = counting(rng);
  const inst = Events.roll(s, rng, 'offseason');
  assert.ok(inst, 'offseason always fires');
  assert.equal(cnt.count(), 2);
  assert.ok(Data.eventsById[inst.id].phase.includes('OFF'));
  // week slot in OFF phase yields nothing eligible
  s.pending = null; cnt.reset();
  assert.equal(Events.roll(s, rng, 'week'), null);
  assert.ok(cnt.count() <= 1);
  // default slot from phase
  s.pending = null;
  assert.ok(Events.roll(s, rng));
});

test('weights: rng.weighted honours event weights (COMEBACK w8 dominates a w2 event pool)', () => {
  const s = efx.forEvent(RTG, 'COMEBACK');          // COMEBACK (8) vs FAMILY_ILLNESS (2), CHARITY (3), KID (3), FAN_MAIL (3), SLEEP (2), PSYCH (4), MENTOR (6)...
  const rng = rngOf(11);
  const seen = {};
  for (let i = 0; i < 2000; i++) {
    s.pending = null; s.recentEventIds = []; delete s.player.flags.eventTick;
    const inst = Events.roll(s, rng, 'week');
    if (inst) seen[inst.id] = (seen[inst.id] || 0) + 1;
  }
  assert.ok(seen.COMEBACK > (seen.FAMILY_ILLNESS || 0) * 2, JSON.stringify(seen));
});

test('determinism: same seed → identical roll/apply sequence', () => {
  const run = (seed) => {
    const s = efx.collegeReg(RTG); const rng = rngOf(seed); const log = [];
    for (let i = 0; i < 40; i++) {
      s.pending = null; s.recentEventIds = []; delete s.player.flags.eventTick;
      const inst = Events.roll(s, rng, 'week');
      if (inst) { const out = Events.apply(s, rng, i % inst.choices.length); log.push(inst.id + ':' + out.headline.text + ':' + JSON.stringify(out.effects)); }
    }
    return log.join('\n') + JSON.stringify(s.player);
  };
  assert.equal(run(31), run(31));
  assert.notEqual(run(31), run(32));
});

// ───────────────────────────── actions ─────────────────────────────

test('actions returned for TRANSFER / TRADE / CAMP_BATTLE / HOLDOUT / CHANGE_TEAM; ultimatum picks by stage', () => {
  const check = (id, ci, expected) => {
    const s = efx.forEvent(RTG, id); Events.force(s, rngOf(1), id);
    const out = Events.apply(s, rngOf(1), ci);
    same(out.actions, expected, id + '[' + ci + ']');
    return s;
  };
  check('PORTAL_WHISPER', 0, ['TRANSFER']);
  const s2 = check('PORTAL_WHISPER', 1, ['CAMP_BATTLE']); assert.equal(s2.player.morale, 65);
  check('TRADE_RUMOR', 0, ['TRADE']);
  check('COACH_SHOPPING', 0, ['CAMP_BATTLE']);
  check('HOLDOUT', 0, ['HOLDOUT']);
  check('CONTENDER_CALL', 0, ['CHANGE_TEAM']);
  check('COACH_ULTIMATUM', 1, ['TRANSFER']);
  const nfl = efx.nflReg(RTG); nfl.player.trust = 20; Events.force(nfl, rngOf(1), 'COACH_ULTIMATUM');
  same(Events.apply(nfl, rngOf(1), 1).actions, ['TRADE']);
  check('ULTIMATUM_FAILED', 0, ['CAMP_BATTLE']);
  check('KID_LESSON', 0, []);
  // timeline impact reflects actions
  const s3 = efx.forEvent(RTG, 'TRADE_RUMOR'); Events.force(s3, rngOf(1), 'TRADE_RUMOR'); Events.apply(s3, rngOf(1), 0);
  assert.equal(s3.history.timeline[s3.history.timeline.length - 1].impact, EV.timelineImpact.action);
});

// ───────────────────────────── modifiers ─────────────────────────────

test('modifiers: appended via Player.addMod with absolute expiry (week/game/season/never), source = event id', () => {
  let s = efx.forEvent(RTG, 'HOLDER_BEEF'); Events.force(s, rngOf(1), 'HOLDER_BEEF'); Events.apply(s, rngOf(1), 0);
  let m = s.player.mods[s.player.mods.length - 1];
  assert.equal(m.key, 'sigma'); assert.equal(m.value, 0.98); same(m.expires, { type: 'week', at: s.week + 4 }); assert.equal(m.source, 'HOLDER_BEEF');
  assert.ok(!s.player.flags.holderBeef, 'dinner clears the beef');
  assert.equal(Player.modValue(s.player, 'sigma', 'mul'), 0.98);
  s = efx.forEvent(RTG, 'SNOW_BOOTS'); s.player.gamesPlayed = 12; Events.force(s, rngOf(1), 'SNOW_BOOTS'); Events.apply(s, rngOf(1), 0);
  const gm = s.player.mods.filter((x) => x.source === 'SNOW_BOOTS');
  assert.equal(gm.length, 2); same(gm[0].expires, { type: 'game', at: 13 }); assert.equal(gm[1].key, 'range');
  assert.equal(Player.expireMods(s.player, { type: 'game', at: 13 }).length, 2);
  s = efx.forEvent(RTG, 'CAPTAIN_VOTE'); Events.force(s, rngOf(1), 'CAPTAIN_VOTE'); Events.apply(s, rngOf(1), 0);
  m = s.player.mods[s.player.mods.length - 1]; same(m.expires, { type: 'season', at: s.year }); assert.equal(m.op, 'add'); assert.equal(m.value, 0.05);
  s = efx.forEvent(RTG, 'WIND_TUNNEL'); Events.force(s, rngOf(1), 'WIND_TUNNEL'); Events.apply(s, rngOf(1), 0);
  m = s.player.mods[s.player.mods.length - 1]; assert.equal(m.expires.type, 'never'); assert.equal(m.key, 'windDrift');
  // offseason-relative weeks count from week 0 of the next season; season mods target next year
  s = efx.forEvent(RTG, 'GURU'); Events.force(s, rngOf(1), 'GURU'); Events.apply(s, rngOf(1), 0);
  m = s.player.mods[s.player.mods.length - 1]; same(m.expires, { type: 'week', at: EV.guru.weeks }); assert.equal(m.value, EV.guru.sigma);
  same(s.player.flags.guru, { pending: true, source: 'GURU' });
  s = efx.forEvent(RTG, 'FAMILY_ILLNESS'); Events.force(s, rngOf(1), 'FAMILY_ILLNESS'); Events.apply(s, rngOf(1), 0);
  const fm = s.player.mods.filter((x) => x.source === 'FAMILY_ILLNESS');
  assert.equal(fm[0].key, 'moraleTarget'); assert.equal(fm[0].expires.type, 'season'); assert.equal(fm[1].key, 'sigma'); assert.equal(fm[1].expires.type, 'game');
  assert.equal(s.player.flags.skipTraining, true);
});

// ───────────────────────────── flags, traits, money, injury, agent ─────────────────────────────

test('flags route to state.flags (career) or player.flags; agentTier/trait/injury/money effects', () => {
  let s = efx.forEvent(RTG, 'AGGRESSIVE_PLAN'); Events.force(s, rngOf(1), 'AGGRESSIVE_PLAN'); Events.apply(s, rngOf(1), 0);
  assert.equal(s.flags.giveMe60, true); assert.equal(s.flags.under55, undefined);
  Events.force(s, rngOf(1), 'AGGRESSIVE_PLAN'); Events.apply(s, rngOf(1), 1);
  assert.equal(s.flags.under55, true); assert.equal(s.flags.giveMe60, undefined);
  s = efx.forEvent(RTG, 'AGENT_UPGRADE'); Events.force(s, rngOf(1), 'AGENT_UPGRADE'); Events.apply(s, rngOf(1), 0);
  assert.equal(s.player.agentTier, 1); assert.equal(s.player.flags.agentFee, 0.05);
  s = efx.forEvent(RTG, 'DOINK_VIRAL'); Events.force(s, rngOf(1), 'DOINK_VIRAL'); Events.apply(s, rngOf(1), 0);
  assert.ok(s.player.traits.includes('DOINK_KING')); assert.equal(s.player.fame, 140 + 40);
  Events.force(s, rngOf(1), 'DOINK_VIRAL'); Events.apply(s, rngOf(1), 0);
  assert.equal(s.player.traits.filter((t) => t === 'DOINK_KING').length, 1, 'trait not duplicated');
  s = efx.forEvent(RTG, 'COMEBACK'); Events.force(s, rngOf(1), 'COMEBACK'); let out = Events.apply(s, rngOf(1), 0);
  assert.equal(s.player.injury.weeksLeft, 3); assert.equal(out.effects.injury, -2); assert.equal(s.player.flags.comebackChoice, 'RUSH');
  s = efx.forEvent(RTG, 'COMEBACK'); s.player.injury.weeksLeft = 4; Events.force(s, rngOf(1), 'COMEBACK'); Events.apply(s, rngOf(1), 1);
  assert.equal(s.player.injury.weeksLeft, 6);
  s = efx.forEvent(RTG, 'COMEBACK'); s.player.injury.weeksLeft = 4; s.player.injury.weeksLeft = 2; Events.force(s, rngOf(1), 'COMEBACK'); Events.apply(s, rngOf(1), 0);
  assert.equal(s.player.injury, null, 'injury cleared at 0 weeks');
  // money: $k → history.earnings ($M), never negative
  s = efx.forEvent(RTG, 'NIL_TRUCK'); const e0 = s.history.earnings; Events.force(s, rngOf(1), 'NIL_TRUCK'); Events.apply(s, rngOf(1), 0);
  assert.ok(Math.abs(s.history.earnings - (e0 + 0.04)) < 1e-9);
  assert.equal(s.player.trust, 60 - 4);
  s = efx.forEvent(RTG, 'PSYCH'); s.history.earnings = 0.005; Events.force(s, rngOf(1), 'PSYCH'); out = Events.apply(s, rngOf(1), 0);
  assert.equal(out.effects.money, -15); assert.equal(s.history.earnings, 0);
  s = efx.forEvent(RTG, 'PSYCH'); s.leagues.college.teams.find((t) => t.id === s.player.teamId).prestige = 5;
  Events.force(s, rngOf(1), 'PSYCH'); out = Events.apply(s, rngOf(1), 0);
  assert.equal(out.effects.money, undefined, 'free at a big program');
  same(s.player.flags.psych, { weeksLeft: EV.psych.weeks, progress: 0, granted: 0 });
  s = efx.forEvent(RTG, 'RETIREMENT_RUMOR'); Events.force(s, rngOf(1), 'RETIREMENT_RUMOR'); Events.apply(s, rngOf(1), 1);
  assert.equal(s.flags.farewell, true);
  s = efx.forEvent(RTG, 'CUT_DAY_CALL'); Events.force(s, rngOf(1), 'CUT_DAY_CALL'); Events.apply(s, rngOf(1), 0);
  same(s.flags.practiceSquad, { weeksLeft: 6 });
});

// ───────────────────────────── trackers: PSYCH, GURU, ultimatum ─────────────────────────────

test('PSYCH: +0.5 CLU per week via flag → +3 after 6 weekly ticks, then DONE (once per week)', () => {
  const s = efx.forEvent(RTG, 'PSYCH'); const clu0 = s.player.attrs.CLU;
  Events.force(s, rngOf(1), 'PSYCH'); Events.apply(s, rngOf(1), 0);
  Events.weeklyTick(s, rngOf(1)); Events.weeklyTick(s, rngOf(1));       // same week → idempotent
  assert.equal(s.player.attrs.CLU, clu0);
  for (let w = 1; w <= 6; w++) { s.week += 1; Events.weeklyTick(s, rngOf(1)); }
  assert.equal(s.player.attrs.CLU, clu0 + EV.psych.cluTotal);
  assert.equal(s.player.flags.psych, 'DONE');
  s.week += 1; Events.weeklyTick(s, rngOf(1));
  assert.equal(s.player.attrs.CLU, clu0 + EV.psych.cluTotal, 'no further gain');
  assertValid(s);
});

test('GURU: σ ×1.2 for 2 weeks, then ACC +2 once the mod has expired (capped by POT)', () => {
  const s = efx.forEvent(RTG, 'GURU'); const acc0 = s.player.attrs.ACC; s.player.pot.ACC = 99;
  Events.force(s, rngOf(1), 'GURU'); Events.apply(s, rngOf(1), 0);
  assert.equal(Player.modValue(s.player, 'sigma', 'mul'), EV.guru.sigma);
  // next season week 1: mod still active → no ACC yet
  efx.at(s, 'REG', 1); Events.weeklyTick(s, rngOf(1));
  assert.equal(s.player.attrs.ACC, acc0);
  s.week = 2; Player.expireMods(s.player, { type: 'week', at: 2 }); Events.weeklyTick(s, rngOf(1));
  assert.equal(s.player.attrs.ACC, acc0 + EV.guru.acc);
  assert.equal(s.player.flags.guru, 'DONE');
  assert.ok(s.headlines[s.headlines.length - 1].text.indexOf('SWING CHANGE') === 0);
  // POT cap
  const s2 = efx.forEvent(RTG, 'GURU'); s2.player.pot.ACC = s2.player.attrs.ACC;
  Events.force(s2, rngOf(1), 'GURU'); Events.apply(s2, rngOf(1), 0); s2.player.mods = [];
  efx.at(s2, 'REG', 3); Events.weeklyTick(s2, rngOf(1));
  assert.equal(s2.player.attrs.ACC, s2.player.pot.ACC);
});

test('COACH_ULTIMATUM: 3-week FG% check → trust +20 on ≥ 85 %; college failure forces ULTIMATUM_FAILED; NFL failure js −20', () => {
  // pass
  let s = efx.forEvent(RTG, 'COACH_ULTIMATUM'); Events.force(s, rngOf(1), 'COACH_ULTIMATUM'); Events.apply(s, rngOf(1), 0);
  assert.equal(s.flags.ultimatum.weeksLeft, EV.ultimatum.weeks);
  assert.ok(!Events.eligible(s, 'week').some((e) => e.id === 'COACH_ULTIMATUM'), 'not re-offered while tracking');
  s.stats.career.fga += 10; s.stats.career.fgm += 9;
  for (let w = 1; w <= 3; w++) {
    s.week += 1; Events.roll(s, rngOf(999), 'week');
    assert.ok(!(s.pending && s.pending.kind === 'EVENT' && s.pending.event.id === 'ULTIMATUM_FAILED'), 'no follow-up on a pass');
    s.pending = null;
  }
  assert.equal(s.player.trust, 20 + EV.ultimatum.trust);
  assert.equal(s.flags.ultimatum, undefined);
  // fail (college) → forced follow-up event with a CAMP_BATTLE choice, 0 extra draws
  s = efx.forEvent(RTG, 'COACH_ULTIMATUM'); Events.force(s, rngOf(1), 'COACH_ULTIMATUM'); Events.apply(s, rngOf(1), 0);
  s.stats.career.fga += 10; s.stats.career.fgm += 5;
  s.week += 1; Events.weeklyTick(s, rngOf(1)); s.week += 1; Events.weeklyTick(s, rngOf(1));
  s.week += 1; const rng = rngOf(1); const cnt = counting(rng);
  const inst = Events.roll(s, rng, 'week');
  assert.ok(inst && inst.id === 'ULTIMATUM_FAILED', 'forced follow-up');
  assert.equal(cnt.count(), 0);
  same(Events.apply(s, rng, 0).actions, ['CAMP_BATTLE']);
  assert.equal(s.player.trust, 20);
  // fail (NFL) → js −20
  s = efx.nflReg(RTG); s.player.trust = 20; Events.force(s, rngOf(1), 'COACH_ULTIMATUM'); Events.apply(s, rngOf(1), 0);
  const js0 = s.player.js;
  for (let w = 1; w <= 3; w++) { s.week += 1; Events.weeklyTick(s, rngOf(1)); }
  assert.equal(s.player.js, js0 + EV.ultimatum.jsNfl);
  assert.equal(s.pending, null);
  assert.ok(/ULTIMATUM FAILED/.test(s.headlines[s.headlines.length - 1].text));
});

// ───────────────────────────── HALFTIME_70 ─────────────────────────────

test('HALFTIME_70: "Try it" requests a one-kick 70-yd KickSession; resolve applies make/miss effects', () => {
  const s = efx.forEvent(RTG, 'HALFTIME_70'); Events.force(s, rngOf(1), 'HALFTIME_70');
  const out = Events.apply(s, rngOf(1), 0);
  same(out.actions, [], 'HALFTIME70 handled internally');
  assert.ok(out.session && s.pending && s.pending.kind === 'KICKS');
  assert.equal(s.pending.session.kind, 'HALFTIME70');
  assert.equal(s.pending.session.contexts.length, 1);
  assert.equal(s.pending.session.contexts[0].distance, EV.halftime70Dist);
  assert.equal(s.pending.session.contexts[0].pressure, EV.halftime70.pressure);
  assertValid(s, 'halftime pending');
  const fame0 = s.player.fame, fans0 = s.player.fans;
  const res = Events.resolveHalftime70(s, rngOf(1), sfx.kickResult({ outcome: 'GOOD', distance: 70 }));
  assert.equal(res.made, true); assert.equal(s.player.fame, fame0 + EV.halftime70.makeFame); assert.equal(s.player.fans, fans0 + EV.halftime70.makeFans);
  assert.equal(s.pending, null);
  assert.ok(/70/.test(res.headline.text) && !/\{/.test(res.headline.text));
  const s2 = efx.forEvent(RTG, 'HALFTIME_70'); Events.force(s2, rngOf(1), 'HALFTIME_70'); Events.apply(s2, rngOf(1), 0);
  const m0 = s2.player.morale, f0 = s2.player.fans;
  Events.resolveHalftime70(s2, rngOf(1), sfx.kickResult({ outcome: 'SHORT', distance: 70 }));
  assert.equal(s2.player.fans, f0 + EV.halftime70.missFans); assert.equal(s2.player.morale, m0 + EV.halftime70.missMorale);
  // declining does nothing
  const s3 = efx.forEvent(RTG, 'HALFTIME_70'); Events.force(s3, rngOf(1), 'HALFTIME_70'); Events.apply(s3, rngOf(1), 1);
  assert.equal(s3.pending, null);
});

// ───────────────────────────── headlines ─────────────────────────────

test('headline bank: ≥ 160 templates, every §2.11 tag present, unique ids, conds are functions', () => {
  assert.ok(Data.headlines.length >= 160, 'templates: ' + Data.headlines.length);
  assert.equal(new Set(Data.headlines.map((h) => h.id)).size, Data.headlines.length);
  for (const tag of TAGS) assert.ok((Data.headlinesByTag[tag] || []).length >= 1, 'tag ' + tag);
  for (const h of Data.headlines) {
    assert.ok(Array.isArray(h.tags) && h.tags.length >= 1 && typeof h.text === 'string' && h.text.length > 10, h.id);
    if (h.cond !== undefined) assert.equal(typeof h.cond, 'function', h.id + ' cond');
    if (h.w !== undefined) assert.ok(h.w > 0);
  }
  assert.ok(Data.headlines.filter((h) => h.tags.includes('bad_day')).length <= Data.headlines.length * 0.5);
  const rare = Data.headlinesByTag.rare.map((h) => h.text).join(' ');
  assert.ok(/PERFECT SEASON/.test(rare) && /0-FOR-3/.test(rare) && /SIXTY IN THE SNOW/.test(rare) && /ICE DOES NOTHING TO THIS MAN/.test(rare));
});

test('every headline & message template renders with no unresolved "{" on college and NFL fixtures', () => {
  for (const s of [efx.collegeReg(RTG), efx.nflReg(RTG), sfx.hsShowcase(RTG)]) {
    for (const h of Data.headlines) {
      const t = Events.renderText(h.text, s, RICH_VARS);
      assert.ok(!/\{/.test(t), h.id + ' → ' + t);
      const bare = Events.renderText(h.text, s, {});
      assert.ok(!/\{/.test(bare), h.id + ' (no vars) → ' + bare);
    }
    for (const kind of Object.keys(Data.messages)) for (const m of Data.messages[kind]) {
      const t = Events.renderText(m.text, s, {});
      assert.ok(!/\{/.test(t), m.id + ' → ' + t);
    }
    for (const e of Data.events) {
      assert.ok(!/\{/.test(Events.renderText(e.text, s, {})) && !/\{/.test(Events.renderText(e.title, s, {})), e.id);
      for (const c of e.choices) {
        const hs = [c.headline].concat((c.branches || []).map((b) => b.headline), (c.branches || []).map((b) => b.else && b.else.headline)).filter(Boolean);
        for (const h of hs) assert.ok(!/\{/.test(Events.renderText(h, s, { title: e.title, choice: c.label })), e.id + ' headline ' + h);
      }
    }
  }
});

test('headline(): 1 draw, cond-filtered, pushed to state.headlines (cap 40), ring never repeats within 40, slots from state', () => {
  const s = efx.collegeReg(RTG);
  const rng = rngOf(21); const cnt = counting(rng);
  const hl = Events.headline(s, rng, 'game_winner', { dist: 52 });
  assert.equal(cnt.count(), 1);
  assert.equal(s.headlines[s.headlines.length - 1], hl);
  assert.equal(hl.tag, 'game_winner'); assert.equal(hl.year, s.year); assert.equal(hl.week, s.week);
  assert.ok(/52/.test(hl.text) && /Booter/.test(hl.text), hl.text);
  assert.ok(s.recentHeadlineIds.includes(hl.tpl));
  // ring: drawing the fresh weekly_flavor pool never repeats a template
  s.recentHeadlineIds = []; s.headlines = [];
  const seen = new Set();
  for (let i = 0; i < 15; i++) { const h = Events.headline(s, rng, 'weekly_flavor', {}); assert.ok(!seen.has(h.tpl), 'repeat ' + h.tpl + ' at ' + i); seen.add(h.tpl); }
  for (let i = 0; i < 120; i++) Events.headline(s, rng, TAGS[i % TAGS.length], RICH_VARS);
  assert.equal(s.headlines.length, Tuning.save.headlinesCap);
  assert.ok(s.recentHeadlineIds.length <= Tuning.save.recentHeadlineIds);
  assert.equal(new Set(s.recentHeadlineIds).size, s.recentHeadlineIds.length, 'ring has no duplicates');
  assert.equal(new Set(s.headlines.map((h) => h.id)).size, s.headlines.length, 'instance ids unique');
  // cond: an iced game-winner with CLU ≥ 90 can produce the rare line; a non-iced one never does
  const s2 = efx.nflReg(RTG); s2.player.attrs.CLU = 92;
  let rareHit = false;
  for (let i = 0; i < 40; i++) { s2.recentHeadlineIds = []; const h = Events.headline(s2, rng, 'rare', { iced: true, made: true, dist: 48 }); if (/ICE DOES NOTHING/.test(h.text)) rareHit = true; }
  assert.ok(rareHit);
  for (let i = 0; i < 40; i++) { s2.recentHeadlineIds = []; const h = Events.headline(s2, rng, 'rare', { iced: false, made: true, dist: 48, perfectSeason: true }); assert.ok(!/ICE DOES NOTHING/.test(h.text)); }
  // unknown tag → generated line, still 1 draw, no braces
  cnt.reset(); const g = Events.headline(s, rng, 'no_such_tag', {});
  assert.equal(cnt.count(), 1); assert.ok(g.text.length > 0 && !/\{/.test(g.text));
  assertValid(s);
});

test('draft headlines: the round / pick lines need a real draft result; declare, combine and undrafted contexts get their own lines, never "round ?"', () => {
  const s = efx.collegeReg(RTG);
  const rng = rngOf(23);
  const draw = (vars) => { s.recentHeadlineIds = []; return Events.headline(s, rng, 'draft', vars); };
  for (let i = 0; i < 30; i++) {
    const dec = draw({ declared: true, round: '?', text: '{last} declares for the draft' });
    assert.ok(/DECLARED/.test(dec.text) && !/round \?|pick 120|\bDRAFTED:/.test(dec.text), dec.text);
    const comb = draw({ combine: true, dist: 55, round: '?', n: 3, text: '{last} at the combine' });
    assert.ok(/Combine buzz/.test(comb.text) && /55/.test(comb.text) && !/round \?/.test(comb.text), comb.text);
    const und = draw({ undrafted: true, text: '{last} goes undrafted' });
    assert.ok(/UNDRAFTED/.test(und.text) && !/round \?/.test(und.text), und.text);
    // no facts at all (a join after the draft): the caller's text, never a round / pick template
    const bare = draw({ round: '?', text: '{last} joins the team' });
    assert.equal(bare.tpl, 'gen:draft'); assert.ok(/joins the team/.test(bare.text) && !/\?/.test(bare.text), bare.text);
    // a real result: the round is named, no fallbacks leak
    const got = draw({ round: 3, pick: 65, team: 'Boston Harbormen' });
    assert.ok(/round 3|round-3/.test(got.text) && !/\?/.test(got.text), got.text);
    assert.ok(!/\?/.test(draw({ round: 1, pick: 12, team: 'Boston Harbormen' }).text));
    assert.ok(!/\?/.test(draw({ round: 7, pick: 240, team: 'Boston Harbormen' }).text));
  }
  assertValid(s);
});

// ───────────────────────────── inbox ─────────────────────────────

test('message bank: ≥ 60 templates across coach/agent/gm/press/fan/family kinds', () => {
  const kinds = Object.keys(Data.messages);
  const total = kinds.reduce((n, k) => n + Data.messages[k].length, 0);
  assert.ok(total >= 60, 'messages: ' + total);
  for (const pfx of ['coach_', 'agent_', 'gm_', 'press_', 'fan_', 'family_']) assert.ok(kinds.some((k) => k.indexOf(pfx) === 0), pfx);
  assert.ok(Data.messages.coach_form_sharp && Data.messages.coach_form_watch && Data.messages.coach_js_low && Data.messages.agent_final_year);
  const ids = [];
  for (const k of kinds) for (const m of Data.messages[k]) { assert.ok(m.id && m.from && m.text, k); ids.push(m.id); }
  assert.equal(new Set(ids).size, ids.length, 'unique message ids');
});

test('message(): deterministic (no rng), pushes to inbox with cap 60, kinds, markRead', () => {
  const s = efx.nflReg(RTG);
  const n0 = s.inbox.length;
  const m = Events.message(s, 'coach_pregame', {});
  assert.equal(s.inbox.length, n0 + 1);
  assert.equal(m.from, 'coach'); assert.equal(m.kind, 'note'); assert.equal(m.read, false); assert.equal(m.year, s.year); assert.equal(m.week, s.week);
  assert.ok(!/\{/.test(m.text));
  const r = Events.message(s, 'result_win', { score: '24-21', line: '2-for-2' });
  assert.equal(r.kind, 'result'); assert.ok(/24-21/.test(r.text));
  const e = Events.message(s, 'agent_extension', { kind: 'event' });
  assert.equal(e.kind, 'event'); assert.equal(e.from, 'agent');
  const u = Events.message(s, 'no_such_kind', { from: 'gm', text: 'Custom line' });
  assert.equal(u.text, 'Custom line'); assert.equal(u.from, 'gm');
  assert.ok(Events.markRead(s, m.id)); assert.equal(m.read, true); assert.ok(!Events.markRead(s, 'nope'));
  for (let i = 0; i < 100; i++) Events.message(s, 'fan_love', {});
  assert.equal(s.inbox.length, Tuning.save.inboxCap);
  assert.equal(new Set(s.inbox.map((x) => x.id)).size, s.inbox.length);
  // determinism: two identical states produce the same message
  const a = efx.nflReg(RTG), b = efx.nflReg(RTG);
  same(Events.message(a, 'coach_loss', {}), Events.message(b, 'coach_loss', {}));
  assertValid(s);
});

test('renderText: state slots (name/team/city/coach/opp/rival/week/year), vars override, money formatting, unknown slots vanish', () => {
  const s = efx.collegeReg(RTG);
  const tm = s.leagues.college.teams.find((t) => t.id === s.player.teamId);
  const t = Events.renderText('{last} of {team} ({city}) under {coach}, week {week} of {year}; {bogus}!', s, {});
  assert.ok(t.indexOf('Booter of ' + (tm.school || tm.name) + ' (' + tm.city + ') under ' + tm.coach) === 0, t);
  assert.ok(t.indexOf('week 5 of ' + Schema.calendarYear(1) + '; !') > 0, t);
  assert.equal(Events.renderText('{dist} yd for {money}', s, { dist: 47, money: 3.4 }), '47 yd for ' + RTG.Util.fmtMoney(3.4));
  assert.equal(Events.renderText('vs {opp} and {rival}', s, {}).indexOf('{'), -1);
  assert.ok(/Randy/.test(Events.renderText(Data.eventsById.NIL_TRUCK.text, s, {})));
  const slots = Events.slots(s, { n: 4 });
  assert.equal(slots.n, 4); assert.equal(slots.last, 'Booter'); assert.equal(slots.pct, '75 %');
});

// ───────────────────────────── awards data ─────────────────────────────

test('awards catalog: §2.8 rows with id/league/name/rule/xp/fame/description; rewards match Tuning', () => {
  const A = Data.awards;
  assert.ok(A.length >= 21, 'rows: ' + A.length);
  assert.equal(new Set(A.map((a) => a.id)).size, A.length);
  for (const a of A) {
    assert.ok(['COLLEGE', 'NFL', 'BOTH'].includes(a.league), a.id);
    assert.ok(a.name && a.rule && typeof a.description === 'string', a.id);
    assert.ok(Number.isInteger(a.xp) && a.xp >= 0 && Number.isInteger(a.fame) && a.fame >= 0, a.id);
    const r = Tuning.awards.rewards[a.id];
    if (r) { assert.equal(a.xp, r.xp, a.id + ' xp'); assert.equal(a.fame, r.fame, a.id + ' fame'); }
  }
  const by = Data.awardsById;
  assert.equal(by.GOLDEN_BOOT.xp, 200); assert.equal(by.GOLDEN_LEG.fame, 150); assert.equal(by.STPOY.xp, 220);
  assert.equal(by.CHAMPIONSHIP_MVP.fame, 300); assert.equal(by.COMEBACK_LEG.league, 'NFL');
  same(A.filter((a) => a.rule === 'GOAL').map((a) => a.xp), Tuning.awards.goalXp);
  assert.equal(Data.awardsFor('COLLEGE').filter((a) => a.league === 'NFL').length, 0);
  assert.ok(Data.awardsFor('NFL').some((a) => a.id === 'SEASON_GOAL_1'));
});

// ───────────────────────────── namespace ─────────────────────────────

test('§3.5.14 surface', () => {
  for (const f of ['roll', 'apply', 'force', 'headline', 'message', 'markRead', 'renderText', 'eligible', 'weeklyTick', 'halftimeSession', 'resolveHalftime70', 'slots']) {
    assert.equal(typeof Events[f], 'function', f);
  }
  assert.ok(Array.isArray(Data.events) && Data.eventsById && Array.isArray(Data.headlines) && Data.messages && Array.isArray(Data.awards));
});
