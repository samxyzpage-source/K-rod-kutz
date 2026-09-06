# Road to Glory: Kicker — UI API (as built, package U1: app shell)

**Status:** the shared UI contract implemented by `kicker/js/ui/{storage,palette,store,router,components,app}.js`,
`kicker/js/debug.js`, `kicker/css/style.css` and the shell-owned screens (`title`, `newcareer`, `settings`, `saves`,
`_fallback`). The kick-scene engineer (U2) and the screens engineer build against **this** document. Where it differs
from SPEC §4.4 the difference is listed in §9. Engine calls follow `docs/ENGINE_API.md`.

Conventions: every file is a classic script using the SPEC §3.3 shim and attaches to `RTG.UI.*`; no modules, no
build, no fetch, no images; must parse on Safari 12 / Chrome 70 (no optional chaining, nullish coalescing or class
fields). The UI never derives game rules — every number comes from `state` or an engine read helper — and changes
state only through `store.dispatch`.

---

## 1. Load order and boot

`index.html` loads: engine (test/load.js `ORDER`) → `ui/storage, ui/palette, ui/store, ui/router, ui/components` →
`ui/sprites, ui/canvas, ui/audio, ui/input, ui/kickview` (U2) → `ui/screens/*` (`_fallback` first) → `ui/app` →
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
| `store.replace(state, rng?)` | swap the live state (rng rebuilt from `state.rngState` when omitted), then `Router.sync()` and notify `'replace'` |
| `store.clear()` | drop the career (title screen) |
| `store.newCareer(opts)` | `Engine.newCareer(opts, Date.now())` (opts.settings defaults to the UI settings) → replace → autosave |
| `store.hasCareer()` | `!!state` |
| `store.save(slot) → {ok, error?, key, bytes, persisted, savedAt}` | slot `'1'|'2'|'3'|'auto'` (or a full `rtg.save.*` key) |
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
   autoPlayWeek, autoPlaySeason, autoPlayOffseason, autoPlayCareer, settlePending`, and after `sessionKick` when the
   result has `done === true`.
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
  leftFooted: false, inputMode: 'flick'|'meter', playClockMult: 1|2, tooltips: true, haptics: true,
  keys: { confirm: ' ', confirmAlt: 'Enter', left: 'ArrowLeft', right: 'ArrowRight' } }
```
`RTG.UI.Store.defaultSettings()` / `sanitizeSettings(raw)`. `app.js` mirrors them to classes on **both** `<body>`
and `<html>`: `.cb .hc .reduced-motion .font-scale-125 .font-scale-150 .left-footed .no-tooltips`, plus
`body[data-input-mode]`. `RTG.UI.Shell.reducedMotion()` = setting OR `prefers-reduced-motion`.

---

## 3. `RTG.UI.Router`

| Member | Description |
|---|---|
| `Router.register(id, factory)` | `factory(store, params) → {el, destroy(), onResize?(), onKey?(ev) → true when handled}` |
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
`game.pending`, else `game`; `pending.kind === 'KICKS'` → by `session.kind`: `SHOWCASE → showcase`,
`CAMP → campbattle`, `COMBINE_* → combine`, anything else (`HALFTIME70 / PRACTICE / TRYOUT`) → `kick`
(`{mode:'session', session}`); `EVENT` → `{id:'hub', event:true}` (keep the current hub-family screen, open the
modal); `DECISION` → `OFFERS_COLLEGE → offers`, `UDFA / FREE_AGENCY / EXTENSION / TAG / CUT_NOTICE / MIN → contract`
(`{kind}`), `HOF → legacy`, `COMBINE_PLAN → combine` (the combine screen owns the plan card), everything else →
`offseason` (`{kind}`); stage `DRAFT`: phase `DRAFT → draft`,
`COMBINE → combine`, else `offseason`; stage `RETIRED → legacy`; phase `AWARDS → awards`; phase `OFF → offseason` (the wizard's preview card once the chain is done); otherwise `hub`.

**Stay rules** (`Router.sync`): the resolved id equals the live one → no remount (screens re-render through their
subscription); resolved `hub` while a `FREE` screen is live → stay; `EVENT` → stay on a `FREE` screen (else go
`hub`) and call `Router.eventModal(event)`; an unregistered id → `_fallback` with `params.wanted = id`.

`FREE` = `hub team training stats schedule standings records timeline inbox saves settings practice postgame`.
`CHROMELESS` (no top bar / tab bar / rails) = `title newcareer kick showcase campbattle combine`.

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
| `chip(text, kind, icon?)` | kinds `gold red mint sky grey team dark` |
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
(sorted), `getJSON`, `setJSON`, `clear(prefix='rtg.')`, `available` (false in private mode → in-memory map).
Never throws. Keys: `rtg.save.1|2|3`, `rtg.save.auto`, `rtg.settings`, `rtg.records`.

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
  tab derives from the live screen (`postgame`/`game` count as HOME; MORE items highlight MORE).
- **Left rail** (desktop): the same destinations as buttons. **Right rail**: THE WIRE (3 newest headlines), METERS
  (trust / fans / morale / job), QUICK STATS.
- **Event modal**: `Shell.openEventModal(event)` — generic modal with sender, text, one big button per choice
  (preview text under it) → `dispatch('chooseEvent', idx)`; idempotent per `event.id@year/week`; closed automatically
  when the pending changes. `inbox.js` may set `Router.eventModal = function (event, store) {…}` for the styled one.
- `Shell.applySettings()`, `Shell.setChrome(screenId)`, `Shell.openMore()`, `Shell.isLandscape()`,
  `Shell.isDesktop()`, `Shell.layout()`, `Shell.reducedMotion()`.
- Keys: Escape on a FREE screen other than the hub → `hub`. Screens get `onKey(ev)` first; return `true` to consume.

---

## 8. `RTG.debug` (js/debug.js, SPEC §3.8)

All synchronous; every mutation re-renders through the store. `RTG.debug.strict = true` enables validation without
`?debug=1`.

| Function | Notes |
|---|---|
| `getState()` / `setState(state)` | deep clone / validate + reindex + replace (+ autosave) |
| `newCareer({seed, difficulty, archetype, name, look, foot, hometown})` → state | |
| `jumpTo({stage, phase?, year?, week?})` → state | one engine step per iteration (`autoPlayGame` if a game is open, `settlePending({max:1})` — ONE pending — if pending, `autoPlayWeek` in REG/POST, else `nextPhase`), so `DRAFT.DECLARE`, `DRAFT.COMBINE` (with the plan decision still pending, i.e. the combine screen's plan card), `DRAFT.DRAFT`, `AWARDS`, `PRE` are all reachable stops; throws after 30 career years |
| `forceKick({outcome, sub?, side?, blockReturnTd?} | {power, aim, quality, holdMs?} | {timing})` → KickResult | game pending: `Kick.resolve(…, {forced})` + `Sim.applyKick`; session: writes `session.results[idx]`, runs `Career.finishSession/resume` when done (mirrors `Engine.sessionKick`); a triple is a normal dispatch. **Subscribers get `{fnName:'applyUserKick'|'sessionKick', result, forced:true}`** — kick scenes must render that result when they are waiting for input |
| `autoKick(bool)` / `autoKickEnabled()` | sets `store.autoKickAll` |
| `simGame()` `simWeek(opts)` `simSeason(opts)` `simOffseason(opts)` `simCareer({untilStage, maxYears})` `settle(opts)` `nextPhase()` | `autoPlay*` / `settlePending` dispatches |
| `setAttrs({POW…})` `setSoft({trust, js, fame, morale, fans, form, xp, age})` `addXp(n)` `addMod(mod)` | direct edits + `touch` |
| `triggerEvent(id)` → EventInstance · `choose(idx)` · `decide({kind, optionId, extra} | optionId)` | `Events.force` / `chooseEvent` / `decide` |
| `screen()` `go(id, params)` `pending()` | |
| `montecarlo({attrs, distance, n, ctxOverrides, seed})` → `{pct, n, made, model}` · `balance(n)` → rows by bucket | throwaway rng, AI input |
| `perf()` → `{fps, frameP95Ms, frames, heapMB|null, rafActive, rafOutstanding, listeners, storeListeners, windowListeners}` | RAF and window/document listeners are instrumented by wrapping; uses `RTG.UI.Canvas.active()/perf()` when present |
| `save(slot)` `load(slot)` `clearStorage()` `exportString()` `importString(s)` `storageKeys()` | |
| `seed()` `rngState()` `tune(path, value?)` `validate()` | |
| `version` `saveVersion` `mountPanel()` | the panel: NEW · SETTLE · KICK GOOD/MISS · DOINK · SIM GAME/WEEK/SEASON · OFFSEASON · → COLLEGE/NFL/RETIRED · NEXT PHASE · EVENT · +500 XP · VALIDATE · SAVE/LOAD · PERF · DUMP |

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
| Chips / meters | `.chip .chip-gold/-red/-mint/-sky/-grey/-team/-dark .chips .delta .meter .meter-label .meter-blocks .blk .on .meter-value .meter-red/-mint/-sky/-team .meters-row .bar .bar-track .bar-fill .bar-pot .bar-value .stars .crest .avatar .icon` |
| Tabs / lists / tables | `.tabs .tab .active .list .list-row .list-empty .list-clickable .kv .tbl .tbl-compact tr.user td.gold th.r td.r` |
| Forms | `.field .field-label .input .input-row .toggle .toggle-label .toggle-hint .switch[aria-checked] .swatches .swatch` |
| Overlays | `#modal-root .modal-backdrop .modal .modal-wide .modal-head .modal-title .modal-x .modal-body .modal-buttons .modal.sheet .more-grid .event-modal .event-sender .event-text .event-choices .event-preview .toast-host .toast .toast-good/-bad/-gold/-info .tooltip .has-tip` |
| Game | `.led .led-team .led-score .led-mid .poss .drivelog .dl-line .dl-home .dl-away .dl-score .dl-kick .dl-muted .banner .banner-good/-bad/-gold/-sky .headline .headline-tag .stamp .stamp-A…F` |
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

---

## 11. Deviations from SPEC §4.4 / the contract (and why)

| Item | As built | Why |
|---|---|---|
| `dispatch` rng | `spendXp / autoSpend / autoOption` are called without an rng | their engine signatures have none (`Engine.spendXp(state, attr)`) |
| No-sync list | adds `sessionKick`, `finishUserGame`, `train`, `spendXp`, `autoSpend`, `autoOption` to the five game-step functions | SPEC §4.5: the showcase calls `Router.sync` itself on done; `postgame` is not derivable from state; training never changes the route |
| Notify order | subscribers are notified after `Router.sync()` | a screen destroyed by the route change must not re-render a stale state |
| `Router.sync` stay rule | hub-family screens stay when the state routes to `hub`; identical target → no remount | otherwise `train` from the training screen would bounce the user to the hub |
| `state.settings` mirror | `store.saveSettings()` writes `state.settings = Schema.mirrorSettings(settings)` directly | UI-owned field per SPEC §3.4; no Engine function exists for it |
| `state.playtimeSec` | accumulated by the store on save / autosave | UI-supplied field per SPEC §3.4 |
| `debug.forceKick` on sessions | mirrors `Engine.sessionKick` bookkeeping in debug.js | no engine entry point accepts a forced outcome (interface request: `Engine.sessionKick(state, rng, input, opts{forced})` / `Engine.applyUserKick(…, opts)`) |
| Settings extras | `haptics`, `keys` added | §4.5 settings row lists haptics (§4.8) and key remap |
| `?load=auto` | boot resumes the autosave directly | test convenience |
| Integration pass | `Router.resolve` routes a pending `COMBINE_PLAN` to `combine`; `Engine.markRead` is dispatchable (NO_SYNC); `C.tooltip` keeps its description in `#tip-descs`; `debug.jumpTo` settles one pending per step; `.screen-kick / .screen-session` full width and `.scroll-x { position: relative }` live in `style.css` | the U2 / U3 interface requests |
| Palette extras | `--team-text`, `--navy2` alias, shell colours | readable team text on navy; kick.css referenced `--navy2` |
