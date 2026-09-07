# SUBMISSION — SEVENFOLD (js13kGames 2026, WebXR)

## 0. Do these by hand before submitting (top item)

One outside tester has run it on a Quest 2 (it launches, the arch and the
boomerang and the block were found; the lasso was not — see the lasso notes in
DECISIONS.md, "Lasso for humans"). Everything else below the checklist ran on the
build machine: desktop Chromium, real Firefox 155, a fake `navigator.xr` shim,
and Meta's Immersive Web Emulation Runtime (the runtime inside the Immersive
Web Emulator extension, Quest 3 profile). **Manual headset / emulator
checklist** (with the *Immersive Web Emulator* Chrome extension, or a Quest):

1. `npm run dev`, open `http://localhost:8080/dist/` in Chrome with the extension
   (DevTools → WebXR tab, device "Meta Quest 3"), or the entry's play page on the
   headset. (The dev server swaps the hosted Three.js URL for a byte-identical
   local copy because the host sends no CORS header; the zip is untouched and is
   same-origin on play.js13kgames.com.)
2. ENTER VR. Expect: the dead forest, standing stones, the red moon, ash falling,
   the rainbow hanging between the two controller positions (white rings),
   lightning now and then with thunder, the title panel ahead: SEVENFOLD, the
   colour rule, "Pull a trigger", and under it the permanent three-line legend
   of every verb and sigil (it stays for the whole game), no console errors. **The trees and stones stand still** (the
   width pulse from the r185 instance-colour default is fixed and guarded by
   `node tools/wobble.mjs`).
3. The first trigger pull recentres the arena on your head and starts the game.
   Wave 1's panel reads "Both triggers: swing and let go." above the legend.
   Each wave teaches the next verb (docs/09 table): colour matching,
   block, lasso, the Herald, Nova, the sigils, the slam, the whip, the Sovereign.
   When three colour hits charge the Nova the panel switches to "Nova ready".
4. Hold both triggers: the rope snaps into a rainbow arch. Swing forward and
   release: it flies out and returns (whoosh, catch). Hold one trigger for a
   moment: a loop hangs from that hand; swing it (an overhead spin or a forward
   fling, at an ordinary pace) and release the trigger: the loop flies where you
   are looking, bent by your throw. It lands on a unicorn: the unicorn stops and
   struggles. Tug that hand in any direction, or pull either trigger: it dies.
   Wave 4's panel reads "Hold one trigger, swing, release it: lasso. / Caught?
   Tug, or pull the trigger."
5. Hold both grips: the world slows and the rainbow turns white. Draw a circle
   and let go: the boomerang launches ahead. Cross your hands and pull apart: the
   lasso is cast. Raise both hands and slam down with a full charge: Nova.
6. Wave 1: block one rear-up with the arch (clank, it staggers). Match a horn's
   colour (red is your left end, violet your right): the chord and coloured burst
   mean a resonant hit. Three of those: the rainbow pulses white, a seven-note
   chime, the panel says "Nova ready". Hold the arch and clap: Nova.
7. Lose all seven colours (or reach Dawn): the panel shows the result; a trigger
   pull during the first 3 s is ignored, after that it restarts at wave 1.
8. Press the emulator's exit (or the headset's system menu) → back to desktop
   mode with the ENTER VR button, no errors. Enter again: a second session works.
9. Emulator only: you cannot move a controller and press a button at once, so the
   game remembers a fast swing for half a second — swing the controllers forward
   quickly in the panel, then release the triggers. The keyboard also works
   inside the session: WASD/QE nudge both hands, B holds both triggers, V both
   grips, Space/G/N draw the three sigils. There is no locomotion by design.
10. Anything that fails: note it and fix it in the bugfix window (PRs by 14 Sept).
11. **On the js13kgames.com game page itself** the tester (and other WebXR
    entries, by their account) could only start the XR session after pressing
    the site's full-screen button. The site's iframe does carry
    `allow="…xr-spatial-tracking"` (checked in its bundle), so this is a site or
    Quest-browser quirk, not something the zip can fix; judges on a headset
    should use the full-screen button or the direct play.js13kgames.com URL.

**Sound** could not be heard on the build machine (headless). The synth runs
without errors for full games; please listen to one wave and one giant on desktop.

**Hand tracking**: pinch = trigger; bare hands have no grip, so the sigils need
controllers (the trigger verbs all work with hands).

## 1. Final size

| step | bytes |
|---|---|
| source, concatenated | 46,942 |
| terser (property-mangled) | 32,784 |
| roadroller -O2 | 17,029 |
| index.html (inlined) | 17,635 |
| **dist/sevenfold.zip** | **13,253** (limit 13,312; margin 59) |

The shipping build is `node build.js --level 2 --iter 200` (`npm run build`
also writes `dist/test.html`, the same sources with the `//@test` hook lines —
`window.SF`, `hashState`, the event log — kept; the zip has none of them and
the browser suite asserts that). Roadroller's optimiser is not perfectly
deterministic: the same source measured 13,253–13,322 bytes across five runs
(one of them over the limit), so **build at least twice and keep the smallest
zip** (`node build.js --level 2 --iter 200` again; the printed size is the one
to trust). Level 3 measured larger. `build.js` fails above the limit.

`unzip -l` → one entry, `index.html`. `unzip -t` → no errors. The only URL in
the build is `https://play.js13kgames.com/2026/webxr/three.js`. No
`localStorage.clear`, no `console.`.

| module | raw | minified |
|---|---|---|
| vec | 1,340 | 821 |
| sim | 14,500 | 9,932 |
| input | 3,738 | 2,198 |
| xr | 1,568 | 1,060 |
| audio | 6,047 | 4,418 |
| render | 17,040 | 13,204 |
| main | 2,588 | 1,954 |

## 2. What was cut, and what fits

Everything in docs/09 is in the zip: the world, the ash, the lightning, the
five verbs, the three sigils, the three variants, both giants, ten waves, Dawn,
the full synth soundtrack, and now a lesson per wave on the panel. Nothing was
cut; the teaching text was paid for by moving the test hooks to the test build
and by byte golf (DECISIONS.md, final round). Endless mode and combo scoring
(priority 5) are not implemented. If bytes are ever needed: the hoof ash and the
boss mist (≈60 bytes), the ground grain (≈90), the standing stones (≈150).

## 3. Tests (final build)

| suite | result |
|---|---|
| `node test/sim.test.js` — rope, whip, arch, block, boomerang, lasso, Nova, circle/cross/slam sigils + negatives, resonance, lives, idle/perfect/no-block bots on seeds 1–5, determinism | 23/23 |
| `node test/browser.test.js chromium --xr` — **the zip, hook-free**: boot, 8 s of key play, offline message, XR shim enter/select/swing/exit; **the test build**: bot replay to wave 3, budget (12 calls, ~28k tris), every wave's hint + "Nova ready", Space/B/G/N verbs, game over + R, Dawn + trigger, mute/best score, XR shim throw + catch | 13/13, zero console errors |
| `node tools/firefox.mjs` — real Firefox 155 over WebDriver BiDi: the zip boots and plays with the keys; the test build's Space/B/G/N fire throw, arch, lasso, Nova | 11/11, zero errors (Firefox 155.0.1, headless) |
| `node tools/iwer.mjs` — Quest 3 emulation runtime: session, first trigger, arch, throw/hit/catch, lasso/catch/yank, drawn circle → forge → sigil → throw, hand-tracking pinches, session end | ok, zero errors, zero warnings |
| `node tools/controls.mjs` — every control: desktop 28 checks; VR 45 checks incl. head/controller mapping, all verbs, all sigils, hand tracking (and no stuck triggers after switching back to controllers), keyboard assist, the hint panel, game over → 3 s lock → trigger restart, Dawn → trigger restart, session end and re-entry | 73/73, zero errors in both modes |
| `node tools/soak.mjs` — a full ten-wave browser play-through (the Node bot drives the page) | 3 full games to Dawn in the 7 min window (the bot restarts at Dawn), zero errors, 9–12 draw calls |
| `node tools/wobble.mjs` — no scenery instance has a non-zero blue channel (the gallop input) | ok |

Perfect-bot clear times (seconds, seeds 1–5): waves 11–12, 15–16, 20–21, 19–20,
**Herald 16–47**, 22–26, 19–21, 27–29, 30–36, **Sovereign 57–117**. Every seed
reaches Dawn with all seven colours; the idle bot loses everything within 60 s;
the no-block bot dies to the Sovereign.

## 4. Submission form

- Category: **WebXR** only (do not tick Desktop/Mobile — the hosted library
  forbids it).
- Zip: `dist/sevenfold.zip`.
- Repo: <https://github.com/Arjun0014/SevenFold> (full source and `build.js`).
- Screenshot: `test-results/gal-horde.png` (the herd) or `gal-sovereign.png`.
- Description (≤ 500 chars, 499):

> You hold the last rainbow. The Umbra took every colour from the unicorns' world and sends its hollow herd against you: ash-black unicorns, each with one burning horn. Hold both triggers and the rainbow becomes an arch that blocks; swing and let go and it flies as a boomerang that returns. One trigger swings a lasso: catch and pull. Match a horn's colour to shatter it; three matches charge a Nova. Seven colours are seven lives. Survive ten waves and two giants until dawn. The horde is the music.

## 5. WebXR category checklist

- [x] Only external resource: the hosted Three.js (dynamic `import(U)`); no addons, XRButton, fonts, images, audio files.
- [x] `requestSession('immersive-vr')` from a user gesture only; `local-floor` (optional feature, falls back to `local`); `setFoveation(1)`; session end returns to desktop mode; a second session works.
- [x] Input: head pose, two grip poses, select (trigger / pinch) and squeeze (grip, the forge). No thumbsticks, no buttons.
- [x] The player never moves and is never moved; everything comes to the player.
- [x] Zero console errors in Chromium (desktop, XR shim, emulation runtime) and in real Firefox 155.
- [x] Budget: 12 draw calls desktop / 24 in stereo, ~28k / 56k triangles, 8 transparent meshes, one fog, no shadows, no post-processing.
- [x] `localStorage` keys `sevenfold_mute`, `sevenfold_best`; never cleared.
- [x] Original content; no copyrighted names.
- [x] Every verb and sigil is on the panel for the whole game (the permanent legend), with one lesson per wave above it and the colour rule on the title screen; the desktop key legend maps the keys.
