// =============================================================
// Orb Lamp — Puck.js v2.1 firmware (Espruino)
// Adapted from Frankie's jar7A.js. Drives an LR7843 opto-isolated
// MOSFET module (active-HIGH PWM on D1) instead of the Puck's
// onboard FET. Flash mode removed; breathing range narrowed to
// match a relaxed human breathing rate. Brightness persisted via
// E.setStorage(). Mains-powered: no auto-sleep by default;
// optional 1-hour sleep timer enabled from app or button.
// =============================================================

var PWM_PIN = D1; // → LR7843 module PWM input (active-HIGH)

var i, t, t_s, t_sleep, step = 0, active = true;

// Configurable Parameters
var cfg = {
  minHz:   0.2,      // 5.0s/cycle — default breathing rate
  maxHz:   0.6,      // 1.67s/cycle — 3x default, slider maximum
  sleepDelay: 60 * 60 // 1 hour in seconds — sleep timer if enabled
};

// Brightness: 0..1, persisted to flash. Default 0.4.
var brightness = 0.4;

// Sleep timer: off by default (mains-powered — no need to save battery)
var sleepEnabled = false;

// Track current breathing hz so sleep-timer restart can resume correctly
var currentHz = 0.2;

// ---- Persistence ----
function loadSettings() {
  var b = E.getStorage("brightness");
  if (b !== undefined) {
    var val = parseFloat(b);
    if (!isNaN(val)) brightness = Math.max(0.05, Math.min(1.0, val));
  }
  var s = E.getStorage("sleepEnabled");
  if (s !== undefined) sleepEnabled = (s === "1");
}

function saveBrightness() {
  E.setStorage("brightness", brightness.toString());
}

function saveSleepEnabled() {
  E.setStorage("sleepEnabled", sleepEnabled ? "1" : "0");
}

// ---- Sleep timer ----
// Resets whenever the lamp is interacted with (button or BLE command).
// Only active when sleepEnabled === true.
function resetSleepTimer() {
  if (t_sleep) t_sleep = clearTimeout(t_sleep);
  if (sleepEnabled && active) {
    t_sleep = setTimeout(function() {
      powerOff();
    }, cfg.sleepDelay * 1000);
  }
}

// ---- Light control ----
function stopLights(silent) {
  if (i) i = clearInterval(i);
  if (t_s) t_s = clearTimeout(t_s);
  if (t_sleep) t_sleep = clearTimeout(t_sleep);
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
  currentHz = hz;
  digitalPulse(LED2, 1, 500); // green flash = waking
  i = setInterval(function() {
    step += (hz * Math.PI * 2) / 50; // 50 ticks/sec at 20ms interval
    var val = ((Math.sin(step) + 1) / 2) * brightness;
    analogWrite(PWM_PIN, val);
    digitalWrite(LED3, val > (0.5 * brightness) ? 1 : 0);
  }, 20);
  resetSleepTimer();
}

function allOn() {
  if (t) t = clearTimeout(t);
  NRF.wake();
  stopLights(true);
  active = true;
  digitalPulse(LED2, 1, 500);
  analogWrite(PWM_PIN, brightness);
  digitalWrite(LED3, 1);
  resetSleepTimer();
}

function powerOff() {
  stopLights();
  active = false;
  digitalPulse(LED1, 1, 500); // red flash = standby
  // Mains-powered: no NRF.sleep() by default. BLE stays alive so
  // the app can reconnect and turn the lamp back on without
  // physically pressing the button.
}

// ---- Button: toggle on/off ----
setWatch(function() {
  resetSleepTimer(); // any button interaction resets sleep countdown
  if (active) {
    powerOff();
  } else {
    startBreathing(currentHz);
  }
}, BTN, {edge:"rising", repeat:true, debounce:50});

// ---- App-facing setters ----
function setMode(mode) {
  resetSleepTimer();
  if (mode === "off") powerOff();
  else if (mode === "solid") allOn();
  else if (mode === "breathing") startBreathing(currentHz);
}

function setBreathSpeed(normalized) {
  var n = Math.max(0, Math.min(1, normalized));
  var hz = cfg.minHz + n * (cfg.maxHz - cfg.minHz);
  currentHz = hz;
  resetSleepTimer();
  if (active) startBreathing(hz);
}

function setBrightness(val) {
  brightness = Math.max(0.05, Math.min(1.0, val));
  saveBrightness();
  resetSleepTimer();
  if (active) {
    // Breathing picks up on next tick; solid needs explicit update
    if (!i) analogWrite(PWM_PIN, brightness);
  }
}

function setSleep(enabled) {
  // enabled: boolean from app toggle
  sleepEnabled = !!enabled;
  saveSleepEnabled();
  if (sleepEnabled) {
    resetSleepTimer(); // start counting immediately if enabled
  } else {
    if (t_sleep) t_sleep = clearTimeout(t_sleep); // cancel if disabled
  }
}

// ---- BLE command interface ----
// Commands from phone app via Nordic UART (NRF UART service):
//   {"cmd":"mode",       "value":"solid"|"breathing"|"off"}
//   {"cmd":"breathSpeed","value":0.0-1.0}  // 0=5s/cycle, 1=1.67s/cycle
//   {"cmd":"brightness", "value":0.0-1.0}  // persisted to flash
//   {"cmd":"sleep",      "value":true|false} // enable/disable 1hr sleep timer
//
// BLE MTU is 20 bytes per packet, so longer JSON arrives in fragments.
// Buffer incoming data and parse only when a newline delimiter is received.
var bleBuffer = "";
NRF.on('data', function(data) {
  bleBuffer += data;
  // Process all complete newline-terminated messages in the buffer
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
  // Safety: prevent buffer growing unbounded if no newline arrives
  if (bleBuffer.length > 200) bleBuffer = "";
});

// ---- Boot ----
loadSettings();            // restore brightness + sleep preference from flash
startBreathing(cfg.minHz); // default: on, 5s breathing cycle
