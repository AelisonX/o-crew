const {
  app,
  BrowserWindow,
  ipcMain,
  screen
} = require("electron");

const path = require("path");

/*
  --------------------------------
  LOCAL AI
  --------------------------------
*/

async function askLocalModel(prompt) {
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
      60000
    );

  try {
    const response =
      await fetch(
        "http://127.0.0.1:11434/api/generate",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            model: "qwen2.5:7b",
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

ipcMain.handle(
  "ai:ask-local",
  async (event, prompt) => {
    const senderWindow =
      BrowserWindow.fromWebContents(
        event.sender
      );

    if (
      !senderWindow ||
      !crewWindows.includes(
        senderWindow
      )
    ) {
      throw new Error(
        "Local AI request rejected."
      );
    }

    return askLocalModel(prompt);
  }
);
const crewWindows = [];

let houseWindow = null;
let crewHidden = false;

function createPetWindow(
  character,
  x,
  y
) {
  const win =
    new BrowserWindow({
      x,
      y,
      width: 256,
      height: 256,
      transparent: true,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      hasShadow: false,

      webPreferences: {
        preload:
          path.join(
            __dirname,
            "preload.js"
          ),

        contextIsolation: true,
        nodeIntegration: false
      }
    });

  win.setSkipTaskbar(true);

  win.loadFile(
    path.join(
      __dirname,
      "index.html"
    ),
    {
      query: {
        character
      }
    }
  );

  crewWindows.push(win);



  /*
    --------------------------------
    MANUAL DRAG
    --------------------------------
  */

  let gesture = null;

  function updateGesture() {
    if (
      !gesture ||
      win.isDestroyed()
    ) {
      return;
    }

    const cursor =
      screen.getCursorScreenPoint();

    const dx =
      cursor.x -
      gesture.cursor.x;

    const dy =
      cursor.y -
      gesture.cursor.y;

    if (
      Math.hypot(dx, dy) >= 6
    ) {
      gesture.dragged = true;
    }

    if (gesture.dragged) {
      win.setPosition(
        gesture.x + dx,
        gesture.y + dy
      );
    }
  }

  function stopGesture() {
    if (!gesture) {
      return;
    }

    clearInterval(
      gesture.timer
    );

    gesture = null;
  }

  function handleGesture(
    event,
    action
  ) {
    if (
      event.sender !==
        win.webContents ||
      event.senderFrame !==
        win.webContents.mainFrame
    ) {
      return;
    }

    if (action === "start") {
      stopRoam();
      stopGesture();

      const [currentX, currentY] =
        win.getPosition();

      gesture = {
        x: currentX,
        y: currentY,

        cursor:
          screen.getCursorScreenPoint(),

        dragged: false
      };

      gesture.timer =
        setInterval(
          updateGesture,
          16
        );
    }

    else if (
      action === "end" &&
      gesture
    ) {
      updateGesture();

      const clicked =
        !gesture.dragged;

      stopGesture();

      if (clicked) {
        win.webContents.send(
          "pet:toggle"
        );
      }
    }

    else if (
      action === "cancel"
    ) {
      stopGesture();
    }
  }

  ipcMain.on(
    "pet:gesture",
    handleGesture
  );

  /*
    --------------------------------
    AUTOMATIC ROAM
    --------------------------------
  */

  let roam = null;

  function stopRoam() {
    if (!roam) {
      return;
    }

    clearInterval(
      roam.timer
    );

    roam = null;
  }

  function startRoam(
    direction,
    speed
  ) {
    stopRoam();

    const safeDirection =
      direction === "left"
        ? "left"
        : "right";

    const safeSpeed =
      Math.max(
        1,
        Number(speed) || 100
      );

    roam = {
      direction:
        safeDirection,

      speed:
        safeSpeed,

      lastTime:
        Date.now(),

      timer: null
    };

    roam.timer =
      setInterval(
        updateRoam,
        60
      );
  }

  function updateRoam() {
    if (
      !roam ||
      win.isDestroyed() ||
      crewHidden ||
      gesture
    ) {
      return;
    }

    const now =
      Date.now();

    const dt =
      Math.min(
        0.2,
        (
          now -
          roam.lastTime
        ) / 1000
      );

    roam.lastTime = now;

    const display =
      screen.getDisplayMatching(
        win.getBounds()
      );

    const area =
      display.workArea;

    const [
      currentX,
      currentY
    ] =
      win.getPosition();

    const [
      width
    ] =
      win.getSize();

    const minX =
      area.x;

    const maxX =
      area.x +
      area.width -
      width;

    const sign =
      roam.direction === "right"
        ? 1
        : -1;

    let nextX =
      currentX +
      sign *
      roam.speed *
      dt;

    let changedDirection =
      false;

    if (nextX >= maxX) {
      nextX = maxX;

      roam.direction =
        "left";

      changedDirection =
        true;
    }

    else if (
      nextX <= minX
    ) {
      nextX = minX;

      roam.direction =
        "right";

      changedDirection =
        true;
    }

    win.setPosition(
      Math.round(nextX),
      currentY
    );

    if (
      changedDirection
    ) {
      win.webContents.send(
        "pet:roam-direction",
        roam.direction
      );
    }
  }

  function handleRoamStart(
    event,
    payload
  ) {
    if (
      event.sender !==
        win.webContents ||
      event.senderFrame !==
        win.webContents.mainFrame
    ) {
      return;
    }

    if (
      !["doggo","piggo","farto"].includes(character)
    ) {
      return;
    }

    startRoam(
      payload?.direction,
      payload?.speed
    );
  }

  function handleRoamStop(
    event
  ) {
    if (
      event.sender !==
        win.webContents ||
      event.senderFrame !==
        win.webContents.mainFrame
    ) {
      return;
    }

    stopRoam();
  }

  ipcMain.on(
    "pet:roam-start",
    handleRoamStart
  );

  ipcMain.on(
    "pet:roam-stop",
    handleRoamStop
  );

  /*
    --------------------------------
    CLEANUP
    --------------------------------
  */

  win.on(
    "blur",
    stopGesture
  );

  win.webContents.on(
    "did-start-loading",
    () => {
      stopGesture();
      stopRoam();
    }
  );

  win.on(
    "closed",
    () => {
      stopGesture();
      stopRoam();

      ipcMain.removeListener(
        "pet:gesture",
        handleGesture
      );

      ipcMain.removeListener(
        "pet:roam-start",
        handleRoamStart
      );

      ipcMain.removeListener(
        "pet:roam-stop",
        handleRoamStop
      );

      const index =
        crewWindows.indexOf(win);

      if (index !== -1) {
        crewWindows.splice(
          index,
          1
        );
      }
    }
  );
}

function createCrew() {
  const area =
    screen
      .getPrimaryDisplay()
      .workArea;

  const gap = 16;
  const size = 256;

  const crew = [
    "doggo",
    "kitto",
    "beeo",
    "farto",
    "piggo"
  ];

  const columns =
    Math.max(
      1,
      Math.min(
        crew.length,

        Math.floor(
          (
            area.width +
            gap
          ) /
          (
            size +
            gap
          )
        )
      )
    );

  const rows =
    Math.ceil(
      crew.length /
      columns
    );

  const width =
    columns *
    size +
    (
      columns -
      1
    ) *
    gap;

  const height =
    rows *
    size +
    (
      rows -
      1
    ) *
    gap;

  const left =
    area.x +
    Math.max(
      0,

      Math.round(
        (
          area.width -
          width
        ) / 2
      )
    );

  const top =
    area.y +
    Math.max(
      0,

      Math.round(
        (
          area.height -
          height
        ) / 2
      )
    );

  const clampX =
    (value) =>
      Math.min(
        value,

        area.x +
        Math.max(
          0,
          area.width -
          size
        )
      );

  const clampY =
    (value) =>
      Math.min(
        value,

        area.y +
        Math.max(
          0,
          area.height -
          size
        )
      );

  crew.forEach(
    (
      character,
      index
    ) => {
      createPetWindow(
        character,

        clampX(
          left +
          (
            index %
            columns
          ) *
          (
            size +
            gap
          )
        ),

        clampY(
          top +
          Math.floor(
            index /
            columns
          ) *
          (
            size +
            gap
          )
        )
      );
    }
  );
}

function createHouse() {
  const area =
    screen
      .getPrimaryDisplay()
      .workArea;

  const size = 70;
  const margin = 16;

  houseWindow =
    new BrowserWindow({
      width: size,
      height: size,

      x:
        area.x +
        area.width -
        size -
        margin,

      y:
        area.y +
        area.height -
        size -
        margin,

      transparent: true,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      hasShadow: false,

      webPreferences: {
        preload:
          path.join(
            __dirname,
            "preload.js"
          ),

        contextIsolation: true,
        nodeIntegration: false
      }
    });

  houseWindow.setSkipTaskbar(
    true
  );

  houseWindow.loadFile(
    path.join(
      __dirname,
      "house.html"
    )
  );

  houseWindow.on(
    "closed",
    () => {
      houseWindow = null;
    }
  );
}

function toggleCrew() {
  crewHidden =
    !crewHidden;

  for (
    const win
    of crewWindows
  ) {
    if (
      win.isDestroyed()
    ) {
      continue;
    }

    if (crewHidden) {
      win.hide();
    }

    else {
      win.show();
    }
  }
}

ipcMain.on(
  "crew:toggle",
  (event) => {
    if (
      !houseWindow ||
      houseWindow.isDestroyed()
    ) {
      return;
    }

    if (
      event.sender !==
      houseWindow.webContents
    ) {
      return;
    }

    toggleCrew();
  }
);

app.whenReady().then(
  () => {
    createCrew();
    createHouse();

    app.on(
      "activate",
      () => {
        if (
          BrowserWindow
            .getAllWindows()
            .length === 0
        ) {
          createCrew();
          createHouse();
        }
      }
    );
  }
);

app.on(
  "window-all-closed",
  () => {
    if (
      process.platform !==
      "darwin"
    ) {
      app.quit();
    }
  }
);




