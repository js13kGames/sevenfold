# 09 — The rehaul (2026-09-05): this document supersedes docs/01, 02, 03 and 05

Read this first. The earlier docs describe the first build (five sigil-forged
weapons, five enemy species, three bosses, a unicorn to guard). After playing it
the user asked for a complete rehaul with one instruction above all others:
**the world has to look and sound like a big game.** Everything below is what
shipped. Where an earlier doc disagrees, this one wins.

## Fiction

The Umbra took the colour out of the unicorns' world. What is left is a dead
forest under ash, a red moon, and one mage: you, holding the last rainbow between
your hands. The Umbra sends its own herd against you — hollow, ash-black unicorns,
each with one burning horn in one of the seven colours. Survive ten waves and two
giants until dawn, when colour comes back.

Shown as: the title over the colour rule ("Strike horns with their own colour.
Red is your left, violet your right. Pull a trigger."). No tutorial screens: the
panel 3.2 m ahead (3.2 × 1.6 m, always visible, in VR and on desktop) carries a
title line, up to two hint lines per wave — one lesson per wave in the order the
player needs them (below) — and, permanently underneath in a dimmer serif, the
legend of every verb and sigil:

    Both triggers: arch (blocks) · swing and let go: boomerang
    Hold one trigger: lasso · swing, release the trigger · tug to kill
    Both grips: circle throws · cross lassoes · raise and slam: Nova

When three colour hits charge the Nova, the panel switches to "Nova ready / Clap
the arch together." until the Nova fires or the wave clears.

## The player

- A mage. Nothing to guard. Every enemy comes for *you* from the fog and you turn
  to face it. The player never moves and is never moved.
- **Seven colours are seven lives.** Each gore removes one band from the rainbow
  in your hands, from the violet end; the rope literally greys out. A greyed
  colour can no longer resonate. Killing a giant restores two. When the last
  colour is gone: "The last colour is gone".
- 1.2 s of invulnerability after a hit.

## The rainbow — one rope, five physical verbs, no gesture recognition

A Verlet rope of 29 points (rest 0.9 m) between the hands. Its **mode** is the
physical state of the triggers (squeeze counts as trigger, so grips work too):

| mode | how | what it does |
|---|---|---|
| free rope | no triggers | hangs; a fast flick (tip ≥ 6 m/s) **cracks** for 1 damage in a 0.4 m sphere, band = band at the tip |
| **arch** | both triggers | the rope stiffens into a rainbow arch (bulges up/forward 0.3 m). A fast swing (hand ≥ 3.5 m/s) is a melee strike (2 dmg, band at contact). The arch **blocks**: a gore or charge whose line to your head crosses the arch is stopped and the unicorn staggers |
| **boomerang** | let go of the arch while both hands move ≥ 2.5 m/s (and < 20: teleports are not throws) | the arch flies along the hand velocity at 11 m/s for 0.75 s or 9 m, turns, and homes back to the throwing hand at 13 m/s; auto-caught within 0.4 m. Hits every unicorn once on the way out and once on the way back (2 dmg, band = the arch point that touched). The hands are empty while it is out |
| **lasso** | one trigger held ≥ 0.25 s | the rope detaches from the other hand and hangs from this one with a loop at the end (the far colour: right hand = red end, left hand = violet). Swing it — the rope tip ≥ 2.5 m/s **or the hand ≥ 1.7 m/s**, remembered for 0.5 s — and release the trigger: the loop flies at 10 m/s **where you look, bent by the throw** (direction = head forward × 8 + the hand's velocity at its fastest; gravity 8, aim assist toward the nearest unicorn within 3 m, and it keeps sliding along the ground for up to 1.3 s). Landing within 0.9 m of a unicorn **catches** it: it stops and struggles. **Yank**: any tug of that hand ≥ 3 m/s in any direction, **or any trigger pull**, for 5 damage (8 on a giant). Released after 4 s, or when both triggers are held |
| **nova** | arch held with a full charge, then clap the hands together (< 0.15 m, closing ≥ 2 m/s) | the rope collapses and a rainbow shockwave hits everything within 6.5 m for a resonant 18, staggers survivors 1.5 s, slow-motion 0.6 s. Charge = 3 resonant hits |

Colour resonance: a hit whose band equals the horn colour deals ×3 (a resonant
hit), grants +1 charge and plays a chord. Any other hit deals normal damage.

### Sigils (both grips)

Hold both grips (squeeze) and the world slows to 15 % while the rainbow turns
white; draw with your hands and let go. Three shapes are recognised from features
that accumulate while you draw (no trails are stored): the midpoint's path length
and total turning in the head's right/up plane, its rise then drop, and whether
the hands ever crossed. Each sigil fires one of the verbs above, so the sigil
layer adds no weapon code:

| sigil | features | what fires |
|---|---|---|
| **circle** | turning ≥ 4.5 rad and path ≥ 0.6 m | the boomerang launches straight ahead (no swing needed) |
| **cross** (hands crossed, then apart) | crossed at some point, hands ≥ 0.5 m apart at the end | the lasso loop is cast ahead at 11 m/s |
| **raise and slam** | rise ≥ 0.3 m then drop ≥ 0.3 m, hands ≤ 0.4 m apart at the end | Nova, if charged |

Anything else drops back to the rope (a grey puff, no penalty). A drawing
resolves on release or after 2.5 s; 0.5 s cooldown. Sigils need both grips, so
hand tracking (pinch only) uses the physical verbs. Desktop: Space, G and N draw
the three sigils; V holds both grips for drawing by hand.

## Enemies — one species, three variants, two giants

Shadow unicorns. One merged model (body, neck, head, horn, eyes, ears, tail,
four legs), one InstancedMesh, legs galloping in the vertex shader. The horn and
eyes glow in the unicorn's colour.

| variant | hp | speed | scale | behaviour |
|---|---|---|---|---|
| stalker | 3 | 2.4 | 1 | weaves toward you; at 1.4 m rears 0.75 s (horn flares, rising sound) then gores (−1) unless blocked; retreats 1.3 s and returns |
| charger | 2 | 7 | 0.8 | spawns at 14 m, announces itself at 9 m, runs straight through you (−1) unless blocked (then it stands stunned 2 s in front of you); re-enters from a new bearing |
| brute | 8 | 1.3 | 1.6 | rears 1 s, gores for −2; a block only staggers it 1 s |
| **Herald** (wave 5) | 100 | 3 | 2.2 | circles at 7 m (timer starts once inside 8 m, every 4 s). Charge: rears 1.4 s (lightning around its horn) then 8 m/s through you (−1); blocked → staggers 3.5 s in front of you. Every third attack: a rune under your head, lightning 0.9 s later (−1 within 0.7 m). Summons 2 stalkers on odd attacks |
| **Sovereign** (wave 10) | 160 | 3.5 | 3.4 | as the Herald with a 3 s cycle, −2 gores, 3 summons, and its horn cycles through all seven colours every 2 s |

Killing a giant kills its minions and restores two colours; the Sovereign's
death is Dawn.

## Waves

`[interval s, spread °, stalkers, chargers, brutes]`, spawns 9–12 m out
(chargers 14 m), bearing = head yaw at wave start ± spread.

| wave | composition | hint |
|---|---|---|
| 1 | 4 stalkers, ±40° | Both triggers: swing and let go. |
| 2 | 6 stalkers, ±70° | Strike horns with their own colour. / Red is your left, violet your right. |
| 3 | 5 stalkers + 3 chargers, ±100° | A rearing horn strikes. Both triggers block. |
| 4 | 4 stalkers + 3 chargers + 1 brute, ±140° | Hold one trigger, swing, release it: lasso. / Caught? Tug, or pull the trigger. |
| 5 | **The Herald** | Block its charge, then strike. / A slain giant gives two colours back. |
| 6 | 8 stalkers + 2 brutes, 360° | Three colour hits turn the rainbow white. / Clap the arch together: Nova. |
| 7 | 4 stalkers + 6 chargers, 360° | Both grips slow time. Draw, then let go. |
| 8 | 6 stalkers + 3 chargers + 3 brutes, 360° | Grips, raise and slam down: Nova. |
| 9 | 10 stalkers + 6 chargers + 2 brutes, 360° | Flick the loose rope: the whip. |
| 10 | **The Sovereign** | Its horn wears every colour in turn. |
| any | Nova charged | Nova ready / Clap the arch together. |

Dawn after the Sovereign; trigger to play again.

## The world (render.js)

No Three lights. One custom shader lights every dark thing (ground, dead trees,
standing stones, unicorns): a tiny ambient, a sky term, a cold fresnel rim so
silhouettes read against the fog, a **point light at the rainbow** (whatever you
hold lights the ground and the unicorns around you), the lightning flash, a
cell-hash grain, and fog applied in output space (Three hands the fog colour to
custom shaders in output space, so the shaders write output values directly;
colours for them are created with `setHex(hex,'srgb-linear')`).

- Ground: a 170 m displaced plane, flat inside 4.5 m; eight tilted standing
  stones at 4.4 m; 46 dead trees (trunk + four branches, merged, instanced,
  random scale/rotation) from 7.5 to 30 m.
- Sky: a shader dome — dark top, fog-coloured horizon, a dead red moon, and the
  lightning glow on the horizon.
- Ash: 1800 GPU points falling and drifting in a 36×14×36 m box around the
  player; soft discs. At Dawn they turn into rainbow snow.
- Bursts: 900 GPU-aged points (position, velocity, birth/life, colour); the CPU
  only writes new ones. Hits, resonance, kills, spawns (ash rising from the
  ground), hooves, blocks, the Nova, and a coloured mist around a giant.
- Lightning: a jittered tube from the sky, two flickers, a directional flash on
  every surface and the sky, fog brightening; ambient bolts every 6–15 s, a bolt
  around a giant's horn while it rears, and the strike on the rune.
- The rainbow: a TubeGeometry rebuilt every frame from the sim's 29 points (core
  + an additive glow copy), with the band shader; greyed bands for lost colours,
  a white pulse when the Nova is charged. The lasso loop is a torus in the loop's
  colour; the Nova ring is a rainbow torus expanding to 6.7 m.
- Text: one CanvasTexture plane (serif) 3.2 m ahead.
- Dawn: over 8 s the fog lifts to 136 m and turns mauve, the sky turns rose, the
  moon turns to a white sun, the world shader warms, the ash turns to colour.

Budget on the built zip: 12 draw calls, ~30k triangles.

## Sound (audio.js) — the horde is the music

Hand-rolled Web Audio, no files:

- A feedback echo (0.27 s, low-passed) under everything: the dark space.
- Wind: looping noise through a slowly wandering band-pass.
- **The choir of horns.** Every living unicorn (nearest ten) has a voice — two
  detuned saws and a sine an octave up through a low-pass — panned from where it
  stands, pitched to the note of its colour. Brutes an octave down, chargers an
  octave up, giants two down. The horde is a swelling dissonant chord that you
  resolve by killing. A lassoed unicorn's voice vibrates; a rearing one bends up.
- Scale: seven notes for seven colours — Phrygian on A (`[0,1,3,5,7,8,10]`
  semitones over 110 Hz) in the dark; at Dawn the scale becomes Lydian.
- Bass pulse: the root, at 52 + 7·wave BPM, ×1.5 while a giant lives.
- Every event has a sound on the same scale: hits play the colour's note,
  resonant hits a chord, kills a falling saw and a shatter, the boomerang
  whooshes out and back, the lasso hisses, a catch snaps, a yank crunches, a
  block clanks, losing a colour is a low thud with the lost note falling, rears
  and charges rise, the Nova is a seven-note run over a sub boom, thunder is
  delayed by distance, waves start with two toms, giants with a roar, the Nova
  charge announces itself with a seven-note chime, Dawn is a slow major swell.

## Desktop (input.js)

Mouse look; LMB/RMB are the triggers; **B** holds both (arch); **Space** performs
a throw; **G** a lasso; **N** a clap; WASD/QE move both hands; R restart; M mute.

## Tests

`node test/sim.test.js`: rope stability, every verb, resonance and the greyed
colours, seven lives, the boss reward, idle bot (dies in waves 1–2 within 60 s),
perfect bot seeds 1–5 (Dawn with ≥ 3 colours; normal waves 8–90 s; the Herald
10–150 s), no-block bot (never reaches Dawn), determinism.
`node test/browser.test.js chromium --xr`: boot, replay of waves 1–2, budget,
desktop macros, game over/restart, resize, persistence, offline message, XR
shim (enter, 300 frames, throw and catch, exit).
