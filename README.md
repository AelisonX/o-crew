# Ø-CREW

**Five tiny desktop companions. Five useful jobs. One local AI, plus optional web portals.**

An early Windows desktop prototype by AISØN: animated characters that roam, rest, respond to clicks, and help with small writing and planning tasks using Qwen through Ollama.

Ø-CREW is being explored as a **local-first hybrid AI system**: routine tasks should use the smallest sufficient model where practical, while more capable services stay explicit and visible.

Today that means: every in-app chat runs on a local model, and four characters can also open an official AI website in your normal browser. There is no cloud API integration.

<p align="center">
  <img src="DOGG%C3%98.png" width="130" alt="DOGGØ" />
  <img src="PIGG%C3%98.png" width="130" alt="PIGGØ" />
  <img src="FART%C3%98.png" width="130" alt="FARTØ" />
  <img src="KITT%C3%98.png" width="130" alt="KITTØ" />
  <img src="BEE%C3%98.png" width="130" alt="BEEØ" />
</p>

## Meet the crew

| Character | Job | Try asking | Web portal |
| --- | --- | --- | --- |
| DOGGØ | Action planner | “Turn my idea into three practical steps.” | Grok |
| PIGGØ | Idea explorer | “Give me three unusual angles for this video.” | Claude |
| FARTØ | Task organiser | “Sort these messy notes into priorities.” | ChatGPT |
| KITTØ | Language editor (Traditional Chinese specialist) | “Polish this paragraph without changing its meaning.” | none |
| BEEØ | Creative companion | “Write three playful captions for this.” | Gemini |

Each character has a distinct prompt and its own conversation history and saved notes. All five currently use the **same `qwen2.5:7b` model**; these are role-based companions, not five separately trained models.

Replies default to English. Ask for another language in your message (for example “reply in Chinese”) and the character should follow it. Chinese replies are instructed to use Traditional characters unless you ask for Simplified, although the local 7B model occasionally slips into Simplified in casual chat. Editing or translation tasks use whatever language the task needs.

## What works today

- Character animations, dragging, and individual idle/rest/movement routines.
- Click a character to open its compact AI panel; close with **×** or **Esc**.
- **Try my job** prepares an editable example. Press **Send** to run it.
- Local Qwen replies with a thinking indicator and a scrollable response.
- Separate local memory for each character, retained across normal app restarts.
- Each panel shows where its chat replies come from: **LOCAL · Qwen 2.5 7B**.
- Four characters have a **PORTAL** button that opens an official AI website (see below).
- **Ø-House** hides or shows the crew together.
- **KITTØ screen friction** (experimental, see below).
- **Message Bus v0.1** for governed pet-to-pet requests and events (experimental, see below).

This version works from the text you provide. It does **not** read your files, control other apps, monitor social feeds, or automatically pass tasks between characters.

### Local AI and web portals

These are two different things:

**Local AI — all five characters.** Every message you send in a character's panel goes to your own Ollama server and is answered by `qwen2.5:7b`. The panel label reads **LOCAL · Qwen 2.5 7B**.

**Web portals — four characters.** A **PORTAL** button opens an official AI website in your normal browser:

| Character | Button | Opens |
| --- | --- | --- |
| FARTØ | PORTAL · ChatGPT ↗ | `https://chatgpt.com/` |
| DOGGØ | PORTAL · Grok ↗ | `https://grok.com/` |
| BEEØ | PORTAL · Gemini ↗ | `https://gemini.google.com/` |
| PIGGØ | PORTAL · Claude ↗ | `https://claude.ai/` |
| KITTØ | — | no portal |

A portal is only a shortcut. **Opening a portal does not send the current Ø-CREW conversation, memory, or notes to that service.** Ø-CREW does not log in for you, read the website, capture its replies, or use paid model APIs. Anything you do on that website happens in your browser, under that service's own account and terms.

The app opens only these fixed addresses, and each character can open only its own. There is currently **no direct cloud-model API routing**.

### KITTØ screen friction (experimental)

After a long active Ø-CREW session, KITTØ may slowly move to the centre of its current display and lie down.

- An "active session" is built only from your interactions with Ø-CREW itself: clicking or dragging a character, sending a chat message, opening a portal, or showing the crew with Ø-House.
- Current defaults: **3-hour active-session threshold**, **30-minute inactivity reset**, **30-minute cooldown** after you move KITTØ away.
- The behaviour is deterministic and rule-based. No language model decides when it happens.
- Click or drag KITTØ away at any time. It stays where you put it and does not come straight back. Dragging KITTØ somewhere during normal use also restarts its full grace period.
- There is no message, reminder, notification, or lockout. KITTØ is just in the way.

This is a playful design experiment, not health advice or a productivity recommendation. The design principle is **friction ≠ authority**: a small inconvenience you can always dismiss, never a rule.

### Message Bus v0.1 (experimental)

A small, rule-based channel for one pet to send another an event or a request.

- **Governed requests and events.** Only a fixed list of intents exists. Events come only from things the app itself observed (for example, a real click on KITTØ).
- **Receiver-owned capabilities.** A request is allowed only if the *receiving* pet holds the capability for that intent. The sender's capabilities are never part of the decision.
- **Sender identity is stamped by the main process** from the real app window, never taken from the message.
- **No free-form agent chat.** Messages carry fixed keys, not text; each pet owns the wording it shows.
- **No LLM makes permission decisions.** Every decision is recorded in an in-memory log that is not saved.

In normal use the bus is mostly invisible. A developer demo (`npm start -- --bus-demo`) shows one allowed request (DOGGØ shows its own speech bubble) and one denied request (a request to move BEEØ is refused).

**Known boundary.** The message bus enforces request/authority boundaries. The current pet renderers still share one localStorage origin/session, so per-character memory keys are namespaced rather than mechanically isolated. See [the boundary audit](docs/BOUNDARY_AUDIT.md).

## Design direction: local-first hybrid AI

Ø-CREW is not intended to send every task to the largest available model.

The design direction is simple:

> **Use the smallest sufficient intelligence for the task.**

Routine, lightweight, or privacy-sensitive tasks stay on local models. The current web portals are a deliberately simple first step: they hand you over to another service visibly, rather than routing your chat there behind the scenes.

Direct optional cloud-model routes (through official APIs) may be explored later. If they are added, the intended design is to keep routing visible rather than silently treating every model as interchangeable.

For example:

```text
routine task
    ↓
local model

complex task
    ↓
optional, visible external route
```

Direct API routing is future work, not a feature of the current prototype.

## Privacy and data boundaries

In-app chat requests are sent only to the user's own Ollama server at:

```text
http://127.0.0.1:11434
```

The application itself does not send prompts, conversation history, or saved notes to a cloud AI service. Portal buttons open a fixed official website in your default browser; nothing from Ø-CREW is attached.

KITTØ screen friction observes only Ø-CREW's own interactions. It does **not** monitor global keyboard input, global mouse activity, screen contents, active applications or windows, operating-system idle time, files, the camera, or the microphone. Its session state lives in memory only and resets when the app restarts.

Installation and model downloads still require internet access, and third-party software such as Node.js, Electron, Ollama, your browser, the websites opened by portals, and operating-system services have their own network behaviour and terms.

Local conversation history and saved notes are stored in the application's local browser storage. They are **not encrypted**.

If direct cloud-model routes are introduced later, the README and interface should identify which requests remain local and which requests are sent to an external service. The project therefore does not make a blanket claim that all future Ø-CREW activity will always remain entirely on-device.

## Run the prototype

This is a source-code release, not a packaged installer. Windows is the development platform; macOS and Linux have not been verified.

1. Install a current LTS version of [Node.js](https://nodejs.org/) and [Ollama](https://ollama.com/download).
2. Open Ollama. In a terminal, download the model once:

   ```sh
   ollama pull qwen2.5:7b
   ```

3. Download this repository using **Code → Download ZIP**, then extract it. Keep the PNG files beside `index.html` with their original names.
4. Open a terminal in the extracted project folder:

   ```sh
   npm ci
   npm start
   ```

The five characters and Ø-House should appear. Click a character, choose **Try my job**, and press **Send**.

After setup, the current prototype performs model inference through your local Ollama server. Performance depends on your hardware and model load time. Try one character at a time for the first demo.

Only one copy of Ø-CREW runs at a time: starting it again while it is open exits quietly instead of creating a second, overlapping crew.

Opening `index.html` directly in a browser or hosting it on GitHub Pages does not provide the Electron desktop or AI bridge.

## Memory controls

- Successful exchanges are saved automatically, up to **12 recent pairs** within a **16,000-character history budget**. Older context is dropped as the limit is reached.
- **Memory → Save** stores up to 2,000 characters of facts/preferences you enter explicitly. Chatting does not automatically extract permanent facts.
- **New chat** clears that character's recent exchanges and keeps its saved notes.
- **Forget all** clears that character's chat and saved notes; other characters are unaffected.

Memory uses the app's local browser storage, outside this repository. It is not encrypted or synchronised between computers. Moving the app to another location or clearing its browser profile can affect whether previous storage is available. A storage error is shown in the panel instead of silently claiming the data was saved.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| “Could not reach local Qwen” | Keep Ollama running; use `ollama list` to check that `qwen2.5:7b` is installed. If no Ollama server is running, start the Ollama app or use `ollama serve`. |
| First response is slow | Loading a 7B model can take time. Responses time out after 60 seconds; retry after the model has loaded. |
| “Local AI is unavailable” | Start with `npm start`, not by double-clicking the HTML. Keep `preload.js` beside `main.js`. |
| Portal button shows “Couldn't open” | Check that a default web browser is set in your operating system. |
| `npm start` returns immediately and no crew appears | Ø-CREW is probably already running; look for the existing crew or Ø-House. |
| KITTØ is lying in the middle of the screen | Click or drag KITTØ away. |
| Missing character images | Extract the whole project and preserve PNG filenames, including `Ø` and capitalisation. |
| Memory does not persist | Check the panel's save status and use the same app installation/profile. |
| Need to quit | Close the terminal process with **Ctrl+C**. This prototype has no tray-menu quit button. |

## Checks and project layout

```sh
npm test
```

Runs 80 automated checks with Node's built-in test runner; no extra test packages are needed. They cover local routing for all five characters, the portal allow-list and its sender checks, the visible LOCAL/PORTAL labels, single-instance startup, the KITTØ screen-friction state machine and screen-centre maths using a simulated clock, and the Message Bus permission, sender-identity, and denial rules. Boundary checks confirm the friction code does not use input hooks, screen capture, idle-time monitoring, notifications, or forced focus.

They do not prove a real Ollama response, visual layout, real browser launches, or real Electron window movement; see [the manual checklist](docs/TESTING.md).

```text
index.html                    Characters, animations, AI panels, local memory, route labels
main.js                       Electron windows, dragging, roaming, IPC, single-instance lock, KITTØ friction movement
preload.js                    Small renderer-to-Electron bridge
house.html                    Show/hide control
providers/router.js           Routes each character's chat to its provider (currently all LOCAL)
providers/local-ollama.js     Local Ollama / qwen2.5:7b requests
providers/launcher.js         Portal allow-list and per-character portal checks
crew/kitto-friction.js        KITTØ screen-friction state machine (no Electron, no timers, no storage)
crew/capabilities.js          Message Bus capability registry, intents, subscriptions, can(actor, capability)
crew/message-bus.js           Message Bus: validation, permission check, handlers, in-memory log (no Electron)
test/                         Automated checks (node --test)
docs/TESTING.md               Manual demo checklist
docs/ASSETS.md                Included artwork and reuse restrictions
docs/BOUNDARY_AUDIT.md        Message Bus v0.1 boundary audit
*.png                         Character artwork and animation frames referenced by the app
```

## Project status and licensing

Early prototype: no installer, automatic updates, or production support commitment yet. Dependency updates, cross-machine testing, and future model-routing experiments remain release work.

This repository is publicly viewable for demonstration, learning, and portfolio purposes, but it is **not open source**.

The project is **UNLICENSED** and all original project materials remain protected. Public availability does not grant permission to redistribute, publish modified versions, sublicense, sell, monetise, or otherwise commercially exploit the source code, characters, names, artwork, animations, or documentation.

See [LICENSE](LICENSE) for the full notice and [the asset inventory](docs/ASSETS.md) for the included PNG files.

Third-party dependencies and models retain their own licences and terms.

Built around a simple principle: **Steward, not emperor.**
