/*
  --------------------------------
  LAUNCHER
  --------------------------------

  Opens an official web UI in the
  system browser. Not an AI provider:
  nothing is sent, read or captured.

  Callers pass a symbolic destination;
  URLs never come from the renderer.
  Unknown destinations are rejected.

  Each crew member may open only its
  own destination; KITTØ has none.
*/

const destinations = {
  chatgpt: "https://chatgpt.com/",
  grok: "https://grok.com/",
  gemini: "https://gemini.google.com/",
  claude: "https://claude.ai/"
};

const launcherForCharacter = {
  farto: "chatgpt",
  doggo: "grok",
  beeo: "gemini",
  piggo: "claude"
};

function destinationForCharacter(characterId) {
  return Object.hasOwn(
    launcherForCharacter,
    characterId
  )
    ? launcherForCharacter[characterId]
    : null;
}

function resolveDestination(destination) {
  if (
    typeof destination !== "string" ||
    !Object.hasOwn(
      destinations,
      destination
    )
  ) {
    throw new Error(
      `Unknown launcher destination: ${String(destination)}.`
    );
  }

  return destinations[destination];
}

function defaultOpen(url) {
  const { shell } =
    require("electron");

  return shell.openExternal(url);
}

async function launchExternal(
  destination,
  open = defaultOpen
) {
  const url =
    resolveDestination(destination);

  await open(url);

  return url;
}

/*
  IPC handler factory: only the main
  frame of a crew window may launch,
  and only its own destination.
*/

function createLauncherHandler({
  getSenderWindow,
  isCrewWindow,
  getCharacter,
  open = defaultOpen
}) {
  return async (
    event,
    destination
  ) => {
    const senderWindow =
      getSenderWindow(
        event.sender
      );

    if (
      !senderWindow ||
      !isCrewWindow(
        senderWindow
      ) ||
      event.senderFrame !==
        event.sender.mainFrame
    ) {
      throw new Error(
        "Launcher request rejected."
      );
    }

    resolveDestination(destination);

    if (
      destinationForCharacter(
        getCharacter(senderWindow)
      ) !== destination
    ) {
      throw new Error(
        "Launcher destination not allowed for this crew member."
      );
    }

    await launchExternal(
      destination,
      open
    );
  };
}

module.exports = {
  destinationForCharacter,
  resolveDestination,
  launchExternal,
  createLauncherHandler
};
