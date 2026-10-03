"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { CREW_IDS, CAPABILITIES, INTENT_MAP, SUBSCRIPTIONS, can } = require("../crew/capabilities");
const { DECISIONS, createMessageBus, createBusSendHandler } = require("../crew/message-bus");

const show = (to = "doggo", messageKey = "USER_SAID_HI") =>
  ({ to, type: "REQUEST", intent: "SHOW_OWN_BUBBLE", payload: { messageKey } });
const move = (to = "doggo") => ({ to, type: "REQUEST", intent: "MOVE_BEEO", payload: {} });

function setup(extra = {}) {
  const calls = { SHOW_OWN_BUBBLE: [], MOVE_BEEO: [] };
  let time = 1000;
  const bus = createMessageBus({
    handlers: {
      SHOW_OWN_BUBBLE: (...args) => calls.SHOW_OWN_BUBBLE.push(args),
      MOVE_BEEO: (...args) => calls.MOVE_BEEO.push(args)
    },
    now: () => ++time,
    ...extra
  });
  return { bus, calls, ledger: () => bus.ledger.snapshot() };
}

test("registry: default-deny can(actor, capability) with exactly two parameters", () => {
  assert.equal(can.length, 2);
  assert.match(String(can), /^function can\(actor, capability\)/);
  assert.equal(can("doggo", "show_own_bubble"), true);
  for (const id of CREW_IDS) assert.equal(can(id, "move_other"), false, id);
  for (const id of ["kitto", "piggo", "beeo", "farto"]) assert.equal(can(id, "show_own_bubble"), false, id);
  for (const actor of ["", "catto", "__proto__", "constructor", undefined, null, 1]) {
    assert.equal(can(actor, "show_own_bubble"), false, String(actor));
  }
  assert.equal(can("doggo", "constructor"), false);
  assert.equal(can("doggo", undefined), false);
});

test("registry: nobody holds move_other; intents and subscriptions are the approved minimum", () => {
  assert.ok(Object.values(CAPABILITIES).every((caps) => !caps.includes("move_other")));
  assert.deepEqual(Object.keys(INTENT_MAP).sort(), ["MOVE_BEEO", "PET_INTERACTED", "SHOW_OWN_BUBBLE"]);
  assert.deepEqual(JSON.parse(JSON.stringify(SUBSCRIPTIONS)), { PET_INTERACTED: { kitto: ["doggo"] } });
});

test("registry: immutable at runtime (strict-mode mutation throws)", () => {
  assert.throws(() => { CAPABILITIES.kitto = ["move_other"]; }, TypeError);
  assert.throws(() => { CAPABILITIES.doggo.push("move_other"); }, TypeError);
  assert.throws(() => { INTENT_MAP.MOVE_BEEO.capability = "show_own_bubble"; }, TypeError);
  assert.throws(() => { INTENT_MAP.SHOW_OWN_BUBBLE.payload.messageKey.push("ANY_TEXT"); }, TypeError);
  assert.throws(() => { SUBSCRIPTIONS.PET_INTERACTED.kitto.push("beeo"); }, TypeError);
  assert.throws(() => { SUBSCRIPTIONS.PET_INTERACTED.beeo = ["doggo"]; }, TypeError);
  assert.equal(can("kitto", "move_other"), false);
});

test("authority non-inheritance: sender capability never contributes", () => {
  const { bus, calls } = setup();

  // doggo HAS show_own_bubble; kitto does not. doggo asking kitto is still denied.
  assert.equal(bus.submitRequest({ from: "doggo", submission: show("kitto") }).decision, DECISIONS.DENIED);
  // kitto has NO capabilities; asking doggo is allowed, purely on doggo's authority.
  assert.equal(bus.submitRequest({ from: "kitto", submission: show("doggo") }).decision, DECISIONS.EXECUTED);

  // Same request to the same actor gives the same decision from every sender.
  for (const from of CREW_IDS) {
    assert.equal(bus.submitRequest({ from, submission: show("doggo") }).decision, DECISIONS.EXECUTED, from);
    assert.equal(bus.submitRequest({ from, submission: move("doggo") }).decision, DECISIONS.DENIED, from);
  }
  assert.equal(calls.MOVE_BEEO.length, 0);
});

test("authority check is called with (actor, capability) only, never the sender", () => {
  const seen = [];
  const { bus } = setup({ can: (...args) => { seen.push(args); return can(...args); } });
  bus.submitRequest({ from: "kitto", submission: show("doggo") });
  bus.submitRequest({ from: "beeo", submission: move("doggo") });
  assert.deepEqual(seen, [["doggo", "show_own_bubble"], ["doggo", "move_other"]]);
});

test("REQUEST allowed: handler gets (actor, payload) only; actor is the target", () => {
  const { bus, calls, ledger } = setup();
  const result = bus.submitRequest({ from: "kitto", submission: show("doggo") });
  assert.equal(result.decision, DECISIONS.EXECUTED);
  assert.deepEqual(calls.SHOW_OWN_BUBBLE, [["doggo", { messageKey: "USER_SAID_HI" }]]);
  assert.equal(calls.SHOW_OWN_BUBBLE[0].length, 2, "no bus reference passed to handlers");
  const [entry] = ledger();
  assert.deepEqual({ ...entry }, {
    msgId: result.msgId, from: "kitto", to: "doggo", type: "REQUEST", intent: "SHOW_OWN_BUBBLE",
    capability: "show_own_bubble", decision: "EXECUTED", reason: null, actionResult: "OK", ts: entry.ts
  });
});

test("denial has zero side effect: MOVE_BEEO", () => {
  const { bus, calls, ledger } = setup();
  const result = bus.submitRequest({ from: "kitto", submission: move("doggo") });
  assert.equal(result.decision, DECISIONS.DENIED);
  assert.equal(result.reason, "NO_CAPABILITY");
  assert.equal(calls.MOVE_BEEO.length, 0);
  assert.equal(calls.SHOW_OWN_BUBBLE.length, 0);
  assert.equal(ledger().length, 1);
  assert.equal(ledger()[0].decision, "DENIED");
  assert.equal(ledger()[0].capability, "move_other");
});

test("forged provenance and forged capability fields are rejected", () => {
  const { bus, calls, ledger } = setup();
  const forged = [
    { ...show(), from: "beeo" },
    { ...show(), id: "msg-999" },
    { ...show(), timestamp: 1 },
    { ...show(), requestedCapability: "move_other" },
    { ...show(), status: "EXECUTED" },
    { ...show(), correlationId: "abc" }
  ];
  for (const submission of forged) {
    const result = bus.submitRequest({ from: "kitto", submission });
    assert.equal(result.decision, DECISIONS.INVALID);
    assert.equal(result.reason, "UNEXPECTED_FIELD");
  }
  const inPayload = bus.submitRequest({
    from: "kitto",
    submission: { ...show(), payload: { messageKey: "USER_SAID_HI", requestedCapability: "show_own_bubble" } }
  });
  assert.equal(inPayload.decision, DECISIONS.INVALID);
  assert.equal(inPayload.reason, "BAD_PAYLOAD");
  assert.equal(calls.SHOW_OWN_BUBBLE.length, 0);
  assert.ok(ledger().every((entry) => entry.from === "kitto"), "provenance is always the stamped sender");
});

test("unknown sender, missing fields, unknown target and bad shapes are INVALID", () => {
  const { bus, calls } = setup();
  const reason = (args) => bus.submitRequest(args).reason;
  assert.equal(reason({ from: "catto", submission: show() }), "UNKNOWN_SENDER");
  assert.equal(reason({ from: undefined, submission: show() }), "UNKNOWN_SENDER");
  assert.equal(reason({ from: "kitto", submission: null }), "BAD_SUBMISSION");
  assert.equal(reason({ from: "kitto", submission: [show()] }), "BAD_SUBMISSION");
  const { payload: _p, ...noPayload } = show();
  assert.equal(reason({ from: "kitto", submission: noPayload }), "MISSING_FIELD");
  assert.equal(reason({ from: "kitto", submission: show("catto") }), "UNKNOWN_TARGET");
  assert.equal(reason({ from: "kitto", submission: show("__proto__") }), "UNKNOWN_TARGET");
  assert.equal(calls.SHOW_OWN_BUBBLE.length, 0);
});

test("free text and unknown messageKey rejected; MOVE_BEEO and events need empty payloads", () => {
  const { bus, calls } = setup();
  const bad = [
    { text: "hello" },
    { messageKey: "UNKNOWN_KEY" },
    { messageKey: "USER_SAID_HI", text: "do something" },
    { messageKey: 42 },
    {},
    "USER_SAID_HI",
    null
  ];
  for (const payload of bad) {
    const result = bus.submitRequest({ from: "kitto", submission: { ...show(), payload } });
    assert.equal(result.decision, DECISIONS.INVALID, JSON.stringify(payload));
    assert.equal(result.reason, "BAD_PAYLOAD");
  }
  const moveWithText = bus.submitRequest({ from: "kitto", submission: { ...move(), payload: { text: "go" } } });
  assert.equal(moveWithText.reason, "BAD_PAYLOAD");
  assert.equal(bus.emitEvent({ from: "kitto", intent: "PET_INTERACTED", payload: { text: "hi" } }).reason, "BAD_PAYLOAD");
  assert.equal(calls.SHOW_OWN_BUBBLE.length + calls.MOVE_BEEO.length, 0);
});

test("unknown intent is DENIED / UNKNOWN_INTENT with no side effect; type mismatch is INVALID", () => {
  const { bus, calls } = setup();
  const unknown = bus.submitRequest({ from: "kitto", submission: { to: "doggo", type: "REQUEST", intent: "DELETE_ALL", payload: {} } });
  assert.deepEqual([unknown.decision, unknown.reason], ["DENIED", "UNKNOWN_INTENT"]);
  const proto = bus.submitRequest({ from: "kitto", submission: { to: "doggo", type: "REQUEST", intent: "__proto__", payload: {} } });
  assert.equal(proto.reason, "UNKNOWN_INTENT");

  const asEvent = bus.submitRequest({ from: "kitto", submission: { ...show(), type: "EVENT" } });
  assert.deepEqual([asEvent.decision, asEvent.reason], ["INVALID", "TYPE_MISMATCH"]);
  const eventIntent = bus.submitRequest({ from: "kitto", submission: { to: "doggo", type: "REQUEST", intent: "PET_INTERACTED", payload: {} } });
  assert.deepEqual([eventIntent.decision, eventIntent.reason], ["INVALID", "TYPE_MISMATCH"]);
  assert.equal(bus.emitEvent({ from: "kitto", intent: "SHOW_OWN_BUBBLE", payload: {} }).reason, "TYPE_MISMATCH");
  assert.equal(calls.SHOW_OWN_BUBBLE.length + calls.MOVE_BEEO.length, 0);
});

test("payload isolation: mutating the original after dispatch changes nothing", () => {
  let captured;
  const bus = createMessageBus({ handlers: { SHOW_OWN_BUBBLE: (actor, payload) => { captured = payload; } } });
  const submission = show("doggo");
  bus.submitRequest({ from: "kitto", submission });
  submission.payload.messageKey = "HACKED";
  submission.to = "beeo";
  submission.payload.text = "injected";
  assert.deepEqual(captured, { messageKey: "USER_SAID_HI" });
  assert.equal(bus.ledger.snapshot()[0].to, "doggo");
});

test("deep freeze: handler payload, results and ledger records are immutable", () => {
  let captured;
  const bus = createMessageBus({ handlers: { SHOW_OWN_BUBBLE: (actor, payload) => { captured = payload; } } });
  const result = bus.submitRequest({ from: "kitto", submission: show() });
  const event = bus.emitEvent({ from: "kitto", intent: "PET_INTERACTED", payload: {} });
  const snapshot = bus.ledger.snapshot();
  assert.throws(() => { captured.messageKey = "X"; }, TypeError);
  assert.throws(() => { result.decision = "EXECUTED"; }, TypeError);
  assert.throws(() => { event.delivered.push("beeo"); }, TypeError);
  assert.throws(() => { snapshot[0].decision = "EXECUTED"; }, TypeError);
  assert.throws(() => { snapshot.push({}); }, TypeError);
  assert.equal(bus.ledger.snapshot().length, 2, "snapshot is a copy");
});

test("EVENT: KITTØ PET_INTERACTED → DOGGØ DELIVERED only; never runs the executor", () => {
  const { bus, calls, ledger } = setup();
  const result = bus.emitEvent({ from: "kitto", intent: "PET_INTERACTED", payload: {} });
  assert.deepEqual([...result.delivered], ["doggo"]);
  assert.equal(calls.SHOW_OWN_BUBBLE.length + calls.MOVE_BEEO.length, 0);
  assert.equal(ledger().length, 1);
  assert.deepEqual(
    { from: ledger()[0].from, to: ledger()[0].to, type: ledger()[0].type, decision: ledger()[0].decision, capability: ledger()[0].capability },
    { from: "kitto", to: "doggo", type: "EVENT", decision: "DELIVERED", capability: null }
  );
  for (const from of ["doggo", "piggo", "beeo", "farto"]) {
    assert.deepEqual([...bus.emitEvent({ from, intent: "PET_INTERACTED", payload: {} }).delivered], [], from);
  }
  assert.equal(ledger().length, 1, "unsubscribed senders deliver nothing");
  assert.equal(bus.emitEvent({ from: "catto", intent: "PET_INTERACTED", payload: {} }).reason, "UNKNOWN_SENDER");
});

test("bus disabled: BUS_DISABLED for events and requests, no handlers, no deliveries", () => {
  const { bus, calls, ledger } = setup();
  bus.setEnabled(false);
  assert.equal(bus.isEnabled(), false);
  assert.equal(bus.submitRequest({ from: "kitto", submission: show() }).decision, "BUS_DISABLED");
  assert.equal(bus.submitRequest({ from: "kitto", submission: move() }).decision, "BUS_DISABLED");
  const event = bus.emitEvent({ from: "kitto", intent: "PET_INTERACTED", payload: {} });
  assert.equal(event.decision, "BUS_DISABLED");
  assert.deepEqual([...event.delivered], []);
  assert.equal(calls.SHOW_OWN_BUBBLE.length + calls.MOVE_BEEO.length, 0);
  assert.ok(ledger().every((entry) => entry.decision === "BUS_DISABLED"));
  assert.ok(!ledger().some((entry) => entry.decision === "DELIVERED"));
  bus.setEnabled("yes");
  assert.equal(bus.isEnabled(), false, "only literal true enables");
  bus.setEnabled(true);
  assert.equal(bus.submitRequest({ from: "kitto", submission: show() }).decision, "EXECUTED");
});

test("missing handler: allowed intent without a handler FAILS with NO_HANDLER", () => {
  const bus = createMessageBus({ handlers: {} });
  const result = bus.submitRequest({ from: "kitto", submission: show() });
  assert.deepEqual([result.decision, result.reason], ["FAILED", "NO_HANDLER"]);
});

test("handler error: FAILED / HANDLER_ERROR", () => {
  const bus = createMessageBus({ handlers: { SHOW_OWN_BUBBLE: () => { throw new Error("boom"); } } });
  const result = bus.submitRequest({ from: "kitto", submission: show() });
  assert.deepEqual([result.decision, result.reason], ["FAILED", "HANDLER_ERROR"]);
});

test("reentrancy: a handler cannot dispatch; the nested message is never processed", () => {
  let bus;
  let nestedError;
  bus = createMessageBus({
    handlers: {
      SHOW_OWN_BUBBLE: () => {
        try { bus.submitRequest({ from: "doggo", submission: move("doggo") }); }
        catch (error) { nestedError = error; throw error; }
      }
    }
  });
  const result = bus.submitRequest({ from: "kitto", submission: show() });
  assert.match(String(nestedError), /already dispatching/);
  assert.deepEqual([result.decision, result.reason], ["FAILED", "HANDLER_ERROR"]);
  assert.equal(bus.ledger.snapshot().length, 1, "no record for the nested attempt");
  assert.equal(bus.ledger.snapshot()[0].intent, "SHOW_OWN_BUBBLE");

  let eventError;
  const bus2 = createMessageBus({
    handlers: { SHOW_OWN_BUBBLE: () => { try { bus2.emitEvent({ from: "kitto", intent: "PET_INTERACTED", payload: {} }); } catch (e) { eventError = e; } } }
  });
  bus2.submitRequest({ from: "kitto", submission: show() });
  assert.match(String(eventError), /already dispatching/);
  assert.ok(!bus2.ledger.snapshot().some((entry) => entry.type === "EVENT"));
});

test("ledger: in-memory ring of 500 final records, oldest dropped", () => {
  const { bus, ledger } = setup();
  for (let i = 0; i < 501; i++) bus.submitRequest({ from: "kitto", submission: move() });
  assert.equal(ledger().length, 500);
  assert.equal(ledger()[0].msgId, "msg-2");
  assert.equal(ledger()[499].msgId, "msg-501");
  const small = createMessageBus({ ledgerSize: 3 });
  for (let i = 0; i < 5; i++) small.submitRequest({ from: "kitto", submission: move() });
  assert.deepEqual(small.ledger.snapshot().map((e) => e.msgId), ["msg-3", "msg-4", "msg-5"]);
});

test("ledger values are sanitised: forged strings never appear in records", () => {
  const { bus, ledger } = setup();
  bus.submitRequest({ from: "kitto", submission: { to: "do anything", type: "SHOUT", intent: "WHATEVER", payload: {} } });
  const [entry] = ledger();
  assert.deepEqual([entry.to, entry.type, entry.intent], [null, null, null]);
  assert.ok(Object.values(entry).every((value) => value === null || typeof value !== "string" || !/anything|SHOUT|WHATEVER/.test(value)));
});

test("ids and timestamps are generated by the bus", () => {
  const bus = createMessageBus({ now: () => 4242, newId: () => "fixed-id", handlers: { SHOW_OWN_BUBBLE() {} } });
  const result = bus.submitRequest({ from: "kitto", submission: show() });
  assert.equal(result.msgId, "fixed-id");
  assert.equal(bus.ledger.snapshot()[0].ts, 4242);
});

test("bus:send handler: main stamps the real sender; house, sub-frames and strangers rejected", async () => {
  const { bus, calls, ledger } = setup();
  const windows = Object.fromEntries(CREW_IDS.map((id) => [id, { id }]));
  const house = { id: "house" };
  const mainFrame = { frame: "main" };
  const handler = createBusSendHandler({
    bus,
    getSenderWindow: (sender) => sender.win,
    isCrewWindow: (win) => Object.values(windows).includes(win),
    getCharacter: (win) => win.id
  });
  const event = (win, frame = mainFrame) => ({ sender: { win, mainFrame }, senderFrame: frame });

  for (const bad of [event(null), event(house), event({ id: "kitto" }), event(windows.kitto, { frame: "sub" })]) {
    await assert.rejects(handler(bad, show()), /Bus request rejected/);
  }
  assert.equal(ledger().length, 0, "rejected senders never reach the bus");

  const ok = await handler(event(windows.kitto), show("doggo"));
  assert.equal(ok.decision, "EXECUTED");
  assert.equal(ledger()[0].from, "kitto");

  const forged = await handler(event(windows.kitto), { ...show("doggo"), from: "beeo" });
  assert.deepEqual([forged.decision, forged.reason], ["INVALID", "UNEXPECTED_FIELD"]);

  const rendererEvent = await handler(event(windows.kitto), { to: "doggo", type: "EVENT", intent: "PET_INTERACTED", payload: {} });
  assert.deepEqual([rendererEvent.decision, rendererEvent.reason], ["INVALID", "TYPE_MISMATCH"]);
  assert.ok(!ledger().some((entry) => entry.decision === "DELIVERED"), "renderers cannot emit events");

  const denied = await handler(event(windows.kitto), move("doggo"));
  assert.deepEqual([denied.decision, denied.reason], ["DENIED", "NO_CAPABILITY"]);
  assert.equal(calls.MOVE_BEEO.length, 0);
  assert.equal(calls.SHOW_OWN_BUBBLE.length, 1);
});

test("renderer: receiver-owned templates match the schema; only own keys shown; demo gated", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const source = html.match(/const bubbleTemplates = (\{[\s\S]*?\n    \});/);
  assert.ok(source, "bubbleTemplates not found");
  const templates = Function(`return (${source[1]});`)();
  assert.deepEqual(Object.keys(templates), ["doggo"], "only DOGGØ can show a bus bubble");
  assert.deepEqual(Object.keys(templates.doggo), [...INTENT_MAP.SHOW_OWN_BUBBLE.payload.messageKey]);
  assert.match(html, /Object\.hasOwn\(bubbleTemplates, requested\)/);
  assert.match(html, /!Object\.hasOwn\(own, messageKey\)/);
  assert.match(html, /requested === "kitto" && new URLSearchParams\(window\.location\.search\)\.get\("busDemo"\) === "1"/);
  assert.doesNotMatch(html, /window\.crew\.send\(\{[^}]*type: "EVENT"/, "renderer never sends events");
});

test("main: bus wiring, demo flag and the single handler", () => {
  const main = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  assert.match(main, /process\.argv\.includes\("--bus-demo"\)/);
  assert.doesNotMatch(main, /process\.env/, "no environment-variable switches");
  assert.match(main, /BUS_DEMO && character === "kitto"/);
  assert.match(main, /"bus:send",\s*createBusSendHandler\(/);
  assert.match(main, /if \(clicked\) \{\s*crewBus\.emitEvent\(\{\s*from: character,\s*intent: "PET_INTERACTED",\s*payload: \{\}/);
  assert.doesNotMatch(main, /MOVE_BEEO:/, "no move handler exists");
  assert.equal((main.match(/createMessageBus\(/g) || []).length, 1, "one bus");
  const preload = fs.readFileSync(path.join(__dirname, "..", "preload.js"), "utf8");
  assert.doesNotMatch(preload, /setEnabled|snapshot|ledger|localStorage/, "no bus control or ledger in preload");
});

test("source boundaries: bus modules import nothing beyond each other", () => {
  for (const file of ["crew/message-bus.js", "crew/capabilities.js"]) {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    const requires = [...source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
    assert.ok(requires.every((r) => r === "./capabilities"), `${file} requires ${requires}`);
    assert.doesNotMatch(source, /electron|\bfs\b|node:|https?\.|fetch\(|XMLHttpRequest|WebSocket|ollama|router|askLocal|localStorage|setTimeout|setInterval/i, file);
  }
});

test("no free-text payload field exists in any intent schema", () => {
  for (const [intent, spec] of Object.entries(INTENT_MAP)) {
    for (const [field, allowed] of Object.entries(spec.payload)) {
      assert.ok(Array.isArray(allowed) && allowed.length > 0, `${intent}.${field} must be an enum`);
      assert.ok(allowed.every((value) => /^[A-Z][A-Z_]*$/.test(value)), `${intent}.${field} values are keys, not text`);
      assert.doesNotMatch(field, /text|message$|body|content|prompt/i, `${intent}.${field}`);
    }
  }
});
