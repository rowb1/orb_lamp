# Orb Lamp

Kate's orb lamp — Puck.js v2.1 controlled LED lamp with phone-based Bluetooth control.
Inspired by [Frankie's Magic Lamp](https://github.com/rowb1/frankie).

## Modes
- **Breathing** — sinusoidal pulse, default 5s/cycle (relaxed human breathing rate), slider up to 3× speed (1.67s/cycle)
- **Solid** — steady at current brightness level

## Hardware
- Espruino Puck.js v2.1
- 5V circular 47mm 24-LED SMD 2835 module (batch 3011-1), measured 0.35A @ 5.00V
- LR7843 opto-isolated MOSFET module (PC817 opto, active-HIGH PWM on D1)
- 5V→3.3V buck converter (powers Puck from USB supply, no CR2032)
- USB-A mains adaptor, 5V ≥1A

## Puck.js Device Identity
| Property | Value |
|---|---|
| Name | `Puck.js a912` |
| BLE MAC address | `EF:9A:B3:5B:A9:12` (random) |
| Firmware | Espruino 2v29 |
| BLE service | Nordic UART Service `6e400001-b5a3-f393-e0a9-e50e24dcca9e` |
| Write characteristic (phone→Puck) | `6e400002-b5a3-f393-e0a9-e50e24dcca9e` |
| Notify characteristic (Puck→phone) | `6e400003-b5a3-f393-e0a9-e50e24dcca9e` |
| Manufacturer data key | `0x0590` |

## App
- **URL:** https://rowb1.github.io/orb_lamp
- Web Bluetooth PWA (Chrome on Android)
- Controls: On/Off, Breathing/Solid mode, Brightness slider, Breath speed slider, Sleep timer toggle

## Files
- `kates_lamp.js` — Puck.js firmware (upload via Espruino Web IDE)
- `kates_lamp_spec.md` — Full design specification
- `index.html` — Phone app (served via GitHub Pages)
- `manifest.json` — PWA manifest

## BLE Connection Notes
- The Puck advertises as `Puck.js a912` — the app finds it by name prefix via the Chrome Web Bluetooth picker
- **Only one BLE connection at a time.** If U22 (or any other device) is connected, the Puck stops advertising and the phone cannot find it
- To disconnect from U22: `bluetoothctl` → `disconnect EF:9A:B3:5B:A9:12` → `exit`
- Do **not** pair via Android's system Bluetooth settings — connect only through the app in Chrome
- Web Bluetooth requires Chrome on Android; Firefox and most other Android browsers are not supported
- If the phone picker shows no devices, check nothing else is connected to the Puck first

## Firmware behaviour
- **Boot:** starts breathing at 0.2Hz (5s/cycle) using last saved brightness (default 0.4)
- **Button:** toggles lamp on/off; green flash = on, red flash = off
- **Sleep timer:** disabled by default (mains-powered); enable via app for 1-hour auto-off after last interaction
- **Brightness:** persisted to Puck flash via `E.setStorage()` — survives power-off
- **Safety auto-off:** 30 minutes (thermal limit of LED module)
- **PWM pin:** D1 → LR7843 module PWM input (active-HIGH)

## Development notes
- Puck only advertises when not connected — disconnect all other clients before trying to connect the phone
- `bluetoothctl` on U22 may hold a background connection even after the Web IDE disconnects; always verify with `bluetoothctl` → `info EF:9A:B3:5B:A9:12` and disconnect explicitly if `Connected: yes`
- BLE filter in app uses `namePrefix: 'Puck'` + `optionalServices: [UART_SERVICE]` — the optional services declaration is required by Chrome's security model to access the UART characteristics after connecting
