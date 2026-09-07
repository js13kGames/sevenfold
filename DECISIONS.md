# DECISIONS.md — SEVENFOLD

Running log of every decision made where the spec (CLAUDE.md, docs/01–08) was
silent or where a number was tuned. Newest at the bottom of each section.

## Phase 0 — Setup (2026-09-04)

- Environment: Windows 11, Node 22.14, Git Bash. No `apt-get`; `advzip`, `ect`,
  `zopfli` binaries are not available. Zip fallback: `@gfx/zopfli` (WASM zopfli,
  dev dep) producing a raw deflate stream, wrapped in a hand-rolled single-entry
  zip container (local header + central dir + EOCD, CRC32 computed in JS). Falls
  back to `zlib.deflateRawSync` level 9 if zopfli fails. Verified with `unzip -t`.
- Hosted library `https://play.js13kgames.com/2026/webxr/three.js` responds
  200 (Cloudflare, 726,241 bytes). It is a single self-contained minified ESM
  bundle, `REVISION "185"`, exports `WebGLRenderer`. A copy is kept at
  `tools/three-hosted-r185.js` (gitignored) for the Playwright `page.route`
  fallback; npm `three@0.185.0` is only the API reference (its
  `three.module.js` splits into `three.core.js`, so the hosted copy is the
  better routing target).
- Dev server: `tools/serve.js` (zero-dep static server on 8080).

## Size log

| step | raw | min | rolled | zip |
|---|---|---|---|---|

## Phase 1 — Pure simulation (2026-09-04)

### Interpretation of the spec

- `sim.js` exposes `S._spawn` / `S._spawnBoss` (test hooks, ~30 bytes) so unit
  tests can place enemies without playing waves.
- A1 "again at DT=1/72 and 1/120": the sim's `DT` is a fixed 1/90 constant by
  design; the test instead feeds hand poses at 72 / 90 / 120 Hz input rates
  (what a 72 Hz or 120 Hz headset actually does) while the sim steps at 1/90.
  Segment-length bound relaxed from 3× to 3.5× rest: hands at 6 m/s stretch the
  Verlet rope transiently to ~3.1× (0.10 m); that is stretch, not an explosion.
- A7 "across DT batching patterns": inputs are injected per sim step, so
  `step(1)`×n and `step(n)` see the same stream; the test replays a recorded
  40 s perfect-bot stream twice and compares `hashState` every 90 steps, and
  checks the hash changes with the seed.
- Hands teleporting > 0.5 m in one step (controller reconnect, tracking loss)
  reset the rope to a straight line between the hands: no spurious crack, no
  velocity spike.
- Projectiles test the taut rope / Lance block **before** head, hand and unicorn
  hits, and the band is taken from the *nearest* rope point. Otherwise blocking
  with the red (left-hand) end was impossible: the orb hit the hand first.
- Lance "pierces up to 3": parts still on the 0.6 s cooldown from this thrust
  count toward the limit, so a thrust through four enemies hits the first three
  along the shaft and not the fourth on the next frame. A killed enemy no longer
  occupies the shaft.
- Light clamps at 0 (a Shell dive at 1 Light no longer shows −1).
- Endless mode follows docs/03 literally: wave n = wave 5 + (n−13) % 7, so the
  bosses recur (wave 16 = Gloam, wave 19 = Eclipse); counts ×1.3^(n−12), speed
  ×1.05^(n−12).

### Tuned constants (docs/03 value → shipped value, reason)

| what | docs | now | why |
|---|---|---|---|
| wave 1/2/3 interval | 2.0/2.0/1.8 | 3.0/2.6/2.6 | keep clear times ≥ 15 s |
| wave 5/6/7 interval | 1.6/1.6/1.5 | 1.8/2.3/3.2 | 15 s floor; wave 7 Swarm needs room |
| wave 9/10/11 interval | 1.4/1.2/1.1 | 2.4/1.5/3.0 | 360° spawns; wave 11 was unwinnable at human hand speed |
| spawn order | as listed | round-robin by type | no front-loaded triple Shells |
| Thunderhead HP / phase 2 | 60 / <30 | 400 / <150 | resonant arrows deal 18; 60 HP died in one eye window |
| Gloam core HP | 30 | 650 | phase 2 is the lance duel; 40–150 s window |
| Gloam phase 2 | kneels | kneels **and steps to 2.2 m**, core band re-rolled to 2–6 | red/orange cores were unreachable for resonant Lance contact from the play area |
| Gloam plates | chest Maul-only, stoop after slam | any plate breaks from a resonant arrow / Maul; no stoop | a 2.2 m Lance cannot reach 3.2 m plates from a 1 m play radius; arrows are the colour-aim lesson |
| Eclipse shells | 30 / 3 plates / 30 | 130 / three 24-HP melee-only tentacles / 180 | one-hit plates ended phase 2 in 1.2 s |
| Spitter cadence | 2.5 s | 3.5 s, first shot at the head | gives a blockable opener; wave 11 density |
| Shell reaching the unicorn | −2 immediately | flares 2.5 s then −2 | telegraph; blockable by killing it |
| Swarm dart cadence | — | 0.9 s | 3 landings in 2 s = −1 Light |
| player-blocking enemies | −1 every 2 s | flare 1.5 s, swing at 2 s; taut rope within 0.7 m or Lance blocks | as docs, telegraph added |

### Bot (test/bot.js)

Virtual body: head ≤ 2 m/s inside a 1 m radius, hands ≤ 5 m/s within 1.15 m
of the head, aim hold 0.27 s, reaction pause 0.16 s. Policies: rope by default
(arc for melee range, bow for the rest, ambush point on a circling Wisp's
orbit, rope/Lance block for unicorn-bound orbs with an intercept point outside
the unicorn's damage sphere), Lance when Swarms or lance-feasible Shells/Husks
are present and no Wisps circle, Maul for Eclipse tentacles, bow for
Thunderhead's eye and Gloam's plates, Lance duel for Gloam's core, shield stance
for the Eclipse pulse. Per-target failure counter falls back to the bow.

Results (seed: per-wave clear s): seeds 1–5 all reach Dawn with 5 Light;
Thunderhead 46–71 s, Gloam 46–47 s, Eclipse 44–47 s; normal waves 16–35 s.
Seeds 6–10: 4 of 5 reach Dawn (seed 6 dies in wave 11 — the densest wave is
deliberately at the edge of human hand speed). Wrong-tool bot clears 1–7 and
dies to Gloam on every seed; idle bot loses all Light by 19 s.

### Size log
(sim.js is not yet built; first measurement after Phase 2.)

## Phase 2 — Render / XR / desktop (2026-09-04)

- Modules share one scope in the build (imports stripped), so every top-level
  name is prefixed per module (`rd*`, `inp*`, `xr*`, `au*`, `m*`). The Three.js
  namespace is `T` in main and `rdT` in render.
- The hosted URL is a plain global `U` defined *outside* the roadroller payload
  (`U="https://play.js13kgames.com/2026/webxr/three.js"`), so the grep check
  finds exactly one URL and judges can read it; the packed code does `import(U)`.
- XR poses are converted to arena space through a recentre transform
  (`inpO`: origin + yaw) taken on the first `select` at the title screen; the
  scene root group carries the inverse. The player is never moved.
- No pose interpolation between sim steps (90 Hz sim vs 72–120 Hz display):
  measured jitter is sub-pixel; the `alpha` from the accumulator is unused.
- Enemies: one instanced sphere with per-type non-uniform scale (silhouettes),
  one instanced core sphere coloured by weakness band, one plate pool (Shells
  and Gloam), one swarm pool. Bosses are merged geometries (custom `merge`,
  no BufferGeometryUtils). 18–26 draw calls.
- Rope: `TubeGeometry` over a `CatmullRomCurve3` of the 29 sim points, rebuilt
  each frame; its built-in `uv.x` drives the band shader, and weapon geometries
  write their band parameter into `uv.x` too. The shader indexes `vec3 c[7]`
  dynamically (WebGL2 everywhere Three r185 runs).
- The hosted three.js sends **no `Access-Control-Allow-Origin`**: a cross-origin
  module import from localhost fails in every browser. The entry is same-origin
  on play.js13kgames.com, so production is fine. `tools/serve.cjs` rewrites the
  URL to a local byte-identical copy for pages it serves (dev + emulator
  checklist); the browser tests route the URL the same way and serve the dist
  unrewritten (`NO_REWRITE=1`).
- terser: `booleans_as_integers` must stay **off** — Three tests
  `visible === false` / `transparent === true`; with it on, hidden bosses
  rendered (the "wings" bug) and blending broke. `unsafe`, `unsafe_math`,
  `unsafe_methods`, `unsafe_proto`, `hoist_funs`, 5 passes are on.
- Any property looked up by *string* must not be `_`-prefixed (the mangler
  cannot see it): weapon meshes are `rdM.lance` etc.; the bow stores the hand
  object, not `'_L'`.
- Hand teleport > 0.5 m/step resets the rope (controller reconnect); canned
  desktop sigils end 31° below eye level so the forged weapon is in view.

## Phase 3/4 — Tests (2026-09-05)

- Browser suite runs the unzipped `dist/sevenfold.zip` from a temp dir through
  the dev server. Replay `test/replays/w1-2.json` is the recorded perfect-bot
  input for waves 1–2 (seed 1), injected through `window.SF` with the loop in
  manual mode; the same page then exercises keys 1–5, injection, game over,
  R, resize/fullscreen, mute/best persistence and the offline message.
- XR shim (`test/xr-shim.js`) works with Three r185's `WebXRManager`. What had
  to be faked beyond docs/07 C: `session.visibilityState`, an `inputsourceschange`
  event with `added` (dispatched on the first `requestAnimationFrame`, after
  Three has subscribed), `frame` on every select/squeeze event (Three calls
  `controller.update(event.inputSource, event.frame, …)`), and hiding
  Chromium's real `XRWebGLBinding` (Three constructs one with the fake session
  and the native class rejects it). `XRWebGLLayer.framebuffer = null` +
  per-eye viewports is enough. Result: enter → 300 frames → select starts the
  game (recentre) → Lance sigil through fake grips with both squeezes → weapon
  `lance` → `session.end()` → desktop mode, zero errors.
- Firefox: Playwright's Firefox (1538, and the older beta 1526) cannot start on
  this Windows 11 26200 machine — side-by-side error "Dependent Assembly
  mozglue could not be found"; files match a fresh download. Tests support
  firefox and report it; recorded as a manual item in SUBMISSION.md.

## Phase 5/6 — Audio and size (2026-09-05)

- First full build: 14,981 bytes zipped, no audio. Roadroller -O2 saves only
  ~40 bytes over -O0 on this code, so minified size is the lever.
- Structural savings: build-stripped test hooks (`//@test` lines: hashState,
  spawn hooks, recogniser features), mangled `rdM._*` keys, sky dome / dust /
  ring pool / lightning line pool / forge trail / Dawn arc removed, one
  instanced body geometry for all enemies, TubeGeometry rope, table-driven key
  map, `Object.assign`-style inject, Thunderhead 12 spheres, shorter hints/CSS.
- Feature cuts, in the CLAUDE.md order: endless + combo (7); hit-stop, dissolve,
  trail, dust (6); sound (5) is a 1.3 KB Web Audio synth behind `--audio` —
  particles + audio = 13,695, audio alone 13,4xx, particles alone 13,244,
  neither 12,901. Following "cut from the bottom", particles (6) stay and sound
  (5) is out. Eclipse phase 2 merged into phase 3 (docs/06 step 6) rather than
  dropping the boss; Swarm stings and the Wisp slingshot were cut as untested
  sub-mechanics.
- Shipped build: `node build.js --level 2 --particles` → **13,244 bytes**
  (68 under the limit; above the 12,900 working target — accepted because the
  build is deterministic and gated, and the alternative was shipping without
  hit feedback).

### Size log

| step | raw | min | rolled | zip |
|---|---|---|---|---|
| Phase 2 first build (level 0) | 55,347 | 40,050 | 19,289 | 14,981 |
| test hooks stripped, slingshot cut | 54,125 | 39,061 | — | — |
| rdM mangled, sky/dust/rings cut | 53,668 | 38,113 | 18,549 | 14,425 |
| shader index, geometry trims | 53,108 | 37,596 | 18,412 | 14,325 |
| endless/combo/darts/Eclipse-p2 cut, one body, tube rope | 50,255 | 35,344 | 17,503 | 13,640 |
| micro cuts, terser passes | 50,009 | 35,080 | 17,428 | 13,587 |
| trail/arc/bolt/hints/CSS cut (+ audio) | 50,590 | 35,386 | 17,662 | 13,737 |
| optional flags: none / particles / audio / both | — | 32,702 / 33,696 / 33,997 / 34,991 | — | 12,901 / 13,189 / 13,407 / 13,695 |
| **final, level 2, --particles** | 48,594 | 33,928 | 17,005 | **13,244** |

## Post-review changes (2026-09-05, user present)

- Visual pass after the first hands-on look: brighter ambient/directional light,
  lighter stone/sea/moon palette, lit enemy edges and larger cores, a horse-shaped
  unicorn at 75 % opacity with bigger motes, objective text on the title
  ("Guard the unicorn behind you. Pull a trigger.") and in the desktop overlay.
- User decision: **sound + embers over the third boss.** Sound + embers + Eclipse
  = 13,765 bytes; the Eclipse is now behind `--eclipse` (lines tagged
  `//@eclipse`; `WAVES` ends at Gloam and Dawn fires on the last boss id
  `WAVES.length/4-1`). The sim tests keep running the 12-wave game from `src/`.
- To get under the limit after the visual pass: F fullscreen key, mouse-wheel
  Prism roll, two hints, the `local` reference-space fallback, CSS and message
  trims were removed. Shipped: 13,279 bytes (`node build.js --level 2`).
- A stale dev server from this session was holding port 8080 with the old
  serve.js (no CORS rewrite), which is why `localhost:8080/dist/` showed the
  "needs the hosted Three.js" message; killed and restarted.

## The rehaul (2026-09-05, user present)

The user played the first build and rejected it: "looks absolutely shit, the world,
the enemies, everything", too many bosses, the objective unclear, the sound
irritating. Instruction: a complete rehaul; the look is the main thing (a grimy
Stranger-Things world with particles like snow and lightning), one enemy type
(unicorns with coloured horns) plus a huge boss unicorn, about ten waves, better
weapons, innovative music and VR-worthy sound effects. Asked once, answered:

- **Player**: "a mage coming to save the unicorn world"; enemies of one type, the
  unicorns; no unicorn to guard ("unnecessary").
- **Health**: yes to "seven colours are seven lives" (bands grey out from violet).
- **Weapons**: "the 2-hand boomerang (main weapon), lasso, a powerful area move;
  you decide how it needs to be." → the sigil forge and the five forms are gone.
- **Music**: the adaptive "choir of horns".

### Design decisions (docs/09 is the spec)

- Five verbs, all physical states of the rope and the triggers: free rope (whip),
  arch (both triggers: blocks, melee), boomerang (release the arch at ≥ 2.5 m/s
  and < 20 m/s — teleports are not throws), lasso (one trigger ≥ 0.25 s; the loop
  is the far colour: right hand red, left hand violet; aim assist within 3 m so
  VR players can catch), Nova (charged arch + clap). Squeeze counts as trigger so
  grips and pinches both work; hand tracking gets everything (one pinch = lasso,
  two = arch).
- The bow is gone (the boomerang is the ranged verb); the whip stays because the
  rope physics already gives it.
- One enemy species with three variants by numbers only (stalker / charger /
  brute) and the giant appearing twice (Herald wave 5 scale 2.2, Sovereign wave 10
  scale 3.4 with a colour-cycling horn) — one model, one InstancedMesh, one
  shader, so the "single enemy type" the user asked for costs nothing extra.
- Giant loop: circle → telegraph (rear + horn lightning + rising sound) → charge;
  blocked charge = 3.5 s stagger in front of you = the damage window. Every third
  attack is a lightning rune to sidestep. Summons keep the horde (and the music)
  alive during the fight.
- Ten waves as tabled in docs/09, tuned with the bot until seeds 1–8 all reach
  Dawn with seven colours and the per-wave times sit in 11–33 s (Herald 16–50 s,
  Sovereign ~60 s). Bot fixes that drove tuning: abort a throw when danger
  appears mid-windup; never throw with a charger inside 12 m, a stalker inside
  3.5 m or a giant telegraphing; melee-swing at ≤ 2.1 m with the arch held at
  the target's body height (the first swing missed chargers: too high); the
  giant's circle timer starts only inside 8 m (it used to attack the instant it
  arrived); its telegraph is 1.3–1.4 s and it charges at 8 m/s.

### Rendering decisions

- No Three lights; one ShaderMaterial for every dark thing. Three r185 gives
  custom shaders the **fog colour in output colour space** and writes it into the
  uniform's Color object every frame — sharing the scene fog's own Color object
  fed it back through the conversion each frame and bleached the fog to white.
  The uniform now has its own Color, and all colours our shaders use are created
  raw (setHex with 'srgb-linear') since ShaderMaterial output is not encoded.
- Ground grain is a cell hash of the world position with mod 64 on the cell
  index (large sin arguments lost precision and produced stripes).
- Particles are GPU-aged (birth/life attributes) so the CPU only writes spawns.
- Desktop hands sit at (±0.36, −0.25, 0.6) so the sagging rope is in view.
- The //@test tag strips whole lines: the title call once shared a line with
  a debug hook and vanished from the build; hooks now sit on their own line.

### Sound decisions

- Everything on one seven-note scale (Phrygian on A, Lydian at Dawn) so the horns,
  the hits and the chime all agree; per-unicorn voices are panned PannerNodes
  positioned in arena space with the listener on the head; nearest ten only.
- A feedback echo instead of a convolver (no impulse to load).
- Thunder is delayed by distance/60 (audibly late, not physically late).

### Size log

| step | raw | min | rolled | zip |
|---|---|---|---|---|
| rehaul, first full build (level 1) | 45,346 | 33,205 | 16,730 | 13,044 |
| visual pass (grain, stones, hoof ash, giant mist, tuning) | 45,840 | 33,585 | 16,961 | 13,245 |
| sine-free grain hash, XR particle scale | 45,896 | 33,639 | 16,992 | 13,245 |
| velocity per pose update, release grace, level 2 | 46,276 | 33,896 | 17,017 | 13,260 |
| keyboard assist inside VR, trims, zopfli 200 | 46,300 | 33,805 | 17,012 | 13,258 |
| teleports are not swings | 46,382 | 33,838 | 17,034 | 13,275 |
| sigils + golf (forward vectors, sound table, trims) | 46,708 | 33,327 | 17,066 | **13,285** |

## Emulator pass (2026-09-05, user present)

The user installed the Immersive Web Emulator and reported "seems like there's
bugs" and that the controls felt hard without a controller. The emulator is
built on Meta's IWER runtime, so `tools/iwer.mjs` now drives the built zip
through IWER (Quest 3 profile) in Chromium. Findings and fixes:

- **Hand velocity was estimated per sim step.** A 72 Hz display frame covers
  two 90 Hz steps; the second step saw an unchanged pose and halved the measured
  speed, so throws and claps were unreliable on real hardware. Velocity is now
  computed per pose update (delta over the steps since the last change) and
  decays only after three unchanged steps. The Nova's closing speed uses the
  hand velocities instead of a per-step distance delta.
- **Release grace (0.5 s).** In the emulator you cannot drag a controller and
  press a button at the same time, and in VR people let go slightly after the
  peak of a swing. A fast swing of the arch is remembered for half a second and
  a release inside that window throws in the remembered direction; the lasso
  loop likewise. A slow release with no recent swing still just drops the arch.
- `onresize` no longer calls `setSize` while presenting (Three warned).
- `bounded-floor` is no longer requested (unused). Roadroller level 2 is the
  shipping build (13,260 bytes).
- IWER results on the final zip: ENTER VR offered, session start, first trigger
  starts the game, both triggers → arch, swing → throw → hit → kill → catch,
  one trigger → lasso → caught → yank → kill, both squeezes → arch, hand
  tracking: one pinch → lasso, two → arch, session end → desktop, zero errors.

## Controls audit (2026-09-05, user present)

The user reported that in the emulator's VR mode the keyboard did nothing and
"moving around" was impossible, and asked for every control to be checked.

- **Keyboard and mouse now work inside a VR session** as an emulator assist:
  WASD/QE nudge both hands in head space (offsets added to the controller poses),
  B holds both triggers, mouse buttons are triggers, Space/G/N run the macros
  around the headset position and yaw. The desktop and XR paths share one
  `inpHS(p, yaw, origin)` transform.
- No locomotion, by design (CLAUDE.md comfort rule): the player never moves.
- Desktop default hands lowered to 1.25 m so a lateral arch sweep connects with a
  unicorn's body and head.
- To pay for the assist (≈110 bytes): dropped the wave-7 hint, the lasso drag,
  the lasso-start blip and the boomerang-turn whoosh, the wave-clear arpeggio
  (one chord now), the unused `macro` hook and kills counter, shorter overlay
  and Dawn texts; zopfli 200 iterations. 13,258 bytes.
- `tools/controls.mjs` audits every control: desktop (button, mouse look,
  both mouse buttons, first trigger, W/A/S/D/E/Q directions, B arch, arch strike,
  block, Space throw and its hit, G lasso and catch, yank, N Nova and its
  charge requirement, whip crack, M, R) and VR through IWER (ENTER VR, recentre
  on the first trigger, head movement and rotation, left/right controller
  mapping, left trigger, right grip, both triggers, swing+release throw with
  hit, swing-stop-release grace, slow release without a throw, one-trigger
  lasso mode, spin+release catch, yank, block, clap Nova, whip crack, hand
  tracking one and two pinches, W/B/Space/G/N/M/R inside VR, session end,
  re-enter). 59/59 on the final build, zero console errors in both modes.
- The user still refers to "sigils" and "weapons": those are gone since the
  rehaul (their own choice in the design questions); the five rope verbs are
  the weapons.
- The audit found a real bug: a hand teleport (a desktop macro ending, a
  controller reconnecting) produced a speed spike that decayed through the
  "valid swing" range and armed the throw grace, so releasing the arch a moment
  later threw the boomerang. A pose jump faster than 20 m/s now zeroes the hand
  velocity instead of being averaged in. 13,275 bytes.

## Sigils return (2026-09-05, user present)

The user: "the sigils and weapon forms were the main thing I thought before, can
we not bring them back? ... convert current verbs to sigils if possible, not all
needed, just a few so that mechanic is there ... I don't want anything else to be
cut ... write proper test scripts."

- **Design**: both grips (squeeze) now mean *forge* instead of doubling as
  triggers. While held, the world runs at 15 % and the rainbow turns white; on
  release a sigil is recognised from features accumulated while drawing (no
  trail arrays): circle → the boomerang launches straight ahead, cross → the
  lasso is cast ahead, raise-and-slam → Nova when charged. The sigils fire the
  existing verbs, so no weapon code was added; a miss just drops the rope.
  Hand tracking has no grip, so it keeps the physical verbs only.
- **Desktop**: Space/G/N now draw the three sigils (they used to run the
  physical macros); V holds both grips; the physical verbs remain on B/LMB/RMB
  + WASD. Inside VR the same keys work as an emulator assist.
- **Bytes**: the sigil layer cost ≈ 380 bytes zipped. No feature was cut. Room
  was found with: forward vectors instead of quaternions between input, sim,
  render and audio (the hand-written quaternion multiply and the yaw helper
  are gone); table-driven simple sounds; the lasso launch shared by the
  trigger release and the sigil; teleport-safe velocity; shorter hints,
  overlay and Dawn text; one ground-noise term, one fewer tree branch, two
  oscillators per voice, no stone tilt, no lightning flicker or cue pulse, no
  sky horizon glow (the fog still brightens), no moon halo, no separate
  unforge sound, and a best score stored as a number. Level 2, zopfli 200.
  Rounding shader floats saved almost nothing: Roadroller's cost is
  information, not characters, so tables of numbers are not smaller than
  repetitive code.
- **Bugs found by the new tests**: the lasso's aim-assist query (3 m) had been
  reused as the catch radius; the audio listener still read the head
  quaternion after the refactor and crashed the first XR frame with sound on;
  a circle-sigil throw launched too steeply to hit a stalker at 4 m (now
  horizontal; the lasso keeps a 0.3 upward component); forging was refused
  between waves.
- Tests: sim suite 23/23 (four sigil tests: circle/cross/slam with effects,
  negatives, 2.5 s timeout, 0.5 s cooldown, slow-motion), browser suite 9/9
  (Space/G/N are sigils), IWER pass with a drawn circle, controls audit 65
  rows.
- A pose source that updates slower than every nine sim steps (a slow browser
  emulator, a stalled frame) no longer decays the hand velocity between
  updates, so swings still register there; the decay used to start after three.

## Scenery wobble fix (session 2026-09-05)

- Three r185 fills `instanceColor` with 1 the first time `setColorAt` is called,
  so every tree and stone except instance 0 had blue = 1, which the world
  vertex shader reads as "gallop amount". Their lower vertices sheared
  sideways at about 2 Hz: the constant width pulse on all scenery. `inst` now
  zeroes the whole instance-colour array (−2 bytes zipped). `tools/wobble.mjs`
  traverses the dev scene and fails if any world-shader instance has a
  non-zero blue channel; pre-fix it reported 45/46 trees and 7/8 stones.

## Final round: teaching, test build, Firefox (session 2026-09-05)

- **In-game teaching.** The user asked whether a new player would know how to
  perform each weapon and sigil. The old panel had one short line for waves 1–4
  and 6 and nothing for the Nova, the whip, the slam or the Sovereign. The panel
  now draws a title and up to two hint lines (`|`-separated, 38 px serif on the
  1024×256 canvas; every line measured under 720 px, the title at 90 px so
  "The last colour is gone" fits with margin on Android's wider serif). One
  lesson per wave in the order the player needs it: arch + boomerang, colour
  matching with red-left/violet-right, block, lasso + yank, the Herald, Nova by
  clap, the grips + circle/cross sigils, the slam, the whip, the Sovereign. The
  `ready` event switches the panel to "Nova ready / Clap the arch together."
  until the Nova fires. The desktop legend names each key's verb.
- **Paying for it (about 330 bytes over at first).** Hint wording tightened;
  the event→burst table replaces the if-chain; the `window.SF` hooks, the event
  log and the replay recorder are now `//@test` lines, stripped from the zip
  and kept in `dist/test.html` (`build.js --test`), which the browser suite
  uses for everything that reads `SF`; the shipped zip itself is exercised
  hook-free (boot, key play, offline, XR enter/exit) and the suite asserts
  `window.SF` is absent from it. Three's blending/side enums became their
  numeric values (r185 is pinned by the host), the head's forward vector is
  the rotation matrix's third column instead of a generic quaternion rotate,
  the pitch pivot in `place` is one rotation with a computed translation, the
  dead fog-colour variable went, shader newlines went, the offline message is
  shorter. Roadroller level 3 was measured at 8 bytes *larger* than level 2, so
  level 2 stays. Zip: 13,267 bytes (45 under the limit).
- **Firefox.** Playwright's Firefox cannot spawn on this machine, but the
  system Firefox 155 can be driven headless over WebDriver BiDi with a
  40-line client (`tools/firefox.mjs`, no dependencies): the zip boots, plays
  with the keys, and the test build's Space/B/G/N fire throw, arch, lasso and
  Nova, with the console watched for errors.
- **Audit additions** (`tools/controls.mjs`, 74 checks): the hint panel in the
  headset, game over by gore in VR, a trigger during the 3 s lock is ignored,
  a trigger after it restarts at wave 1, Dawn then a trigger restarts, and the
  controllers drive the hands again after a hand-tracking spell. The audit
  must not clear the herd between frames before a gore test: an empty herd
  ends the wave and gores are ignored between waves.
- **Stuck triggers after a hand-tracking switch (real-device bug, found by the
  audit).** A pinch sets the slot's select flag; when the hand source
  disconnects (the player picks the controllers up) the same slot object is
  reused by the controller with the flag still 1, so both triggers stayed
  "held" until the player pressed and released them — the rope stuck as an
  arch, sigils could not forge, and a later trigger edge restarted the game.
  `disconnected` now clears select and squeeze with the connected flag (+6
  bytes). The audit checks "no stuck triggers after the switch".

## Permanent legend (session 2026-09-06)

- The user pointed out that the key legend at the bottom of the page is desktop
  only and that headset players need to know the moves from the start and see
  them at all times. The panel canvas is now 1024×512 on a 3.2 × 1.6 m plane
  (one draw call as before), always visible: title, up to two wave-hint lines,
  and a permanent three-line legend in a dimmer serif (30 px, every line under
  800 px so Android's wider serif still fits). The title screen carries the
  colour rule and "Pull a trigger". Wave hints shrank to one line where the
  legend already says it. Paid for by moving the bot's per-wave time log to a
  `//@test` line, folding the grip flag out of the three desktop sigil
  generators, and a shorter offline message. Zip 13,286 bytes (26 under; the PLAY button moved below the panel on desktop).

## Lasso for humans (session 2026-09-07)

- **Report from a Quest 2 tester** (the first outside headset run): the arch,
  the boomerang throw and the block were found unaided; the lasso was not —
  "I could get it to drop, but pressing buttons and making throwing motions
  didn't do anything to the unicorns." Two mechanics were the cause, both
  reproduced in the sim with human-paced motions (scratch experiment, then the
  new sim test "lasso at human speeds"):
  1. **The cast only read the rope tip.** The loop flew only when the rope's
     free end reached 3 m/s. A forward fling manages that, but the motion
     everyone tries first — an overhead lasso spin at 1–2 turns a second with a
     20–35 cm radius — never did: the Verlet rope is heavily damped, so the tip
     lagged at 2.3–2.6 m/s while the hand moved at 1.3–3 m/s. Releasing the
     trigger then silently re-formed the rope: nothing happened, which is
     exactly the report. Now the throw signal is the greater of the tip speed
     and 1.5 × the hand speed, threshold 2.5 m/s, remembered for 0.5 s as
     before. A 1.5 rev/s, 20 cm spin casts; a gentle lowering of the hand
     (tip 1.9 m/s, hand 0.5 m/s) still does not.
  2. **The loop flew along the tip's velocity**, which for a fling is mostly
     upward (the rope swings up like a pendulum) and for a spin is tangential
     — i.e. sideways — and its speed scaled with the tip, so a soft throw at
     3.9 m/s dropped at the player's feet. The loop now flies at a fixed 10 m/s
     along head-forward × 8 + the hand's velocity at its fastest moment: it goes
     where you look, bent up to ~30° by the throw. With the aim assist and the
     ground slide, every human motion tried (flings of 0.18–0.35 s, spins of
     1–2 rev/s, a side swing) catches a stalker at 3 m and at 6 m.
  3. **The yank demanded a pull *away* from the unicorn** (≥ 3.5 m/s with a
     positive component along hand − unicorn). A "throwing motion" toward the
     caught unicorn, the natural follow-up, was ignored. The yank is now any
     tug of that hand ≥ 3 m/s in any direction, **or any trigger pull** while
     the unicorn is caught (the trigger edge is shared with the start/restart
     logic via one helper). Catch-and-kill in one motion is possible when the
     hand is still moving at the catch; it feels good, not cheap: the catch
     already needs a throw.
- **Teaching.** "Swing, let go, pull back" was too terse for a first-time
  headset player. The permanent legend's lasso line is now "Hold one trigger:
  lasso · swing, release the trigger · tug to kill" (742 px at 30 px serif,
  under the 800 px bound) and wave 4's hint is two lines: "Hold one trigger,
  swing, release it: lasso. / Caught? Tug, or pull the trigger." (620 / 489 px
  at 38 px). The wave 1 line stays: the tester found the arch and the
  boomerang from it.
- **Paying for it.** The cast line grew; paid by dropping the throw-strength
  speed (fixed 10 m/s; 8–13 was imperceptible under the aim assist), the
  yank's direction test, `S._md=S._L.t&S._R.t` (the flags are normalised 0/1)
  in two places, a regex for the clear/start/restart text reset, one
  position-setter helper in audio.js (panner, listener, voices — the sound is
  unchanged), `bpos` reused for the bolt position and the giant's circling,
  the rope substep gravity as one constant, the lasso state object without
  its zero fields, the hand's previous position starting at the origin (the
  first step reads as a teleport and is ignored, as before), unused chord
  defaults, and the colour table built in one `map`. Roadroller's optimiser
  moved the same input between 13,253 and 13,322 bytes across five runs — one
  of them **over the limit** — so the release build is now run more than once
  and the smallest zip kept (SUBMISSION.md). Shipped: **13,253 bytes, 59
  under**, the widest margin since the sigils returned.
- **Tests.** Sim suite 24/24 (new: lazy spin casts and catches, fling catches
  at 6 m, gentle lowering does not cast, trigger-pull yank, forward-tug yank —
  fails on the old sim); the VR controls audit gains a lazy-overhead-spin row
  (catch with no yank yet, since the hand is slow at the catch) and a
  trigger-pull yank row, and its pull-back yank row now follows a lazy spin,
  because the old superhuman spin (8 m/s at release) yanks at the catch by
  itself. The first audit run after the change crashed the VR page half-way:
  every kill row clears its wave, the two new rows walked the counter to 10,
  and the audit's herd-clearing hook made wave 10 "clear" and begin a wave 11
  that has no table entry (`WAVES[10][1]`). In play that state is unreachable
  — the Sovereign's death goes straight to Dawn — so the fix is in the audit:
  its clear hook resets the wave to 0. The browser suite's wave-4 hint check
  reads the new words; the whole suite is 13/13, real Firefox and the IWER
  runtime pass are clean, with the runtime's lasso step now catching and
  yanking.
- **The site's full-screen quirk.** The tester could only enter XR on
  js13kgames.com after the page's full-screen button. The page bundle creates
  the game iframe with `allow="accelerometer;…;xr-spatial-tracking"`, so the
  permission is delegated; the cause is on the site or in the Quest browser and
  is noted in SUBMISSION.md for judges rather than patched around in the zip.
