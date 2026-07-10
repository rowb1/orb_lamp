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
