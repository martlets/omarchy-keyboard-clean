const assert = require("node:assert/strict")
const model = require("../KeyboardCleanModel.js")

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

function testLockable() {
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
    model.luaDeviceEnabled("hid-sdw:0:0:01fa:4245:01", true),
    'hl.device({ name = "hid-sdw:0:0:01fa:4245:01", enabled = true })'
  )
}

function testParse() {
  assert.equal(model.parseDevicesJson("{"), null)
  assert.equal(model.parseDevicesJson("[]"), null)
  assert.ok(model.parseDevicesJson(JSON.stringify(sample)))
  const extra = model.newlyLockableNames(sample, ["at-translated-set-2-keyboard"])
  assert.ok(extra.indexOf("at-translated-set-2-keyboard") === -1)
  assert.ok(extra.indexOf("dell-wmi-hotkeys") !== -1)
}

function testElapsedAndState() {
  assert.equal(model.formatElapsed(0), "0:00")
  assert.equal(model.formatElapsed(1000), "0:01")
  assert.equal(model.formatElapsed(61000), "1:01")
  assert.equal(model.formatElapsed(-20), "0:00")
  assert.equal(model.tooltipFor(false, 0), "Lock Keyboard to Clean")
  assert.equal(model.tooltipFor(true, 5000), "Unlock Keyboard · locked 0:05")
  assert.equal(model.clampTimeoutSeconds(12, 2700, 60, 3600), 60)
  assert.equal(model.clampTimeoutSeconds(9000, 2700, 60, 3600), 3600)
  assert.equal(model.clampTimeoutSeconds("nope", 2700, 60, 3600), 2700)

  const state = model.parseState(JSON.stringify({
    version: 1,
    locked: true,
    generation: 3,
    pid: 9,
    devices: ["at-translated-set-2-keyboard", "bad name", "at-translated-set-2-keyboard"]
  }))
  assert.equal(state.locked, true)
  assert.deepEqual(state.devices, ["at-translated-set-2-keyboard"])
  assert.equal(model.parseState('{"version":2}'), null)
}

function testRejectsMiceOnlyPayload() {
  assert.deepEqual(model.lockableKeyboardNames({ mice: sample.mice }), [])
}

testSafety()
testNeverLock()
testLockable()
testPointerCollision()
testLua()
testParse()
testElapsedAndState()
testRejectsMiceOnlyPayload()
console.log("ok")
