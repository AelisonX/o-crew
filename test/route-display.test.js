const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const localOllama = require("../providers/local-ollama");
const { destinationForCharacter } = require("../providers/launcher");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function extract(name) {
  const source = html.match(new RegExp(`const ${name} = (\\{[\\s\\S]*?\\});`));
  assert.ok(source, `${name} not found in index.html`);
  return Function(`return (${source[1]});`)();
}

test("local route label matches the configured local model", () => {
  const localRoute = extract("localRoute");

  assert.equal(localRoute.label, "LOCAL");
  assert.equal(localRoute.name, "Qwen 2.5 7B");
  assert.equal(localRoute.model, localOllama.config.model);
  assert.match(html, /routeLabel\.textContent = localRoute\.label \+ " · " \+ localRoute\.name;/);
});

test("portal labels: ChatGPT, Grok, Gemini, Claude, none for kitto", () => {
  const launchers = extract("launchers");
  const expected = {
    farto: "ChatGPT",
    doggo: "Grok",
    beeo: "Gemini",
    piggo: "Claude",
    kitto: undefined
  };

  for (const [characterId, name] of Object.entries(expected)) {
    assert.equal(launchers[characterId]?.name, name, characterId);
    assert.equal(launchers[characterId]?.destination ?? null, destinationForCharacter(characterId), characterId);
  }

  assert.match(html, /launcherButton\.textContent = "PORTAL · " \+ petLauncher\.name \+ " ↗";/);
});

test("portal wording never implies the provider receives the chat", () => {
  const block = html.match(/const localRoute = [\s\S]*?\n    \/\/ Separate storage keys/);
  assert.ok(block, "route/launcher block not found");
  assert.doesNotMatch(block[0], /MODEL:|USING|Ask |ASK /);
  assert.match(block[0], /Nothing from this chat is sent\./);
});
