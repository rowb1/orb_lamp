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
  // Live-update whichever mode is active — no restart needed for solid;
  // breathing picks up the new brightness value on the next tick automatically.
  if (active) {
    var currentMode = (i !== undefined && i !== null) ? "breathing" : "solid";
    if (currentMode === "solid") analogWrite(PWM_PIN, brightness);
    // breathing interval reads 'brightness' directly each tick — already live
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
loadBrightness();               // restore saved brightness from flash
startBreathing(cfg.minHz);      // default: 5s breathing cycle
