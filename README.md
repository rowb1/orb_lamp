# Orb Lamp

Kate's orb lamp — Puck.js v2.1 controlled LED lamp with phone-based Bluetooth control.
Inspired by [Frankie's Magic Lamp](https://github.com/rowb1/frankie).

## Modes
- **Solid** — steady full brightness
- **Breathing** — sinusoidal pulse, default 5s/cycle (relaxed human breathing rate), slider up to 3× speed

## Hardware
- Espruino Puck.js v2.1
- 5V circular 47mm 24-LED SMD 2835 module (batch 3011-1), measured 0.35A @ 5V
- LR7843 opto-isolated MOSFET module (PC817 opto, active-HIGH PWM on D1)
- 5V→3.3V buck converter (powers Puck from USB supply, no CR2032)

## Files
- `kates_lamp.js` — Puck.js firmware (upload via Espruino Web IDE)
- `kates_lamp_spec.md` — Full design specification
