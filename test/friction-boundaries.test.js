const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

const frictionModule = read("crew/kitto-friction.js");
const main = read("main.js");
const preload = read("preload.js");
const html = read("index.html");
const pkg = JSON.parse(read("package.json"));

const rendererFriction = html.match(/KITTØ SCREEN FRICTION[\s\S]*?function resumeKittoStateMachine/);

const surveillance = [
  /globalShortcut/, /desktopCapturer/, /powerMonitor/, /getSystemIdle/, /child_process/,
  /getUserMedia/, /systemPreferences/, /iohook/i, /uiohook/i,
  /getFocusedWindow/, /active-?win/i, /screenshot/i
];

const lockout = [
  /setIgnoreMouseEvents/, /setFocusable\(\s*false/, /setMovable\(\s*false/, /\.focus\(/, /\bdialog\b/,
  /\bNotification\b/, /setAlwaysOnTop\(\s*true\s*,\s*["']screen-saver/, /setKiosk/, /setFullScreen/, /blockInput/
];

test("friction module is pure: no requires, no timers, no storage", () => {
  assert.doesNotMatch(frictionModule, /require\(/);
  assert.doesNotMatch(frictionModule, /setTimeout|setInterval|localStorage|writeFile|readFile/);
});

test("no surveillance capability in friction, main process or preload", () => {
  assert.ok(rendererFriction, "renderer friction block not found");
  for (const [name, source] of Object.entries({ frictionModule, main, preload, rendererFriction: rendererFriction[0] })) {
    for (const pattern of surveillance) {
      assert.doesNotMatch(source, pattern, `${name} must not use ${pattern}`);
    }
  }
});

test("no authority or lockout capability in friction, main process or preload", () => {
  for (const [name, source] of Object.entries({ frictionModule, main, preload, rendererFriction: rendererFriction[0] })) {
    for (const pattern of lockout) {
      assert.doesNotMatch(source, pattern, `${name} must not use ${pattern}`);
    }
  }
});

test("renderer friction shows no text, reminder or prompt", () => {
  assert.doesNotMatch(rendererFriction[0], /textContent|innerHTML|alert\(|confirm\(|prompt\(/);
});

test("friction tests use an injected fake clock, never real waits", () => {
  const frictionTests = read("test/kitto-friction.test.js");
  assert.match(frictionTests, /now: clock\.now/);
  assert.doesNotMatch(frictionTests, /setTimeout|setInterval|Date\.now|new Promise|mock\.timers/);
});

test("friction adds no dependencies", () => {
  assert.deepEqual(pkg.dependencies ?? {}, {});
  assert.deepEqual(Object.keys(pkg.devDependencies), ["electron"]);
});

test("only a completed KITTØ drag restarts the session; other pets just note interaction", () => {
  const calls = main.match(/kittoFriction\.restartSession\(\)/g) || [];
  assert.equal(calls.length, 1);
  assert.match(
    main,
    /if \(\s*character === "kitto" &&\s*!clicked\s*\) \{\s*kittoFriction\.restartSession\(\);\s*\}\s*else \{\s*noteCrewInteraction\(\);\s*\}/
  );
});

test("panel signal carries only a boolean; main derives the pet from the sender", () => {
  assert.match(preload, /"pet:panel",\s*open === true/);
  const handler = main.match(/"pet:panel",[\s\S]*?\n\);/);
  assert.ok(handler, "pet:panel handler not found");
  assert.match(handler[0], /crewCharacters\.get\(win\) !== "kitto"/);
  assert.match(handler[0], /event\.senderFrame !==\s*event\.sender\.mainFrame/);
});
