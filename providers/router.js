/*
  --------------------------------
  AI ROUTER
  --------------------------------

  Character → mode → provider.
  Every crew member routes to LOCAL for now.
  Unknown or missing crew members are rejected.
*/

const localOllama =
  require("./local-ollama");

const MODES = {
  LOCAL: "LOCAL"
};

const characterModes = {
  doggo: MODES.LOCAL,
  kitto: MODES.LOCAL,
  piggo: MODES.LOCAL,
  beeo: MODES.LOCAL,
  farto: MODES.LOCAL
};

const providers = {
  [MODES.LOCAL]: localOllama
};

async function routeAiRequest({
  characterId,
  prompt
}) {
  if (
    !Object.hasOwn(
      characterModes,
      characterId
    )
  ) {
    throw new Error(
      `Unknown crew member: ${String(characterId)}.`
    );
  }

  const mode =
    characterModes[characterId];

  const provider =
    providers[mode];

  if (!provider) {
    throw new Error(
      `No provider for mode ${mode}.`
    );
  }

  return provider.ask(prompt);
}

module.exports = {
  MODES,
  routeAiRequest
};
