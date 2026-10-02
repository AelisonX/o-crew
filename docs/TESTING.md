# Before sharing a demo

1. Run `npm test` and start Ollama with `qwen2.5:7b` installed.
2. Run `npm start`; confirm all five images and Ø-House appear. Run `npm start` again and confirm it exits without creating a second crew.
3. For each character, click **Try my job**, review the sample, and press **Send**. Check its reply fits the advertised job.
4. Ask a follow-up referring to the previous answer. Save a harmless test preference in Memory, restart, and check recall.
5. Confirm one character does not know a preference saved only in another character's memory.
6. Check **New chat** retains saved notes and **Forget all** removes both history and notes for only that character.
7. Drag each character before and during chat. Dragging must not toggle the panel. Close the panel and check normal animation resumes.
8. Check long replies scroll, Chinese text input works, and **Esc** / **×** dismiss the panel. A reply arriving after dismissal must not reopen it.
9. Hide/show the crew with Ø-House. Check chat and animations recover.
10. Stop Ollama, submit a prompt, and confirm a readable error. Restart Ollama and retry.
11. Check every panel shows **LOCAL · Qwen 2.5 7B**. Check FARTØ, DOGGØ, BEEØ and PIGGØ each show one **PORTAL** button that opens ChatGPT, Grok, Gemini and Claude respectively in the default browser, and that KITTØ has no portal button.
12. KITTØ screen friction uses a 3-hour threshold by default, so it is impractical to wait for in a short demo; its timing is covered by `npm test` with a simulated clock. If you see KITTØ travelling to or lying in the centre of the screen, click or drag it away and confirm it stays put and normal behaviour resumes.

## Demo claims

Show or describe this as an early local desktop prototype. A generated concept video should be labelled as such; it is not proof of actual app behaviour. The current app assists with provided text and does not browse, access personal files, or coordinate a team automatically. Portal buttons only open an official AI website in the user's own browser; they do not send the Ø-CREW conversation there.
