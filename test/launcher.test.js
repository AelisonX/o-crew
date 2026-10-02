const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  destinationForCharacter,
  resolveDestination,
  launchExternal,
  createLauncherHandler
} = require("../providers/launcher");

const expectedUrls = {
  chatgpt: "https://chatgpt.com/",
  grok: "https://grok.com/",
  gemini: "https://gemini.google.com/",
  claude: "https://claude.ai/"
};

const expectedCharacters = {
  farto: "chatgpt",
  doggo: "grok",
  beeo: "gemini",
  piggo: "claude",
  kitto: null
};

function recorder() {
  const opened = [];
  const open = async (url) => {
    opened.push(url);
  };
  return { opened, open };
}

test("allow-list resolves each destination to its official URL only", async () => {
  for (const [destination, url] of Object.entries(expectedUrls)) {
    assert.equal(resolveDestination(destination), url);

    const { opened, open } = recorder();
    await launchExternal(destination, open);
    assert.deepEqual(opened, [url]);
  }
});

test("unknown, URL-shaped and non-string destinations fail closed", async () => {
  const rejected = [
    "unknown", "evil-url", "Grok", "chatgpt ",
    "https://chatgpt.com/", "https://grok.com/", "https://gemini.google.com/", "https://claude.ai/",
    "https://evil.example/", "javascript:alert(1)", "file:///C:/Windows/System32/calc.exe",
    "__proto__", "constructor", "toString", "hasOwnProperty",
    "", undefined, null, 42, true, {}, ["chatgpt"]
  ];

  for (const destination of rejected) {
    const { opened, open } = recorder();
    await assert.rejects(
      launchExternal(destination, open),
      /Unknown launcher destination/,
      `expected rejection for ${String(destination)}`
    );
    assert.deepEqual(opened, []);
  }
});

test("character launcher mapping: farto/doggo/beeo/piggo, none for kitto", () => {
  for (const [characterId, destination] of Object.entries(expectedCharacters)) {
    assert.equal(destinationForCharacter(characterId), destination, characterId);
  }

  for (const characterId of ["catto", "__proto__", "constructor", "", undefined, null]) {
    assert.equal(destinationForCharacter(characterId), null);
  }
});

test("renderer launcher buttons match the main-process mapping", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const source = html.match(/const launchers = (\{[\s\S]*?\n    \});/);
  assert.ok(source, "launchers map not found in index.html");
  const launchers = Function(`return (${source[1]});`)();

  assert.deepEqual(Object.keys(launchers).sort(), ["beeo", "doggo", "farto", "piggo"]);
  assert.equal(Object.hasOwn(launchers, "kitto"), false);

  for (const [characterId, entry] of Object.entries(launchers)) {
    assert.equal(entry.destination, destinationForCharacter(characterId), characterId);
    assert.equal(new URL(resolveDestination(entry.destination)).host, entry.host, characterId);
  }
});

test("only a crew window's main frame can open its own destination", async () => {
  const windows = Object.fromEntries(
    ["farto", "doggo", "beeo", "piggo", "kitto"].map((id) => [id, { id }])
  );
  const otherWin = { id: "other" };
  const mainFrame = { frame: "main" };
  const subFrame = { frame: "sub" };

  const { opened, open } = recorder();
  const handler = createLauncherHandler({
    getSenderWindow: (sender) => sender.win,
    isCrewWindow: (win) => Object.values(windows).includes(win),
    getCharacter: (win) => win.id,
    open
  });

  const event = (win, frame = mainFrame) => ({
    sender: { win, mainFrame },
    senderFrame: frame
  });

  await assert.rejects(handler(event(null), "chatgpt"), /Launcher request rejected/);
  await assert.rejects(handler(event(otherWin), "chatgpt"), /Launcher request rejected/);
  await assert.rejects(handler(event(windows.farto, subFrame), "chatgpt"), /Launcher request rejected/);

  await assert.rejects(handler(event(windows.farto), "https://chatgpt.com/"), /Unknown launcher destination/);
  await assert.rejects(handler(event(windows.farto), "grok"), /not allowed for this crew member/);
  await assert.rejects(handler(event(windows.doggo), "chatgpt"), /not allowed for this crew member/);

  for (const destination of Object.keys(expectedUrls)) {
    await assert.rejects(handler(event(windows.kitto), destination), /not allowed for this crew member/);
  }

  assert.deepEqual(opened, []);

  for (const [characterId, destination] of Object.entries(expectedCharacters)) {
    if (!destination) continue;
    assert.equal(await handler(event(windows[characterId]), destination), undefined);
  }

  assert.deepEqual(opened, [
    "https://chatgpt.com/",
    "https://grok.com/",
    "https://gemini.google.com/",
    "https://claude.ai/"
  ]);
});
