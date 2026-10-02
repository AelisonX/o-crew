/*
  --------------------------------
  LOCAL PROVIDER · OLLAMA
  --------------------------------
*/

const config = {
  baseUrl:
    "http://127.0.0.1:11434",

  model:
    "qwen2.5:7b",

  timeoutMs:
    60000
};

async function ask(prompt) {
  const safePrompt =
    String(prompt ?? "").trim();

  if (!safePrompt) {
    throw new Error(
      "Prompt is empty."
    );
  }

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      config.timeoutMs
    );

  try {
    const response =
      await fetch(
        `${config.baseUrl}/api/generate`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            model: config.model,
            prompt: safePrompt,
            stream: false
          }),

          signal:
            controller.signal
        }
      );

    if (!response.ok) {
      throw new Error(
        `Ollama HTTP ${response.status}`
      );
    }

    const data =
      await response.json();

    return String(
      data?.response ?? ""
    ).trim();
  }

  finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  config,
  ask
};
