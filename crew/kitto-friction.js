/*
  --------------------------------
  KITTØ SCREEN FRICTION
  --------------------------------

  friction ≠ authority
  session awareness ≠ surveillance

  A session is built only from
  interactions with Ø-CREW itself.
  After a while KITTØ wanders to the
  middle of the screen and lies down.
  Any grab, click or hide ends it.

  Pure and deterministic: no Electron,
  no timers, no storage. Time comes
  from the injected now().
*/

const STATES = Object.freeze({
  IDLE: "IDLE",
  ACTIVE: "ACTIVE",
  TRAVEL: "TRAVEL",
  LYING: "LYING",
  COOLDOWN: "COOLDOWN"
});

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// Runtime defaults. Tests inject their own small values and a fake clock.
const KITTO_FRICTION_CONFIG = Object.freeze({
  thresholdMs: 3 * HOUR,
  inactivityResetMs: 30 * MINUTE,
  cooldownMs: 30 * MINUTE,
  speedPxPerSec: 40
});

function createKittoFriction({
  thresholdMs,
  inactivityResetMs,
  cooldownMs,
  now
}) {
  let state = STATES.IDLE;
  let sessionStartedAt = null;
  let lastInteractionAt = null;
  let cooldownUntil = null;

  function clearSession() {
    sessionStartedAt = null;
    lastInteractionAt = null;
  }

  // Apply time-based transitions only.
  function settle(time) {
    if (
      state === STATES.COOLDOWN &&
      time >= cooldownUntil
    ) {
      state = STATES.IDLE;
      cooldownUntil = null;
    }

    if (
      state === STATES.ACTIVE &&
      time - lastInteractionAt >= inactivityResetMs
    ) {
      state = STATES.IDLE;
      clearSession();
    }
  }

  function noteInteraction() {
    const time = now();
    settle(time);

    if (state === STATES.IDLE) {
      state = STATES.ACTIVE;
      sessionStartedAt = time;
      lastInteractionAt = time;
    }

    else if (state === STATES.ACTIVE) {
      lastInteractionAt = time;
    }

    return state;
  }

  // Intentional manual placement of KITTØ: a full fresh grace period.
  // Only from IDLE/ACTIVE; never interrupts TRAVEL, LYING or COOLDOWN.
  function restartSession() {
    const time = now();
    settle(time);

    if (
      state === STATES.IDLE ||
      state === STATES.ACTIVE
    ) {
      state = STATES.ACTIVE;
      sessionStartedAt = time;
      lastInteractionAt = time;
    }

    return state;
  }

  function tick({ eligible }) {
    const time = now();
    settle(time);

    if (
      state === STATES.ACTIVE &&
      eligible === true &&
      time - sessionStartedAt >= thresholdMs
    ) {
      state = STATES.TRAVEL;
    }

    return state;
  }

  function arrived() {
    if (state === STATES.TRAVEL) {
      state = STATES.LYING;
    }

    return state;
  }

  function cancel() {
    if (
      state !== STATES.TRAVEL &&
      state !== STATES.LYING
    ) {
      return false;
    }

    state = STATES.COOLDOWN;
    cooldownUntil = now() + cooldownMs;
    clearSession();
    return true;
  }

  function reset() {
    state = STATES.IDLE;
    cooldownUntil = null;
    clearSession();
    return state;
  }

  function getState() {
    settle(now());
    return state;
  }

  return {
    noteInteraction,
    restartSession,
    tick,
    arrived,
    cancel,
    reset,
    getState
  };
}

/*
  Centre of a display's work area for a
  window of the given size, kept inside
  that work area.
*/

function centreTarget(workArea, size) {
  const clamp = (value, min, max) =>
    Math.max(min, Math.min(value, max));

  return {
    x: clamp(
      workArea.x + Math.round((workArea.width - size.width) / 2),
      workArea.x,
      workArea.x + Math.max(0, workArea.width - size.width)
    ),
    y: clamp(
      workArea.y + Math.round((workArea.height - size.height) / 2),
      workArea.y,
      workArea.y + Math.max(0, workArea.height - size.height)
    )
  };
}

/*
  One movement step toward a target,
  never overshooting it.
*/

function stepToward(position, target, maxStep) {
  const dx = target.x - position.x;
  const dy = target.y - position.y;
  const distance = Math.hypot(dx, dy);

  if (distance <= maxStep) {
    return { x: target.x, y: target.y, arrived: true };
  }

  return {
    x: position.x + (dx / distance) * maxStep,
    y: position.y + (dy / distance) * maxStep,
    arrived: false
  };
}

module.exports = {
  STATES,
  KITTO_FRICTION_CONFIG,
  createKittoFriction,
  centreTarget,
  stepToward
};
