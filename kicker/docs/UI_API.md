# Road to Glory: Kicker — UI API (as built, package U1: app shell)

**Status:** the shared UI contract implemented by `kicker/js/ui/{storage,palette,store,router,components,app}.js`,
`kicker/js/debug.js`, `kicker/css/style.css` and the shell-owned screens (`title`, `newcareer`, `settings`, `saves`,
`_fallback`). The kick-scene engineer (U2) and the screens engineer build against **this** document. Where it differs
from SPEC §4.4 the difference is listed in §11. Engine calls follow `docs/ENGINE_API.md`.

**Refreshed for D23–D27** (SPEC §0.4): the senior season and the camps (`hsseason` / `hsgame` / `hscamps` / `hscamp`,
`Engine.hsStartGame` / `hsStartCamp`), the uncapped signature attribute on the training screen, the venue-sized
stadiums (`KickView.VENUES` / `venueOf`), and the money system (`finances`, `Kit.money`, the hub's bank chip,
`RTG.debug.money`) — §1, §2.1, §3, §4.1–4.2, §7–§11 below.

Conventions: every file is a classic script using the SPEC §3.3 shim and attaches to `RTG.UI.*`; no modules, no
build, no fetch, no images; must parse on Safari 12 / Chrome 70 (no optional chaining, nullish coalescing or class
fields). The UI never derives game rules — every number comes from `state` or an engine read helper — and changes
state only through `store.dispatch`.

---

## 1. Load order and boot

`index.html` loads: engine (test/load.js `ORDER`: `00_namespace`, `engine/tuning … schema`, the data files incl.
`data/finance`, `engine/names … career`, `engine/hs`, `engine/finance`, `engine/save`, `engine/api`) → `ui/storage,
ui/palette, ui/store, ui/router, ui/components` → `ui/sprites, ui/canvas, ui/audio, ui/input, ui/kickview` (U2) →
`ui/screens/*` (`_fallback` first; incl. `hsseason`, `hsgame`, `hscamps`, `hscamp`, `finances`) → `ui/app` →
`debug`. Files that do not exist yet 404 harmlessly; **everything is guarded at call time** (`RTG.UI.KickView`,
`RTG.UI.Canvas`, screen ids…).

`app.js` boots on `DOMContentLoaded` (`RTG.UI.boot()`, idempotent): creates `RTG.UI.store` (+ `RTG.UI.uiRng`),
builds the chrome inside `#app`, mounts the Router into `<main class="screen-host">`, applies the settings body
classes, wires resize (debounced 100 ms → `Router.resize()` → live screen `onResize`), `keydown` (→ live screen
`onKey`, unless a modal is open or the target is a form field), autosave on `pagehide` / `visibilitychange`,
then `Router.sync()` (or `store.load('auto')` with `?load=auto`). With `?debug=1` it mounts the debug panel.

---

## 2. `RTG.UI.Store` — singleton `RTG.UI.store`

| Member | Description |
|---|---|
| `store.state` | live `CareerState` or `null` (no career) |
| `store.rng` | the career `RTG.RNG` instance (never hand it to the UI cosmetics) |
| `store.settings` | UI settings (persisted at `rtg.settings`, see §2.2) |
| `store.uiRng` | cosmetics RNG seeded from `Date.now()`; **never** passed to the engine |
| `store.autoKickAll` | `RTG.debug.autoKick(true)` flag: kick scenes must resolve every user kick via `dispatch('autoKick')` / `dispatch('sessionKick', null)` immediately |
| `store.lastDispatch` | `{fnName, result, at, forced?}` of the last dispatch / touch |
| `store.dispatch(fnName, ...args) → result` | calls `RTG.Engine[fnName](state, rng, ...args)` — see §2.1 |
| `store.subscribe(fn) → unsubscribe` | `fn({fnName, result, args, store, forced?})` after every dispatch, `touch`, `replace`, `settings`, `records` |
| `store.replace(state, rng?)` | swap the live state (rng rebuilt from `state.rngState` when omitted), **always** rebuild the UI-owned `state.settings` mirror from `store.settings` (`Schema.mirrorSettings`) so a loaded / imported career runs on the player's current Auto-PAT · Play kickoffs · sim speed, then `Router.sync()` and notify `'replace'` |
| `store.clear()` | drop the career (title screen) |
| `store.newCareer(opts)` | `Engine.newCareer(opts, Date.now())` (opts.settings defaults to the UI settings) → replace → autosave |
| `store.hasCareer()` | `!!state` |
| `store.save(slot) → {ok, error?, key, bytes, persisted, savedAt}` | slot `'1'|'2'|'3'|'auto'` (or a full `rtg.save.*` key). `persisted:false` = the write fell back to the in-memory map (quota / private mode); the save is still readable for the rest of the session (§6) and subscribers are notified **once per session** with `{fnName:'storage', result:{persisted:false, key, available}}`, which app.js turns into a warning toast |
| `store.load(slot | blob) → {ok, error?, code?, warnings, migrated, summary}` | `Save.deserialize` → replace; codes `NEWER / CHECKSUM / INVALID / NO_MIGRATION / EMPTY / PARSE`; the message is in `error` |
| `store.loadBlob(blob)` | same for an in-memory blob (the Saves import path) |
| `store.autosave() → boolean` | writes `rtg.save.auto` (never throws) |
| `store.blob()` | the current save blob (`Engine.save(state, rng, now)`) — for `Save.exportString` |
| `store.slotSummary(slot)` | `Save.slotSummary` of a slot or `null` |
| `store.deleteSlot(slot)` | |
| `store.saveSettings()` / `store.setSetting(key, value)` / `store.resetSettings()` | persist, mirror `autoPat / playKickoffs / simSpeed` into `state.settings` (`Schema.mirrorSettings`), notify `'settings'` |
| `store.touch(fnName, result, {forced, noSync, autosave})` | notify (+ sync unless `noSync`) without an engine call — debug tools and forced kicks use it |
| `store.isDebug()` | `?debug=1` or `RTG.debug.strict` |
| `store.listenerCount()` | subscriber count (`RTG.debug.perf().storeListeners`) |
| `store.getRecords()` / `store.addCareerRecord(entry)` | the cross-save `rtg.records` block `{careers[], best{}}`; the legacy screen calls `addCareerRecord({seed, name, tier, hof, fgm, long, gw, seasons})` |
| `RTG.UI.Store.KEYS` | `{settings:'rtg.settings', records:'rtg.records', auto:'rtg.save.auto', slot(n)}` |

### 2.1 `dispatch` rules (binding)

1. `RTG.Engine[fnName](state, rng, ...args)`; for **`spendXp`, `autoSpend`, `autoOption`** (engine signature without an
   rng) the call is `(state, ...args)`. `newCareer`, `save`, `load` are not dispatchable (use the store methods).
2. `state.rngState = rng.state()` is written back.
3. In debug mode `RTG.Schema.validate(state)` runs and **throws** `Error('Schema invalid after <fn>: …')` on errors.
4. **Autosave** (`rtg.save.auto`) after `finishUserGame, endWeek, chooseEvent, decide, nextPhase, autoPlayGame,
   autoPlayWeek, autoPlaySeason, autoPlayOffseason, autoPlayCareer, settlePending, hsStartGame, hsStartCamp`
   (`Store.AUTOSAVE`), and after `sessionKick` when the result has `done === true` — so a mid-game or mid-camp
   save/load lands back on `hsgame` / `hscamp`.
5. **`Router.sync()`** is called after every dispatch **except** these in-scene functions, whose calling scene owns
   the transition: `simStep, simToKick, applyUserKick, autoKick, applyUserKickoff` (game loop), `sessionKick`
   (session scenes call `Router.sync()` after their result beat), `finishUserGame` (the game screen goes to
   `postgame` itself), `train, spendXp, autoSpend, autoOption, markRead` (never change the route). The inbox marks
   messages read with `dispatch('markRead', '*')` (`Engine.markRead(state, rng, id | ids | '*')`); subscribers see
   `fnName === 'markRead'` and may skip a re-render.
6. Subscribers are notified **after** the sync (a screen destroyed by the sync is already unsubscribed).
7. Engine errors propagate (they are programming errors); wrap UI handlers that may hit a precondition and toast.

### 2.2 Settings (`rtg.settings`)

```
{ audio: true, autoPat: 'off'|'safe'|'all', playKickoffs: false, simSpeed: 1|2|4,
  colorblind: false, highContrast: false, reducedMotion: false, fontScale: 1|1.25|1.5,
  leftFooted: false, inputMode: 'meter'|'flick' (default 'meter' = aim-then-hold), playClockMult: 1|2, tooltips: true, haptics: true,
  greenAssist: true,            // D21: a release inside the green band is a guaranteed make (aim-and-hold only)
  kickInputV2: true,            // migration marker: pre-aim-and-hold settings are moved onto 'meter' once
  keys: { confirm: ' ', confirmAlt: 'Enter', left: 'ArrowLeft', right: 'ArrowRight' } }
```
`RTG.UI.Store.defaultSettings()` / `sanitizeSettings(raw)`. `app.js` mirrors them to classes on **both** `<body>`
and `<html>`: `.cb .hc .reduced-motion .font-scale-125 .font-scale-150 .left-footed .no-tooltips`, plus
`body[data-input-mode]`. `RTG.UI.Shell.reducedMotion()` = setting OR `prefers-reduced-motion`.

---

## 3. `RTG.UI.Router`

| Member | Description |
|---|---|
| `Router.register(id, factory)` | `factory(store, params) → {el, destroy(), onResize?(), onKey?(ev) → true when handled, keysInFields?: boolean}` — see §7 for `keysInFields` |
| `Router.has(id)` / `Router.ids()` | |
| `Router.mount(rootEl)` | done by app.js (`.screen-host`) |
| `Router.go(id, params?, {replace?, keepScroll?})` | destroys the live screen, mounts the new one (adds `.screen`, `data-screen`), pushes the previous one on a stack ≤ 8 unless `replace`, scrolls to top, emits `onChange` |
| `Router.back()` | pops the stack; empty stack → `sync()` |
| `Router.current() → id` · `Router.params()` · `Router.screen()` | the live id / params / instance |
| `Router.resolve(state) → {id, params, event?}` | **pure** SPEC §3.6 table (below) |
| `Router.sync(opts?)` | routes from `store.state` with the stay rules (below); opens the event modal. `opts.force` skips the stay rules and always (re)mounts the resolved screen — `store.replace` (load / import / new career) uses it so a loaded career lands on its own screen |
| `Router.onChange(fn) → unsubscribe` | `fn({id, prevId, params, wanted})` |
| `Router.eventModal` | `fn(event, store)` hook — app.js installs the generic modal; `inbox.js` may replace it |
| `Router.resize()` / `Router.key(ev)` | forwarders used by app.js |
| `Router.FREE` / `Router.CHROMELESS` | screen-id sets (below) |

**Routing table** (`Router.resolve`): no state → `title`; `state.game` → `kick` (`{mode:'game'}`) when
`game.pending`, else `game`; `pending.kind === 'KICKS'` → by `session.kind`: `HS_GAME → hsgame`, `RECRUIT_CAMP →
hscamp`, `CAMP → campbattle`, `COMBINE_* → combine`, anything else (`HALFTIME70 / PRACTICE / TRYOUT`) → `kick`
(`{mode:'session', session}`); `EVENT` → `{id:'hub', event:true}` (keep the current hub-family screen, open the
modal); `DECISION` → `OFFERS_COLLEGE → offers`, `UDFA / FREE_AGENCY / EXTENSION / TAG / CUT_NOTICE / MIN → contract`
(`{kind}`), `HOF → legacy`, `COMBINE_PLAN → combine` (the combine screen owns the plan card), **`FINANCES →
finances`** (the books, D27 — checked before the offseason fallback; the wizard's own FINANCES card is only a door to
it), everything else → `offseason` (`{kind}`); stage `DRAFT`: phase `DRAFT → draft`, `COMBINE → combine`, else
`offseason`; stage `HS` (D23/D26): phase `OFFERS → offers`, `CAMPS → hscamps`, else `hsseason` (the season pauses on
the schedule between games, the tour on the itinerary between camps); stage `RETIRED → legacy`; phase `AWARDS →
awards`; phase `OFF → offseason` (the wizard's preview card once the chain is done); otherwise `hub`.

**Stay rules** (`Router.sync`): the resolved id equals the live one → no remount (screens re-render through their
subscription); resolved `hub` while a `FREE` screen is live → stay; `EVENT` → stay on a `FREE` screen (else go
`hub`) and call `Router.eventModal(event)`; an unregistered id → `_fallback` with `params.wanted = id`.

`FREE` = `hub team training stats schedule standings records timeline inbox saves settings practice postgame finances`
(`finances` in REVIEW mode stays mounted while the state routes to `hub`).
`CHROMELESS` (no top bar / tab bar / rails) = `title newcareer kick hsgame hscamp campbattle combine`.

**How a screen registers itself** (any order after `router.js`):
```js
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI.Router.register('stats', function (store, params) {
    var C = RTG.UI.C;
    var el = C.screen({ title: 'STATS' });
    var unsub = store.subscribe(function (info) { /* re-render from store.state */ });
    return { el: el, destroy: function () { unsub(); }, onResize: function () {}, onKey: function (ev) { return false; } };
  });
})(typeof window !== 'undefined' ? window : globalThis);
```
`destroy()` must unsubscribe, cancel timers / RAF (`Canvas.stop()`), and remove window listeners. Do not decide the
next phase inside a screen: dispatch, then let `Router.sync()` (or call it yourself for the in-scene functions).

---

## 4. `RTG.UI.C` — components

All return `HTMLElement`s styled by `css/style.css`.

| Function | Notes |
|---|---|
| `el(tag, attrs, ...children)` | attrs: `class`, `text`, `html`, `style` (string or object, `--vars` ok), `on<Event>` handlers (`onClick`), `aria-*`, `data-*`, `role`, `id`, any attribute; `value/checked/disabled/selected/readOnly` set as properties. Children: strings, nodes, arrays, `{el}` objects; `null/false` skipped |
| `clear(el)` / `replace(el, ...children)` | |
| `button({label, kind, onClick, icon, disabled, small, block, title, ariaLabel, action, class})` | kinds `primary (gold) · secondary · danger · ghost · team`; `action` → `data-action` |
| `buttonRow(buttons, cls)` | `.btn-row` |
| `chip(text, kind, icon?)` | kinds `gold red mint sky grey team dark warn` (`warn` = sunset on ink, D27: the HIGH-risk chip between gold MED and red WILD) |
| `deltaChip(value, suffix)` | signed, coloured by sign |
| `meter({label, value, max=100, blocks=5, kind, delta, suffix})` | 5-block pixel bar with `role=meter` |
| `bar({label, value, max=99, kind, pot, delta, noValue})` | continuous attribute bar, `pot` tick |
| `stars(n, max=5)` | ★☆ |
| `card({title, body, footer, kind, icon, right, class})` | kinds `gold red sky mint team flat`; `card.body` is the body element |
| `tabs({items:[{id,label,icon}], active, onChange}) → el` | `el.setActive(id)`, `el.active()`; arrow keys move |
| `list(items, renderRow, {empty, class})` | `<ul class="list">` |
| `kv(rows)` | `[[label, value, kind?]]` or `[{k, v, kind}]` |
| `table(cols, rows, {rowClass, onRow, caption, compact, empty})` | cols `{key, label, align:'r', render(row), cls}`; wrapped in `.scroll-x` |
| `modal({title, body, buttons:[{label, kind, icon, onClick(close), close:false?}], closable=true, kind, class, wide, focus, onClose}) → {el, box, body, close()}` | focus-trapped, Escape/backdrop close when closable, restores focus |
| `confirm({title, text, okLabel, cancelLabel, kind}) → handle.onOk(fn).onCancel(fn)` | |
| `modalOpen()` / `closeAllModals()` | app.js skips screen `onKey` while a modal is open |
| `toast(text, kind, ms=2600)` | kinds `good bad gold info`; returns the element (`.dismiss()`) |
| `announce(text)` | writes the `#live` aria-live region |
| `crest(teamOrId, size=32)` | procedural pixel crest (shape + motif by `fnv1a32(id)`, team colours); accepts a team object or id (state lookup, then static data) |
| `pixelAvatar(look, size)` | player `look {skin, hair, boot}`; palettes in `C.LOOK` |
| `sparkline(canvas, values, {min, max, color})` | pixel polyline |
| `tooltip(el, text)` | hover / focus / 400 ms long-press; sets `aria-describedby`; honours `settings.tooltips`. The description span lives in one shared `#tip-descs` sr-only host (not inside `el`, so `el.textContent` stays clean and nothing widens a `.scroll-x`); entries whose anchor left the document are swept (`C.tooltipCount()` for tests) |
| `icon(name, size=12)` | inline SVG from a pixel string: `wind rain snow dome star trophy envelope boot heart clock arrow-l/r/u/d check x home team train stats more dice save sun cloud money ball flag ice bolt gear trash`; `weatherIcon(weather, wind)` picks one |
| `screen({title, back, right, class, children})` | `.screen` with a `.screen-head` (back button → `Router.back()`) |
| `team(id)` / `teamName(id)` / `teamAbbr(id)` | read-only lookups |
| `fmt` | `money pct clock ordinal pad` (RTG.Util) + `int signed date ago week(state) calYear stage(state) kickType(ctx) hash(h)` |

---

### 4.1 `RTG.UI.Kit` — screen helpers (`ui/screens/hub.js`, shared by every screen)

`safe(fn)` (wraps a handler: an engine error becomes a toast), `dispatch(store, fnName, …args)` (a dispatch through
that wrapper; `undefined` when it threw), `team(id)` / `teamName(id)` / `abbr(id)` / `userTeam(state)`, `ovr(player)`,
`fameTier(fame)`, `reduced()`, `calYear(year)`, `tip(el, text)` (tooltip honouring the setting; returns `el`),
**`money(k)`** (D27 — a bank amount in **$k**, the finance block's unit, as text through `C.fmt.money(k / 1000)`:
'$30k', '$1.5M', '-$40k'; `Util.fmtMoney` itself takes $M), `numEl(text, tip, cls)` (a `.num` span with a tooltip),
`pctText`, `longText`, `fgLine`, `recordOf`, `standingRow`, `standingsStarted`, `rankChip`, `climateName` /
`climateIcon` / `climateChip`, `teamStars`, `crestName`, `senderName(kind)` / `avatar(kind, size)` (the inbox senders:
coach / agent / gm / press / fan / family / teammate / sponsor — the finances screen maps a pitch's `source` AGENT →
agent, TEAMMATE → teammate, BOOSTER → sponsor, BANK → gm, DM → fan), `impactStars`, `weekLabel`, `awardName`,
`contractText`, `coachStyleText` / `aggressionText`, `moodFace`, `offerCard`, `bracketEl`, `goalsList`, `gameKicks`,
`lineFromKicks`, `outcomeText`, `kickChip`, `venueInfo`, `kindLabel`.

### 4.2 `RTG.UI.KickView` — the surface the screens use (`ui/kickview.js`, U2; the scene itself is SPEC §4.6)

`mount(container, opts)`, `current()`, `TIMING`, `OUTCOME_TEXT`, `shouldAutoPat(ctx, settings, store)`,
`hudParts(ctx)`, `windText`, `kickoffBar(parent, opts)` / `kickoffText(ko)`, `escapeToSettings(ev)` (§4.8: Escape opens
Settings from a chromeless kick screen), `sessionScreen(store, opts)` (the shared chromeless session screen behind
`hsgame`, `hscamp`, `campbattle` and `combine`), and since D25 **`VENUES`** (`{HS, COLLEGE, NFL}` — the stadium recipe
per venue: night, tier heights, `upperByPrestige`, edge rise, roof, fill and its pressure / prestige terms, away
share, the HS bleacher and light poles, the NFL jumbotron; SPEC §4.6) and **`venueOf(ctx)`** (`ctx.venue` when it is
`'HS' | 'COLLEGE' | 'NFL'`, else `'NFL'` for an NFL context and `'COLLEGE'` otherwise — contexts saved before D25).
A mounted view exposes `view.venue()` and `view.stadium()` for the specs.

## 5. `RTG.UI.Palette`

Tokens as JS (`Palette.navy`, `navy2`, `cream`, `ink`, `grass`, `grass2`, `chalk`, `gold`, `red`, `sky`, `mint`,
`grey`, `dusk`, plus shell extras `shadow dusk2 sunset night ball`), `Palette.TOKENS`, `Palette.variant('default'|'cb'|'hc')`,
`Palette.current()` (matches the body classes), `Palette.get(token)`, `Palette.findTeam(teamOrId)`,
`Palette.teamTint(teamOrId) → [primary, secondary]`, `Palette.teamText(teamOrId)` (the team colour that reads as
text on navy, else gold), `Palette.setTeamVars(teamOrId)` (writes `--team-1 --team-2 --team-ink --team-text` on
`:root`; app.js calls it whenever `player.teamId` changes), `hexToRgb`, `luminance`, `contrast`, `readable(bg)`.
Canvas code should read colours through `Palette.get()` so the colour-blind / high-contrast variants apply.

## 6. `RTG.UI.Storage`

`getItem(key) → string|null`, `setItem(key, value) → boolean` (false = memory fallback), `removeItem`, `keys()`
(sorted), `getJSON`, `setJSON`, `clear(prefix='rtg.')`, `available` (false in private mode → in-memory map),
`degraded` (true once any write has fallen back), `memoryKeys()`. Never throws. Keys: `rtg.save.1|2|3`,
`rtg.save.auto`, `rtg.settings`, `rtg.records`.

**The memory fallback shadows the backend.** When `setItem` throws (quota, private mode) the value is kept in an
in-memory map and `getItem` / `getJSON` read that map **first**, so a quota-failed save can still be summarised
(`slotSummary`) and loaded for the rest of the session — a live-but-full `localStorage` must never hand back the
stale older value. A later successful write for the same key drops the shadow; `removeItem` / `clear` clear both.

---

## 7. Shell chrome (`app.js`, `RTG.UI.Shell`)

`#app` is a CSS grid: **phone portrait** `top / main / tabs`; **desktop ≥ 900 px** `top` over `left rail (176) ·
main (≤ 720) · right rail (≤ 320)` with the tab bar hidden; **phone landscape** (`html.is-landscape`, height < 500)
keeps the layout with a collapsed top bar and icon-only tabs. `#app.chromeless` (screens in `Router.CHROMELESS`, or
no career) hides the top bar, rails and tab bar. `html` also carries `.is-desktop` / `.is-phone` / `.is-landscape`.

- **Top bar** (sticky): crest + abbr + record (→ `team`), `Y<year> · WK <week>` / phase + stage · role, XP (→
  `training`), earnings. Rendered from state on every store change.
- **Bottom tab bar** (`.tabbar`): HOME → `hub`, TEAM → `team`, TRAIN → `training`, STATS → `stats`, MORE → a sheet
  modal with Schedule / Standings / Records / Timeline / Inbox / Saves / Settings / Practice / Title screen. The active
  tab derives from the live screen (`postgame`/`game` count as HOME; MORE items highlight MORE). The `finances`
  screen has no tab and is not in the MORE sheet (`MORE_ITEMS` in app.js was outside the money pass): it is reached
  from the hub — the head's **bank chip** (`button.hub-bank[data-action="bank"]`, gold, red in debt, tooltip with
  the net worth) and the METERS card's nav row (`.hub-nav [data-action="finances"]`) — and by the router for the
  offseason `FINANCES` decision.
- **Left rail** (desktop): the same destinations as buttons. **Right rail**: THE WIRE (3 newest headlines), METERS
  (trust / fans / morale / job), QUICK STATS.
- **Event modal**: `Shell.openEventModal(event)` — generic modal with sender, text, one big button per choice
  (preview text under it) → `dispatch('chooseEvent', idx)`; idempotent per `event.id@year/week`; closed automatically
  when the pending changes. `inbox.js` may set `Router.eventModal = function (event, store) {…}` for the styled one.
- `Shell.applySettings()`, `Shell.setChrome(screenId)`, `Shell.openMore()`, `Shell.isLandscape()`,
  `Shell.isDesktop()`, `Shell.layout()`, `Shell.reducedMotion()`.
- Keys: Escape on a FREE screen other than the hub → `hub`. Screens get `onKey(ev)` first; return `true` to consume.
  Keydowns whose target is an `INPUT` / `TEXTAREA` / `SELECT` / contenteditable are **dropped** so typing never
  reaches the shell shortcuts — unless the live screen returned `keysInFields: true`, in which case they are
  forwarded to that screen's `onKey` only (`newcareer` uses it for Enter-to-submit in the name / seed fields).
  The chromeless kick screens (`kick`, `hsgame`, `hscamp`, `campbattle`, `combine`) have no tab bar or rail, so their
  `onKey` sends **Escape → `settings`** (`KickView.escapeToSettings`); `Router.back()` returns to the still-
  pending session. In flick mode the confirm key on an armed scene also swaps that view to aim-then-hold
  (SPEC §4.8 keyboard fallback), so a keyboard-only player is never stuck.

---

## 8. `RTG.debug` (js/debug.js, SPEC §3.8)

All synchronous; every mutation re-renders through the store. `RTG.debug.strict = true` enables validation without
`?debug=1`.

| Function | Notes |
|---|---|
| `getState()` / `setState(state)` | deep clone / validate + reindex + replace (+ autosave) |
| `newCareer({seed, difficulty, archetype, name, look, foot, hometown})` → state | |
| `jumpTo({stage, phase?, year?, week?})` → state | one engine step per iteration (`autoPlayGame` if a game is open, `settlePending({max:1})` — ONE pending — if pending, `autoPlayWeek` in REG/POST, else `nextPhase`), so `DRAFT.DECLARE`, `DRAFT.COMBINE` (with the plan decision still pending, i.e. the combine screen's plan card), `DRAFT.DRAFT`, `AWARDS`, `PRE` are all reachable stops, and so are the HS phases `SEASON` / `CAMPS` / `OFFERS` (the games and camps are opened and played one `settlePending` at a time); throws after 30 career years |
| `forceKick({outcome, sub?, side?, blockReturnTd?} | {power, aim, quality, holdMs?} | {timing})` → KickResult | game pending: `Kick.resolve(…, {forced})` + `Sim.applyKick`; session: writes `session.results[idx]`, runs `Career.finishSession/resume` when done (mirrors `Engine.sessionKick`); a triple is a normal dispatch. **Subscribers get `{fnName:'applyUserKick'|'sessionKick', result, forced:true}`** — kick scenes must render that result when they are waiting for input |
| `autoKick(bool)` / `autoKickEnabled()` | sets `store.autoKickAll` |
| `simGame()` `simWeek(opts)` `simSeason(opts)` `simOffseason(opts)` `simCareer({untilStage, maxYears})` `settle(opts)` `nextPhase()` | `autoPlay*` / `settlePending` dispatches |
| `setAttrs({POW…})` `setSoft({trust, js, fame, morale, fans, form, xp, age})` `addXp(n)` `addMod(mod)` | direct edits + `touch` |
| `money(k)` → bank | D27: $k into the bank through `Finance.deposit(state, k, 'EVENT', 'debug')` (negative → `Finance.charge`), then `store.touch('money', bank)`; the panel's `+$100k` button calls `money(100)` so QA can fund a purchase |
| `triggerEvent(id)` → EventInstance · `choose(idx)` · `decide({kind, optionId, extra} | optionId)` | `Events.force` / `chooseEvent` / `decide` |
| `screen()` `go(id, params)` `pending()` | |
| `montecarlo({attrs, distance, n, ctxOverrides, seed})` → `{pct, n, made, model}` · `balance(n)` → rows by bucket | throwaway rng, AI input |
| `perf()` → `{fps, frameP95Ms, frames, heapMB|null, rafActive, rafOutstanding, listeners, storeListeners, windowListeners}` | RAF and window/document listeners are instrumented by wrapping; uses `RTG.UI.Canvas.active()/perf()` when present |
| `save(slot)` `load(slot)` `clearStorage()` `exportString()` `importString(s)` `storageKeys()` | |
| `seed()` `rngState()` `tune(path, value?)` `validate()` | |
| `version` `saveVersion` `mountPanel()` | the panel: NEW · SETTLE · KICK GOOD/MISS · DOINK · SIM GAME/WEEK/SEASON · OFFSEASON · → COLLEGE/NFL/RETIRED · NEXT PHASE · EVENT · +500 XP · +$100k · VALIDATE · SAVE/LOAD · PERF · DUMP |

---

## 9. CSS class vocabulary (`css/style.css`)

Tokens: `--navy --navy-2 (--navy2 alias) --cream --ink --grass --grass-2 --chalk --gold --red --sky --mint --grey
--dusk --dusk-2 --sunset --night --shadow --ball --team-1 --team-2 --team-ink --team-text`, sizes `--u (8px) --border
(2px) --shadow-size (3px) --touch (44px) --topbar-h --tabbar-h --safe-b --safe-t --main-max`. Base font 10 px phone /
12 px desktop (× font scale via `html.font-scale-*`), so use `rem`/`em`; `.num` = tabular numerals.

| Group | Classes |
|---|---|
| Layout | `#app .topbar .screen-host .tabbar .rail .rail-left .rail-right .chromeless .screen .screen-full .screen-kick .screen-session (canvas screens: max-width none, no centred column) .screen-head .screen-title .screen-head-right .section-title .stack .stack-2 .grid-2 .grid-3 .row .row-between .row-wrap .col .grow .scroll-x (position: relative)` |
| Buttons | `.btn .btn-primary .btn-secondary .btn-danger .btn-ghost .btn-team .btn-sm .btn-block .btn-row .btn-row-tight .active .btn.pill .pills` (pills: ghost buttons used as radio choices) |
| Cards | `.card .card-title .card-title-right .card-body .card-footer .card-gold .card-red .card-sky .card-mint .card-team .card-flat .card-selectable .card-selected` |
| Chips / meters | `.chip .chip-gold/-red/-mint/-sky/-grey/-team/-dark/-warn .chips .delta .meter .meter-label .meter-blocks .blk .on .meter-value .meter-red/-mint/-sky/-team .meters-row .bar .bar-track .bar-fill .bar-pot .bar-value .stars .crest .avatar .icon` |
| Tabs / lists / tables | `.tabs .tab .active .list .list-row .list-empty .list-clickable .kv .tbl .tbl-compact tr.user td.gold th.r td.r` |
| Forms | `.field .field-label .input .input-row .toggle .toggle-label .toggle-hint .switch[aria-checked] .swatches .swatch` |
| Overlays | `#modal-root .modal-backdrop .modal .modal-wide .modal-head .modal-title .modal-x .modal-body .modal-buttons .modal.sheet .more-grid .event-modal .event-sender .event-text .event-choices .event-preview .toast-host .toast .toast-good/-bad/-gold/-info .tooltip .has-tip` |
| Game | `.led .led-team .led-score .led-mid .poss .drivelog .dl-line .dl-home .dl-away .dl-score .dl-kick .dl-muted .banner .banner-good/-bad/-gold/-sky .headline .headline-tag .stamp .stamp-A…F` |
| Hub / finances (D27) | `.hub-bank .hub-nav` · `.scr-finances .fin-head .fin-stats .fin-stat .fin-bank .fin-networth .fin-debt .fin-return .fin-tiers .fin-tier (.selected .current) .fin-tier-head .fin-tier-name .fin-tier-cost .fin-tier-fx .fin-tier-text .fin-service (.staged .dim) .fin-service-btn .fin-buys .fin-buy (.owned .staged .dim) .fin-buy-head .fin-buy-icon .fin-buy-name .fin-buy-price .fin-buy-fx .fin-buy-text .fin-buy-foot .fin-fx-key .fin-fx-yearly .fin-opps .fin-opp (.staged .dim) .fin-opp-head .fin-opp-name .fin-opp-pitch .fin-opp-act .fin-stepper .fin-amount .fin-sub .fin-holding (.staged .dead) .fin-ledger-row .fin-footer (.over) .fin-footer-sum .fin-footer-note .fin-footer-btns .fin-after .fin-actions` — tiers 2 × 2 on a phone / 1 × 4 on desktop, buys 2 / 3 / 4 columns, the footer sticky above the tab bar and the safe area |
| Utilities | `.center .right .small .big .huge .mono .nowrap .wrap .ellipsis .upper .pixel .divider .blink .pulse .mt-1 .mt-2 .mb-1 .mb-2 .gap-1 .gap-2 .txt-gold/-red/-mint/-sky/-grey/-cream/-team .sr-only` |
| Body / html classes | `.cb .hc .reduced-motion .font-scale-125 .font-scale-150 .left-footed .no-tooltips` · `html.is-desktop .is-phone .is-landscape` · `body[data-input-mode]` |

Focus ring: `:focus-visible { outline: 3px solid var(--sky) }`. Motion: `@media (prefers-reduced-motion)` and
`body.reduced-motion` zero every animation/transition. Never let a page scroll horizontally — wide content goes in
`.scroll-x`. Screen-specific rules go in `css/screens.css` (screens engineer) and `css/kick.css` (U2); please scope
them to the screen (e.g. `.game-screen .pill`) — global selectors in a later sheet override `style.css`.

---

## 10. Shell-owned screens

- **title**: canvas strip (`.title-canvas`, plain ctx rects, uiRng wobble, RAF stopped on destroy, static with
  reduced motion), logo, NEW CAREER / CONTINUE (`.title-summary` from `Save.slotSummary('auto')`) / LOAD / SETTINGS,
  `.ticker` of `rtg.records` best careers, version + `[data-seed]`.
- **newcareer**: `#nc-name` + DICE (`Names.player(store.uiRng)`), `[data-arch]` cards (bars from
  `Tuning.progression.archetypes` means), look swatches + `C.pixelAvatar`, foot, `#nc-home` (Data.names.hometowns),
  `[data-diff]` pills (descriptions from `Tuning.difficulty`), `#nc-seed` + RANDOM, START CAREER →
  `store.newCareer(opts)`.
- **settings**: every §2.2 key, `.switch[data-setting]` / `.pill[data-setting][data-value]`, key remap, RESET.
- **saves**: `.slot-card` × 4 (`[data-action="save-N|load-N|delete-N"]`), `.export-area` + `[data-action=export]`
  / COPY, `.import-area` + `[data-action=import]`, `.save-msg` status line. Rejections show the `store.load` message.
- **_fallback**: renders any state — stage/phase header, pending KICKS session (PLAY → `kick` when built, AUTO KICK
  → `sessionKick(null)`, AUTO ALL), EVENT choices, DECISION options (offer cards; COUNTER gets +AAV / +YEARS),
  in-progress game (LED scoreboard, drive log, NEXT KICK / STEP / AUTO KICK / FINISH GAME / SIM REST), phase actions
  (train pills, spend XP, PLAY / SIM GAME, END WEEK, SIM WEEK/SEASON, START SEASON, CONTINUE, NEXT PHASE, SIM
  OFFSEASON, NEW CAREER), player card, THE WIRE, raw JSON `<details>`. `[data-seed]` chip shows the seed.

- **hsseason / hsgame / hscamps / hscamp** (U2, SPEC §2.7.1 / §4.5, D23/D26): the senior season's schedule and
  board, the live-scoreboard game scene, the camp itinerary (one row per invite with `HS.askOf`, OFFER EARNED / NO
  OFFER once played, NEXT on the next one; GO TO <SCHOOL> CAMP → `dispatch('hsStartGame' | 'hsStartCamp')`) and the
  camp scene (`KickView.sessionScreen`; the tally through `HS.judgeCamp`). The session scenes call `Router.sync()`
  after their result beat (`sessionKick` is in `NO_SYNC`).
- **training**: the archetype's signature attribute (`Player.signatureOf`, D24) shows "no cap" where the other rows
  show a POT hint.
- **finances** (SPEC §4.9, D27; `ui/screens/finances.js`, also `RTG.UI.Screens.finances`): two modes from state —
  DECISION when `state.pending` is the `FINANCES` decision, REVIEW otherwise (from the hub). Sections top to bottom:
  THE BOOKS header (`.fin-bank`, `.fin-networth`, this year's take-home, the lifestyle chip, `.fin-debt` banner when
  the bank is negative) → THIS YEAR (the tick report, or this year's ledger in review) → LIFESTYLE (`[data-tier]`,
  `aria-pressed`; buttons in DECISION mode, divs in REVIEW) → GAME PLAN (`[data-service]` ADD / REMOVE, BOOKED chip;
  DECISION only) → BIG BUYS (`[data-buy]` BUY / UNDO, disabled when unaffordable; OWNED chip) → INVEST
  (`.fin-opp[data-opp]` with `[data-step="<oppId>:-1|+1"]`, `[data-max]`, `[data-invest]` INVEST / UNDO; then
  HOLDINGS `.fin-holding[data-holding]` with `[data-sell]` SELL / UNDO, BUST for a dead one) → LEDGER (last 12). The
  draft `{lifestyle, buy[], services[], invest[{oppId, amount}], sell[]}` is staged locally and recomputed in the
  engine's apply order (sell → lifestyle → services → buy → invest) with the same per-step affordability check as
  `Finance.apply`, so the sticky footer's BANK AFTER (`.fin-after`) is exact; the floor is $0 or the opening bank when
  the year opens in debt — buttons that would breach it disable, `.fin-footer.over` marks a draft over it (under the
  floor, or carrying items the bank can no longer pay after it moved under the draft: CLOSE disables until they are
  undone); a dearer lifestyle tier disables while the bank is red; the draft itself lives in a module-level cache
  keyed by career + year (`DRAFTS`), so a route away and back keeps it. CLOSE THE
  BOOKS (`[data-action="close-books"]`, primary, in a `.card-footer` row) → `Kit.dispatch(store, 'decide', {kind:
  'FINANCES', optionId:'DONE', extra})` — `lifestyle` only when it differs from the current tier — then toasts the
  receipt (skipped items by reason, or "Books closed · bank $X" and the headline), `announce`s it, `Router.sync()`,
  and leaves explicitly if the sync kept the screen. RESET DRAFT (`[data-action="reset-draft"]`); BACK
  (`[data-action="back"]`) in REVIEW mode. A career without books shows a "no books yet" card with BACK. Stepper
  step = the 1 / 2 / 5 × 10ⁿ value at or above a tenth of the range; MAX = min(max, the staged bank). Factory
  helpers for tests: `Screens.finances.model(state)`, `.staged(model, draft)`, `.stepFor(opp)`.

---

## 11. Deviations from SPEC §4.4 / the contract (and why)

| Item | As built | Why |
|---|---|---|
| `dispatch` rng | `spendXp / autoSpend / autoOption` are called without an rng | their engine signatures have none (`Engine.spendXp(state, attr)`) |
| No-sync list | adds `sessionKick`, `finishUserGame`, `train`, `spendXp`, `autoSpend`, `autoOption` to the five game-step functions | SPEC §4.5: the session scenes (senior-season game, camp, camp battle, combine) call `Router.sync` themselves on done; `postgame` is not derivable from state; training never changes the route |
| Notify order | subscribers are notified after `Router.sync()` | a screen destroyed by the route change must not re-render a stale state |
| `Router.sync` stay rule | hub-family screens stay when the state routes to `hub`; identical target → no remount | otherwise `train` from the training screen would bounce the user to the hub |
| `state.settings` mirror | `store.saveSettings()` writes `state.settings = Schema.mirrorSettings(settings)` directly | UI-owned field per SPEC §3.4; no Engine function exists for it |
| `state.playtimeSec` | accumulated by the store on save / autosave | UI-supplied field per SPEC §3.4 |
| `debug.forceKick` on sessions | mirrors `Engine.sessionKick` bookkeeping in debug.js | no engine entry point accepts a forced outcome (interface request: `Engine.sessionKick(state, rng, input, opts{forced})` / `Engine.applyUserKick(…, opts)`) |
| Settings extras | `haptics`, `keys` added | §4.5 settings row lists haptics (§4.8) and key remap |
| `?load=auto` | boot resumes the autosave directly | test convenience |
| Integration pass | `Router.resolve` routes a pending `COMBINE_PLAN` to `combine`; `Engine.markRead` is dispatchable (NO_SYNC); `C.tooltip` keeps its description in `#tip-descs`; `debug.jumpTo` settles one pending per step; `.screen-kick / .screen-session` full width and `.scroll-x { position: relative }` live in `style.css` | the U2 / U3 interface requests |
| Palette extras | `--team-text`, `--navy2` alias, shell colours | readable team text on navy; kick.css referenced `--navy2` |
| Canvas fractional fit (§4.2) | `RTG.UI.Canvas` integer-scales as specified, except when the integer scale would be 1 and the fractional fit is ≥ `Canvas.MIN_FRACTIONAL` (1.35): then the fractional fit is used (390×844 fits 2× in a session scene; in-game, with the score row and CONTINUE, 375×667 fits 1.6× instead of 1×) | a 1× 192-px scene on a 375-px phone leaves navy on both sides and a tiny pull area; nearest-neighbour sampling keeps the pixels crisp, desktops (fit ≥ 2) still integer-scale |
| Flick segment start (§4.6 step 3) | `Input.flick` takes the last 120 ms / 6 samples as specified, but the segment never starts before the pull's reversal — the deepest sample of the pull, found by walking back from the release with no time bound (a deeper sample inside the last 300 ms still wins), which is also where power is read | a fast pull that snaps straight into the flick would otherwise drag downward samples into the window and the chord across the turn would read as WEAK (×0.85); and a player who draws, pauses to aim and then flicks leaves no samples at the bottom, so a time-bounded scan read power off the first flick sample instead of the pull depth |
| `D_full` cap (§4.6 step 2) | `D_full = 0.32 × canvasCssHeight` (portrait) / `0.45 ×` (landscape) as specified, then capped so the whole range including overswing fits under the ball: `min(D_full, max(60, (roomBelowBall − 12) / 1.15))`, measured at `pointerdown` | a finger cannot leave the screen — without the cap a landscape phone put `P = 1.15` past the bottom edge (the home-indicator strip). CSS keeps the room honest instead: `.kv-stage { max-height: 74% }` on landscape phones leaves ~155 px under the tee, so the cap no longer binds there |
| Hesitation clock (§4.6 / §2.3.3) | `holdSince` is latched at the first sample with P ≥ 0.95 and stopped by the first sample back under it, instead of being zeroed by every sample under the line | the flick samples run through the same `updatePull`, so the old rule zeroed the clock on the way out and `holdMs` was always 0 — the composure penalty was dead code for flick input |
| Keyboard fallback on a flick scene (§4.8) | the confirm key on an armed flick scene swaps **that view** to aim-then-hold (`store.settings.inputMode` untouched) and announces it; Escape on a chromeless kick screen opens `settings` | the flick needs a pointer and the kick screens have no chrome, so a keyboard-only player was stuck on the first senior-season kick with no route to Settings |
| `finances` in `FREE` (D27) | the books stay mounted while the state routes to `hub` (REVIEW mode); after CLOSE THE BOOKS the screen calls `Router.sync()` and leaves explicitly when the sync kept it (an EVENT pending resolves to `hub` + modal) | a hub-family screen would otherwise bounce back to the hub on every store touch; the wizard / hub own the flow once the decision is gone |
| CLOSE THE BOOKS in debt (D27) | enabled whenever the draft is not over the floor `min(0, the opening bank)` — under it, or carrying items the bank can no longer pay; only the staging buttons (and, in the red, every dearer lifestyle tier) disable | the build contract disabled it for any negative bank, but the real bank can open a year negative (event costs before any income; lifestyle, upkeep and interest at the tick), which would strand the human in the offseason; the engine refuses a dearer plan in debt, so the tier buttons say so first |
| The draft cache (D27) | `DRAFTS[createdAt:year]` at module level; `factory()` reads its entry on every render, writes back on every commit / stepper / reset, deletes it on CLOSE THE BOOKS | the draft used to live in the factory closure, and every route away (HUB tab, desktop rail, Escape → hub, the wizard's door card) destroyed the screen and silently dropped everything staged |
| CLOSE THE BOOKS re-entrancy (D27) | `closeBooks` returns unless a FINANCES decision is pending and no close is in flight; the button disables for the dispatch; the screen leaves on its own when the decision disappears under it (`lastMode` DECISION → REVIEW while the router resolves elsewhere) | a second click on the detached button reached `Engine.decide` and toasted "no pending decision (wanted FINANCES)"; an autoplay from the open books left the screen mounted in REVIEW mode (the FREE stay rule) |
| Event modal focus (D27) | `C.modal` with `closable: false` focuses the dialog box itself (`tabindex=-1`), not its first choice; closable modals focus their first control as before | Enter / Space pressed twice on CLOSE THE BOOKS (or any decision button followed by an event) answered the event with its first choice, unread |
| `.card-footer` on the finances footer (D27) | the sticky footer's button row also carries `.card-footer` | the career e2e's generic decision path (and the house convention) clicks `.card-footer .btn-primary` as a step's default action |
| `Kit.money` unit (D27) | takes $k (the finance block's unit) and prints through `C.fmt.money(k / 1000)` | `Util.fmtMoney` takes $M; the hub's earnings chip stays in $M (gross) |
| Hub navigation (D27) | FINANCES is reached from the hub head's bank chip and the METERS card's nav row, not from the MORE sheet / left rail | `app.js` (`MORE_ITEMS`) was outside the money pass — open |
| The SCAM pitch (D27) | the opportunity card prints a display label for the kind (`KIND_LABEL`: INDEX and SCAM both read `FUND`), never `o.kind` itself; the holding row still shows the real kind once it has busted | the catalogue keys the first-tick bust on `kind: 'SCAM'`, and "A DM · SCAM" on the card gave the sure thing away |
| Debt banner copy (D27) | worded from `Tuning.finance.debt` (`liquidateAfter` spelled out, the grace, "once the debt is more than what you own") | it hardcoded "after two years" while the constant was 3, and promised a frugal drop the engine did not enforce |
| Accessible names on the books (D27) | BUY / ADD / INVEST / SELL / MAX / stepper buttons carry `aria-label`s with the item ("Buy Used Truck, $25k", "More for Parking App"); `restoreFocus` falls back to the nearest enabled button of the same card when the focused control just disabled itself | eleven identical "BUY, toggle button"s; a stepper reaching its cap dropped the focus on `<body>` |
