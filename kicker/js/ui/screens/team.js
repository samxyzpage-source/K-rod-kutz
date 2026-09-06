/**
 * Road to Glory: Kicker — screen 'team' (SPEC §4.5 team row).
 *
 * Depth chart: K1 / K2 cards (you: avatar, OVR bar, attributes, Job Security meter; the rival: the team's other leg
 * — team.kicker2 when you start, team.kicker when you are the backup — with OVR, age, contract years and season line)
 * and the OVR gap (Player.rivalOvr); coach card (name, college coach style from player.flags.coachStyle, aggression
 * from team.coachAgg, trust meter); stadium card (city, climate, dome, surface, altitude, windy / rainy); team
 * OFF / DEF / ST bars; contract card. Everything is read from state.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var Screens = RTG.UI.Screens = RTG.UI.Screens || {};

  function C() { return RTG.UI.C; }
  function K() { return RTG.UI.Kit; }

  function factory(store) {
    var c = C(), Kit = K(), R = RTG.UI.Router;
    var el = c.el('div', { class: 'screen scr-team' });
    var unsub = null, destroyed = false;

    function rivalOf(state, t) {
      var p = state.player;
      if (!t) return null;
      return p.role === 'K1' ? (t.kicker2 || t.kicker || null) : (t.kicker || t.kicker2 || null);
    }

    function youCard(state) {
      var p = state.player, ovr = Kit.ovr(p);
      var head = c.el('div', { class: 'row' }, c.pixelAvatar(p.look, 48), c.el('div', { class: 'col grow', style: 'gap:2px' },
        c.el('strong', { class: 'ellipsis', text: p.name.full }),
        c.el('span', { class: 'row row-wrap small' }, Kit.tip(c.chip(p.role === 'NONE' ? 'FA' : p.role, p.role === 'K1' ? 'gold' : 'grey'), p.role === 'K1' ? 'Starter' : 'Backup'), c.el('span', { class: 'txt-grey', text: 'age ' + p.age + ' · ' + p.foot + ' foot · ' + p.archetype }))));
      var bars = c.el('div', { class: 'stack mt-1' });
      bars.appendChild(Kit.tip(c.bar({ label: 'OVR', value: ovr, kind: 'gold' }), 'Overall rating'));
      RTG.Schema.ATTRS.forEach(function (a) { bars.appendChild(c.bar({ label: a, value: p.attrs[a], pot: p.agentTier >= 2 && p.pot ? p.pot[a] : undefined })); });
      var js = Kit.tip(c.meter({ label: 'JOB', value: p.js, kind: p.js < 25 ? 'red' : '' }), 'Job security ' + Math.round(p.js) + ' — benched below 25, regain the job at 40');
      var line = c.el('p', { class: 'small txt-gold mt-1', text: Kit.fgLine(state.stats.season) });
      return c.card({ title: (p.role === 'K2' ? 'K2 · YOU' : 'K1 · YOU'), kind: 'gold', body: [head, bars, c.el('div', { class: 'mt-1' }, js), line] });
    }

    function rivalCard(state, t) {
      var p = state.player, r = rivalOf(state, t);
      if (!r) return c.card({ title: p.role === 'K1' ? 'K2 · NOBODY' : 'K1 · OPEN', kind: 'flat', body: c.el('p', { class: 'small txt-grey', text: 'No other leg in the room — the job is yours as long as the coach trusts it.' }) });
      var rOvr = typeof r.ovr === 'number' ? r.ovr : (RTG.Player && r.attrs ? RTG.Player.ovr(r.attrs) : 0);
      var gap = Kit.ovr(p) - rOvr;
      var head = c.el('div', { class: 'row' }, Kit.avatar('teammate', 40), c.el('div', { class: 'col grow', style: 'gap:2px' },
        c.el('strong', { class: 'ellipsis', text: r.name || 'The other kicker' }),
        c.el('span', { class: 'row row-wrap small' }, c.chip(p.role === 'K1' ? 'K2' : 'K1', p.role === 'K1' ? 'grey' : 'gold'), c.el('span', { class: 'txt-grey', text: 'age ' + Kit.num(r.age) + (typeof r.contractYears === 'number' ? ' · ' + r.contractYears + ' yr left' : '') }))));
      var bars = c.el('div', { class: 'stack mt-1' });
      bars.appendChild(c.bar({ label: 'OVR', value: rOvr, kind: 'sky' }));
      if (r.attrs) RTG.Schema.ATTRS.forEach(function (a) { bars.appendChild(c.bar({ label: a, value: r.attrs[a], kind: 'sky' })); });
      var cmp = c.el('div', { class: 'row row-wrap mt-1' }, Kit.tip(c.deltaChip(gap), 'Your OVR minus the rival OVR — feeds the job-security regression (+5 per point)'), c.el('span', { class: 'small txt-grey', text: gap >= 0 ? 'You are the better leg on paper.' : 'The rival grades higher — every miss counts double.' }));
      var s = r.seasonStats;
      var line = s ? c.el('p', { class: 'small mt-1', text: 'This season: ' + Kit.fgLine(s) }) : null;
      return c.card({ title: 'RIVAL', kind: 'sky', body: [head, bars, cmp, line] });
    }

    function coachCard(state, t) {
      var p = state.player;
      var style = p.flags && p.flags.coachStyle;
      var rows = [];
      rows.push(['NAME', t && t.coach ? t.coach : '—']);
      if (style) rows.push(['STYLE', Kit.coachStyleText(style)]);
      rows.push(['AGGRESSION', Kit.tip(c.el('span', { text: Kit.aggressionText(t && t.coachAgg) + ' (' + (t ? Math.round(Kit.num(t.coachAgg, 0.5) * 100) : 50) + ')' }), 'How readily the coach sends you out for long attempts')]);
      var trust = Kit.tip(c.meter({ label: 'TRUST', value: p.trust }), 'Coach trust ' + Math.round(p.trust) + ' — attempt range, job-security floor (trust ÷ 5), extension eligibility');
      var ft = RTG.Player && RTG.Player.formText ? RTG.Player.formText(p) : '';
      return c.card({ title: 'COACH', icon: 'team', body: [c.kv(rows), c.el('div', { class: 'mt-1' }, trust), ft ? c.el('p', { class: 'small txt-sky mt-1', text: '“' + ft + '”' }) : null] });
    }

    function stadiumCard(state, t) {
      if (!t) return null;
      var chips = c.el('div', { class: 'chips' }, Kit.climateChip(t),
        Kit.tip(c.chip(String(t.surface || 'grass').toUpperCase(), 'grey'), 'Playing surface'),
        t.altitude ? Kit.tip(c.chip('ALTITUDE', 'sky', 'arrow-u'), 'Thin air: the ball carries further') : null,
        t.windy ? Kit.tip(c.chip('WINDY', 'sky', 'wind'), 'Gusty venue: wider wind draws') : null,
        t.rainy ? Kit.tip(c.chip('RAINY', 'sky', 'rain'), 'Wet venue: more rain games') : null,
        t.bigMarket ? Kit.tip(c.chip('BIG MARKET', 'gold', 'star'), 'Fame ×1.2') : null);
      var W = RTG.Tuning && RTG.Tuning.weather && RTG.Tuning.weather.climates;
      var key = t.dome ? 'dome' : (t.climate || 'temperate');
      var temps = W && W[key] ? W[key].temp : null;
      var months = RTG.Tuning && RTG.Tuning.weather && RTG.Tuning.weather.months || ['Sep', 'Oct', 'Nov', 'Dec', 'Jan'];
      var tempRow = temps ? c.el('div', { class: 'row row-wrap small mt-1 stadium-temps' }, temps.map(function (v, i) { return Kit.tip(c.el('span', { class: 'num' }, months[i] + ' ' + Math.round(v) + '°'), 'Typical ' + months[i] + ' temperature'); })) : null;
      return c.card({ title: 'STADIUM', icon: 'home', body: [c.kv([['CITY', (t.city || '—') + (t.state ? ', ' + t.state : '')], ['CONFERENCE', (t.conf || '—') + (t.div ? ' ' + t.div : '')], t.prestige ? ['PRESTIGE', c.stars(t.prestige)] : null].filter(Boolean)), c.el('div', { class: 'mt-1' }, chips), tempRow] });
    }

    function ratingsCard(state, t) {
      if (!t) return null;
      return c.card({ title: 'TEAM RATINGS', icon: 'stats', body: c.el('div', { class: 'stack' },
        Kit.tip(c.bar({ label: 'OFF', value: Kit.num(t.OFF), kind: 'team' }), 'Offense: drives that reach your range'),
        Kit.tip(c.bar({ label: 'DEF', value: Kit.num(t.DEF), kind: 'team' }), 'Defense: close games and short fields'),
        Kit.tip(c.bar({ label: 'ST', value: Kit.num(t.ST), kind: 'team' }), 'Special teams: blends the kicker rating')) });
    }

    function contractCard(state) {
      var p = state.player, ct = p.contract;
      var rows = [['DEAL', Kit.contractText(ct)]];
      if (ct && ct.type !== 'SCHOLARSHIP' && ct.type !== 'WALKON') rows.push(['TOTAL', c.fmt.money(Kit.num(ct.aav) * Kit.num(ct.years))], ['SIGNING BONUS', c.fmt.money(Kit.num(ct.signingBonus))]);
      if (p.league === 'COLLEGE' || state.stage === 'COLLEGE') rows.push(['NIL', '$' + Kit.num(p.nil) + 'k / yr']);
      rows.push(['EARNINGS', c.fmt.money(Kit.num(state.history && state.history.earnings))]);
      if (p.agentTier) rows.push(['AGENT', 'Tier ' + p.agentTier + (p.agentName ? ' · ' + p.agentName : '')]);
      if (RTG.Contracts && RTG.Contracts.marketValue && (state.stage === 'NFL' || p.league === 'NFL')) {
        try { var mv = RTG.Contracts.marketValue(state); rows.push(['MARKET VALUE', Kit.tip(c.el('span', { class: 'txt-gold num', text: c.fmt.money(mv.aav) + '/yr · ' + Math.round(mv.gtdPct * 100) + '% gtd' }), 'OVR ' + mv.ovr + ' · age ×' + mv.ageMul + ' · fame ×' + mv.fameMul.toFixed(2) + ' · market ×' + mv.marketMul.toFixed(2))]); } catch (e) { /* ignore */ }
      }
      return c.card({ title: 'CONTRACT', icon: 'money', body: c.kv(rows) });
    }

    function render() {
      if (destroyed) return;
      var state = store.state;
      var parts = [c.el('header', { class: 'screen-head' }, c.el('h1', { class: 'screen-title', text: 'TEAM' }))];
      if (!state) { parts.push(c.card({ body: c.el('p', { text: 'No career loaded.' }) })); c.replace(el, parts); return; }
      var t = Kit.userTeam(state);
      if (t) {
        var rec = Kit.recordOf(state, t.id);
        parts.push(c.el('div', { class: 'row team-head card card-team' }, c.crest(t, 48), c.el('div', { class: 'col grow', style: 'gap:2px' }, c.el('strong', { class: 'ellipsis', text: t.name }), c.el('span', { class: 'row row-wrap small' }, rec ? Kit.numEl(rec, 'Record') : null, Kit.rankChip(state, t.id), Kit.teamStars(t)))));
      } else {
        parts.push(c.card({ kind: 'sky', body: c.el('p', { text: state.stage === 'NFL' ? 'No team right now — a free agent waits by the phone.' : 'No team yet.' }) }));
      }
      parts.push(c.el('div', { class: 'grid-2 team-depth' }, youCard(state), rivalCard(state, t)));
      parts.push(coachCard(state, t));
      parts.push(c.el('div', { class: 'grid-2 team-cards' }, stadiumCard(state, t), ratingsCard(state, t)));
      parts.push(contractCard(state));
      parts.push(c.el('div', { class: 'btn-row' }, c.button({ label: 'SCHEDULE', kind: 'ghost', icon: 'clock', onClick: function () { R.go('schedule'); } }), c.button({ label: 'STANDINGS', kind: 'ghost', icon: 'flag', onClick: function () { R.go('standings'); } })));
      c.replace(el, parts);
    }

    render();
    unsub = store.subscribe(function () { render(); });
    return { el: el, destroy: function () { destroyed = true; if (unsub) unsub(); unsub = null; } };
  }

  Screens.team = factory;
  RTG.UI.Router.register('team', factory);
})(typeof window !== 'undefined' ? window : globalThis);
