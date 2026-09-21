# Road to Glory: Kicker

A Retro Bowl-style single-player career game in which **you are the leg**. Start as a high-school recruit at a six-kick
showcase, pick a college, win the job, kick through seasons of weather, ice-outs and game-winners, declare for the
draft, survive the combine, sign pro contracts, and retire into the Hall of Fame — or not.

Everything is a static site: plain HTML, CSS and vanilla JavaScript (ES2017, no build step, no npm dependencies, no
images — every sprite and crest is drawn procedurally). It runs from `file://` as well as from any static host, on
phones and desktops.

## Play it

- Open `kicker/index.html` in a browser (double-click works), or serve the repository and open `/kicker/`.
- Or publish the single-file bundle: `node kicker/tools/bundle.js` writes `kicker/dist/kicker.html`, one self-contained
  HTML file that behaves exactly like the multi-file site.

### The leagues

The college side is 48 real FBS programmes on 2026 alignment — six conferences of eight, ordered so the rivalry
games are the real ones (Iron Bowl, The Game, Red River, Army–Navy…). Only 48 of roughly 134 programmes fit the
structure, so it is a selection; the independents, Notre Dame among them, have no conference slot. School
nicknames and colours belong to those schools — fine for a personal project, worth a licensing thought before
anything commercial. The **pro league is invented** (32 fictional teams in real cities), which is where the
trademark blocklist still does its work.

### Controls

**The kick (aim and hold — the default)**

1. **Aim** with `←` / `→` (or `A` / `D`) — 0.5° per tap, hold to sweep. The marker on the uprights is where you are
   pointing. This is the whole aim: nothing later moves it.
2. **Hold** `Space` (or `Enter`, or a finger anywhere on the scene). The power bar on the left climbs from zero. The
   green band is the power the distance needs — Legend difficulty hides it.
3. **Let go in the green — that is a guaranteed make.** Anywhere inside the band, the kick goes through: no wobble, no
   doink, no block. Outside it the normal physics apply, and the further out you release the worse the ball comes off
   your foot; hold past 100 % and you are in the red — an overswing, with more carry and less accuracy. Distance still
   decides everything, because the green sits higher up the bar the longer the kick, and past your range there is no
   green left to hit. Turn the guarantee off under Settings → "Green = guaranteed" if you want the risk back.
4. A tap too quick to register just returns you to aiming; it does not spend the kick. The play clock (the ring around
   the ball) starts when you begin the hold, and if it runs out the ball goes with whatever the bar had.

All four bindings are remappable under Settings → KEYS (`A` / `D` stay aim aliases only while the arrows are unremapped).
`Space` / `Enter` also skips the flight (after 300 ms) and the result beat. `Escape` on a kick screen opens Settings and
comes straight back to the pending kick.

**Flick mode** (Settings → Kick input → FLICK) — the original touch mechanic

1. Press on the ball and **pull down** for power, then **flick up** to strike.
2. The direction of the flick is your aim; its straightness is your strike quality — a wobbly flick hooks or pushes the
   ball, a yanked one loses quality, a lazy one loses power. Holding full power for more than 1.2 s before the flick is a
   hesitation (a composure penalty).
3. On a flick kick the confirm key is a keyboard fallback: it switches that scene to aim-and-hold, so a keyboard-only
   player never gets stuck on a kick that needs a pointer.

**Everywhere else**: `Tab` reaches every button, `Enter` activates the primary button of a screen (CONTINUE, START THE
DRAFT…), `Escape` closes modals and returns from a browsing screen to the hub, `←` / `→` browse offer cards. On phones
the bottom tab bar (HOME · TEAM · TRAIN · STATS · MORE) replaces the desktop rails; long-press any number for its tooltip.

**Season loop**: on the hub, TRAIN once a week (or REST on a bye), spend XP on the Training screen (undo until you leave
it), then PLAY GAME. NEXT KICK ▶ simulates to your next kick, WATCH plays the drives at ×1 / ×2 / ×4, SIM REST finishes
the game with auto kicks. Kickoffs are simulated unless you switch PLAY KICKOFFS on; extra points follow the AUTO-PAT
setting (OFF = you kick every PAT, SAFE = automatic unless the game is on the line, ALL = automatic).

### Difficulty

| | Rookie | Pro | All-Pro | Legend |
|---|---|---|---|---|
| Kick error | ×0.85 | ×1.00 | ×1.10 | ×1.20 |
| Ice-out chance | 25 % | 55 % | 65 % | 75 % |
| Play clock | 3.5 s | 2.5 s | 2.5 s | 2.0 s |
| Wind cap | 15 mph | 20 mph | 25 mph | 30 mph (+ gusts) |
| XP / contracts | ×1.25 / ×1.15 | ×1.00 | ×0.90 / ×0.92 | ×0.80 / ×0.85 |
| Wind-drift preview | full | full | numbers only | arrow only |
| Green power zone | yes | yes | yes | no |
| Event previews | numbers | icons | hidden | hidden |
| Career-threatening injuries | off | from 34 | on | on |

### Seeds

Every career is deterministic for its seed (numbers or words — `31337`, `road to glory`): the same seed gives the same
showcase, the same offers, the same weather, the same AI kickers and the same suggested name / look / hometown, so
two players can compare choices (anything you pick by hand on the New Career form is kept when you change the seed). Leave the seed
empty (or press RANDOM) for a fresh one; the seed is shown on the title screen and on the legacy report (tap to copy).

### Saves and export

- The game **autosaves** after every game, week, event and decision (`rtg.save.auto` in `localStorage`); CONTINUE on the
  title resumes it. Three manual slots live under MORE → SAVES.
- **Export** turns a save into a text string (copy it anywhere); **Import** pastes one back. Saves carry a checksum and a
  version: a tampered or newer-version save is refused with a message.
- Settings (`rtg.settings`) and the cross-career records board (`rtg.records`, shown on the title ticker and the legacy
  screen) persist separately from careers. Settings are **not** part of a save: loading a career applies the settings you
  are playing with now, not the ones it was saved with.
- In private browsing — or when storage is full — everything lives in memory for the session: the game says so with a
  warning, and those saves stay loadable until you close the tab (they are gone afterwards).

## Project layout

```
kicker/
  index.html              the page (script order is a contract — see docs/SPEC.md §3.2)
  css/style.css           tokens, chrome, components (the visual system)
  css/kick.css            the kick scene, session screens, game screen, practice
  css/screens.css         the DOM screens (hub, inbox, training, postgame, draft, contract, legacy, …)
  js/00_namespace.js      window.RTG = {VERSION, SAVE_VERSION, Data, UI}
  js/engine/*.js          the pure, DOM-free game engine (tuning, rng, schema, kick model, sim, season, career,
                          contracts, draft, events, awards, stats, save); fn(state, rng, args) → result
  js/data/*.js            colleges (48 real FBS programmes), NFL teams (fictional), names, awards,
                          events, headlines, records, blocklist
  js/ui/*.js              storage, palette, store (the one owner of state), router, components, sprites, canvas,
                          audio, input (flick / meter), kickview (the kick scene)
  js/ui/screens/*.js      one file per screen; each registers itself with RTG.UI.Router
  js/ui/app.js            boot: chrome (top bar, tab bar, rails), settings classes, resize / key routing, autosave
  js/debug.js             RTG.debug — the scripted API the tests drive (?debug=1 mounts a panel + strict validation)
  docs/                   SPEC.md (design + technical spec), ENGINE_API.md, UI_API.md, BALANCE.md
  test/*.test.js          Node engine tests (node:test, no dependencies); test/load.js loads the engine into a vm
  test/e2e/*.spec.js      Playwright specs (dev-only) + _harness.js, _kickhelpers.js, run.js, qa_shots.js
  tools/bundle.js         the single-file bundler
  dev/kickscene.html      the kick scene on its own, with pickers (distance, hash, wind, weather, pressure)
```

Rules the code follows: the engine never touches the DOM, a clock or `Math.random` (every draw comes from the career's
seeded RNG, so replays are exact); the UI changes state only through `store.dispatch('EngineFn', …)`; every constant
lives in `RTG.Tuning`; every file is a classic script using the same wrapper so the game parses on old Safari / Chrome.

## Tests

**Engine (Node ≥ 18, nothing to install):**

```
node kicker/test/run.js              # every kicker/test/*.test.js in its own process (23 files)
node kicker/test/run.js --balance    # + the slow statistical calibration tests
node kicker/test/kick.test.js        # a single file
node kicker/test/balance_report.js   # prints the FG% calibration table
```

**Browser (Playwright 1.56 + Chromium, dev-only):** each spec is a plain Node script using `node:test` that opens the
app on **both** `file://…/kicker/index.html` and `http://127.0.0.1:8080/kicker/` (the runner serves the repository
itself), on a 390×844 iPhone-12-style viewport and a 1280×800 desktop (some specs add 844×390 and 768×1024).

```
node kicker/test/e2e/run.js                 # every spec, both modes (boot, newcareer, saveload, kick_mouse, kick_touch,
                                            # kick_keyboard, force_kick, game_flow, season_and_career, events, responsive,
                                            # a11y, full_career, perf)
node kicker/test/e2e/run.js kick perf       # only the specs whose name contains an argument
node kicker/test/e2e/full_career.spec.js    # one spec on its own (starts its own server for the http mode)
node kicker/test/e2e/qa_shots.js [--http] [phone|desktop|landscape]   # screenshots of every screen → test/e2e/shots/qa_*.png
```

`full_career.spec.js` plays a complete career through the real screens (six real flicks at the showcase, a real game
week, the wizard cards, the combine, the draft ticker, contract cards, retirement, the legacy report) with
`Schema.validate` after every dispatch and zero console errors; `perf.spec.js` checks heap growth over 300 game
simulations, the kick scene's frame-cost p95, and that screen mount / unmount cycles leak no listeners.

Screenshots land in `kicker/test/e2e/shots/`. In the browser, `?debug=1` mounts the debug panel and validates the state
after every engine call; `RTG.debug.*` (see `docs/SPEC.md` §3.8) drives everything from the console:
`RTG.debug.newCareer({seed: 7})`, `RTG.debug.jumpTo({stage: 'NFL', phase: 'REG', week: 1})`,
`RTG.debug.forceKick({outcome: 'DOINK_IN'})`, `RTG.debug.simSeason()`, `RTG.debug.perf()`.

## The single-file bundle

```
node kicker/tools/bundle.js                          # → kicker/dist/kicker.html (full document)
node kicker/tools/bundle.js --fragment out.html      # body-only fragment for hosts that supply their own <html> skeleton
```

The bundler inlines every local stylesheet and script of `index.html` in document order (no minification, no
transforms; a literal `</script>` inside a source file is escaped) and keeps the Google Fonts link — the page falls back
to Courier when the font cannot load. Open `kicker/dist/kicker.html` from `file://` or drop it on any static host.
