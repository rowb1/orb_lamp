# Orb Lamp — Specification (v0.9 DRAFT)

A Puck.js-controlled mains-powered LED lamp with phone control, offering **solid** and **breathing** modes. Inspired by [Frankie's Magic Lamp](https://github.com/rowb1/frankie), simplified (no flash mode) and re-architected for a larger, USB-powered LED.

**Repository:** https://github.com/rowb1/orb_lamp

> **Status:** Draft. **LED current draw now confirmed: 0.35 A @ 5.00 V** (measured, UT658Dual USB tester + benchtop PSU; see §2.1). **MOSFET driver module selected: LR7843 opto-isolated module** (see §4.1) — changes grounding topology vs earlier drafts. **Puck supply resolved: 5V → 3.3V buck converter** (see §3.1, output 3.34V confirmed, dropout at 4.0V/recovery at 4.1V measured) — no coin cell in final build. **Breathing rate defined: 5 s/cycle default, slider triples to 1.67 s/cycle** (see §5). **Firmware (§5.1) adapted from Frankie's `jar7A.js`** with brightness control (default 0.4, persisted via `E.setStorage()`). **Drive circuit RESOLVED and bench-confirmed (2026-07-11):** the LR7843 *opto* module was rejected (can't switch a 5V load — see §4.1), and the adopted circuit is **direct gate drive** on the bare LR7843 with the opto removed (see §4.0). Real 5V LED array now runs at full brightness with smooth breathing; firmware unchanged at v0.10.2.

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

The two grounds are **kept separate by the PC817 optocoupler** inside the LR7843 module. A wiring fault or MOSFET failure on the high-current LED side cannot propagate to the Puck. There is **no wire deliberately tying the USB 5V load GND to the Puck/buck GND** — the opto handles the signal crossing. *(Corrected in §3.2: a standard non-isolated buck bonds these grounds internally, so the isolation is nominal in this build.)*

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

**Critical ground rule:** the buck converter output GND (= Puck GND) must connect **only** to the LR7843 signal GND terminal. Do not connect it to the USB supply GND or LR7843 load − terminal — that would tie the two isolated domains together and expose the Puck to the LED load circuit. *(See §3.2 — with a non-isolated buck these grounds are already bonded internally, so this rule prevents a redundant extra wire but does not by itself achieve isolation.)*

### 3.2 Grounding — signal-side common ground (and a correction to the isolation model)

This subsection documents the grounding as actually wired on the assembled hardware, and resolves the battery-vs-USB question about the Puck GND wire.

**The signal side always needs one common ground.** For PWM to reach the MOSFET, the Puck's D1 output must share a ground with the LR7843 signal GND terminal. When D1 goes HIGH it sources current through the module's 1 kΩ series resistor and the PC817 input LED, and that current returns to the module signal GND terminal — a loop that only completes if the module signal GND sits at the Puck's own ground potential. So **Puck GND and LR7843 signal GND must be connected in every power configuration**, battery or USB.

**Battery build (CR2032):** black (Puck GND) → LR7843 signal GND is sufficient on its own. The Puck's ground reference is the coin cell's negative terminal — internally the same node as the Puck GND pad — so a single wire to the module signal GND closes the opto-LED loop. Confirmed correct.

**USB build (buck converter — the final build):** the black wire cannot simply be moved from the module to "USB GND". Puck GND now has two jobs at once:

1. **Power return** — the Puck draws current in via its 3V pin (from buck OUT+) and must return it to buck OUT−. Without Puck GND ↔ buck OUT−, the Puck never powers on.
2. **Signal return** — the opto-LED loop still needs Puck GND ↔ LR7843 signal GND, exactly as on battery.

Both are satisfied by making these one common signal-ground node — **buck OUT− = Puck GND = LR7843 signal GND** — which is exactly the §3.1 wiring line. In practice: run the black wire to buck OUT−, and add a short jumper from buck OUT− to the LR7843 signal GND terminal. Do **not** leave the module signal GND floating; if you do, the MOSFET never switches.

**Correction to the "two isolated domains" model (§3, §4.1):** those sections state the PC817 keeps the Puck/buck ground electrically isolated from the USB 5V load ground, with no wire tying them. That holds only if the Puck is fed from an *isolated* DC-DC converter. The selected module is a standard **non-isolated buck** (shared input/output ground): buck IN− (USB 5V GND, load side) and buck OUT− (Puck signal ground) are the same node internally. So in this build the load ground and the signal ground are already bonded *through the buck converter* — the optocoupler's galvanic isolation exists on the module but is **not realised at system level**.

This is harmless. A single common-ground, low-side-switch design is completely standard and safe at 5V, and the LR7843 module operates correctly with a common ground. The only practical consequence is that the fault-isolation benefit described in §3/§4.1 does not exist in this build — a fault on the LED side would share ground with the Puck. Achieving true isolation would require an *isolated* DC-DC converter for the Puck (or powering the Puck from a separate supply / its coin cell); for a 5V ambient lamp this is unnecessary.

**Net wiring, final USB build (effectively one ground):**

- **Common ground node:** USB 5V GND = buck IN− = buck OUT− = Puck GND = LR7843 signal GND
- **LR7843 load −:** also to USB 5V GND (same node)
- **LR7843 load +:** USB 5V (+); **LOAD:** LED red (+); LED black (−) switched internally by the MOSFET
- **Puck 3V:** buck OUT+; **Puck D1:** LR7843 PWM input

---

## 4. Drive circuit

### 4.0 ADOPTED: LR7843 direct gate drive (opto removed) — bench-confirmed 2026-07-11

**This is the circuit in the final build.** The opto module (§4.1) was bench-rejected because it cannot fully switch a 5V load. The adopted circuit reuses the same LR7843 module *board* as a physical mount, but with the PC817 optocoupler **desoldered** and the Puck driving the MOSFET gate **directly**.

**What was done:**

- **Removed the PC817 optocoupler** from the module.
- **Soldered D1 to the former opto emitter pad**, which connects through the board's onboard **100Ω** (gate series resistor) to the MOSFET gate, and has the onboard **4.7kΩ** to ground as the gate pulldown. D1 now drives the gate directly, 0V ↔ full rail, bypassing the load-derived gate divider that starved the opto version.
- Reuses the board's **100Ω** and **4.7kΩ** — **zero added components**. The board's V+ gate pull-up is orphaned when the opto is removed (no floating partial-on). The indicator LED still works.

**Final drive wiring:**

```
  USB 5V (+) ─────────────► module "+"  ──► LED red (+)
  USB 5V GND (-) ─────────► module "-"  (= MOSFET source = common GND)
  LED black (-) ──────────► module "LOAD" (= MOSFET drain)
  Puck D1 (yellow) ───────► former opto EMITTER pad ─[100Ω]─► MOSFET gate
                                                      └─[4.7kΩ]─► GND (pulldown)
  Puck 3V ────────────────► 3.3V buck OUT+
  Puck GND (black) ───────► common GND
```

- **Load path (low-side switch):** V+ → LED → drain → MOSFET → GND. Gate HIGH → FET on → LED full bright; gate LOW → off. **Active-HIGH, matches firmware — no code change.**
- **Common ground (single node):** USB 5V GND = buck OUT− = Puck GND = MOSFET source. The buck is non-isolated and the opto is gone, so there is no isolation barrier — this is one ground (see §3.2).
- **3.3V gate drive is sufficient** for the LR7843 at the 0.35 A load. (A sagging 2.8 V coin cell was *not* — the final build powers the Puck from the buck.)

> **Critical assembly note (cost several bench hours):** the LED must be wired **red → `+`, black → `LOAD`** (in *series*, V+→LED→drain). Wiring it `LOAD`→`GND` puts the LED **in parallel with the FET**, so the FET shorts it out when it turns on (LED off when gate high) and only a ~1 mA indicator-pull-up trickle lights it when the FET is off (constant dim). This miswire mimics an "inverting, always-dim" module exactly — see `ble_debug.md`.

---

### 4.1 REJECTED: LR7843 opto-isolated MOSFET module (low-side switch)

> **STATUS: BENCH-REJECTED at 5 V (2026-07-11).** This module cannot fully switch a 5 V load: it derives the MOSFET gate bias from the *load* supply via a resistor divider and is specced for 6–28 V, so at 5 V the gate only reaches ~2.5 V (right at the LR7843 threshold) and the FET never fully enhances → LED stuck dim, LOAD terminal swinging only ~1.3–2.5 V instead of to ~0 V. The 5 V LED array can't tolerate a higher rail (fixed onboard current-limiting resistors), so raising the load supply to fix the gate bias was not viable. Superseded by the direct-drive mod in **§4.0**. The analysis below is retained as the rationale and for anyone using these modules at their intended 6–28 V.

**Why this module was chosen:**
- The LR7843 N-channel MOSFET is logic-level compatible, fully enhanced at V_GS = 2.5V — so the Puck's 3.3V GPIO drives it directly without a level shifter.
- R_DS(on) of 3.3 mΩ is extremely low; at 0.35 A the power dissipated in the switch is negligible (~0.4 mW), so no heatsinking is needed.
- Rated 15 A continuous (161 A peak) — the 0.35 A load is less than 2.5% of its capacity, giving enormous headroom.
- The onboard **PC817 optocoupler** electrically isolates the Puck's signal ground from the LED power ground. This protects the Puck from any fault on the high-current side, and removes the need to deliberately tie the two grounds together in the wiring. *(Caveat — see §3.2: the non-isolated buck bonds signal and load grounds anyway, so this isolation is not realised at system level. Harmless for a 5V lamp.)*

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

*(Diagram above reflects the rejected opto wiring. The adopted build uses §4.0: opto removed, single common ground, LED wired `+`→`LOAD`.)*

**Notes on the circuit:**
- **No R_gate or R_pulldown needed externally** — both are already on the module (1 kΩ input resistor, 4.7 kΩ gate pulldown).
- **No R_L** — the LED module's onboard resistors (270/240) handle current limiting.
- **Active HIGH logic** — PWM high = LED on, PWM low = LED off. Matches the Puck's default GPIO state on boot (low), so the LED is off-by-default safely.
- **PWM frequency caution** — the PC817 optocoupler has a relatively slow response time (~3–18 µs). This limits clean PWM to roughly **1–5 kHz maximum** before the opto can no longer follow the signal faithfully. This is well above the frequency needed to avoid visible flicker (~100–200 Hz minimum), so breathing mode is fine. Test on the bench to confirm the upper limit with this specific module batch.
- **Load supply range** — the module supports 6–28V on the load side per the manufacturer. At 5V load this is below the stated minimum; the gate is biased at ~V_load/2 (~2.5V), right at the LR7843's threshold. **BENCH RESULT: it did NOT adequately switch at 5V** — the FET stayed in its linear region (LOAD terminal ~1.3–2.5V, LED dim). The predicted marginal gate drive was real. Feeding the load + terminal from ≥6V would fix the gate bias but overdrives the fixed-5V LED array, so this path was abandoned in favour of §4.0.
- **Puck GND isolation** — *(this was the design intent for the opto version; it does not hold in this build — see §3.2. The non-isolated buck already bonds the grounds, and §4.0 removes the opto entirely, giving one common ground.)*

---

## 5. Firmware behaviour (Puck.js / Espruino)

| Mode | Behaviour |
|---|---|
| **Solid** | `analogWrite(PWM_PIN, brightness)` — LED steady at current brightness level. |
| **Breathing** | Sinusoidal PWM ramp scaled by `brightness` — peak brightness is the current brightness setting, not always 1.0. **Default: 5 s per full cycle.** |
| **Off / standby** | GPIO low; pulldown ensures LED off. `NRF.sleep()` after standby period. |

**Brightness control:** a 0–1 scalar applied to all LED output. Default 0.4 (noticeably on but not room-filling). Persisted to Puck flash via `E.setStorage()` — survives power-off and reboot. In breathing mode, sets the sine wave's *peak*; in solid mode, sets the steady output level. Minimum clamped to 0.05 to prevent fully-off via slider.

**Button (physical master toggle):** single press wakes the lamp (green flash) / enters standby (red flash), mirroring Frankie.

**Breathing rate — default and range:**

Resting/relaxed human breathing is typically 12–20 breaths/minute (one breath every 3–5 s). The lamp defaults to the slow end of that range for a calm ambient feel, with the UI slider able to speed it up to roughly **triple the rate** (shorter cycle) for a livelier effect.

| Parameter | Value | Cycle time | Notes |
|---|---|---|---|
| **Default breathing frequency** | 0.2 Hz | 5.0 s/cycle | One full on→off→on cycle every 5 seconds — matches a relaxed resting breath |
| **Slider minimum** | 0.2 Hz | 5.0 s/cycle | Slowest = default |
| **Slider maximum** | 0.6 Hz | 1.67 s/cycle | 3× the default frequency (1/3 the cycle time) |
| Hardware safety floor/ceiling (carried from Frankie, unchanged) | 0.02 – 20.0 Hz | — | Wider than UI range — UI range is a deliberate comfort subset |

**Distinct from PWM carrier frequency:** the breathing rate (0.2–0.6 Hz) is the slow sinusoidal *envelope*. The PWM *carrier* (the fast switching that creates each brightness level) is separate — §4.1 notes the LR7843 module's opto caps this at ~1–5 kHz.

**Safety auto-off:** 30 min hardcoded timer — consistent with the LED module's thermal note (§2.1).

### 5.1 Firmware code (Espruino / Puck.js)

Adapted from Frankie's actual source (`jar7A.js`, supplied by the user) — same tick-based phase-accumulator pattern, button/standby/safety-timer structure, and `digitalPulse` LED feedback. Three changes from Frankie's original:

1. **`FET.write()` / `FET.set()` / `FET.reset()` → `PWM_PIN` GPIO calls.** Frankie drove the Puck's *onboard* low-side FET directly. Kate's lamp uses the external LR7843 module via GPIO `D1`, active-HIGH.
2. **Flash mode removed, frequency range retargeted.** Frankie's 0.1–10 Hz range supported flashing. Orb lamp drops flash mode and narrows to 0.2–0.6 Hz.
3. **Brightness control added with flash persistence.** `brightness` (0–1, default 0.4) scales all LED output. Loaded from flash on boot via `E.getStorage("brightness")`; saved on change via `E.setStorage("brightness", ...)`. Survives power-off.

```javascript
// =============================================================
// Orb Lamp — Puck.js v2.1 firmware (Espruino)
// Adapted from Frankie's jar7A.js. Drives an LR7843 opto-isolated
// MOSFET module (active-HIGH PWM on D1) instead of the Puck's
// onboard FET. Flash mode removed; breathing range narrowed to
// match a relaxed human breathing rate. Brightness control added
// with persistence via E.setStorage(). See spec §4.1 and §5.
// =============================================================

var PWM_PIN = D1; // → LR7843 module PWM input (active-HIGH)

var i, t, t_s, step = 0, active = true;

// Configurable Parameters
var cfg = {
  minHz: 0.2,    // 5.0s/cycle — default, matches relaxed resting breath
  maxHz: 0.6,    // 1.67s/cycle — 3x default, slider maximum
  standby: 300,  // seconds before deep sleep after powerOff
  sleep: 30 * 60 // seconds — safety auto-off (thermal note §2.1)
};

// Brightness: 0..1, persisted to flash.
// Default 0.4 — noticeably on but not room-filling; user can raise via app.
var brightness = 0.4;

function loadBrightness() {
  var stored = E.getStorage("brightness");
  if (stored !== undefined) {
    var val = parseFloat(stored);
    if (!isNaN(val)) brightness = Math.max(0.05, Math.min(1.0, val));
  }
}

function saveBrightness() {
  E.setStorage("brightness", brightness.toString());
}

function stopLights(silent) {
  if (i) i = clearInterval(i);
  if (t_s) t_s = clearTimeout(t_s);
  digitalWrite(PWM_PIN, 0);
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
    var val = ((Math.sin(step) + 1) / 2) * brightness; // scale by brightness
    analogWrite(PWM_PIN, val);
    digitalWrite(LED3, val > (0.5 * brightness) ? 1 : 0);
  }, 20);
  t_s = setTimeout(powerOff, cfg.sleep * 1000);
}

function allOn() {
  if (t) t = clearTimeout(t);
  NRF.wake();
  stopLights(true);
  active = true;
  digitalPulse(LED2, 1, 500);
  analogWrite(PWM_PIN, brightness); // solid at current brightness level
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
  if (active) startBreathing(hz);
}

function setBrightness(val) {
  // val: 0..1 from UI slider. Clamped to 0.05 minimum (avoid fully off).
  brightness = Math.max(0.05, Math.min(1.0, val));
  saveBrightness(); // persist to flash immediately
  // Live-update: breathing picks up new brightness on next tick automatically;
  // solid mode needs an explicit analogWrite to update immediately.
  if (active) {
    var currentMode = (i !== undefined && i !== null) ? "breathing" : "solid";
    if (currentMode === "solid") analogWrite(PWM_PIN, brightness);
  }
}

// ---- BLE command interface (sketch — wire up to actual GATT/UART RX) ----
// Expected commands from phone app, e.g. via NRF UART service:
//   {"cmd":"mode","value":"solid"|"breathing"|"off"}
//   {"cmd":"breathSpeed","value":0.0-1.0}   // 0 = 5s cycle, 1 = 1.67s cycle
//   {"cmd":"brightness","value":0.0-1.0}    // persisted to flash
function onBleCommand(msg) {
  try {
    var cmd = JSON.parse(msg);
    if (cmd.cmd === "mode") setMode(cmd.value);
    else if (cmd.cmd === "breathSpeed") setBreathSpeed(cmd.value);
    else if (cmd.cmd === "brightness") setBrightness(cmd.value);
  } catch (e) {
    // ignore malformed commands
  }
}
// NRF.on('data', onBleCommand); // wire up once UART/GATT service is finalised

// ---- Boot ----
loadBrightness();          // restore saved brightness from flash
startBreathing(cfg.minHz); // default: 5s breathing cycle
```

**Notes on the adaptation:**
- **Phase-accumulator math unchanged from Frankie:** `step += (hz * Math.PI * 2) / 50` at 20ms tick is Frankie's exact pattern. At 0.2 Hz → 5.0s period; at 0.6 Hz → 1.67s period.
- **Brightness scales the sine peak:** `val = ((Math.sin(step) + 1) / 2) * brightness` — at brightness 0.4 the LED peaks at 40% duty cycle, not 100%. This is the natural way to implement "max brightness for breathing."
- **Persistence via `E.setStorage()`:** Espruino writes to a small reserved flash area that survives power-off and reboot. `loadBrightness()` runs at boot before `startBreathing()` so the first breath already uses the saved level. Saves on every change from the app — no explicit "save" button needed.
- **Default brightness 0.4** rather than 1.0 — addresses the "a little too bright for the room" feedback. Can be raised to taste via the app slider and will be remembered.
- **`setBreathSpeed` restarts the interval on change** to keep the phase accumulator consistent — matches Frankie's pattern.
- **BLE wiring is a stub** — `onBleCommand` is defined but `NRF.on('data', ...)` is commented out pending the phone app.

---

## 6. Phone app

- Web Bluetooth control page (Android), served from GitHub Pages as an installable PWA — same delivery model as Frankie (`index.html` + `manifest.json` + `icon.png`).
- **Repo:** https://github.com/rowb1/orb_lamp
- **GitHub Pages URL (once enabled):** https://rowb1.github.io/orb_lamp
- UI controls:
  - **On/Off toggle**
  - **Solid vs Breathing toggle**
  - **Breathing speed slider** — 0 = 5s/cycle (default), max = 1.67s/cycle (3×)
  - **Brightness slider** — 0.05–1.0; sets peak brightness for both solid and breathing modes; persisted to Puck flash, survives power-off
- Visual theme TBC (Frankie used amber/cork glassmorphism — orb lamp theme TBC with Kate).

---

## 7. Open questions / TBC

**Resolved by bench measurement, LED datasheet, MOSFET module selection, Puck supply decision, breathing-rate research, Frankie source adaptation, and brightness design decision:** current draw (0.35 A @ 5.00 V, measured), built-in current limiting (yes, no R_L), drive method (**LR7843 direct gate drive, opto removed — §4.0; opto-module approach rejected at 5V — §4.1**), supply sizing (≥1 A USB adaptor), PWM dimmability (yes — bench-confirmed smooth breathing on the real LED), thermal limit (airflow needed >30 min), grounding (single common ground — non-isolated buck + opto removed, §3.2), Puck supply method (5V→3.3V buck converter — no CR2032 in final build), default breathing rate (5 s/cycle, 0.2 Hz, tripled to 1.67 s/cycle at slider max), firmware base (adapted from Frankie's `jar7A.js`), brightness control (0–1 scalar, default 0.4, persisted via `E.setStorage()`, sets sine peak and solid level).

Still open:

1. **Buck converter output — PARTIALLY VALIDATED.** Output measured 3.34V (no load) ✅. Dropout confirmed at 4.0V input; recovery at 4.1V — minimum safe USB supply input is **4.1V**. Remaining: measure adaptor output with LED running, confirm stays ≥4.1V.
2. **USB adaptor voltage under load** — confirm stays ≥4.1V with LED running (0.35 A).
3. **PWM carrier frequency — RESOLVED.** With direct gate drive (opto removed), Espruino's default `analogWrite(PWM_PIN, val)` carrier gives smooth, flicker-free breathing on the real LED. No explicit `freq` needed. (The old ~1–5 kHz opto-bandwidth constraint no longer applies — there is no opto.)
4. **Gate drive — RESOLVED (approach changed).** The opto module's 5V gate bias was inadequate (§4.1). Adopted direct gate drive (§4.0): D1 puts a clean ~3.2V on the LR7843 gate, fully switching the 0.35 A load. Bench-confirmed full brightness.
5. **Enclosure / form factor** — must allow airflow around LED housing per thermal note.
6. **Safety auto-off duration** — 30 min proposed; confirm against intended use and ventilation.
7. **Firmware bench validation — MOSTLY DONE.** Verified end-to-end on the real hardware (direct-drive LR7843 + buck-powered Puck): full-brightness solid, smooth breathing. Still worth a deliberate pass on `E.setStorage()` brightness persistence across power cycles and the safety/standby timers.
8. **BLE command interface** — `onBleCommand` stub needs wiring to GATT/Nordic UART service once phone app (§6) is built.

---

## 8. Bill of materials (preliminary)

| Qty | Part | Notes |
|---|---|---|
| 1 | Espruino Puck.js v2.1 | Controller; powered from buck converter output, no CR2032 fitted |
| 1 | USB-A mains adaptor, 5V **≥1 A (≥5W)** | Common supply for LED and Puck buck converter |
| 1 | 5V Circular LED Module, 47mm 24-LED (batch 3011-1) | 0.35 A @ 5.00 V measured, integrated resistors, USB-A leads |
| 1 | LR7843 MOSFET module, **modified** | PC817 opto **removed**; D1 drives the gate directly via the board's onboard 100Ω (→ gate) with the onboard 4.7kΩ pulldown. Board reused as FET mount + screw terminals. See §4.0. |
| 1 | 5V→3.3V buck converter module | Solder-bridge selectable output; confirm 3.3V ± 0.1V under load before connecting Puck |
| 2 | Decoupling caps: 100 µF electrolytic + 100 nF ceramic | Fitted at Puck 3V/GND pins to suppress buck ripple |
| — | Wiring | Single common ground (USB GND = buck OUT− = Puck GND = MOSFET source). **LED: red → module `+`, black → module `LOAD`** (series, low-side). D1 → former opto emitter pad → onboard 100Ω → gate. See §4.0 wiring block. |

*Gate resistor (100Ω) and pulldown (4.7kΩ) are the module's existing onboard parts, reused after removing the opto — no discrete passives added.*
*No external LED current-limiting resistor required — handled on LED module.*
