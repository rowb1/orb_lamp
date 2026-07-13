# Orb Lamp — BLE Debugging Summary & Resolution

**Status: FINAL — built and in daily use.** Comms, hardware, firmware and app
are all complete. App → BLE → firmware → hardware path confirmed end-to-end.
Lamp logic verified on the real 5V LED array — full brightness, smooth breathing
between an adjustable floor and peak, cycle 1.67–60 s. The MOSFET drive circuit
is resolved (see "MOSFET hardware bring-up" below). This document is retained as
the debugging history and the firmware/app changelog; the design spec is
`kates_lamp_spec.md`.

Current versions: firmware `kates_lamp.js` **v0.10.5**, app `index.html`
**v0.11.4**. Both print/display their version so the running build can always
be confirmed (firmware prints `Orb Lamp firmware vX.Y.Z` on boot; app shows
`App vX.Y.Z` under the status line).

### Firmware changelog

- **v0.10.5 (60s range + breath floor).** (1) Slowest breath cycle extended to
  60s (from 20s). The normalized breath-speed now maps linearly in *cycle
  length* (`normToHz`), so the slider feels even across the wide 1.67-60s span
  instead of bunching near the slow end; and the boot/default rate is decoupled
  from the slider minimum (`cfg.defaultCycleS = 20`). (2) New persisted
  `breathFloor` (0..1 absolute, clamped at use to <= peak) so breathing dips to
  a minimum brightness instead of fully off: `val = lo + s*(peak - lo)` where
  `lo = min(breathFloor, brightness)`. New command
  `{"cmd":"minBright","value":0..1}`, saved to flash as `orb.floor`; default 0 =
  breathe fully off (unchanged behaviour until raised). App and firmware share
  the identical cycle-mapping formula so the displayed cycle matches the lamp.
- **v0.10.4 (slower breathing).** Slowest breath cycle widened from 5s to 20s
  (`minHz` 0.2 -> 0.05); fastest unchanged at ~1.67s (`maxHz` 0.6). The boot/
  default rate is the slow end, so the lamp now boots at the 20s cycle. App
  slider math updated to match (`hz = 0.05 + norm * 0.55`).
- **v0.10.3 (command length fix).** The command characteristic was declared
  with `maxLen: 20`, but the app sends each command as a *single*
  `writeValue()` of the whole newline-terminated string. Only
  `{"cmd":"test"}` (15 bytes) fit; every longer command
  (`mode`/`brightness`/`breathSpeed`/`sleep`, 31-36 bytes) was
  rejected/truncated by the BLE stack before `onWrite`, so it was silently
  dropped. Symptom: comms test flashed the red LED, but no slider or mode
  change did anything and the lamp stayed on its boot default (breathing).
  Fix: `maxLen` raised to 100. The newline buffering in `handleCommandData`
  was already correct and is kept. NOTE: the repo's `kates_lamp.js` had drifted
  out of sync with the Puck (it still held the old Nordic-UART + console-detach
  build); v0.10.3 refreshes it to the real custom-characteristic firmware.

### App changelog

- **v0.11.4 (Minimum slider + 60s breath range).** New **Minimum brightness**
  slider card (breath floor) below Brightness: absolute 0-100%, kept at or below
  the peak Brightness (raising it past the peak clamps; lowering Brightness below
  it pulls it down), sends `{"cmd":"minBright"}`, added to `syncAll`. Dims out in
  Solid mode (renamed the shared dim class `.speed-card` -> `.breath-card`, now
  covering both the Minimum and Breath speed cards). Breath-speed slider
  retargeted to the 1.67-60s range with cycle-linear mapping (`normToCycle`,
  matching firmware `normToHz`); the slider now starts at the ~20s default
  position (value 69) rather than the slow extreme.
- **v0.11.3 (scrollable layout, test button removed).** Removed the "Flash red
  LED (comms test)" button and all its handlers/CSS (the maxLen bug it helped
  diagnose is fixed). Layout is now scrollable so no control can be trapped off
  the bottom on small screens: `body` no longer sets `overflow:hidden`, `.app`
  uses `min-height:100dvh` (dvh accounts for mobile browser chrome) with
  `justify-content:flex-start` so controls stack from the top and the page
  scrolls when they exceed the viewport. The fixed ambient glow stays put while
  scrolling.
- **v0.11.2 (Sleep control + 20s breath).** Moved the sleep function up to a
  **Sleep** toggle card directly under Power (label: "Turn lamp off after 1
  hour - Power wakes it"); removed the old bottom "Sleep timer" card. No
  firmware change for this - it reuses the existing `{"cmd":"sleep"}` /
  `setSleep` 1-hour timer. Breath-speed slider retargeted to 0.05-0.6 Hz
  (20.0s slowest -> 1.67s fastest) to match firmware v0.10.4; default label/CSS
  now read 20.0s. (Also resolves the earlier 30-min-vs-1-hour label mismatch:
  the label now correctly says 1 hour, matching `sleepDelay`.)
- **v0.11.1 (default Power ON).** The firmware boots ON (breathing) in
  `onInit()`, but the app defaulted `state.on = false`, so `syncAll()` pushed
  `{"cmd":"mode","value":"off"}` ~1s after connect and switched a breathing lamp
  off. This was invisible before the firmware `maxLen` fix (the 29-byte 'off'
  command was too long to land); once v0.10.3 let it through, connecting the app
  turned the big LED dark and nothing but a reboot or a Power-on brought it back
  (`powerOff()` is sticky - it stops the interval and sets `active=false`).
  Fix: app now defaults `state.on = true` / breathing to match the firmware boot
  state, so connecting re-affirms breathing instead of killing it. The Power
  toggle and ambient glow reflect ON at load.
- **v0.11.0 (connection robustness).** No firmware change. Added a connection
  state machine (`idle` / `scanning` / `connecting` / `connected` /
  `reconnecting` / `error`) that drives a single source of truth for the UI: a
  coloured **status dot** (grey idle, pulsing amber busy, green connected, red
  error) next to the status text, plus the button label and control enablement.
  Auto-reconnect on an *unexpected* GATT drop reuses the already-picked device
  (no re-prompt) with capped backoff (4 tries), and re-runs `syncAll` on
  success so the lamp matches the UI again. A user-initiated disconnect is
  flagged so it does **not** trigger auto-reconnect. Added a `gatt.connect()`
  timeout, friendlier error text, and silent handling of a cancelled device
  chooser. The mid-flight button acts as **Cancel**. Removed dead
  transport-A/B diagnostic CSS left over from an earlier build. Also corrected
  the sleep-timer sublabel copy to match the firmware's 30-min safety auto-off.

---

## The original problem

The phone app connected to the Puck.js over Web Bluetooth, but every attempt to
send a command failed — the `writeValue()` on the Nordic UART TX characteristic
rejected, or the command silently never reached the firmware.

## Root causes found (in order of discovery)

1. **`E.getStorage`/`E.setStorage` don't exist.** The firmware used a
   non-existent API for flash persistence; `loadSettings()` threw at boot,
   halting the rest of boot (no breathing, console never detached). Fixed by
   using the `Storage` module: `require("Storage").readJSON/writeJSON`.

2. **Non-ASCII characters broke the Web IDE upload.** Em-dashes, arrows and
   smart quotes in comments caused `Got UNFINISHED STRING` when the IDE wrapped
   the code into a `Storage.write(".bootcde", "...")` string. Fixed by keeping
   the firmware strictly ASCII. **Rule: firmware stays ASCII-only.**

3. **The console (REPL) owns the Nordic UART.** By default Espruino feeds
   incoming BLE UART data to the JS REPL, so `NRF.on('data')` never fires —
   the phone's JSON was being evaluated as REPL input, not delivered to the
   handler. Attempts to fix this by detaching the console
   (`E.setConsole(null,{force:true})`) failed because **Espruino automatically
   moves the console back onto BLE on every connect/disconnect**, so a one-shot
   detach was always undone.

4. **The console-detach approach made reflashing miserable.** With the console
   detached, the Web IDE couldn't get a prompt, forcing battery pulls,
   long-press recovery, and `bluetoothctl` gymnastics on every flash. This was
   the turning point that motivated the architecture change below.

## The fix that actually worked: custom BLE characteristic (v0.10.0)

Instead of the Nordic UART, the firmware now defines its **own writable
characteristic** via `NRF.setServices`, and commands arrive in its `onWrite`
handler. A custom characteristic is independent of the console, so:

- The console stays on BLE **permanently** -> the Web IDE always connects and
  reflashing is trivial (connect + send; no battery pull, no long-press, no
  `bluetoothctl`).
- Commands always reach `onWrite` regardless of console state.

Key implementation details (both are common traps):
- `NRF.setServices` **must run inside `onInit()`**, or the service is lost after
  `save()` / on the next boot.
- Keep `{ uart: true }` so the REPL/IDE access survives alongside the custom
  characteristic.
- On connect, Espruino may log *"BLE Connected, queueing BLE restart for
  later"* — this is normal; the new services go live when the current
  connection drops.

### Command protocol (unchanged JSON, new transport)

Newline-terminated JSON written to the command characteristic:

| Command | Payload |
|---|---|
| mode | `{"cmd":"mode","value":"solid"\|"breathing"\|"off"}` |
| breathSpeed | `{"cmd":"breathSpeed","value":0.0-1.0}` |
| brightness | `{"cmd":"brightness","value":0.0-1.0}` |
| sleep | `{"cmd":"sleep","value":true\|false}` |
| test | `{"cmd":"test"}` — flashes red LED 0.5s (comms self-test) |

### BLE UUIDs (custom service — must match firmware and app)

| Role | UUID |
|---|---|
| Command service | `6e40aa01-b5a3-f393-e0a9-e50e24dcca9e` |
| Command characteristic (write, phone->Puck) | `6e40aa02-b5a3-f393-e0a9-e50e24dcca9e` |

The **Nordic UART** (`6e400001/2/3`) is still present (for the REPL) but no
longer used for commands.

---

## Other bugs fixed along the way

- **Button logic.** BTN reads HIGH while held (press = rising, release =
  falling). Now a simple rising-edge toggle that restores the last mode. The
  earlier long-press console-recovery gesture is gone (no longer needed —
  console stays on BLE).
- **Solid mode / breath-speed conflict.** `setBreathSpeed` used to call
  `startBreathing` unconditionally, overriding solid mode. Now guarded by an
  explicit `currentMode` ("breathing" | "solid") so speed/brightness changes
  only apply in the relevant mode.
- **Disconnect button.** Now resets the UI immediately instead of waiting for a
  disconnect event that didn't always fire.
- **PWM flicker on static values (nRF52).** A bare `analogWrite(pin, value)` of
  a static value — especially right after a `digitalWrite` on the same pin —
  can flicker. Fixed with an explicit `{ freq: 1000 }` on the D1 output.
- **Write serialization.** Android permits only one outstanding GATT operation
  at a time; multiple `writeValue()` calls in a row reject with "GATT operation
  already in progress". The app queues writes and sends them one at a time.
- **syncAll ordering.** Sends `mode` first (now safe due to the currentMode
  guards) so connect-time state applies cleanly.

## Bench preview (v0.10.2) — IMPORTANT for current state

`PWM_PIN = D1` drives the real LED (via the LR7843 MOSFET), which is **now wired
and confirmed** (see "MOSFET hardware bring-up" below). The onboard **blue LED
(LED3)** mirrors the D1 output as a real brightness level (software PWM, so it
doesn't fight D1's hardware-PWM timer) and remains a handy status cue:

- Breathing -> blue LED **fades** up and down smoothly.
- Solid -> blue LED holds **steady** at the brightness level.
- Brightness slider changes the glow level; speed slider changes fade rate.

Once the real LED is wired to D1 and confirmed, the `analogWrite(LED3, ...)`
mirror lines can be removed (or kept — LED3 as a status/preview cue is
harmless).

---

## MOSFET hardware bring-up (real LED on D1) — 2026-07-11

Wiring D1 to the real 5V LED array turned into a multi-hour debugging saga. The
symptom throughout was the same — **LED stuck at a constant dim glow, no
breathing** — but it had *three* independent causes stacked on top of each
other, plus one red herring. Recording all of them because the failure modes
look identical on the bench.

**The module.** 20x "LR7843 opto-isolated MOSFET module" boards (PC817 opto +
LR7843 N-channel MOSFET, screw terminals marked `+ / LOAD / -`, PWM/GND signal
header). Sold as 6-28V load range.

**Cause 1 - the opto module can't switch a 5V load (rejected).** These modules
derive the MOSFET gate bias from the *load* supply through a resistor divider,
and are specced for 6-28V. At 5V the gate only reaches ~2.5V - right at the
LR7843's threshold - so the FET never fully enhances. Bench-confirmed: driving
the module's PWM input, the LOAD terminal only swung ~1.3-2.5V (never near 0V),
LED dim. Raising the load supply to fix the gate bias wasn't an option - the LED
array is a fixed 5V module with onboard current-limiting resistors, so a higher
rail would overdrive it. **The opto module was abandoned.**

**The isolation was illusory anyway.** The module's PC817 nominally isolates
signal ground from load ground, but the Puck is powered from a *non-isolated*
5V->3.3V buck (input and output grounds common), so both grounds were already
bonded through the buck. Isolation bought nothing here except a 6-28V
requirement we couldn't meet. (See spec section 3.2.)

**The fix - direct gate drive, reusing the module board.** Desoldered the PC817
entirely and soldered D1 (yellow) to the former opto **emitter pad**, which
connects through the board's onboard **100 ohm** resistor to the MOSFET gate and
has the onboard **4.7 kohm** to ground as a pulldown. This bypasses the opto and
the load-derived gate divider - D1 now drives the gate directly, 0V <-> full rail.
Reuses the board's 100R (gate series R) and 4.7k (pulldown) with **zero added
components**; the board's V+ gate pull-up is orphaned when the opto leaves, so no
floating partial-on. The board is kept purely as a convenient mount + screw
terminals for the FET.

**Red herring - a dying coin cell.** Mid-debug the gate maxed out at only 2.77V
because the CR2032 had sagged to ~2.8V - enough to muddy the "is the gate drive
adequate?" question. Switching the Puck to the **3.3V buck** gave a clean 3.2V on
the gate. (3.3V fully drives the LR7843 for the trivial 0.35A load; a dying 2.8V
did not.)

**Cause 2 (the real one) - the LED was wired across the FET.** Even with a clean
3.2V gate the LED still read backwards: gate HIGH -> LED off, gate LOW -> LED
dim. That is *impossible* for an N-channel low-side switch with the opto gone
(nothing left to invert). The cause: the LED was wired **red -> LOAD, black ->
GND**, i.e. drain-to-ground, *in parallel with the FET* instead of in series
above it. So FET-on shorted the LED out (off), and FET-off let only the ~1 mA
trickle through the board's indicator pull-up reach it (dim). **This single
miswire also retro-explains every "inverting" reading from the whole session -
the board was the normal non-inverting design all along.**

**Fix:** rewire the LED to span `+` to `LOAD`: **LED red -> `+`, LED black ->
`LOAD`**. Now V+ -> LED -> drain -> FET -> GND. Result: full brightness, smooth
breathing, non-inverting, firmware unchanged.

### Final working drive wiring

| From | To |
|---|---|
| USB 5V (+) | module `+` terminal |
| USB 5V GND (-) | module `-` terminal |
| LED red (+) | module `+` terminal |
| LED black (-) | module `LOAD` terminal (MOSFET drain) |
| Puck D1 (yellow) | former opto **emitter pad** -> onboard 100R -> MOSFET gate |
| Puck 3V | 3.3V buck OUT+ |
| Puck GND (black) | common ground |

**Common ground (single node):** USB 5V GND = buck IN- = buck OUT- = Puck GND =
MOSFET source = module `-`. The buck is non-isolated, so this is one node - and
with the opto removed there is no isolation barrier left at all.

**Onboard components reused:** 100R (gate series), 4.7k (gate pulldown). PC817
removed. V+ gate pull-up orphaned (harmless). Indicator LED still lit by its own
pull-up (harmless).

**Key lesson:** identical bench symptoms ("constant dim, no breathing") came from
opto gate-starvation, a flat battery, AND a load miswire. Measuring the **actual
gate leg voltage** (0V / 3.2V) was what finally separated "gate drive" from "load
wiring" - once the gate was proven clean, an N-FET that turns *off* when its gate
is *high* can only mean the load is wired across the switch, not through it.

## Environment gotchas (Linux / U22)

- **`bluetoothctl` steals the connection.** Espruino accepts only ONE BLE
  connection at a time. If U22's BlueZ is connected (or a `bluetoothctl` scan
  is running and auto-reconnects), the Web IDE connects at the surface but gets
  *"No response from board"*. Fix: in `bluetoothctl` run `scan off`,
  `disconnect <MAC>`, `exit` — and then **do not reopen `bluetoothctl`**; let
  Chrome's Web Bluetooth be the only thing connecting.
- **Stale pairing/bond blocks Web Bluetooth.** If BlueZ has *paired/bonded* the
  Puck, `remove <MAC>` in `bluetoothctl` clears it. A `sudo systemctl restart
  bluetooth` clears accumulated BlueZ flakiness.
- **"Module Storage not found" / "pre-1v96 firmware"** in the IDE are **false
  alarms from an incomplete/flaky connection**, not real problems. The board is
  2v29 and has `Storage`.
- **Hard reset** (hold BTN + insert battery, ~10s, through green -> all-3-LEDs
  -> red-blinks-5x, release 1s after blinking stops): boots a clean interpreter
  with no saved code loaded and the console on BLE — the most stable state for
  recovery/flashing. Saved code is not erased, just not loaded that boot.
- With v0.10.0+, the console stays on BLE, so routine reflashing should **not**
  need any of the above — just connect the IDE and send.

## Flashing workflow (Web IDE)

Practical routine for reflashing over BLE, learned the slightly hard way.

- **Iterate with "Send to RAM", save only when happy.** Set the Web IDE send
  mode to *Send to RAM* (not *Direct to Flash* / *Save on Send*) while
  developing. The firmware calls `onInit()` at the very bottom, so a RAM upload
  runs immediately with no flash write and therefore no compaction pause. Once
  a build is confirmed good, do a deliberate `save()` (or one *Save on Send*
  upload) to make it boot-persistent for the gift.
- **"Compacting..." is a flash write - do NOT interrupt it.** It appears when a
  flash save triggers Storage defragmentation. Over BLE it can take several
  minutes (flash writes interleave with the radio). Pulling power mid-compaction
  is the one thing that can genuinely corrupt the Storage filesystem. Wait it
  out; if unsure whether it finished, press Enter in the console and look for a
  `>` prompt, then check `FW_VERSION`.
- **Expect the version to print twice on a saved flash.** Once from the
  save-triggered boot, once from the explicit `onInit()` call at the end of the
  file. Normal.
- **`BLE Connected, queueing BLE restart for later` is normal.** The updated
  custom service goes live only when the current connection drops. After
  flashing, **disconnect the Web IDE first**, then connect the app - otherwise
  the app talks to the pre-restart service.
- **If a compaction genuinely hangs (>~10 min, no prompt, Enter dead):** hard
  reset. No coin cell in the final build, so "power cycle" = unplug/replug USB
  **while holding BTN** (hold through green -> all-3-LEDs -> red-blinks-5x,
  release ~1s after blinking stops). Boots a clean interpreter, console on BLE,
  saved code untouched (just not loaded that boot) - the safest state to
  re-send from.
- **Fragmentation getting worse over many reflashes:** `require("Storage").
  eraseAll()` from a clean boot clears it, then re-send. This DOES wipe saved
  code, so only from a known-good state.

## Hardware

| Item | Detail |
|---|---|
| Puck.js | v2.1, firmware Espruino 2v29 |
| BLE name | `Puck.js a912` (or `Puck.js !BTN` in button-held recovery boot) |
| MAC | `EF:9A:B3:5B:A9:12` (random) |
| Lamp output pin | `D1` -> LR7843 MOSFET, **direct gate drive** (opto removed; see bring-up section), active-HIGH PWM |
| Lamp load | 5V 24-LED circular array, 0.35 A, low-side switched by the LR7843 |
| Puck supply | 5V->3.3V non-isolated buck (no CR2032 in final build) |
| App hosting | GitHub Pages — `https://rowb1.github.io/orb_lamp` |
| Repo | `https://github.com/rowb1/orb_lamp` |

## Files

- `kates_lamp.js` — Puck firmware (flash via Web IDE; ASCII-only)
- `index.html` — Web Bluetooth PWA (push to GitHub Pages)
- `kates_lamp_spec.md` — living design spec
