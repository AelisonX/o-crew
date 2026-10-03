/*
  --------------------------------
  Ø-CREW MESSAGE BUS v0.1
  --------------------------------

  One bus. EVENT and REQUEST only.
  The main process stamps who sent a
  message; the renderer never does.

  Authority: can(envelope.to, INTENT_MAP[intent].capability).
  The sender's capabilities are never consulted.

  No free text, no forwarding, no replies,
  no queues, no LLM, no persistence.
  Dispatch is synchronous and non-reentrant.
*/

const {
  CREW_IDS,
  INTENT_MAP,
  SUBSCRIPTIONS,
  can: registryCan
} = require("./capabilities");

const DECISIONS = Object.freeze({
  DELIVERED: "DELIVERED",
  EXECUTED: "EXECUTED",
  DENIED: "DENIED",
  FAILED: "FAILED",
  INVALID: "INVALID",
  BUS_DISABLED: "BUS_DISABLED"
});

const SUBMISSION_FIELDS = Object.freeze([
  "to",
  "type",
  "intent",
  "payload"
]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);

    for (const key of Object.keys(value)) {
      deepFreeze(value[key]);
    }
  }

  return value;
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isCrewId = (value) =>
  typeof value === "string" && CREW_IDS.includes(value);

const isIntent = (value) =>
  typeof value === "string" && Object.hasOwn(INTENT_MAP, value);

/*
  Rebuild the payload field by field from the
  intent's schema. Only enum strings survive,
  so nothing from the sender's object is kept.
*/

function rebuildPayload(intent, payload) {
  const schema = INTENT_MAP[intent].payload;

  if (!isPlainObject(payload)) {
    return null;
  }

  const allowed = Object.keys(schema);
  const given = Object.keys(payload);

  if (
    given.length !== allowed.length ||
    !given.every((key) => allowed.includes(key))
  ) {
    return null;
  }

  const rebuilt = {};

  for (const key of allowed) {
    const value = payload[key];

    if (typeof value !== "string" || !schema[key].includes(value)) {
      return null;
    }

    rebuilt[key] = value;
  }

  return deepFreeze(rebuilt);
}

function createMessageBus({
  handlers = {},
  now = Date.now,
  newId,
  ledgerSize = 500,
  can = registryCan,
  onRecord = null
} = {}) {
  let counter = 0;
  const nextId = newId ?? (() => `msg-${++counter}`);

  // Handlers are fixed at creation and receive only (actor, payload).
  const fixedHandlers = Object.freeze({ ...handlers });

  const ring = [];
  let enabled = true;
  let dispatching = false;

  function record(fields) {
    const entry = deepFreeze({
      msgId: fields.msgId ?? null,
      from: isCrewId(fields.from) ? fields.from : null,
      to: isCrewId(fields.to) ? fields.to : null,
      type: fields.type === "EVENT" || fields.type === "REQUEST" ? fields.type : null,
      intent: isIntent(fields.intent) ? fields.intent : null,
      capability: fields.capability ?? null,
      decision: fields.decision,
      reason: fields.reason ?? null,
      actionResult: fields.actionResult ?? null,
      ts: fields.ts
    });

    ring.push(entry);

    if (ring.length > ledgerSize) {
      ring.shift();
    }

    if (onRecord) {
      onRecord(entry);
    }

    return entry;
  }

  function outcome(entry, extra = {}) {
    return deepFreeze({
      msgId: entry.msgId,
      decision: entry.decision,
      reason: entry.reason,
      ...extra
    });
  }

  function guard() {
    if (dispatching) {
      throw new Error("Message bus is already dispatching (no forwarding or nested sends).");
    }
  }

  // Run fn with the bus locked; nested submitRequest/emitEvent throw.
  function locked(fn) {
    guard();
    dispatching = true;

    try {
      return fn();
    }

    finally {
      dispatching = false;
    }
  }

  function submitRequest({ from, submission } = {}) {
    return locked(() => {
      const ts = now();
      const msgId = nextId();
      const base = { msgId, from, ts };

      if (!enabled) {
        return outcome(record({
          ...base,
          to: submission?.to,
          type: submission?.type,
          intent: submission?.intent,
          decision: DECISIONS.BUS_DISABLED
        }));
      }

      const invalid = (reason, extra = {}) =>
        outcome(record({ ...base, ...extra, decision: DECISIONS.INVALID, reason }));

      if (!isCrewId(from)) {
        return invalid("UNKNOWN_SENDER");
      }

      if (!isPlainObject(submission)) {
        return invalid("BAD_SUBMISSION");
      }

      const keys = Object.keys(submission);

      if (keys.some((key) => !SUBMISSION_FIELDS.includes(key))) {
        return invalid("UNEXPECTED_FIELD");
      }

      if (SUBMISSION_FIELDS.some((key) => !keys.includes(key))) {
        return invalid("MISSING_FIELD");
      }

      const { to, type, intent, payload } = submission;

      if (!isIntent(intent)) {
        return outcome(record({ ...base, to, type, decision: DECISIONS.DENIED, reason: "UNKNOWN_INTENT" }));
      }

      const spec = INTENT_MAP[intent];

      if (type !== "REQUEST" || spec.type !== "REQUEST") {
        return invalid("TYPE_MISMATCH", { to, intent });
      }

      if (!isCrewId(to)) {
        return invalid("UNKNOWN_TARGET", { type, intent });
      }

      const cleanPayload = rebuildPayload(intent, payload);

      if (!cleanPayload) {
        return invalid("BAD_PAYLOAD", { to, type, intent });
      }

      const envelope = deepFreeze({
        id: msgId,
        from,
        to,
        type,
        intent,
        payload: cleanPayload,
        timestamp: ts
      });

      const capability = spec.capability;
      const actor = envelope.to;
      const fields = { ...base, to: actor, type, intent, capability };

      // Authority lives here, and only here.
      if (!can(actor, capability)) {
        return outcome(record({ ...fields, decision: DECISIONS.DENIED, reason: "NO_CAPABILITY" }));
      }

      if (!Object.hasOwn(fixedHandlers, intent) || typeof fixedHandlers[intent] !== "function") {
        return outcome(record({ ...fields, decision: DECISIONS.FAILED, reason: "NO_HANDLER" }));
      }

      try {
        fixedHandlers[intent](actor, envelope.payload);
      }

      catch {
        return outcome(record({ ...fields, decision: DECISIONS.FAILED, reason: "HANDLER_ERROR" }));
      }

      return outcome(record({ ...fields, decision: DECISIONS.EXECUTED, actionResult: "OK" }));
    });
  }

  // Main-process only: facts the main process observed itself.
  function emitEvent({ from, intent, payload } = {}) {
    return locked(() => {
      const ts = now();
      const msgId = nextId();
      const base = { msgId, from, type: "EVENT", intent, ts };

      if (!enabled) {
        return outcome(record({ ...base, decision: DECISIONS.BUS_DISABLED }), { delivered: Object.freeze([]) });
      }

      const invalid = (reason) =>
        outcome(record({ ...base, decision: DECISIONS.INVALID, reason }), { delivered: Object.freeze([]) });

      if (!isCrewId(from)) {
        return invalid("UNKNOWN_SENDER");
      }

      if (!isIntent(intent) || INTENT_MAP[intent].type !== "EVENT") {
        return invalid("TYPE_MISMATCH");
      }

      const cleanPayload = rebuildPayload(intent, payload);

      if (!cleanPayload) {
        return invalid("BAD_PAYLOAD");
      }

      const byIntent = Object.hasOwn(SUBSCRIPTIONS, intent) ? SUBSCRIPTIONS[intent] : {};
      const recipients = Object.hasOwn(byIntent, from) ? byIntent[from] : [];
      const delivered = [];

      // v0.1 delivery = a provenance record per subscriber; no executor, no UI.
      for (const to of recipients) {
        record({ ...base, to, decision: DECISIONS.DELIVERED });
        delivered.push(to);
      }

      return deepFreeze({
        msgId,
        decision: DECISIONS.DELIVERED,
        reason: null,
        delivered
      });
    });
  }

  function setEnabled(value) {
    guard();
    enabled = value === true;
  }

  return Object.freeze({
    submitRequest,
    emitEvent,
    setEnabled,
    isEnabled: () => enabled,
    ledger: Object.freeze({
      snapshot: () => Object.freeze(ring.slice())
    })
  });
}

/*
  Renderer entry point (bus:send). Only the main frame
  of a real crew window may submit, and only REQUESTs;
  `from` is stamped from that window, never from data.
*/

function createBusSendHandler({
  bus,
  getSenderWindow,
  isCrewWindow,
  getCharacter
}) {
  return async (event, submission) => {
    const senderWindow = getSenderWindow(event.sender);

    if (
      !senderWindow ||
      !isCrewWindow(senderWindow) ||
      event.senderFrame !== event.sender.mainFrame
    ) {
      throw new Error("Bus request rejected.");
    }

    return bus.submitRequest({
      from: getCharacter(senderWindow),
      submission
    });
  };
}

module.exports = {
  DECISIONS,
  createMessageBus,
  createBusSendHandler
};
