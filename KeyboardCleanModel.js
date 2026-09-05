// Pure helpers for Keyboard Clean. Qt-free so node can unit-test them.

var DEVICE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/

// Hyprland lists ACPI buttons, lid switches, the fcitx virtual keyboard, and
// similar non-keyboards as keyboards. None of those are being wiped, and some
// (power, sleep, privacy kill-switch) must keep working during a clean.
var NEVER_LOCK_RE = /^(hl-virtual-keyboard|power-button|sleep-button|lid-switch|video-bus|dell-privacy-driver|intel-hid-events|intel-hid-5-button-array)/

var POINTER_LISTS = ["mice", "touch", "tablets"]

function isSafeDeviceName(name) {
  return DEVICE_NAME_RE.test(String(name || ""))
}

function isNeverLockKeyboard(name) {
  return NEVER_LOCK_RE.test(String(name || ""))
}

function pointerNameSet(devices) {
  var blocked = {}
  if (!devices || typeof devices !== "object") return blocked

  for (var i = 0; i < POINTER_LISTS.length; i++) {
    var list = devices[POINTER_LISTS[i]]
    if (!Array.isArray(list)) continue
    for (var j = 0; j < list.length; j++) {
      var name = String(list[j] && list[j].name || "")
      if (isSafeDeviceName(name)) blocked[name] = true
    }
  }

  return blocked
}

function parseDevicesJson(text) {
  try {
    var data = JSON.parse(String(text || ""))
    if (data && typeof data === "object" && !Array.isArray(data)) return data
  } catch (error) {
  }
  return null
}

function lockableKeyboardNames(devices) {
  if (!devices || typeof devices !== "object") return []

  var keyboards = devices.keyboards
  if (!Array.isArray(keyboards)) return []

  var blocked = pointerNameSet(devices)
  var seen = {}
  var names = []

  for (var i = 0; i < keyboards.length; i++) {
    var name = String(keyboards[i] && keyboards[i].name || "")
    if (!isSafeDeviceName(name)) continue
    if (isNeverLockKeyboard(name)) continue
    if (blocked[name]) continue
    if (seen[name]) continue
    seen[name] = true
    names.push(name)
  }

  return names
}

function newlyLockableNames(devices, alreadyLocked) {
  var locked = {}
  if (Array.isArray(alreadyLocked)) {
    for (var i = 0; i < alreadyLocked.length; i++) locked[String(alreadyLocked[i])] = true
  }

  var names = lockableKeyboardNames(devices)
  var extra = []
  for (var j = 0; j < names.length; j++) {
    if (!locked[names[j]]) extra.push(names[j])
  }
  return extra
}

function luaDeviceEnabled(name, enabled) {
  if (!isSafeDeviceName(name)) return ""
  return 'hl.device({ name = "' + name + '", enabled = ' + (enabled ? "true" : "false") + " })"
}

function formatElapsed(ms) {
  var totalSec = Math.floor(Number(ms) / 1000)
  if (!isFinite(totalSec) || totalSec < 0) totalSec = 0
  var minutes = Math.floor(totalSec / 60)
  var seconds = totalSec % 60
  return minutes + ":" + (seconds < 10 ? "0" : "") + seconds
}

function clampTimeoutSeconds(value, fallback, min, max) {
  var timeout = Number(value)
  if (!isFinite(timeout)) timeout = Number(fallback)
  if (!isFinite(timeout)) timeout = 2700
  var lo = isFinite(Number(min)) ? Number(min) : 60
  var hi = isFinite(Number(max)) ? Number(max) : 3600
  if (timeout < lo) return lo
  if (timeout > hi) return hi
  return Math.floor(timeout)
}

function buildState(fields) {
  var source = fields && typeof fields === "object" ? fields : {}
  var devices = []
  if (Array.isArray(source.devices)) {
    for (var i = 0; i < source.devices.length; i++) {
      var name = String(source.devices[i] || "")
      if (isSafeDeviceName(name) && devices.indexOf(name) === -1) devices.push(name)
    }
  }

  return {
    version: 1,
    locked: source.locked === true,
    generation: Math.max(0, Math.floor(Number(source.generation) || 0)),
    pid: Math.max(0, Math.floor(Number(source.pid) || 0)),
    startedAt: String(source.startedAt || ""),
    devices: devices
  }
}

function parseState(text) {
  try {
    var data = JSON.parse(String(text || ""))
    if (!data || typeof data !== "object" || Array.isArray(data)) return null
    if (data.version !== 1) return null
    return buildState(data)
  } catch (error) {
    return null
  }
}

function tooltipFor(locked, elapsedMs) {
  if (!locked) return "Lock Keyboard to Clean"
  return "Unlock Keyboard · locked " + formatElapsed(elapsedMs)
}

if (typeof module !== "undefined") {
  module.exports = {
    DEVICE_NAME_RE: DEVICE_NAME_RE,
    NEVER_LOCK_RE: NEVER_LOCK_RE,
    buildState: buildState,
    clampTimeoutSeconds: clampTimeoutSeconds,
    formatElapsed: formatElapsed,
    isNeverLockKeyboard: isNeverLockKeyboard,
    isSafeDeviceName: isSafeDeviceName,
    lockableKeyboardNames: lockableKeyboardNames,
    luaDeviceEnabled: luaDeviceEnabled,
    newlyLockableNames: newlyLockableNames,
    parseDevicesJson: parseDevicesJson,
    parseState: parseState,
    pointerNameSet: pointerNameSet,
    tooltipFor: tooltipFor
  }
}
