const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const main = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

test("main process requests the single-instance lock once, before startup", () => {
  const lockCalls = main.match(/app\.requestSingleInstanceLock\(\)/g) || [];
  assert.equal(lockCalls.length, 1);

  const lockAt = main.indexOf("app.requestSingleInstanceLock()");
  assert.ok(lockAt < main.indexOf("ipcMain.handle("), "lock must come before IPC registration");
  assert.ok(lockAt < main.indexOf("app.whenReady()"), "lock must come before whenReady");
});

test("a second instance quits and never creates a crew", () => {
  assert.match(main, /if \(!hasInstanceLock\) \{\s*app\.quit\(\);\s*\}/);

  const ready = main.slice(main.indexOf("app.whenReady()"));
  const guardAt = ready.indexOf("if (!hasInstanceLock)");
  assert.ok(guardAt !== -1, "whenReady must check the lock");
  assert.ok(guardAt < ready.indexOf("createCrew();"), "guard must run before createCrew");
  assert.ok(guardAt < ready.indexOf("createHouse();"), "guard must run before createHouse");
});

test("second launch does not focus, show or move existing windows", () => {
  assert.doesNotMatch(main, /second-instance/);
});
