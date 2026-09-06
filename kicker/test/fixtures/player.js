/**
 * Player fixtures (E1). Attribute profiles from SPEC §2.3.6, ready-made Player
 * objects, and CareerStates positioned for Player.* calls.
 *
 *   const pfx = require('./fixtures/player');
 *   const attrs = pfx.profiles.elite;                     // {ACC:92, CON:90, CLU:88, POW:82, KO:80}
 *   const state = pfx.stateWith(RTG, {attrs: attrs, age: 28});   // COLLEGE.REG week 5 state with a patched player
 *   const summary = pfx.gameSummary([{distance: 42, made: true}, {distance: 52, made: false}]);
 */
'use strict';

var schemaFx = require('./schema');

/** §2.3.6 profiles (KO added so the attrs object is complete). */
var profiles = {
  college: { ACC: 55, CON: 50, CLU: 50, POW: 58, KO: 50 },
  rookie: { ACC: 60, CON: 55, CLU: 55, POW: 62, KO: 55 },
  vet: { ACC: 78, CON: 75, CLU: 70, POW: 72, KO: 70 },
  elite: { ACC: 92, CON: 90, CLU: 88, POW: 82, KO: 80 }
};

/** Attrs in the canonical key order {POW, ACC, CON, CLU, KO}. */
function attrs(profile) {
  var p = profiles[profile] || profiles.rookie;
  return { POW: p.POW, ACC: p.ACC, CON: p.CON, CLU: p.CLU, KO: p.KO };
}

/**
 * A Player from Player.create with a fixed seed, then overrides applied shallowly
 * (attrs/pot merged).
 * @param {object} RTG @param {object} [o] overrides (+ seed, archetype) @returns {object} Player
 */
function player(RTG, o) {
  o = o || {};
  var rng = RTG.RNG.create((o.seed === undefined ? 11 : o.seed) >>> 0);
  var p = RTG.Player.create(rng, { name: o.name || 'Sam Booter', archetype: o.archetype || 'SURGEON', foot: o.foot, stars: o.stars });
  return patch(p, o);
}

/** Apply overrides to a player in place (attrs/pot/flags merged, other keys replaced). */
function patch(p, o) {
  Object.keys(o).forEach(function (k) {
    if (k === 'seed' || k === 'archetype' || k === 'name' || k === 'stars') return;
    if ((k === 'attrs' || k === 'pot' || k === 'flags') && o[k] && typeof o[k] === 'object') {
      Object.keys(o[k]).forEach(function (a) { p[k][a] = o[k][a]; });
    } else if (k === 'traits' || k === 'mods') {
      p[k] = o[k].slice();
    } else {
      p[k] = o[k];
    }
  });
  return p;
}

/**
 * A valid CareerState (COLLEGE.REG week 5 by default; pass stage:'NFL' for NFL.REG week 9)
 * whose player is patched with the overrides.
 * @param {object} RTG @param {object} [o] player overrides; o.stage selects the base fixture; o.difficulty sets state.difficulty
 * @returns {object} CareerState
 */
function stateWith(RTG, o) {
  o = o || {};
  var state = o.stage === 'NFL' ? schemaFx.nflRegWeek9InGame(RTG, { seed: o.seed }) : schemaFx.collegeRegWeek5(RTG, { seed: o.seed });
  if (o.stage === 'NFL') state.game = null;
  if (o.difficulty) state.difficulty = o.difficulty;
  var po = {};
  Object.keys(o).forEach(function (k) { if (k !== 'stage' && k !== 'difficulty' && k !== 'seed') po[k] = o[k]; });
  patch(state.player, po);
  return state;
}

/**
 * A minimal GameSummary for Player.updateJobSecurity from a list of kicks
 * [{distance, made, decisive?, blocked?, type?}].
 * @param {object[]} kicks @param {{won?:boolean}} [o] @returns {object}
 */
function gameSummary(kicks, o) {
  o = o || {};
  var rows = kicks.map(function (k, i) {
    return {
      id: 'gs' + i, type: k.type || 'FG', distance: k.distance, made: !!k.made,
      outcome: k.made ? 'GOOD' : (k.blocked ? 'BLOCKED' : 'WIDE_L'),
      tags: k.decisive ? ['decisive'] : []
    };
  });
  var fga = rows.filter(function (r) { return r.type === 'FG'; }).length;
  var fgm = rows.filter(function (r) { return r.type === 'FG' && r.made; }).length;
  return {
    gameId: 'fxg', score: { home: 21, away: 17 }, won: o.won !== undefined ? o.won : true,
    userLine: { fga: fga, fgm: fgm, pat: 0, patMade: 0, long: 0, gw: rows.some(function (r) { return r.made && r.tags.indexOf('decisive') >= 0; }) ? 1 : 0 },
    grade: 'B', xp: { items: [], total: 0 }, meters: {}, headline: '', kicks: rows, drives: []
  };
}

/** A Modifier literal. */
function mod(o) {
  o = o || {};
  return {
    id: o.id || ('fx-' + (o.key || 'sigma')), key: o.key || 'sigma', op: o.op || 'mul',
    value: o.value !== undefined ? o.value : 1.1,
    expires: o.expires || { type: 'week', at: 6 }, label: o.label || 'fixture', source: o.source || 'test'
  };
}

module.exports = {
  profiles: profiles,
  attrs: attrs,
  player: player,
  patch: patch,
  stateWith: stateWith,
  gameSummary: gameSummary,
  mod: mod,
  kickContext: schemaFx.kickContext,
  kickResult: schemaFx.kickResult
};
