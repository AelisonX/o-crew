const test = require("node:test");
const assert = require("node:assert/strict");

const localOllama = require("../providers/local-ollama");
const { MODES, routeAiRequest } = require("../providers/router");

test("local provider configuration is unchanged", () => {
  assert.equal(localOllama.config.baseUrl, "http://127.0.0.1:11434");
  assert.equal(localOllama.config.model, "qwen2.5:7b");
  assert.equal(localOllama.config.timeoutMs, 60000);
});

test("all five crew members route to LOCAL", async (t) => {
  const calls = [];
  t.mock.method(localOllama, "ask", async (prompt) => {
    calls.push(prompt);
    return "local reply";
  });

  assert.deepEqual(Object.keys(MODES), ["LOCAL"]);

  for (const characterId of ["doggo", "kitto", "piggo", "beeo", "farto"]) {
    assert.equal(
      await routeAiRequest({ characterId, prompt: `hi ${characterId}` }),
      "local reply"
    );
  }

  assert.deepEqual(calls, ["hi doggo", "hi kitto", "hi piggo", "hi beeo", "hi farto"]);
});

test("unknown or missing crew members are rejected", async (t) => {
  const ask = t.mock.method(localOllama, "ask", async () => "should not run");

  await assert.rejects(routeAiRequest({ characterId: "catto", prompt: "hi" }), /Unknown crew member: catto\./);
  await assert.rejects(routeAiRequest({ characterId: "constructor", prompt: "hi" }), /Unknown crew member/);
  await assert.rejects(routeAiRequest({ prompt: "hi" }), /Unknown crew member: undefined\./);
  assert.equal(ask.mock.callCount(), 0);
});

test("AI routing is independent of the launcher", () => {
  const routerSource = require("node:fs").readFileSync(require.resolve("../providers/router"), "utf8");
  assert.doesNotMatch(routerSource, /launcher|openExternal|shell/);
});

test("empty prompt keeps the existing error", async () => {
  await assert.rejects(
    routeAiRequest({ characterId: "doggo", prompt: "   " }),
    /Prompt is empty\./
  );
});
