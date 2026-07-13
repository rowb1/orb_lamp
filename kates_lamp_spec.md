# Orb Lamp — Specification (v1.0 FINAL)

A Puck.js-controlled mains-powered LED lamp with phone control, offering **solid** and **breathing** modes. Inspired by [Frankie's Magic Lamp](https://github.com/rowb1/frankie), simplified (no flash mode) and re-architected for a larger, USB-powered LED.

**Repository:** https://github.com/rowb1/orb_lamp

> **Status: FINAL — built, flashed, and in daily use (2026-07-12).** Firmware `kates_lamp.js` **v0.10.5**, app `index.html` **v0.11.4** (both display their version at runtime). The full path — phone app → Web Bluetooth → custom BLE characteristic → firmware → LR7843 → LED — is confirmed end-to-end on the real hardware. **Drive circuit:** direct gate drive on the bare LR7843 with the PC817 opto removed (§4.0); the opto module was bench-rejected at 5V (§4.1). **Puck supply:** 5V → 3.3V buck converter (§3.1), no CR2032. **LED:** 0.35 A @ 5.00 V measured (§2.1), integrated current-limiting resistors. **Breathing:** 1.67 s → 60 s per cycle (~20 s default), with an adjustable minimum-brightness floor so it need not dip fully off. **Persistence:** peak brightness and breath floor saved to flash via the `Storage` module. See `ble_debug.md` for the full debugging history and firmware/app changelogs.

---

## 1. Overview

| Item | Detail |
|---|---|
| Controller | Espruino Puck.js v2.1 (nRF52832, BLE) |
| Power source | Mains → USB-A adaptor, 5V DC |
| Puck supply | 5V → 3.3V buck converter (no CR2032 in final build) |
| Control | Phone web app over BLE (Web Bluetooth, Android) |
| Modes | Solid (steady on) and Breathing (sinusoidal PWM pulse) |
| Removed vs Frankie | Flash mode; Frankie's deep-sleep power management (mains-powered — BLE stays alive so the app can always reach the lamp) |
| Retained from Frankie | Breathing via hardware PWM, button master toggle. Frankie's forced safety auto-off becomes an opt-in **1-hour sleep timer** (off by default) |

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
| **Solid** | `analogWrite(PWM_PIN, brightness)` — LED steady at the current (peak) brightness level. |
| **Breathing** | Sinusoidal PWM between the **minimum-brightness floor** and the **peak** brightness: `val = floor + ((sin+1)/2)*(peak - floor)`. Default ~20 s per cycle; range 1.67–60 s. |
| **Off / standby** | GPIO low; pulldown ensures LED off. Mains-powered, so **no `NRF.sleep()`** — BLE stays alive so the app or button can turn the lamp back on. |

**Brightness control:** a 0–1 scalar setting the *peak* LED output. Default 0.4 (noticeably on but not room-filling). Persisted to flash via the `Storage` module (`require("Storage").writeJSON("orb.bright", …)`) — survives power-off and reboot. In breathing mode it sets the sine peak; in solid mode the steady level. Minimum clamped to 0.05.

**Minimum brightness (breath floor):** a 0–1 scalar setting the dimmest point of the breath, so breathing need not dip fully off. Absolute, clamped at use-time to ≤ peak; default 0 (breathe fully off, the original behaviour). Persisted to flash (`orb.floor`).

**Button (physical master toggle):** single press wakes the lamp (green flash) / enters standby (red flash), restoring the last mode.

**Breathing rate — default and range:**

The lamp breathes from a lively ~1.67 s cycle up to a very slow 60 s cycle, defaulting to a calm, clearly-visible **~20 s** cycle. The app slider maps **linearly in cycle length** (not frequency) so it feels even across that wide range; firmware and app share the identical formula so the displayed cycle matches the lamp.

| Parameter | Cycle time | Frequency | Notes |
|---|---|---|---|
| **Slider minimum (slowest)** | 60 s/cycle | ~0.017 Hz | Barely-perceptible slow drift |
| **Boot / default** | ~20 s/cycle | 0.05 Hz | Decoupled from the slider minimum; calm but clearly moving |
| **Slider maximum (fastest)** | 1.67 s/cycle | 0.6 Hz | Livelier pulse |

**Distinct from PWM carrier frequency:** the breathing rate is the slow sinusoidal *envelope*. The PWM *carrier* (the fast switching that creates each brightness level) is Espruino's default `analogWrite` frequency — with the opto removed (§4.0) it drives the LED flicker-free with no explicit `freq` needed.

**Sleep timer:** an opt-in **1-hour** auto-off, **off by default** (mains-powered — no forced auto-off). Armed/cancelled from the app Sleep toggle or persisted in flash (`orb.sleep`); BLE stays alive after it fires so the lamp can be woken again.

### 5.1 Firmware implementation

The authoritative firmware is **`kates_lamp.js` (v0.10.5)** in the repo — flash it via the Espruino Web IDE (see the flashing-workflow notes in `ble_debug.md`). It is adapted from Frankie's `jar7A.js` (same tick-based phase-accumulator breathing, button handling, and `digitalPulse` LED feedback), with these changes:

- **External MOSFET on `D1`** (active-HIGH) instead of the Puck's onboard FET.
- **Flash mode removed;** breathing retargeted to a 1.67–60 s cycle, mapped linearly in cycle length.
- **Peak brightness + minimum-brightness floor,** both persisted to flash via the `Storage` module. (Espruino has no `E.getStorage`/`E.setStorage`; persistence uses `require("Storage").readJSON/writeJSON` with keys `orb.bright`, `orb.floor`, `orb.sleep`.)
- **Custom BLE command characteristic** (not the Nordic UART) so the JS console can stay on BLE permanently and the Web IDE can always reconnect to reflash. `NRF.setServices` runs inside `onInit()`. See `ble_debug.md` for the transport rationale and the `maxLen` fix (commands longer than one 20-byte BLE packet were being rejected/truncated).
- **Mains-powered:** no `NRF.sleep()`; an optional 1-hour sleep timer can be armed from the app or button.
- **ASCII-only source** — non-ASCII characters break the Web IDE upload.

**Command protocol** — newline-terminated JSON written to the command characteristic (service `6e40aa01-b5a3-f393-e0a9-e50e24dcca9e`, characteristic `6e40aa02-b5a3-f393-e0a9-e50e24dcca9e`):

| Command | Payload |
|---|---|
| mode | `{"cmd":"mode","value":"solid"\|"breathing"\|"off"}` |
| breathSpeed | `{"cmd":"breathSpeed","value":0.0-1.0}` — 0 = 60 s/cycle, 1 = 1.67 s/cycle (linear in cycle length) |
| brightness | `{"cmd":"brightness","value":0.0-1.0}` — peak level, persisted |
| minBright | `{"cmd":"minBright","value":0.0-1.0}` — breath floor, persisted |
| sleep | `{"cmd":"sleep","value":true\|false}` — arm/cancel the 1-hour timer |
| test | `{"cmd":"test"}` — flash red LED 0.5 s (comms self-test) |

Each breathing tick computes `val = lo + ((sin+1)/2)*(peak - lo)` where `lo = min(breathFloor, brightness)`, then `analogWrite(D1, val)`.

---

## 6. Phone app

Built and in daily use — a Web Bluetooth control page (`index.html`, v0.11.4) served from GitHub Pages as an installable PWA (`index.html` + `manifest.json` + icons).

- **Repo:** https://github.com/rowb1/orb_lamp
- **GitHub Pages URL:** https://rowb1.github.io/orb_lamp
- **Transport:** writes newline-terminated JSON to the custom command characteristic (§5.1). Writes are **serialised** — Android allows only one outstanding GATT write at a time — via a small send queue.
- **Controls:**
  - **Connect / Disconnect** with a live connection-status dot (idle / busy / connected / error).
  - **Power** — on/off (defaults ON, matching the firmware's boot state so connecting doesn't switch the lamp off).
  - **Sleep** — arm/cancel the 1-hour auto-off; the lamp stays reachable and Power wakes it.
  - **Mode** — Breathing / Solid.
  - **Brightness** — peak level (5–100%).
  - **Minimum brightness** — the breath floor (breathing only; dims out in Solid mode).
  - **Breath speed** — cycle length, 1.67–60 s (linear-in-cycle slider, ~20 s default).
- **Robustness:** connection state machine, auto-reconnect on unexpected drops (reuses the picked device, capped backoff), graceful cancel/error handling, and a scrollable layout so no control is trapped off-screen on small phones.
- **Theme:** dark navy background with an amber "orb" glow that breathes in sync with the lamp, and Cinzel display type — the orb lamp's own dark/amber take (Frankie used amber/cork glassmorphism).

---

## 7. Status of open questions

**Resolved (design complete, bench-confirmed, in daily use):** current draw (0.35 A @ 5.00 V, measured); built-in current limiting (yes, no R_L); drive method (LR7843 direct gate drive, opto removed — §4.0; opto-module approach rejected at 5V — §4.1); supply sizing (≥1 A USB adaptor); PWM dimmability (bench-confirmed smooth breathing on the real LED — Espruino's default `analogWrite` carrier is flicker-free with the opto gone, no explicit `freq` needed); gate drive (D1 puts ~3.2V on the LR7843 gate, fully switching the 0.35 A load); thermal limit (airflow needed >30 min); grounding (single common ground — non-isolated buck + opto removed, §3.2); Puck supply (5V→3.3V buck, no CR2032; output 3.34V no-load, ~4.1V minimum input); breathing rate (1.67–60 s cycle, ~20 s default); brightness + minimum-brightness floor (0–1, persisted via the `Storage` module); firmware base (adapted from `jar7A.js`); BLE transport (custom command characteristic — §5.1, built and confirmed); phone app (built, v0.11.4 — §6); firmware bench validation (verified end-to-end on real hardware; brightness/floor persistence across power cycles confirmed).

**Remaining (physical build / to-taste, non-blocking):**

1. **USB adaptor voltage under load** — one-time check that the chosen mains adaptor holds ≥4.1V at the buck input with the LED running (0.35 A). The buck itself is already validated (3.34V no-load; dropout 4.0V, recovery 4.1V).
2. **Enclosure / form factor** — must allow airflow around the LED housing per the thermal note (§2.1).
3. **Sleep-timer duration** — currently an opt-in 1-hour auto-off (off by default); revisit only if intended use suggests otherwise.

---

## 8. Bill of materials (as built)

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
