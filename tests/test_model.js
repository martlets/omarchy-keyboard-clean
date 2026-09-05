const assert = require("node:assert/strict")
const model = require("../StayCleanModel.js")

const sample = {
  mice: [
    { name: "ven_06cb:00-06cb:d01a-mouse" },
    { name: "ven_06cb:00-06cb:d01a-touchpad" },
    { name: "ps/2-generic-mouse" }
  ],
  keyboards: [
    { name: "hid-sdw:0:0:01fa:4245:01-consumer-control" },
    { name: "hid-sdw:0:0:01fa:4245:01" },
    { name: "video-bus" },
    { name: "intel-hid-events" },
    { name: "intel-hid-5-button-array" },
    { name: "power-button" },
    { name: "sleep-button" },
    { name: "dell-privacy-driver" },
    { name: "dell-wmi-hotkeys" },
    { name: "at-translated-set-2-keyboard" },
    { name: "hl-virtual-keyboard-fcitx5" },
    { name: "evil; rm -rf /" },
    { name: 'quote"name' },
    { name: "duplicate" },
    { name: "duplicate" }
  ],
  tablets: [],
  touch: [{ name: "cust0000:00-3558:2003" }]
}

function testSafety() {
  assert.equal(model.isSafeDeviceName("at-translated-set-2-keyboard"), true)
  assert.equal(model.isSafeDeviceName("hid-sdw:0:0:01fa:4245:01"), true)
  assert.equal(model.isSafeDeviceName("cust0000:00-3558:2003"), true)
  assert.equal(model.isSafeDeviceName(""), false)
  assert.equal(model.isSafeDeviceName("has space"), false)
  assert.equal(model.isSafeDeviceName("foo`id`"), false)
  assert.equal(model.isSafeDeviceName("foo$(id)"), false)
  assert.equal(model.isSafeDeviceName("foo;id"), false)
  assert.equal(model.isSafeDeviceName("../etc"), false)
  assert.equal(model.isSafeDeviceName('foo"bar'), false)
  assert.equal(model.luaDeviceEnabled("bad name", false), "")
}

function testNeverLock() {
  ;[
    "hl-virtual-keyboard-fcitx5",
    "power-button",
    "sleep-button",
    "lid-switch",
    "video-bus",
    "dell-privacy-driver",
    "intel-hid-events",
    "intel-hid-5-button-array"
  ].forEach(function (name) {
    assert.equal(model.isNeverLockKeyboard(name), true, name)
  })
  assert.equal(model.isNeverLockKeyboard("at-translated-set-2-keyboard"), false)
  assert.equal(model.isNeverLockKeyboard("dell-wmi-hotkeys"), false)
}

function testLockableKeyboards() {
  const names = model.lockableKeyboardNames(sample)
  assert.deepEqual(names, [
    "hid-sdw:0:0:01fa:4245:01-consumer-control",
    "hid-sdw:0:0:01fa:4245:01",
    "dell-wmi-hotkeys",
    "at-translated-set-2-keyboard",
    "duplicate"
  ])
  assert.equal(names.indexOf("power-button"), -1)
  assert.equal(names.indexOf("hl-virtual-keyboard-fcitx5"), -1)
  assert.equal(names.indexOf("ven_06cb:00-06cb:d01a-touchpad"), -1)
  assert.equal(names.indexOf("cust0000:00-3558:2003"), -1)
}

function testLockableTouch() {
  assert.equal(model.hasUnlockPointer(sample), true)
  assert.deepEqual(model.lockableTouchNames(sample), ["cust0000:00-3558:2003"])
  assert.deepEqual(model.lockableTouchNames({ touch: sample.touch }), [])
  assert.deepEqual(model.lockableNames(sample, "touch"), ["cust0000:00-3558:2003"])
  assert.equal(model.lockableNames(sample, "keyboard").indexOf("cust0000:00-3558:2003"), -1)
  const both = model.lockableNames(sample, "both")
  assert.ok(both.indexOf("at-translated-set-2-keyboard") !== -1)
  assert.ok(both.indexOf("cust0000:00-3558:2003") !== -1)
  assert.equal(both.indexOf("ven_06cb:00-06cb:d01a-touchpad"), -1)
}

function testPointerCollision() {
  const devices = {
    mice: [{ name: "sneaky-keyboard" }],
    keyboards: [{ name: "sneaky-keyboard" }, { name: "real-keyboard" }]
  }
  assert.deepEqual(model.lockableKeyboardNames(devices), ["real-keyboard"])
}

function testLua() {
  assert.equal(
    model.luaDeviceEnabled("at-translated-set-2-keyboard", false),
    'hl.device({ name = "at-translated-set-2-keyboard", enabled = false })'
  )
  assert.equal(
    model.luaDeviceEnabled("cust0000:00-3558:2003", true),
    'hl.device({ name = "cust0000:00-3558:2003", enabled = true })'
  )
}

function testParse() {
  assert.equal(model.parseDevicesJson("{"), null)
  assert.equal(model.parseDevicesJson("[]"), null)
  assert.ok(model.parseDevicesJson(JSON.stringify(sample)))
  const extra = model.newlyLockableNames(sample, ["at-translated-set-2-keyboard"], "both")
  assert.ok(extra.indexOf("at-translated-set-2-keyboard") === -1)
  assert.ok(extra.indexOf("dell-wmi-hotkeys") !== -1)
  assert.ok(extra.indexOf("cust0000:00-3558:2003") !== -1)
}

function testElapsedAndState() {
  assert.equal(model.formatElapsed(0), "0:00")
  assert.equal(model.formatElapsed(1000), "0:01")
  assert.equal(model.formatElapsed(61000), "1:01")
  assert.equal(model.formatElapsed(-20), "0:00")
  assert.equal(model.tooltipFor(false, 0, "both"), "Stay Clean")
  assert.equal(model.tooltipFor(true, 5000, "touch"), "Cleaning Touchscreen · 0:05 · click for Unlock")
  assert.equal(model.clampTimeoutSeconds(12, 2700, 60, 3600), 60)
  assert.equal(model.clampTimeoutSeconds(9000, 2700, 60, 3600), 3600)
  assert.equal(model.clampTimeoutSeconds("nope", 2700, 60, 3600), 2700)
  assert.equal(model.normalizeMode("nope"), "both")
  assert.equal(model.modeLabel("keyboard"), "Keyboard")
  assert.equal(model.modeChoices().length, 3)
  assert.equal(model.statusLabel(false, "both", "0:00"), "Off")
  assert.equal(model.statusLabel(true, "touch", "0:05"), "On · Touchscreen · 0:05")
  const idleRows = model.menuRows(false, "both")
  assert.equal(idleRows.length, 3)
  assert.equal(idleRows[0].value, "keyboard")
  const liveRows = model.menuRows(true, "touch")
  assert.equal(liveRows[0].value, "unlock")
  assert.equal(liveRows[0].kind, "unlock")
  assert.equal(liveRows.filter(function (row) { return row.active }).length, 1)
  assert.equal(liveRows.find(function (row) { return row.value === "touch" }).active, true)

  const state = model.parseState(JSON.stringify({
    version: 1,
    locked: true,
    mode: "touch",
    generation: 3,
    pid: 9,
    devices: ["cust0000:00-3558:2003", "bad name", "cust0000:00-3558:2003"]
  }))
  assert.equal(state.locked, true)
  assert.equal(state.mode, "touch")
  assert.deepEqual(state.devices, ["cust0000:00-3558:2003"])
  assert.equal(model.parseState('{"version":2}'), null)
}

function testRejectsMiceOnlyPayload() {
  assert.deepEqual(model.lockableKeyboardNames({ mice: sample.mice }), [])
  assert.equal(model.emptyLockError("touch", { touch: sample.touch }), "need a mouse or trackpad to unlock")
  assert.equal(model.emptyLockError("keyboard", sample), "no lockable keyboards found")
}

testSafety()
testNeverLock()
testLockableKeyboards()
testLockableTouch()
testPointerCollision()
testLua()
testParse()
testElapsedAndState()
testRejectsMiceOnlyPayload()
console.log("ok")
