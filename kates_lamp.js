// =============================================================
// Orb Lamp - Puck.js v2.1 firmware (Espruino)
// Adapted from Frankie's jar7A.js. Drives an LR7843 opto-isolated
// MOSFET module (active-HIGH PWM on D1) instead of the Puck's
// onboard FET. Flash mode removed; breathing range narrowed to
// match a relaxed human breathing rate. Brightness persisted via
// the Storage module. Mains-powered: no auto-sleep by default;
// optional 1-hour sleep timer enabled from app or button.
//
// v0.10.0: commands now arrive over a dedicated custom BLE
// characteristic (not the Nordic UART), so the JS console can
// stay on BLE permanently. This ends the console-detach problems
// and means the Web IDE can always connect to reprogram.
//
// v0.10.3: FIX - command characteristic maxLen was 20 bytes, but
// the app sends each command as ONE writeValue() of the whole
// string. Commands longer than 20 bytes (mode/brightness/
// breathSpeed/sleep) were rejected or truncated by the BLE stack,
// so onWrite never received a complete newline-terminated line and
// they were silently dropped. Only {"cmd":"test"} (15 bytes) fit.
// maxLen raised to 100 so a full command lands in a single write.
// The newline buffering is kept (harmless, and it still correctly
// reassembles a long-write that the stack splits internally).
//
// v0.10.4: slowest breathing rate widened from 5s to 20s per cycle
// (minHz 0.2 -> 0.05). Fastest unchanged at ~1.67s (maxHz 0.6).
// The boot/default rate is the slow end, so the lamp now boots at
// the 20s cycle.
// =============================================================

var FW_VERSION = "v0.10.4"; // bump on every firmware change

var PWM_PIN = D1; // -> LR7843 module PWM input (active-HIGH)

var i, t, t_s, t_sleep, step = 0, active = true;

// Configurable Parameters
var cfg = {
  minHz:   0.05,     // 20.0s/cycle - slowest, and the boot/default breathing rate
  maxHz:   0.6,      // 1.67s/cycle - slider maximum (fastest)
  sleepDelay: 60 * 60 // 1 hour in seconds - sleep timer if enabled
};

// Brightness: 0..1, persisted to flash. Default 0.4.
var brightness = 0.4;

// Sleep timer: off by default (mains-powered - no need to save battery)
var sleepEnabled = false;

// Track current breathing hz so sleep-timer restart can resume correctly
var currentHz = 0.05; // matches cfg.minHz (20s/cycle) until the app changes it

// Track the current lamp mode explicitly ("breathing" | "solid") so that a
// breath-speed change doesn't force breathing while the lamp is in solid
// mode. Only meaningful while active; ignored when the lamp is off.
var currentMode = "breathing";

// ---- Persistence ----
// Espruino has no E.getStorage/E.setStorage. Flash persistence is the
// Storage module: require("Storage").readJSON/writeJSON (or read/write).
// readJSON returns undefined if the key is missing or unparseable, so no
// try/catch is needed for a first boot with empty flash.
var store = require("Storage");

function loadSettings() {
  var b = store.readJSON("orb.bright", true); // true = tolerate missing/bad
  if (typeof b === "number" && !isNaN(b)) {
    brightness = Math.max(0.05, Math.min(1.0, b));
  }
  var s = store.readJSON("orb.sleep", true);
  if (typeof s === "boolean") sleepEnabled = s;
}

function saveBrightness() {
  store.writeJSON("orb.bright", brightness);
}

function saveSleepEnabled() {
  store.writeJSON("orb.sleep", sleepEnabled);
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

// ---- Button ----
// Short press -> toggle lamp on/off (restoring the last mode).
// On Puck.js, BTN reads HIGH while held: press = rising, release = falling.
// We act on the rising edge (press) for immediate response. No long-press
// handling is needed any more: the console stays on BLE permanently in this
// design, so the Web IDE can always connect to reprogram - no recovery
// gesture required.
setWatch(function(e) {
  resetSleepTimer();        // any button interaction resets sleep countdown
  if (active) powerOff();
  else if (currentMode === "solid") allOn();
  else startBreathing(currentHz);
}, BTN, {edge:"rising", repeat:true, debounce:50});

// ---- App-facing setters ----
function setMode(mode) {
  resetSleepTimer();
  if (mode === "off") {
    powerOff();
  } else if (mode === "solid") {
    currentMode = "solid";
    allOn();
  } else if (mode === "breathing") {
    currentMode = "breathing";
    startBreathing(currentHz);
  }
}

function setBreathSpeed(normalized) {
  var n = Math.max(0, Math.min(1, normalized));
  var hz = cfg.minHz + n * (cfg.maxHz - cfg.minHz);
  currentHz = hz;
  resetSleepTimer();
  // Only apply immediately if we're actually breathing. In solid mode we
  // store the new speed for later but must NOT start breathing (that was
  // the cause of the lamp flashing when solid was selected).
  if (active && currentMode === "breathing") startBreathing(hz);
}

function setBrightness(val) {
  brightness = Math.max(0.05, Math.min(1.0, val));
  saveBrightness();
  resetSleepTimer();
  if (active && currentMode === "solid") {
    // Solid mode: apply new brightness immediately. (Breathing mode picks
    // it up automatically on the next interval tick.)
    analogWrite(PWM_PIN, brightness);
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
// A dedicated writable characteristic receives commands. Unlike the Nordic
// UART, a custom characteristic is NOT tied to the JS console/REPL, so the
// console can stay on BLE permanently. That means:
//   * commands always reach onWrite regardless of console state, and
//   * the Web IDE can always connect to reprogram (no console detaching,
//     no long-press recovery, no battery-pull dance).
//
// Service  UUID: 6e40aa01-b5a3-f393-e0a9-e50e24dcca9e
// Command  UUID: 6e40aa02-b5a3-f393-e0a9-e50e24dcca9e  (write, phone -> Puck)
//
// Commands are newline-terminated JSON. The app sends each command as ONE
// writeValue() of the whole string, so the characteristic maxLen MUST be
// large enough to hold the longest command (see v0.10.3 note). onWrite
// delivers an ArrayBuffer; we still accumulate on newline so a stack-split
// long-write reassembles correctly.
//   {"cmd":"mode",       "value":"solid"|"breathing"|"off"}
//   {"cmd":"breathSpeed","value":0.0-1.0}
//   {"cmd":"brightness", "value":0.0-1.0}
//   {"cmd":"sleep",      "value":true|false}
//   {"cmd":"test"}   // flash red LED 0.5s (comms self-test)
var CMD_SERVICE = "6e40aa01-b5a3-f393-e0a9-e50e24dcca9e";
var CMD_CHAR    = "6e40aa02-b5a3-f393-e0a9-e50e24dcca9e";

var bleBuffer = "";
function handleCommandData(data) {
  digitalPulse(LED3, 1, 30); // blue blink = command data reached handler
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
      else if (cmd.cmd === "test")        digitalPulse(LED1, 1, 500); // comms self-test
    } catch (e) {
      // ignore malformed or incomplete fragments
    }
  }
  if (bleBuffer.length > 200) bleBuffer = ""; // guard against runaway buffer
}

// Define the custom service. IMPORTANT: this MUST run inside onInit(),
// otherwise the service is lost after save() / on the next boot.
function setupServices() {
  var svc = {};
  svc[CMD_SERVICE] = {};
  svc[CMD_SERVICE][CMD_CHAR] = {
    // maxLen must exceed the longest command (~36 bytes incl. newline). At 20
    // bytes the BLE stack rejected/truncated every command except the short
    // {"cmd":"test"} - see the v0.10.3 note at the top of this file. 100 gives
    // comfortable headroom whether or not the phone negotiates a larger MTU.
    maxLen: 100,
    writable: true,
    onWrite: function(evt) {
      // evt.data is an ArrayBuffer of bytes written by the phone.
      handleCommandData(E.toString(evt.data));
    }
  };
  // uart:true keeps the REPL available so the Web IDE can always connect.
  NRF.setServices(svc, { uart: true });
  // Keep the advertised name so the app's "Puck" name filter still matches.
  NRF.setAdvertising({}, { name: "Puck.js " + NRF.getAddress().substr(-5).replace(":", "") });
}

// ---- Boot ----
function onInit() {
  print("Orb Lamp firmware " + FW_VERSION);
  loadSettings();            // restore brightness + sleep preference from flash
  setupServices();           // register the custom command characteristic
  startBreathing(cfg.minHz); // default: on, 20s breathing cycle (slowest)
}

// onInit() runs automatically at power-on when the code is saved to flash.
// Call it directly too so behaviour is identical when uploading without a
// save (RAM-only upload), so you can test immediately after "Send".
onInit();
