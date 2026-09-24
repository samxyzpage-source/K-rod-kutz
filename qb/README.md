# Road to Glory: QB — The Moment

The quarterback sibling of *Road to Glory: Kicker* (`../kicker/`), built in the same idiom: a Retro Bowl-style
pixel game where **you only play the moments**. In a moment you make a **pre-snap read** (the defence shows a look;
pick one of 2–3 plays) and then **you draw the play**, like Soccer Superstar: a line from the quarterback to a
receiver is the ball's exact path, a line into space is where the quarterback runs. Only the key snaps of a game are
played; the camera sits behind and above the quarterback like the kicker's scene. This build is the playable demo of
the moment: a six-snap drive (3rd-and-medium, 3rd-and-long, a red-zone snap, short yardage, a two-minute drill, a
last-play game-winner) with a box score and a passer rating at the end. The full career comes later and will host the
moment screen unchanged.

Everything is a static site: plain HTML, CSS and vanilla JavaScript (ES2017, no build step, no npm dependencies, no
modules, no images — every sprite is drawn procedurally). It runs from `file://` as well as from any static host, on
phones (390 px, and 320 px still works) and desktops. `kicker/` is never edited — it is the style guide and the source
of every kit file copied here.

## How to play

1. **The situation** — down, distance, the spot, the clock, the score. Tap to read.
2. **The read** — the defence shows a look (safeties deep or rolled down, corners pressed or off, the box, a blitz
   tell). Pick one of the 2–3 play cards; each carries the coach's advice (GOOD / OK / BAD, or `?` when the look may
   be lying — a smarter quarterback sees through more disguises). A SNEAK or a DRAW card on short yardage is resolved
   at the snap.
3. **The snap — draw it.** Put your finger (or the mouse) on the quarterback and draw (on a touch screen the line is
   drawn a little above your fingertip, so your thumb never hides it; on the very first snap the play waits for your
   first touch):
   - **To a receiver → a pass.** The line is the ball's exact path: it flies along it and lands where the line ends.
     Bend it around a linebacker. A defender near the line can get a hand on it (a tip, or a pick).
   - **Fast for a bullet, slow for a lob.** The speed of your stroke is the touch: a quick, aimed stroke is a bullet
     on a rope (a linebacker at chest height is where interceptions come from); a slow, patient line floats over the
     underneath defenders and is contested at the end. A longer line needs more arm — past your arm's range the line
     turns red and the ball dies there. Draw a deep line too fast and the HUD says `TOO FAST`: the ball gets there
     before your receiver does. Throw before his route breaks and he is not looking yet.
   - **Into space → a run.** Roll out, step up, scramble: the quarterback runs the line you drew (draw again for a new
     run, or draw the pass from wherever he got to). Cross the line of scrimmage with the ball and it is a scramble —
     no more passing, and the yards are rushing yards.
   - **Out of bounds → a throw-away** (or the THROW AWAY button / the X key). Never a turnover. Nobody catches a
     ball out of bounds.
   - **Changed your mind?** Drag the line back onto the quarterback, or off the field, and let go (`LET GO TO
     CANCEL`). A finger resting on its line keeps what it drew: a pass line stays a pass.
   - **While your finger is down the play runs in slow motion** (about 15 % speed — the rush still creeps). The slow
     motion budget is about four real seconds per play; after that time runs at full speed.
   - The HUD says what your line is (`PASS → WR1 · BULLET`, `RUN`, `THROW AWAY`, `TOO LONG`, `TOO FAST`). A **FIELD GENERAL**
     also sees the landing spot coloured by the race to it — green, gold or red — before he lets go. Aim assist
     (Settings, on by default) snaps a pass line's end onto the spot its receiver can reach when you end close to it.
   - Stand there holding it and the pocket collapses: sacked. Running straight back is a backpedal — the rush runs
     you down (roll out across the field instead).
4. **The result** — the banner, what the throw looked like (on the money / led him / behind him · on time / late ·
   bullet / touch / lob) and what the coach saw. Then the story of the drive and the next snap.

**Keyboard (a complete path):** `1`–`5` aim a straight pass at a receiver (WR1 WR2 SLOT TE RB — the play slows
down while you compose) · arrows nudge the end 1 yd · `Q` / `E` bend the line · `L` cycles BULLET / TOUCH / LOB ·
`Enter` or `Space` throws · `Backspace` cancels · `R` starts a run (arrows steer, `Enter` commits) · `X` throws it
away · `Escape` opens Settings. Keys are remappable in Settings.

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
  js/engine/field.js      RTG.Field — the play on the field: 22 players and the ball in yards, stepped at a fixed dt (engine agent)
  js/engine/play.js       RTG.Play — buildContext / snap / live / resolve / driveScript / rating (engine agent)
  js/ui/storage.js, palette.js, components.js, canvas.js, audio.js   the kit (copied)
  js/ui/sprites.js        the kicker's atlas, extended with the QB, receivers, defenders, ball, rings (scene agent)
  js/ui/playinput.js      RTG.UI.PlayInput — the draw hand: a line from the QB (pointer or keyboard) → a draft + loft (scene agent)
  js/ui/playview.js       RTG.UI.PlayView — the scene: SITUATION → READ → PLAY (the live, drawn on) | RUN → RESULT → DONE (scene agent)
  js/ui/store.js          the demo's tiny store: drive script, index, line, seed, rng, each moment's plan (shell agent)
  js/ui/screens/*.js      title, moment, summary, settings (shell agent)
  js/debug.js             RTG.debug — current / forceResult / drawPass / drawRun / reachSpot / replay / skipTo (shell agent)
  js/ui/app.js            boot: screens, settings classes, resize / key routing (shell agent)
  test/*.test.js          Node engine tests (node:test, no dependencies); test/load.js loads the engine into a vm
  test/e2e/*.spec.js      Playwright specs (dev-only) + _harness.js, _playhelpers.js, run.js, qa_shots.js
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
syntax level and Tuning writes, and checks the namespaces of the delivered modules. `test/play.test.js` pins the
engine (draw counts, determinism, the read, the snap's cast, the run cards, the drive script, the passer rating);
`test/field.test.js` pins the field simulation (live vs resolve equality, classify's PASS / RUN / THROWAWAY / INVALID
rules, tips and picks on a bullet through a linebacker vs a lob over him — up to the catch point — scatter, the rush
and the rollout, a retreat that buys nothing, the scramble / tackle / out-of-bounds / touchdown rules, nobody catching or
playing out of bounds, a spot never rounded up into a score or a first down, a GOOD call's separation over a BAD one, a
ball led onto a receiver's route caught in stride, a ball that beats the break, the catcher on the result, garbage in
→ no NaN); `test/balance.test.js` (`--balance`, about 1.5 min) pins the bots' tiers and strategies, including the
no-read quick throw (QUICK) trailing a reader;
`test/plays_lint.test.js` lints the play book (every assignment names an existing route and slot, every coverage has
a look and a pressureMul, every route's ideal lead / loft is in range and its window sits inside [0, 4]).

**Browser (Playwright 1.56 + Chromium, dev-only, never `npm install` — it lives in `/opt/node22/lib/node_modules`):**
each spec is a plain Node script using `node:test` that opens the demo on **both** `file://…/qb/index.html` and
`http://127.0.0.1:8080/qb/` (the runner serves the repository root), on a 390×844 phone and a 1280×800 desktop
(`H.VIEWPORTS` also has `landscape` 844×390, `narrow` 320×568 and `tablet`).

```
/opt/node22/bin/node qb/test/e2e/run.js                 # every spec, both modes
/opt/node22/bin/node qb/test/e2e/run.js boot moment     # only the specs whose name contains an argument
/opt/node22/bin/node qb/test/e2e/boot.spec.js           # one spec on its own (starts its own server for the http mode)
/opt/node22/bin/node qb/test/e2e/qa_shots.js            # screenshots of every beat (title, read, lines mid-draw, flight, sack, pick, tip … summary)
```

`boot.spec.js` boots with zero errors; `moment.spec.js` plays six moments through the real screens in every mode ×
viewport with REAL drawn gestures (a fast bullet, a slow lob, a keyboard-only pass on the desktop / a bent line by
CDP touch on the phone, a drawn rollout then a pass, a drawn scramble past the line, a throw-away line out of bounds),
replays each recorded plan with `Play.resolve`, checks the box score (scrambles are rushes), replays a seed, forces
results, pins the draw accounting (every moment costs the drive's rng 3 draws), opens settings with Escape and checks
320 px and landscape; `controls.spec.js` covers THROW AWAY, the sack, invalid and cancelled drafts, slow motion and its
budget, the FIELD GENERAL's preview colour, aim assist on / off, keyboard composing, reduced motion, seed → identical
situations and cast, no horizontal scroll at 320 px in every phase, a frame p95 under 4 ms while drawing and in flight,
the SNEAK card, the core rule watched every frame (the scene's 22 actors are the live's positions, within the
sub-step presentation offset; a press anywhere in the start circle starts the line on the quarterback), the first
moment waiting for a touch, a press during the slide, the touch lift, the two abort gestures and a resting pass line
that stays a pass. `_playhelpers.js` holds the shared hands (pick, wait for a window, draw a pass / a run / a
throw-away with timed mouse or CDP-touch strokes, the keyboard pass and run, the interstitial).

Never edit source while an e2e run is in progress (false failures). Screenshots land in `qb/test/e2e/shots/`.
In the browser, `RTG.debug.*` drives the demo from the console (`RTG.debug.forceResult('INT')`,
`RTG.debug.current()` (the live snapshot and the draft), `RTG.debug.drawPass('WR1', {loft: 1})`,
`RTG.debug.drawRun('rollout')`, `RTG.debug.replay(0)`, `RTG.debug.seed()`, `RTG.debug.skipTo('summary')`,
`RTG.debug.unhold()` (start the first moment's clock without a touch)).

## The single-file bundle

```
node qb/tools/bundle.js                          # → qb/dist/qb.html (full document)
node qb/tools/bundle.js --fragment out.html      # body-only fragment for hosts that supply their own <html> skeleton
```

The bundler inlines every local stylesheet and script of `index.html` in document order (no minification, no
transforms; a literal `</script>` inside a source file is escaped) and keeps the Google Fonts link — the page falls back
to Courier when the font cannot load.
