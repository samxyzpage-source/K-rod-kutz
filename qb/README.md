# Road to Glory: QB — The Moment

The quarterback sibling of *Road to Glory: Kicker* (`../kicker/`), built in the same idiom: a Retro Bowl-style
pixel game where **you only play the moments**. In a moment you make a **pre-snap read** (the defence shows a look;
pick one of 2–3 plays) and then **the throw** (pick the receiver, aim-then-hold the velocity meter, drag for lead
and loft, let go). Only the key snaps of a game are played; the camera sits behind and above the quarterback like the
kicker's scene. This build is the playable demo of the moment: a six-snap drive (3rd-and-medium, 3rd-and-long, a
red-zone snap, short yardage, a two-minute drill, a last-play game-winner) with a box score and a passer rating at the
end. The full career comes later and will host the moment screen unchanged.

Everything is a static site: plain HTML, CSS and vanilla JavaScript (ES2017, no build step, no npm dependencies, no
modules, no images — every sprite is drawn procedurally). It runs from `file://` as well as from any static host, on
phones (390 px, and 320 px still works) and desktops. `kicker/` is never edited — it is the style guide and the source
of every kit file copied here.

## Play it

- Open `qb/index.html` in a browser (double-click works), or serve the repository root and open `/qb/`.
- `?seed=<number or word>` in the URL reproduces a drive (the same looks, the same windows, the same weather).
- Or publish the single-file bundle: `node qb/tools/bundle.js` writes `qb/dist/qb.html`, one self-contained HTML file
  that behaves exactly like the multi-file site.

## Project layout

```
qb/
  index.html              the page (script order is a contract — see test/load.js ORDER)
  css/style.css           tokens, chrome, components (copied from the kicker: the visual system)
  css/play.css            the QB moment scene (scene agent)
  css/screens.css         the DOM screens: title, drive interstitial, summary, settings (shell agent)
  js/00_namespace.js      window.RTG = {VERSION, Data, UI}
  js/engine/tuning.js     RTG.Tuning — every balance constant (Tuning.qb) (engine agent)
  js/engine/util.js       RTG.Util (copied)         js/engine/rng.js  RTG.RNG, seeded mulberry32 (copied)
  js/engine/weather.js    RTG.Weather (copied; reads Tuning.weather and Tuning.difficulty.pro.windCap)
  js/data/plays.js        RTG.Data.plays — routes, plays, coverages (engine agent)
  js/engine/play.js       RTG.Play — buildContext / snap / throw / driveScript / rating (engine agent)
  js/ui/storage.js, palette.js, components.js, canvas.js, audio.js   the kit (copied)
  js/ui/sprites.js        the kicker's atlas, extended with the QB, receivers, defenders, ball, rings (scene agent)
  js/ui/playinput.js      RTG.UI.PlayInput — target selection, the hold meter, drag → lead/loft (scene agent)
  js/ui/playview.js       RTG.UI.PlayView — the scene: SITUATION → READ → SNAP → THROW → FLIGHT → RESULT → DONE (scene agent)
  js/ui/store.js          the demo's tiny store: drive script, index, line, seed, rng (shell agent)
  js/ui/screens/*.js      title, moment, summary, settings (shell agent)
  js/debug.js             RTG.debug — forceResult / current / seed / state / skipTo (shell agent)
  js/ui/app.js            boot: screens, settings classes, resize / key routing (shell agent)
  test/*.test.js          Node engine tests (node:test, no dependencies); test/load.js loads the engine into a vm
  test/e2e/*.spec.js      Playwright specs (dev-only) + _harness.js, run.js
  tools/bundle.js         the single-file bundler
```

Rules the code follows (the kicker's): the engine (`js/engine/*`, `js/data/*`) never touches the DOM, a clock or
`Math.random` — every draw comes from the seeded RNG passed in, every function documents its draw count and a fork
costs exactly one parent draw, so replays are exact; every constant lives in `RTG.Tuning`; every file is a classic
script in the same `(function (root) { … })(typeof window !== 'undefined' ? window : globalThis)` wrapper; ES2017 at
most (no `?.`, `??`, class fields, optional catch binding).

## Tests

**Engine (Node ≥ 18, nothing to install):**

```
node qb/test/run.js                          # every qb/test/*.test.js in its own process
node qb/test/run.js play                     # only the files whose name contains an argument
/opt/node22/bin/node --test qb/test/play.test.js   # a single file
```

`test/purity.test.js` scans every engine / data file for DOM, clock and `Math.random` references, the wrapper, the
syntax level and Tuning writes, and checks the namespaces of the delivered modules.

**Browser (Playwright 1.56 + Chromium, dev-only, never `npm install` — it lives in `/opt/node22/lib/node_modules`):**
each spec is a plain Node script using `node:test` that opens the demo on **both** `file://…/qb/index.html` and
`http://127.0.0.1:8080/qb/` (the runner serves the repository root), on a 390×844 phone and a 1280×800 desktop
(`H.VIEWPORTS` also has `landscape` 844×390, `narrow` 320×568 and `tablet`).

```
/opt/node22/bin/node qb/test/e2e/run.js                 # every spec, both modes
/opt/node22/bin/node qb/test/e2e/run.js boot moment     # only the specs whose name contains an argument
/opt/node22/bin/node qb/test/e2e/boot.spec.js           # one spec on its own (starts its own server for the http mode)
```

Never edit source while an e2e run is in progress (false failures). Screenshots land in `qb/test/e2e/shots/`.
In the browser, `RTG.debug.*` drives the demo from the console (`RTG.debug.forceResult('INT')`,
`RTG.debug.current()`, `RTG.debug.seed()`, `RTG.debug.skipTo('summary')`).

## The single-file bundle

```
node qb/tools/bundle.js                          # → qb/dist/qb.html (full document)
node qb/tools/bundle.js --fragment out.html      # body-only fragment for hosts that supply their own <html> skeleton
```

The bundler inlines every local stylesheet and script of `index.html` in document order (no minification, no
transforms; a literal `</script>` inside a source file is escaped) and keeps the Google Fonts link — the page falls back
to Courier when the font cannot load.
