# Orb Lamp — BLE Debugging Summary

## The Problem

The phone app (`index.html`, served from `https://rowb1.github.io/orb_lamp`) connects to the Puck.js via Web Bluetooth in Chrome on Android, but every attempt to send a command results in:

> **"Send failed — try reconnecting"**

This error is thrown in the `send()` function's `.catch()` handler when `bleTxChar.writeValue(...)` rejects.

The lamp is otherwise working correctly:
- Firmware boots, blue LED breathes slowly — confirmed
- Button toggles on/off with green/red flash — confirmed
- U22 can connect via `bluetoothctl` and Web IDE — confirmed
- Phone can find and select the Puck in the Chrome Web Bluetooth picker — confirmed
- Phone shows "Connected" status briefly before send fails — confirmed

---

## Hardware & Software Environment

| Item | Detail |
|---|---|
| Puck.js | v2.1, firmware Espruino 2v29 |
| Puck BLE name | `Puck.js a912` |
| Puck MAC | `EF:9A:B3:5B:A9:12` (random) |
| Phone | Android, Chrome browser |
| App hosting | GitHub Pages (HTTPS) — `https://rowb1.github.io/orb_lamp` |
| U22 OS | Ubuntu 22, BlueZ, `bluetoothctl` |

---

## Nordic UART Service UUIDs

These are confirmed correct from Espruino's own documentation:

| Role | UUID |
|---|---|
| Service | `6e400001-b5a3-f393-e0a9-e50e24dcca9e` |
| TX — **write to this** (phone→Puck) | `6e400002-b5a3-f393-e0a9-e50e24dcca9e` |
| RX — notify (Puck→phone) | `6e400003-b5a3-f393-e0a9-e50e24dcca9e` |

The Espruino naming is from the Puck's perspective — "TX" means the Puck transmits; the phone writes to TX to send data to the Puck. This was confused and swapped multiple times during debugging.

---

## What Has Been Tried

### 1. Wrong characteristic UUID (TX vs RX swapped)
- **Tried:** Writing to `6e400003` (RX/notify — wrong direction)
- **Result:** Send failed
- **Fix applied:** Corrected to write to `6e400002` (TX)
- **Outcome:** Still failed

### 2. `writeValue` vs `writeValueWithoutResponse`
- **Tried:** Changed from `writeValue` to `writeValueWithoutResponse`
- **Rationale:** Some Android/Chrome combos reject acknowledged writes on UART characteristics
- **Result:** Still failed
- **Fix applied:** Reverted to `writeValue` (matches Espruino's own example code)
- **Outcome:** Still failed

### 3. BLE device filter (name prefix vs service UUID)
- **Tried:** `filters: [{ services: [UART_SERVICE] }]` — filter by service UUID
- **Result:** Puck not found in picker (Espruino puts service UUID in scan response packet, not the main advertising packet — passive Android scan misses it)
- **Fix applied:** Reverted to `filters: [{ namePrefix: 'Puck' }]` with `optionalServices: [UART_SERVICE]`
- **Outcome:** Puck now appears in picker correctly

### 4. U22 holding the BLE connection
- **Discovered:** `bluetoothctl` showed `Connected: yes` to the Puck even after Web IDE was closed
- **Symptom:** Phone picker showed no devices
- **Fix:** `bluetoothctl` → `disconnect EF:9A:B3:5B:A9:12` → `exit`
- **Outcome:** Phone can now find and connect to Puck — but send still fails

### 5. JSON fragmentation (BLE MTU = 20 bytes)
- **Discovered:** BLE has a 20-byte maximum per packet. JSON commands like `{"cmd":"mode","value":"breathing"}` (33 bytes) arrive at the Puck in multiple fragments
- **Original firmware:** Called `JSON.parse(msg)` directly in `NRF.on('data', ...)` — fails on every fragment that isn't a complete JSON string
- **Fix applied:** Added a receive buffer (`bleBuffer`) that accumulates incoming bytes and only calls `JSON.parse` when a newline (`\n`) delimiter is found. The app already appends `\n` to every message.
- **Outcome:** Still failed — the write itself is still rejected before data even reaches the Puck

### 6. syncAll() firing before GATT is ready
- **Theory:** Sending 4 commands immediately on connection callback races against Android GATT stack stabilisation
- **Fix applied:** Added `setTimeout(syncAll, 500)` — 500ms delay after `onConnected()` before sending initial state
- **Outcome:** Still failed

---

## Current State of the Code

### `index.html` (relevant BLE section)
```javascript
var UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
var UART_TX      = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // phone → Puck (write)
var UART_RX      = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Puck → phone (notify)

var bleDevice = null, bleTxChar = null;

function send(obj) {
  if (!bleTxChar) return;
  var msg = JSON.stringify(obj) + '\n';
  bleTxChar.writeValue(new TextEncoder().encode(msg)).catch(function(e) {
    setStatus('Send failed — try reconnecting');
    console.error(e);
  });
}

navigator.bluetooth.requestDevice({
  filters: [{ namePrefix: 'Puck' }, { namePrefix: 'puck' }],
  optionalServices: [UART_SERVICE]
})
.then(function(d) { ... return d.gatt.connect(); })
.then(function(s)  { return s.getPrimaryService(UART_SERVICE); })
.then(function(sv) { return sv.getCharacteristic(UART_TX); })
.then(function(c)  { bleTxChar = c; onConnected(); })

function onConnected() {
  ...
  setTimeout(syncAll, 500); // 500ms delay before sending initial state
}
```

### `kates_lamp.js` (relevant BLE section)
```javascript
var bleBuffer = "";
NRF.on('data', function(data) {
  bleBuffer += data;
  var nl;
  while ((nl = bleBuffer.indexOf('\n')) !== -1) {
    var msg = bleBuffer.substr(0, nl).trim();
    bleBuffer = bleBuffer.substr(nl + 1);
    if (msg.length === 0) continue;
    try {
      var cmd = JSON.parse(msg);
      if      (cmd.cmd === "mode")        setMode(cmd.value);
      else if (cmd.cmd === "breathSpeed") setBreathSpeed(cmd.value);
      else if (cmd.cmd === "brightness")  setBrightness(cmd.value);
      else if (cmd.cmd === "sleep")       setSleep(cmd.value);
    } catch (e) {
      // ignore malformed or incomplete fragments
    }
  }
  if (bleBuffer.length > 200) bleBuffer = "";
});
```

---

## Unresolved Questions

1. **Is `writeValue` actually being called on the correct characteristic?** The GATT discovery chain looks correct but has not been independently verified (e.g. with `console.log` in each `.then()` step or with nRF Connect app inspection).

2. **Is the GATT connection actually established before the write?** The `gattserverdisconnected` event may be firing immediately after connect on some Android versions, invalidating `bleTxChar` before `send()` is called.

3. **Does the Puck's REPL intercept data before `NRF.on('data', ...)`?** When the Web IDE connected previously, it sent a `\x03` (Ctrl+C) to interrupt the REPL. If the REPL is consuming incoming data before `NRF.on('data', ...)` sees it, commands will never reach `onBleCommand`. Consider using `Bluetooth.setConsole(false)` or moving console away from BLE in the firmware.

4. **Has `NRF.on('data', ...)` been confirmed to fire?** No debugging output (e.g. `digitalPulse(LED3,1,200)`) has been added to the data handler to confirm it's being called at all.

5. **Is the `writeValue` promise rejecting with a specific error?** The error is caught but only `console.error(e)` is called. The actual error message from Chrome's Web Bluetooth implementation has not been inspected. This would immediately clarify whether the issue is a GATT-level error, a security error, a disconnection, or something else.

---

## Suggested Next Debugging Steps

1. **Add visible feedback to the firmware data handler** — a `digitalPulse(LED2,1,100)` at the top of `NRF.on('data', ...)` will confirm whether any data is arriving at the Puck at all, regardless of parsing.

2. **Log the actual error from `writeValue`** — display `e.message` or `e.toString()` in the status line on the phone instead of the generic "send failed" message.

3. **Test with Espruino's own `puck.js` library** — `<script src="https://www.puck-js.com/puck.js"></script>` provides a proven `Puck.write()` function. If that works, the connection approach is fine and the issue is in the custom BLE code. If it also fails, the issue is environmental (Android version, Chrome version, phone BLE stack).

4. **Test with nRF Connect app** — connect to the Puck from nRF Connect, navigate to the Nordic UART service, and manually write a short string to `6e400002`. If that also fails, the characteristic permissions on the Puck side are the issue.

5. **Check `Bluetooth.setConsole(false)` in firmware** — ensures the REPL doesn't compete with `NRF.on('data', ...)` for incoming BLE data.

---

## Repository

https://github.com/rowb1/orb_lamp

Current firmware: `kates_lamp.js` (commit `45e4417`)
Current app: `index.html` (commit `45e4417`)
