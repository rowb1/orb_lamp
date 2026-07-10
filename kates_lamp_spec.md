# Kate's Lamp — Specification (v0.8 DRAFT)

A Puck.js-controlled mains-powered LED lamp with phone control, offering **solid** and **breathing** modes. Inspired by [Frankie's Magic Lamp](https://github.com/rowb1/frankie), simplified (no flash mode) and re-architected for a larger, USB-powered LED.

> **Status:** Draft. **LED current draw now confirmed: 0.35 A @ 5.00 V** (measured, UT658Dual USB tester + benchtop PSU; see §2.1). **MOSFET driver module selected: LR7843 opto-isolated module** (see §4.1) — changes grounding topology vs earlier drafts. **Puck supply resolved: 5V → 3.3V buck converter** (see §3.1, output 3.34V confirmed, dropout at 4.0V/recovery at 4.1V measured) — no coin cell in final build. **Breathing rate defined: 5 s/cycle default, slider triples to 1.67 s/cycle** (see §5). **Firmware (§5.1) now adapted from Frankie's actual `jar7A.js` source** (supplied by user) rather than written from spec description alone — not yet bench-tested on Kate's hardware.

---

## 1. Overview

| Item | Detail |
|---|---|
| Controller | Espruino Puck.js v2.1 (nRF52832, BLE) |
| Power source | Mains → USB-A adaptor, 5V DC |
| Puck supply | 5V → 3.3V buck converter (no CR2032 in final build) |
| Control | Phone web app over BLE (Web Bluetooth, Android) |
| Modes | Solid (steady on) and Breathing (sinusoidal PWM pulse) |
| Removed vs Frankie | Flash mode |
| Retained from Frankie | Breathing via hardware PWM, button master toggle, deep-sleep power management, safety auto-off |

---

## 2. Key difference from Frankie

Frankie drove a small fairy-light string from a **4.5V AA pack** through the Puck's onboard **low-side FET (200 mA max)**.

Kate's lamp differs in two important ways:

1. **Mains/USB power (5V)** instead of a battery pack — continuous supply, no battery life concern for either the LED or the Puck. The Puck is powered from a 5V→3.3V buck converter drawing from the same USB supply (see §3.1); no CR2032 is fitted in the final build.
2. **A much bigger LED — 0.35 A (measured)** — roughly **1.75× the Puck's 200 mA FET limit**. This forces an external MOSFET.

### 2.1 LED module — confirmed specification

| Parameter | Value | Notes |
|---|---|---|
| Module | 5V Circular LED Module, 47mm, 24-LED (batch 3011-1) | |
| Input voltage | 5.0V DC | USB range 4.75–5.25V |
| LED type | SMD 2835 ×24, circular array | |
| Configuration | Parallel branches, **integrated current-limiting resistors** (marked 270 / 240) | **No external R_L needed** |
| Current draw | **0.35 A @ 5.00 V** | Measured, UT658Dual USB tester + benchtop PSU. LED brightly lit. |
| Power | ~1.75 W | Supply overhead min. 3W recommended |
| Power lead | Pre-soldered red (+) / black (−) wires to USB-A | |
| Recommended supply | 5V DC, **≥0.5 A** | |
| PCB | 47mm dia, ~1.2mm thick | Integrated ridged metal housing acts as passive heatsink |
| Dimming | Compatible with inline 5V DC PWM dimmers rated ≥2A | Confirms PWM breathing is viable |
| Polarity | Reverse polarity permanently damages the array | Observe + / − |
| Thermal | For continuous run >30 min, ensure ambient airflow around housing | Feeds into safety auto-off choice |

**Resolved decision gate:** at 0.35 A the onboard-FET path (§4.2) is **invalid** (still exceeds the 200 mA limit). Use the external MOSFET (§4.1), sized well above 0.35 A.

---

## 3. Power architecture

Both the LED and the Puck are powered from a single USB-A mains adaptor (5V DC), but via **two separate, electrically isolated power domains** — this is a deliberate feature of the LR7843 module's PC817 optocoupler (see §4.1), not an accidental omission of a common ground wire.

- **LED power domain:** USB 5V → LR7843 module load terminals (+/LOAD/−) → LED module. The USB supply GND connects to the LR7843 load − terminal only.
- **Puck power domain:** USB 5V → 5V→3.3V buck converter → Puck 3V + GND pins. The buck converter GND connects to the LR7843 signal GND terminal only.

The two grounds are **kept separate by the PC817 optocoupler** inside the LR7843 module. A wiring fault or MOSFET failure on the high-current LED side cannot propagate to the Puck. There is **no wire deliberately tying the USB 5V load GND to the Puck/buck GND** — the opto handles the signal crossing.

The USB adaptor must supply enough current for both domains: LED load (0.35 A) + Puck via buck (~30–50 mA estimated) + converter overhead. A **≥1 A (≥5W)** adaptor provides comfortable headroom.

### 3.1 Puck supply: 5V → 3.3V buck converter

**Why a buck converter rather than a linear regulator (LDO):**
An LDO stepping 5V down to 3.3V drops 1.7V and dissipates that as heat proportional to current. For the Puck's modest current (~30–50 mA) the waste would be small (~85 mW), so an LDO would also work — but the available buck module is a cleaner, more efficient choice and avoids sourcing an additional part.

**Puck.js v2.1 supply voltage constraints:**
The Puck has no onboard voltage regulator — it expects supply voltage directly on its 3V and GND pins. The acceptable range is **2.0–3.6V**; the absolute maximum is 3.6V. Exceeding this risks permanent damage to the nRF52832 and onboard sensors. 3.3V is the correct target: within range, with 0.3V margin below the maximum.

**The buck converter module (identified from photos):**
The module shows selectable output taps (5V / 3.3V / 2.5V / 1.8V / 1.5V) via solder bridges, a 4R7 inductor, and is labelled "Default Out: 1.25V" / "IN: 5–15V / OUT: Max 3A". This appears to be an adjustable buck module using a fixed-output feedback network selected by the solder bridges.

**Required validation before connecting to Puck:**

| Check | Why | Action |
|---|---|---|
| Output voltage accuracy | Solder-bridge selected outputs may not be trimmed precisely | **DONE: measured 3.34V (multimeter, no load) — within ±0.1V of target. ✅** |
| Dropout / input minimum | Buck needs headroom above output; need to know minimum input before output collapses | **DONE: output held 3.3V down to 4.0V input; recovered at 4.1V on the way back up. Minimum safe input: ~4.1V. ✅** |
| Input voltage under load | USB plug packs sag under load; must stay above 4.1V at the buck input with LED running | Measure USB adaptor output voltage with LED running; confirm ≥4.1V (was previously ≥5V — now tighter bound known) |
| Output ripple | Buck converters switch at high frequency; nRF52832 BLE is sensitive to supply noise | Observe output on oscilloscope if available; add **100 µF electrolytic + 100 nF ceramic** at Puck 3V/GND pins regardless |

**Wiring:**
- Buck converter IN+ → USB 5V (+)
- Buck converter IN− → USB 5V GND *(load side — not Puck GND)*
- Buck converter OUT+ → Puck 3V pin
- Buck converter OUT− → Puck GND pin → LR7843 signal GND

**Critical ground rule:** the buck converter output GND (= Puck GND) must connect **only** to the LR7843 signal GND terminal. Do not connect it to the USB supply GND or LR7843 load − terminal — that would tie the two isolated domains together and expose the Puck to the LED load circuit.

---

## 4. Drive circuit

### 4.1 Required: LR7843 opto-isolated MOSFET module (low-side switch)

**Why this module was chosen:**
- The LR7843 N-channel MOSFET is logic-level compatible, fully enhanced at V_GS = 2.5V — so the Puck's 3.3V GPIO drives it directly without a level shifter.
- R_DS(on) of 3.3 mΩ is extremely low; at 0.35 A the power dissipated in the switch is negligible (~0.4 mW), so no heatsinking is needed.
- Rated 15 A continuous (161 A peak) — the 0.35 A load is less than 2.5% of its capacity, giving enormous headroom.
- The onboard **PC817 optocoupler** electrically isolates the Puck's signal ground from the LED power ground. This protects the Puck from any fault on the high-current side, and removes the need to deliberately tie the two grounds together in the wiring.

**Why the common-ground assumption from earlier drafts no longer applies:**

Previous drafts assumed a discrete MOSFET (AO3400 / IRLZ44N) wired directly, where a shared ground between Puck and LED supply was *mandatory* — the MOSFET source had to sit at the same potential as the Puck GND for the gate drive to work. The LR7843 module replaces this with an optocoupler: the Puck's PWM signal drives the LED inside the PC817, whose phototransistor output then drives the MOSFET gate referenced to the *load* supply — a completely separate circuit. The two grounds are therefore intentionally isolated, not accidentally disconnected.

**How the gate drive works on this module:**

The Puck PWM pin → 1 kΩ series resistor (on module) → PC817 LED. When the PWM signal is high, the opto phototransistor conducts and creates a voltage divider from two 4.7 kΩ resistors, biasing the MOSFET gate to approximately 50% of the 5V load supply (~2.5V). This is sufficient to fully enhance the LR7843 at 5V load voltage. When PWM is low (or floating), a 4.7 kΩ pulldown on the gate holds the MOSFET off — the LED is guaranteed off during Puck boot/sleep.

**Connections (three wires total):**

```
  ┌─────────────────────────────────────────────────────────┐
  │              LR7843 MODULE                              │
  │                                                         │
  │  Signal side (left / PWM+GND headers)                  │
  │  ┌──────────┐                                           │
  │  │ PWM  ●───┼──── Puck GPIO (PWM pin, e.g. D1)         │
  │  │ GND  ●───┼──── Puck GND                             │
  │  └──────────┘                                           │
  │         │   PC817 optocoupler (isolation barrier)       │
  │  Load side (right / screw terminals on rear)            │
  │  ┌────────────┐                                         │
  │  │  +    ●───┼──── USB 5V supply (+)                   │
  │  │  LOAD ●───┼──── LED module red wire (+)              │
  │  │  −    ●───┼──── USB 5V supply GND (−)               │
  │  └────────────┘                                         │
  │                LR7843 MOSFET switches                   │
  │                LED black wire (−) to load GND           │
  └─────────────────────────────────────────────────────────┘

  LED module black wire (−) is switched by the MOSFET internally.
  USB supply GND and Puck GND are NOT connected together.
```

**Notes on the circuit:**
- **No R_gate or R_pulldown needed externally** — both are already on the module (1 kΩ input resistor, 4.7 kΩ gate pulldown).
- **No R_L** — the LED module's onboard resistors (270/240) handle current limiting.
- **Active HIGH logic** — PWM high = LED on, PWM low = LED off. Matches the Puck's default GPIO state on boot (low), so the LED is off-by-default safely.
- **PWM frequency caution** — the PC817 optocoupler has a relatively slow response time (~3–18 µs). This limits clean PWM to roughly **1–5 kHz maximum** before the opto can no longer follow the signal faithfully. This is well above the frequency needed to avoid visible flicker (~100–200 Hz minimum), so breathing mode is fine. Test on the bench to confirm the upper limit with this specific module batch.
- **Load supply range** — the module supports 6–28V on the load side per the manufacturer. At 5V load this is slightly below the stated minimum; however, the gate is biased at ~50% of supply (~2.5V), which is right at the LR7843's threshold. In practice it works at 5V — confirm on the bench. If gate drive proves marginal, feeding the load + terminal from a slightly higher voltage (e.g. a 6V USB-C PD supply) would give more V_GS headroom, but this is unlikely to be necessary.
- **Puck GND isolation** — do **not** run a wire from USB 5V GND to Puck GND. The opto provides the signal crossing; joining the grounds would defeat the isolation and expose the Puck to the load circuit.

---

## 5. Firmware behaviour (Puck.js / Espruino)

| Mode | Behaviour |
|---|---|
| **Solid** | GPIO driven steady high → LED full on. |
| **Breathing** | Hardware PWM, sinusoidal duty-cycle ramp for an organic pulse (Frankie's approach, retained). **Default: 5 s per full cycle**, matching a relaxed resting breathing rate (§ research note below). |
| **Off / standby** | GPIO low; pulldown ensures LED off. Optional `NRF.sleep()` after a standby period. |

**Button (physical master toggle):** single press wakes the lamp (green flash) / enters standby (red flash), mirroring Frankie.

**Breathing rate — default and range:**

Resting/relaxed human breathing is typically 12–20 breaths/minute (one breath every 3–5 s). Kate's lamp defaults to the slow end of that range for a calm ambient feel, with the UI slider able to speed it up to roughly **triple the rate** (shorter cycle) for a livelier effect.

| Parameter | Value | Cycle time | Notes |
|---|---|---|---|
| **Default breathing frequency** | 0.2 Hz | 5.0 s/cycle | One full on→off→on cycle every 5 seconds — matches a relaxed resting breath |
| **Slider minimum** | 0.2 Hz | 5.0 s/cycle | Slowest = default |
| **Slider maximum** | 0.6 Hz | 1.67 s/cycle | 3× the default frequency (1/3 the cycle time) |
| Hardware safety floor/ceiling (carried from Frankie, unchanged) | 0.02 – 20.0 Hz | — | Wider than the UI range; the UI range above is a deliberate subset chosen for comfort, not a hardware limit |

**Distinct from PWM carrier frequency:** the breathing rate above (0.2–0.6 Hz) is the speed of the slow sinusoidal *envelope* — how often the lamp visibly brightens and dims. This is separate from the PWM *carrier* frequency that actually switches the LR7843 module's MOSFET many times per second to create each brightness level (§4.1 caps that carrier at ~1–5 kHz due to the PC817 opto's response time). The firmware below sets the carrier via `analogWrite`'s `freq` option, and sweeps duty cycle at the slower breathing rate via a `setInterval` tick.

**Safety auto-off:** hardcoded timer turns the LED off if left active. The module's datasheet warns that continuous operation **>30 minutes** needs ambient airflow around the housing — so a safety auto-off in the ~30 min range is a sensible default unless the enclosure provides good ventilation.

### 5.1 Firmware code (Espruino / Puck.js)

Adapted from Frankie's actual source (`jar7A.js`, supplied by the user) — same tick-based phase-accumulator pattern, button/standby/safety-timer structure, and `digitalPulse` LED feedback. Two changes from Frankie's original:

1. **`FET.write()` / `FET.set()` / `FET.reset()` → `PWM_PIN` GPIO calls.** Frankie drove the Puck's *onboard* low-side FET directly (a built-in helper object). Kate's lamp uses the external LR7843 module instead (§4.1), so all FET calls become `digitalWrite`/`analogWrite` on a regular GPIO pin (`D1`) wired to the module's PWM input, active-HIGH.
2. **Flash mode removed, frequency range retargeted.** Frankie's `cfg.minHz`/`maxHz` (0.1–10 Hz) supported flashing as well as breathing. Kate's lamp drops flash mode entirely (per §1) and narrows the breathing range to 0.2–0.6 Hz (5 s → 1.67 s per cycle, §5) for a calm, human-breath feel rather than Frankie's wider decorative range.

```javascript
// =============================================================
// Kate's Lamp — Puck.js v2.1 firmware (Espruino)
// Adapted from Frankie's jar7A.js. Drives an LR7843 opto-isolated
// MOSFET module (active-HIGH PWM on D1) instead of the Puck's
// onboard FET. Flash mode removed; breathing range narrowed to
// match a relaxed human breathing rate. See spec §4.1 and §5.
// =============================================================

var PWM_PIN = D1; // → LR7843 module PWM input (active-HIGH)

var i, t, t_s, step = 0, active = true;

// Configurable Parameters
var cfg = {
  minHz: 0.2,    // 5.0s/cycle — default, matches relaxed resting breath (§5)
  maxHz: 0.6,    // 1.67s/cycle — 3x default, slider maximum (§5)
  standby: 300,  // seconds before deep sleep eligible after powerOff
  sleep: 30 * 60 // 30 min safety auto-off (thermal note §2.1)
};

function stopLights(silent) {
  if (i) i = clearInterval(i);
  if (t_s) t_s = clearTimeout(t_s);
  digitalWrite(PWM_PIN, 0); // LED off (was FET.reset())
  digitalWrite(LED1,0); digitalWrite(LED2,0); digitalWrite(LED3,0);
  step = 0;
  if (!silent) active = false;
}

function startBreathing(hz) {
  if (t) t = clearTimeout(t);
  NRF.wake();
  stopLights(true);
  active = true;
  digitalPulse(LED2, 1, 500); // green flash = waking
  i = setInterval(() => {
    step += (hz * Math.PI * 2) / 50; // 50 ticks/sec at 20ms interval
    var val = (Math.sin(step) + 1) / 2;
    analogWrite(PWM_PIN, val); // was analogWrite(FET, val)
    digitalWrite(LED3, val > 0.5 ? 1 : 0); // onboard LED follows roughly
  }, 20);
  t_s = setTimeout(powerOff, cfg.sleep * 1000);
}

function allOn() {
  if (t) t = clearTimeout(t);
  NRF.wake();
  stopLights(true);
  active = true;
  digitalPulse(LED2, 1, 500);
  digitalWrite(PWM_PIN, 1); // was FET.set()
  digitalWrite(LED3, 1);
  t_s = setTimeout(powerOff, cfg.sleep * 1000);
}

function powerOff() {
  stopLights();
  active = false;
  digitalPulse(LED1, 1, 500); // red flash = standby
  t = setTimeout(() => { NRF.sleep(); }, cfg.standby * 1000);
}

// Button: toggle between standby and default breathing (5s/cycle)
setWatch(() => active ? powerOff() : startBreathing(cfg.minHz), BTN, {edge:"rising", repeat:true, debounce:50});

// Default boot state: 5s breathing cycle (0.2 Hz)
startBreathing(cfg.minHz);

// ---- App-facing setters (called from BLE command handlers) ----
function setMode(mode) {
  if (mode === "off") powerOff();
  else if (mode === "solid") allOn();
  else if (mode === "breathing") startBreathing(cfg.minHz);
}

function setBreathSpeed(normalized) {
  // normalized: 0..1 from UI slider. 0 = 5.0s/cycle, 1 = 1.67s/cycle (3x).
  var n = Math.max(0, Math.min(1, normalized));
  var hz = cfg.minHz + n * (cfg.maxHz - cfg.minHz);
  if (active) startBreathing(hz); // restart breathing loop at new rate
}

// ---- BLE command interface (sketch — wire up to actual GATT/UART RX) ----
// Expected commands from phone app, e.g. via NRF UART service:
//   {"cmd":"mode","value":"solid"|"breathing"|"off"}
//   {"cmd":"breathSpeed","value":0.0-1.0}   // 0 = 5s cycle, 1 = 1.67s cycle
function onBleCommand(msg) {
  try {
    var cmd = JSON.parse(msg);
    if (cmd.cmd === "mode") setMode(cmd.value);
    else if (cmd.cmd === "breathSpeed") setBreathSpeed(cmd.value);
  } catch (e) {
    // ignore malformed commands
  }
}
// NRF.on('data', onBleCommand); // wire up once UART/GATT service is finalised
```

**Notes on the adaptation:**
- **Phase-accumulator math is unchanged from Frankie:** `step += (hz * Math.PI * 2) / 50` at a fixed 20ms tick is exactly Frankie's pattern — it's a proven approach, so it's kept as-is rather than reworked. At `hz = 0.2` this produces a 5.0s sine period; at `hz = 0.6` (slider max) a 1.67s period, confirming the "triple the rate" requirement.
- **`FET.write`/`FET.set`/`FET.reset` are Puck-specific helpers for the onboard low-side FET** — they don't apply to Kate's lamp, which switches an *external* MOSFET module via a regular GPIO pin. Replaced with `digitalWrite`/`analogWrite` on `PWM_PIN` (`D1`), active-HIGH per §4.1.
- **Flash mode (`start(hz)` in the original) is dropped entirely** — consistent with the spec's original decision ("Removed vs Frankie: Flash mode," §1). `setMode("solid")` replaces Frankie's `allOn()` naming for clarity against the spec's mode table.
- **No brightness scaling separate from breathing** — Frankie's source doesn't have an independent brightness control either; the sine wave's peak is always 1.0. If a brightness control beyond "breathing speed" is wanted (as listed in §6's UI), that's a genuine addition beyond what Frankie or this draft currently does — flagged as an open item below.
- **`setBreathSpeed` restarts the interval on change** rather than mutating a shared `hz` variable mid-loop, to keep the phase accumulator consistent — matches Frankie's pattern of calling `startBreathing()` fresh rather than patching state externally.
- **Untested:** still a first draft adapted from source, not yet run on Kate's actual hardware (LR7843 module, buck-converter-powered Puck). Needs bench validation per the open items below.
- **BLE wiring is a stub**, same caveat as before — message shape assumed, not yet connected to a real GATT/UART service.

---

## 6. Phone app

- Web Bluetooth control page (Android), served from GitHub Pages as an installable PWA — same delivery model as Frankie (`index.html` + `manifest.json` + `icon.png`).
- UI reduced to: **On/Off**, **Solid vs Breathing**, **brightness**, **breathing speed**.
- **Breathing speed slider:** sends a 0–1 normalized value via `breathSpeed` command (see §5.1). 0 = default 5 s/cycle, 1 = fastest at 1.67 s/cycle (3× default).
- Visual theme TBC (Frankie used amber/cork glassmorphism).

---

## 7. Open questions / TBC

**Resolved by bench measurement, LED datasheet, MOSFET module selection, Puck supply decision, breathing-rate research, and Frankie source adaptation:** current draw (0.35 A @ 5.00 V, measured), built-in current limiting (yes, no R_L), drive method (LR7843 opto-isolated MOSFET module), supply sizing (≥1 A USB adaptor), PWM dimmability (yes, subject to opto bandwidth), thermal limit (airflow needed >30 min), Puck GND isolation (PC817 opto on LR7843 module), Puck supply method (5V→3.3V buck converter — no CR2032 in final build), default breathing rate (5 s/cycle, 0.2 Hz, tripled to 1.67 s/cycle at slider max — see §5), firmware base (adapted from Frankie's actual `jar7A.js` source — see §5.1).

Still open:

1. **Buck converter output — PARTIALLY VALIDATED.** Output measured 3.34V (no load) ✅. Dropout confirmed at 4.0V input; recovery at 4.1V — so minimum safe USB supply input is **4.1V**. Remaining check: measure USB adaptor output voltage with LED running and confirm it stays ≥4.1V under that load. Add 100 µF + 100 nF decoupling at Puck power pins before connecting.
2. **USB adaptor voltage under load** — dropout testing shows buck needs ≥4.1V input to maintain 3.3V output. Measure adaptor output voltage with LED running (0.35 A); confirm it stays ≥4.1V. Most 5V USB adaptors stay well above this, but cheap units can sag — verify before finalising the adaptor choice.
3. **PWM carrier frequency** — `analogWrite(PWM_PIN, val)` in §5.1 currently uses Espruino's default carrier (no explicit `freq` option set). Must confirm the default falls within the LR7843 module's ~1–5 kHz opto bandwidth (§4.1) and stays high enough to avoid visible flicker (≥100–200 Hz); set an explicit `freq` option if the default doesn't land in range.
4. **Gate drive at 5V load supply** — module rated 6–28V on load side; 5V gives ~2.5V gate bias, right at the LR7843 threshold. Verify clean switching on the bench.
5. **Enclosure / form factor** — must allow airflow around the LED's metal housing per thermal note.
6. **Safety auto-off duration** — proposed ~30 min; confirm against intended use and enclosure ventilation.
7. **Brightness control gap (revised)** — §6's UI lists a brightness control, but neither Frankie's original source nor the adapted §5.1 firmware implements one; the sine wave's peak is always 1.0 (full brightness). Needs a design decision: either add a `brightness` multiplier to `ledBreathTick`-equivalent logic (as in the earlier firmware draft), or drop brightness from the UI scope and rely on breathing speed + solid/breathing toggle only.
8. **Firmware bench validation** — §5.1 code is adapted from real Frankie source but not yet run on Kate's actual hardware (LR7843 module, buck-converter-powered Puck). Needs testing: confirm PWM carrier survives the opto cleanly (see item 3), the breathing sine looks smooth (not stepped) at both 5 s and 1.67 s cycle times, and button/safety-timer/standby logic behaves as expected.
9. **BLE command interface** — `onBleCommand` in §5.1 is a stub matching an assumed JSON message shape; needs to be wired to a concrete GATT/Nordic UART service once the phone app (§6) is built, and the message format confirmed end-to-end.

---

## 8. Bill of materials (preliminary)

| Qty | Part | Notes |
|---|---|---|
| 1 | Espruino Puck.js v2.1 | Controller; powered from buck converter output, no CR2032 fitted |
| 1 | USB-A mains adaptor, 5V **≥1 A (≥5W)** | Common supply for LED and Puck buck converter |
| 1 | 5V Circular LED Module, 47mm 24-LED (batch 3011-1) | 0.35 A @ 5.00 V measured, integrated resistors, USB-A leads |
| 1 | LR7843 opto-isolated MOSFET module | PC817 opto + LR7843 N-ch MOSFET; logic-level, 15 A continuous, isolated signal/load grounds |
| 1 | 5V→3.3V buck converter module | Solder-bridge selectable output; confirm 3.3V ± 0.1V under load before connecting Puck |
| 2 | Decoupling caps: 100 µF electrolytic + 100 nF ceramic | Fitted at Puck 3V/GND pins to suppress buck ripple |
| — | Wiring | Buck: IN from USB 5V load side; OUT to Puck 3V+GND. LR7843: PWM+signal GND from Puck; load +/− from USB 5V load side. Buck OUT GND and USB load GND must NOT be joined. |

*Gate resistor, gate pulldown, and MOSFET are all integrated on the LR7843 module — no discrete passives required for the drive circuit.*
*No external LED current-limiting resistor required — handled on LED module.*
