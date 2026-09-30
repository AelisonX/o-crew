# Ø-CREW

**Five tiny desktop companions. Five useful jobs. One local AI — for now.**

An early Windows desktop prototype by AISØN: animated characters that roam, rest, respond to clicks, and help with small writing and planning tasks using Qwen through Ollama.

Ø-CREW is being explored as a **local-first hybrid AI system**: routine tasks should use the smallest sufficient model where practical, while more capable cloud models may later be added as explicit, visible routes for tasks that genuinely need them.

The current prototype is still fully local. Hybrid routing is a design direction, not a feature claim.

<p align="center">
  <img src="DOGG%C3%98.png" width="130" alt="DOGGØ" />
  <img src="PIGG%C3%98.png" width="130" alt="PIGGØ" />
  <img src="FART%C3%98.png" width="130" alt="FARTØ" />
  <img src="KITT%C3%98.png" width="130" alt="KITTØ" />
  <img src="BEE%C3%98.png" width="130" alt="BEEØ" />
</p>

## Meet the crew

| Character | Job | Try asking |
| --- | --- | --- |
| DOGGØ | Action planner | “Turn my idea into three practical steps.” |
| PIGGØ | Idea explorer | “Give me three unusual angles for this video.” |
| FARTØ | Task organiser | “Sort these messy notes into priorities.” |
| KITTØ | Traditional Chinese editor | “Polish this paragraph without changing its meaning.” |
| BEEØ | Creative companion | “Write three playful captions for this.” |

Each character has a distinct prompt and its own conversation history and saved notes. All five currently use the **same `qwen2.5:7b` model**; these are role-based companions, not five separately trained models.

## What works today

- Character animations, dragging, and individual idle/rest/movement routines.
- Click a character to open its compact AI panel; close with **×** or **Esc**.
- **Try my job** prepares an editable example. Press **Send** to run it.
- Local Qwen replies with a thinking indicator and a scrollable response.
- Separate local memory for each character, retained across normal app restarts.
- **Ø-House** hides or shows the crew together.

This version works from the text you provide. It does **not** browse the web, read your files, control other apps, monitor social feeds, or automatically pass tasks between characters.

There is currently **no cloud-model fallback or cloud-model routing**.

## Design direction: local-first hybrid AI

Ø-CREW is not intended to send every task to the largest available model.

The design direction is simple:

> **Use the smallest sufficient intelligence for the task.**

Routine, lightweight, or privacy-sensitive tasks may stay on local models. Tasks that genuinely benefit from stronger remote models may later be routed to optional cloud services.

If cloud routing is introduced, the intended design is to make that routing visible rather than silently treating every model as interchangeable.

For example:

```text
routine task
    ↓
local model

complex task
    ↓
optional cloud model
```

This is a design goal, not a claim about functionality in the current prototype.

## Privacy and data boundaries

The current prototype sends AI requests only to the user’s own Ollama server at:

```text
http://127.0.0.1:11434
```

The application itself does not currently send prompts to a cloud AI service.

Installation and model downloads still require internet access, and third-party software such as Node.js, Electron, Ollama, operating-system services, or future optional integrations may have their own network behaviour and terms.

Local conversation history and saved notes are stored in the application’s local browser storage. They are **not encrypted**.

Future versions may introduce optional cloud-model routes. If that happens, the README and interface should identify which requests remain local and which requests are sent to an external service.

The project therefore does not make a blanket claim that all future Ø-CREW activity will always remain entirely on-device.

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

Opening `index.html` directly in a browser or hosting it on GitHub Pages does not provide the Electron desktop or AI bridge.

## Memory controls

- Successful exchanges are saved automatically, up to **12 recent pairs** within a **16,000-character history budget**. Older context is dropped as the limit is reached.
- **Memory → Save** stores up to 2,000 characters of facts/preferences you enter explicitly. Chatting does not automatically extract permanent facts.
- **New chat** clears that character’s recent exchanges and keeps its saved notes.
- **Forget all** clears that character’s chat and saved notes; other characters are unaffected.

Memory uses the app’s local browser storage, outside this repository. It is not encrypted or synchronised between computers. Moving the app to another location or clearing its browser profile can affect whether previous storage is available. A storage error is shown in the panel instead of silently claiming the data was saved.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| “Could not reach local Qwen” | Keep Ollama running; use `ollama list` to check that `qwen2.5:7b` is installed. If no Ollama server is running, start the Ollama app or use `ollama serve`. |
| First response is slow | Loading a 7B model can take time. Responses time out after 60 seconds; retry after the model has loaded. |
| “Local AI is unavailable” | Start with `npm start`, not by double-clicking the HTML. Keep `preload.js` beside `main.js`. |
| Missing character images | Extract the whole project and preserve PNG filenames, including `Ø` and capitalisation. |
| Memory does not persist | Check the panel’s save status and use the same app installation/profile. |
| Need to quit | Close the terminal process with **Ctrl+C**. This prototype has no tray-menu quit button. |

## Checks and project layout

```sh
npm test
```

The checks simulate role prompts, isolated memory, reloads, request errors, duplicate submissions, dismissal, and drag/visibility event handling. They do not prove a real Ollama response, visual layout, or Electron window movement; see [the manual checklist](docs/TESTING.md).

```text
index.html          Characters, animations, AI panels and local memory
main.js             Electron windows, dragging, roaming and local Ollama requests
preload.js          Small renderer-to-Electron bridge
house.html          Show/hide control
*.png               Character artwork and animation frames referenced by the app
tests/verify.cjs     Behaviour checks using a simulated bridge
```

## Project status and licensing

Early prototype: no installer, automatic updates, or production support commitment yet. Dependency updates, cross-machine testing, and future model-routing experiments remain release work.

This repository is publicly viewable for demonstration, learning, and portfolio purposes, but it is **not open source**.

The project is **UNLICENSED** and all original project materials remain protected. Public availability does not grant permission to redistribute, publish modified versions, sublicense, sell, monetise, or otherwise commercially exploit the source code, characters, names, artwork, animations, or documentation.

See [LICENSE](LICENSE) for the full notice and [the asset inventory](docs/ASSETS.md) for the included PNG files.

Third-party dependencies and models retain their own licences and terms.

Built around a simple principle: **Steward, not emperor.**