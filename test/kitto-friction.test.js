const test = require("node:test");
const assert = require("node:assert/strict");

const {
  STATES,
  KITTO_FRICTION_CONFIG,
  createKittoFriction,
  centreTarget,
  stepToward
} = require("../crew/kitto-friction");

const { IDLE, ACTIVE, TRAVEL, LYING, COOLDOWN } = STATES;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// Small fake-clock timings for the state-machine tests; nothing waits in real time.
const TEST_TIMING = { thresholdMs: 60_000, inactivityResetMs: 90_000, cooldownMs: 30_000 };
const { thresholdMs, inactivityResetMs, cooldownMs } = TEST_TIMING;

function fakeClock() {
  let time = 1_000_000;
  return {
    now: () => time,
    set: (value) => { time = value; },
    advance: (ms) => { time += ms; }
  };
}

function setup(timing = TEST_TIMING) {
  const clock = fakeClock();
  const friction = createKittoFriction({ ...timing, now: clock.now });
  return { friction, clock };
}

// Interact every `stepMs` so the session never expires, until `totalMs` has passed.
function keepBusy(friction, clock, totalMs, stepMs = 30_000) {
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    const step = Math.min(stepMs, totalMs - elapsed);
    clock.advance(step);
    friction.noteInteraction();
  }
}

function travelling() {
  const ctx = setup();
  ctx.friction.noteInteraction();
  ctx.clock.advance(thresholdMs);
  assert.equal(ctx.friction.tick({ eligible: true }), TRAVEL);
  return ctx;
}

test("default config: 3 h threshold, 30 min inactivity reset, 30 min cooldown, 40 px/s", () => {
  assert.deepEqual({ ...KITTO_FRICTION_CONFIG }, {
    thresholdMs: 3 * HOUR,
    inactivityResetMs: 30 * MINUTE,
    cooldownMs: 30 * MINUTE,
    speedPxPerSec: 40
  });
  assert.equal(KITTO_FRICTION_CONFIG.thresholdMs, 10_800_000);
  assert.equal(KITTO_FRICTION_CONFIG.inactivityResetMs, 1_800_000);
  assert.equal(KITTO_FRICTION_CONFIG.cooldownMs, 1_800_000);
  assert.ok(Object.isFrozen(KITTO_FRICTION_CONFIG));
});

test("default timing (fake clock): a long session with normal pauses reaches KITTØ at 3 h", () => {
  const { friction, clock } = setup(KITTO_FRICTION_CONFIG);
  friction.noteInteraction();
  keepBusy(friction, clock, 3 * HOUR - 1, 29 * MINUTE);
  assert.equal(friction.tick({ eligible: true }), ACTIVE, "3 h − 1 ms");
  clock.advance(1);
  assert.equal(friction.tick({ eligible: true }), TRAVEL, "exactly 3 h");
});

test("default timing (fake clock): 30 min without interaction resets the session", () => {
  const { friction, clock } = setup(KITTO_FRICTION_CONFIG);
  friction.noteInteraction();
  clock.advance(30 * MINUTE - 1);
  assert.equal(friction.tick({ eligible: true }), ACTIVE);
  clock.advance(1);
  assert.equal(friction.tick({ eligible: true }), IDLE);
});

test("default timing (fake clock): KITTØ placement restarts the full 3 h threshold", () => {
  const { friction, clock } = setup(KITTO_FRICTION_CONFIG);
  friction.noteInteraction();
  keepBusy(friction, clock, 3 * HOUR + 10 * MINUTE, 20 * MINUTE);
  assert.equal(friction.restartSession(), ACTIVE);
  assert.equal(friction.tick({ eligible: true }), ACTIVE, "no immediate travel");
  keepBusy(friction, clock, 3 * HOUR - 1, 20 * MINUTE);
  assert.equal(friction.tick({ eligible: true }), ACTIVE, "3 h − 1 ms after placement");
  clock.advance(1);
  assert.equal(friction.tick({ eligible: true }), TRAVEL, "3 h after placement");
});

test("default timing (fake clock): dismissal gives a 30 min cooldown, then needs a new interaction", () => {
  const { friction, clock } = setup(KITTO_FRICTION_CONFIG);
  friction.noteInteraction();
  keepBusy(friction, clock, 3 * HOUR, 29 * MINUTE);
  assert.equal(friction.tick({ eligible: true }), TRAVEL);
  friction.cancel();
  clock.advance(30 * MINUTE - 1);
  assert.equal(friction.noteInteraction(), COOLDOWN);
  clock.advance(1);
  assert.equal(friction.tick({ eligible: true }), IDLE);
  clock.advance(5 * HOUR);
  assert.equal(friction.tick({ eligible: true }), IDLE, "time alone never returns her");
  assert.equal(friction.noteInteraction(), ACTIVE);
});

test("session: no interaction never triggers", () => {
  const { friction, clock } = setup();
  for (let i = 0; i < 10; i++) {
    clock.advance(thresholdMs);
    assert.equal(friction.tick({ eligible: true }), IDLE);
  }
});

test("session: first interaction starts ACTIVE", () => {
  const { friction } = setup();
  assert.equal(friction.noteInteraction(), ACTIVE);
});

test("session: before threshold stays ACTIVE, at threshold travels", () => {
  const { friction, clock } = setup();
  friction.noteInteraction();
  clock.advance(thresholdMs - 1);
  assert.equal(friction.tick({ eligible: true }), ACTIVE);
  clock.advance(1);
  assert.equal(friction.tick({ eligible: true }), TRAVEL);
});

test("session: later interactions do not restart the session clock", () => {
  const { friction, clock } = setup();
  friction.noteInteraction();
  keepBusy(friction, clock, thresholdMs - 1, 10_000);
  assert.equal(friction.tick({ eligible: true }), ACTIVE);
  clock.advance(1);
  assert.equal(friction.tick({ eligible: true }), TRAVEL);
});

test("session: inactivity before threshold resets to IDLE", () => {
  const { friction, clock } = setup();
  const quick = createKittoFriction({ thresholdMs: 200_000, inactivityResetMs, cooldownMs, now: clock.now });
  quick.noteInteraction();
  clock.advance(inactivityResetMs - 1);
  assert.equal(quick.tick({ eligible: true }), ACTIVE);
  clock.advance(1);
  assert.equal(quick.tick({ eligible: true }), IDLE);
  assert.equal(friction.getState(), IDLE);
});

test("session: new interaction after inactivity starts a fresh session", () => {
  const { clock } = setup();
  const quick = createKittoFriction({ thresholdMs: 200_000, inactivityResetMs, cooldownMs, now: clock.now });
  quick.noteInteraction();
  clock.advance(inactivityResetMs);
  assert.equal(quick.noteInteraction(), ACTIVE);
  keepBusy(quick, clock, 200_000 - 1);
  assert.equal(quick.tick({ eligible: true }), ACTIVE, "fresh session clock, not the old one");
  clock.advance(1);
  assert.equal(quick.tick({ eligible: true }), TRAVEL);
});

test("friction: arrived() moves TRAVEL to LYING, and only from TRAVEL", () => {
  const { friction } = setup();
  assert.equal(friction.arrived(), IDLE);
  const ctx = travelling();
  assert.equal(ctx.friction.arrived(), LYING);
  assert.equal(ctx.friction.tick({ eligible: true }), LYING, "lying has no automatic exit");
});

test("friction: cancel from TRAVEL enters COOLDOWN", () => {
  const { friction } = travelling();
  assert.equal(friction.cancel(), true);
  assert.equal(friction.getState(), COOLDOWN);
});

test("friction: cancel from LYING enters COOLDOWN", () => {
  const { friction } = travelling();
  friction.arrived();
  assert.equal(friction.cancel(), true);
  assert.equal(friction.getState(), COOLDOWN);
});

test("friction: cancel outside TRAVEL/LYING does nothing", () => {
  const { friction } = setup();
  assert.equal(friction.cancel(), false);
  friction.noteInteraction();
  assert.equal(friction.cancel(), false);
  assert.equal(friction.getState(), ACTIVE);
});

test("cooldown: blocks retrigger and ignores interactions", () => {
  const { friction, clock } = travelling();
  friction.cancel();
  for (let elapsed = 1_000; elapsed < cooldownMs; elapsed += 1_000) {
    clock.advance(1_000);
    assert.equal(friction.noteInteraction(), COOLDOWN);
    assert.equal(friction.tick({ eligible: true }), COOLDOWN);
  }
  clock.advance(999);
  assert.equal(friction.noteInteraction(), COOLDOWN, "1 ms before expiry");
  assert.equal(friction.tick({ eligible: true }), COOLDOWN);
});

test("cooldown: expiry returns to IDLE without starting a session", () => {
  const { friction, clock } = travelling();
  friction.cancel();
  clock.advance(cooldownMs);
  assert.equal(friction.tick({ eligible: true }), IDLE);
  for (let i = 0; i < 5; i++) {
    clock.advance(thresholdMs);
    assert.equal(friction.tick({ eligible: true }), IDLE, "time alone never brings KITTØ back");
  }
});

test("cooldown: a new interaction after expiry starts the next session", () => {
  const { friction, clock } = travelling();
  friction.cancel();
  clock.advance(cooldownMs);
  assert.equal(friction.noteInteraction(), ACTIVE);
  clock.advance(thresholdMs - 1);
  assert.equal(friction.tick({ eligible: true }), ACTIVE);
  clock.advance(1);
  assert.equal(friction.tick({ eligible: true }), TRAVEL);
});

test("eligibility: threshold reached while blocked does not travel", () => {
  const { friction, clock } = setup();
  friction.noteInteraction();
  clock.advance(thresholdMs + 5_000);
  assert.equal(friction.tick({ eligible: false }), ACTIVE);
  assert.equal(friction.tick({}), ACTIVE, "missing eligibility counts as blocked");
});

test("eligibility: becoming eligible before inactivity expiry can travel", () => {
  const { friction, clock } = setup();
  friction.noteInteraction();
  clock.advance(thresholdMs);
  assert.equal(friction.tick({ eligible: false }), ACTIVE);
  clock.advance(inactivityResetMs - thresholdMs - 1);
  assert.equal(friction.tick({ eligible: true }), TRAVEL);
});

test("eligibility: inactivity expiry while blocked resets instead", () => {
  const { friction, clock } = setup();
  friction.noteInteraction();
  clock.advance(thresholdMs);
  assert.equal(friction.tick({ eligible: false }), ACTIVE);
  clock.advance(inactivityResetMs - thresholdMs);
  assert.equal(friction.tick({ eligible: false }), IDLE);
  assert.equal(friction.tick({ eligible: true }), IDLE);
});

test("placement grace: dragging KITTØ restarts an over-threshold session", () => {
  const { friction, clock } = setup();
  friction.noteInteraction();
  keepBusy(friction, clock, thresholdMs + 20_000);
  assert.equal(friction.getState(), ACTIVE, "past threshold but blocked so far");

  assert.equal(friction.restartSession(), ACTIVE);
  assert.equal(friction.tick({ eligible: true }), ACTIVE, "no immediate travel after placement");

  keepBusy(friction, clock, thresholdMs - 1);
  assert.equal(friction.tick({ eligible: true }), ACTIVE, "threshold − 1 after placement");

  clock.advance(1);
  assert.equal(friction.tick({ eligible: true }), TRAVEL, "fresh threshold reached");
});

test("placement grace: from IDLE it starts a session like any interaction", () => {
  const { friction, clock } = setup();
  assert.equal(friction.restartSession(), ACTIVE);
  clock.advance(thresholdMs);
  assert.equal(friction.tick({ eligible: true }), TRAVEL);
});

test("placement grace: never interrupts TRAVEL, LYING or COOLDOWN", () => {
  const ctx = travelling();
  assert.equal(ctx.friction.restartSession(), TRAVEL);
  ctx.friction.arrived();
  assert.equal(ctx.friction.restartSession(), LYING);
  ctx.friction.cancel();
  assert.equal(ctx.friction.restartSession(), COOLDOWN);
  ctx.clock.advance(cooldownMs - 1);
  assert.equal(ctx.friction.restartSession(), COOLDOWN);
});

test("drag-away still cancels into COOLDOWN; the grab's placement adds no session", () => {
  for (const lying of [false, true]) {
    const { friction, clock } = travelling();
    if (lying) friction.arrived();

    // main.js: grab → cancel(); drag end → restartSession() (no-op in cooldown)
    assert.equal(friction.cancel(), true);
    assert.equal(friction.restartSession(), COOLDOWN);

    clock.advance(cooldownMs);
    assert.equal(friction.tick({ eligible: true }), IDLE);
    clock.advance(thresholdMs);
    assert.equal(friction.tick({ eligible: true }), IDLE, "time alone still never returns her");
  }
});

test("other-pet interactions do not restart the session clock", () => {
  const { friction, clock } = setup();
  friction.noteInteraction();
  clock.advance(thresholdMs - 1);
  friction.noteInteraction();
  clock.advance(1);
  assert.equal(friction.tick({ eligible: true }), TRAVEL);
});

test("reset() clears everything, including cooldown", () => {
  const { friction, clock } = travelling();
  friction.cancel();
  assert.equal(friction.reset(), IDLE);
  clock.advance(thresholdMs);
  assert.equal(friction.tick({ eligible: true }), IDLE, "no stale session after reset");
  assert.equal(friction.noteInteraction(), ACTIVE, "reset clears cooldown too");
});

test("centre target: primary, right-hand, negative-x and taskbar-offset displays", () => {
  const size = { width: 256, height: 256 };
  const displays = {
    primary: { x: 0, y: 0, width: 1920, height: 1040 },
    rightHand: { x: 1920, y: 0, width: 2560, height: 1400 },
    negativeX: { x: -1600, y: -200, width: 1600, height: 860 },
    taskbarLeftAndTop: { x: 64, y: 48, width: 1856, height: 1032 }
  };
  const expected = {
    primary: { x: 832, y: 392 },
    rightHand: { x: 3072, y: 572 },
    negativeX: { x: -928, y: 102 },
    taskbarLeftAndTop: { x: 864, y: 436 }
  };

  for (const [name, area] of Object.entries(displays)) {
    const target = centreTarget(area, size);
    assert.deepEqual(target, expected[name], name);
    assert.ok(target.x >= area.x && target.x + size.width <= area.x + area.width, `${name} x inside`);
    assert.ok(target.y >= area.y && target.y + size.height <= area.y + area.height, `${name} y inside`);
  }
});

test("centre target: window larger than the work area stays anchored inside it", () => {
  const area = { x: 100, y: 50, width: 200, height: 150 };
  assert.deepEqual(centreTarget(area, { width: 256, height: 256 }), { x: 100, y: 50 });
});

test("stepToward: moves at most maxStep and lands exactly on target", () => {
  const target = { x: 100, y: 0 };
  let position = { x: 0, y: 0 };
  let steps = 0;

  while (true) {
    const next = stepToward(position, target, 30);
    assert.ok(Math.hypot(next.x - position.x, next.y - position.y) <= 30 + 1e-9);
    position = next;
    steps++;
    if (next.arrived) break;
  }

  assert.deepEqual(position, { x: 100, y: 0, arrived: true });
  assert.equal(steps, 4);
  assert.deepEqual(stepToward({ x: 5, y: 5 }, { x: 5, y: 5 }, 0), { x: 5, y: 5, arrived: true });
});
