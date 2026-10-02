const {
  app,
  BrowserWindow,
  ipcMain,
  screen
} = require("electron");

const path = require("path");

const {
  routeAiRequest
} = require("./providers/router");

const {
  createLauncherHandler
} = require("./providers/launcher");

const {
  STATES: FRICTION,
  KITTO_FRICTION_CONFIG,
  createKittoFriction,
  centreTarget,
  stepToward
} = require("./crew/kitto-friction");

/*
  --------------------------------
  SINGLE INSTANCE
  --------------------------------

  A second launch quits quietly and
  leaves the running crew untouched.
*/

const hasInstanceLock =
  app.requestSingleInstanceLock();

if (!hasInstanceLock) {
  app.quit();
}

/*
  --------------------------------
  LOCAL AI
  --------------------------------
*/

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

    noteCrewInteraction();

    return routeAiRequest({
      characterId:
        crewCharacters.get(
          senderWindow
        ),

      prompt
    });
  }
);
const crewWindows = [];
const crewCharacters = new WeakMap();

/*
  --------------------------------
  LAUNCHER
  --------------------------------
*/

const openLauncher =
  createLauncherHandler({
    getSenderWindow:
      (sender) =>
        BrowserWindow.fromWebContents(
          sender
        ),

    isCrewWindow:
      (win) =>
        crewWindows.includes(win),

    getCharacter:
      (win) =>
        crewCharacters.get(win)
  });

ipcMain.handle(
  "launcher:open",
  async (event, destination) => {
    await openLauncher(
      event,
      destination
    );

    noteCrewInteraction();
  }
);

let houseWindow = null;
let crewHidden = false;

/*
  --------------------------------
  KITTØ SCREEN FRICTION
  --------------------------------

  Session = Ø-CREW's own interactions
  only (pet click/drag, chat send,
  portal, house). Nothing else on the
  computer is observed. In memory only;
  a restart begins clean.
*/

const kittoFriction =
  createKittoFriction({
    ...KITTO_FRICTION_CONFIG,
    now: Date.now
  });

const activeGestureWindows =
  new Set();

let kittoPanelOpen = false;
let frictionTravel = null;
let frictionDisplayId = null;

function noteCrewInteraction() {
  kittoFriction.noteInteraction();
}

function findKittoWindow() {
  return crewWindows.find(
    (win) =>
      !win.isDestroyed() &&
      crewCharacters.get(win) === "kitto"
  ) ?? null;
}

function sendKittoFriction(mode) {
  const win =
    findKittoWindow();

  if (win) {
    win.webContents.send(
      "pet:friction",
      mode
    );
  }
}

function isKittoFrictionOn() {
  const state =
    kittoFriction.getState();

  return (
    state === FRICTION.TRAVEL ||
    state === FRICTION.LYING
  );
}

function stopFrictionTravel() {
  if (!frictionTravel) {
    return;
  }

  clearInterval(
    frictionTravel.timer
  );

  frictionTravel = null;
}

// "cancel" = user intervened (cooldown); "reset" = clean slate.
function endKittoFriction(how) {
  const wasOn =
    isKittoFrictionOn();

  stopFrictionTravel();
  frictionDisplayId = null;

  if (how === "cancel") {
    kittoFriction.cancel();
  }

  else {
    kittoFriction.reset();
  }

  if (wasOn) {
    sendKittoFriction("off");
  }
}

function cancelKittoFrictionByUser() {
  if (isKittoFrictionOn()) {
    endKittoFriction("cancel");
  }
}

function isKittoEligible(win) {
  return Boolean(
    win &&
    !win.isDestroyed() &&
    win.isVisible() &&
    !crewHidden &&
    !activeGestureWindows.has(win) &&
    !kittoPanelOpen
  );
}

function updateFrictionTravel() {
  const travel =
    frictionTravel;

  if (!travel) {
    return;
  }

  if (travel.win.isDestroyed()) {
    endKittoFriction("reset");
    return;
  }

  const time =
    Date.now();

  const dt =
    Math.min(
      0.2,
      (time - travel.lastTime) / 1000
    );

  travel.lastTime = time;

  const next =
    stepToward(
      travel,
      travel.target,
      KITTO_FRICTION_CONFIG.speedPxPerSec * dt
    );

  travel.x = next.x;
  travel.y = next.y;

  travel.win.setBounds({
    x: Math.round(next.x),
    y: Math.round(next.y),
    width: travel.width,
    height: travel.height
  });

  if (next.arrived) {
    stopFrictionTravel();
    kittoFriction.arrived();
    sendKittoFriction("lie");
  }
}

function startFrictionTravel(win) {
  stopFrictionTravel();

  const bounds =
    win.getBounds();

  // Fixed at the start: KITTØ never crosses monitors.
  const display =
    screen.getDisplayMatching(
      bounds
    );

  frictionDisplayId =
    display.id;

  frictionTravel = {
    win,

    target:
      centreTarget(
        display.workArea,
        bounds
      ),

    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    lastTime: Date.now(),
    timer: null
  };

  sendKittoFriction("travel");

  frictionTravel.timer =
    setInterval(
      updateFrictionTravel,
      60
    );
}

function tickKittoFriction() {
  const win =
    findKittoWindow();

  const before =
    kittoFriction.getState();

  const after =
    kittoFriction.tick({
      eligible:
        isKittoEligible(win)
    });

  if (
    before !== FRICTION.TRAVEL &&
    after === FRICTION.TRAVEL
  ) {
    startFrictionTravel(win);
  }
}

// Safe over clever: a changed display ends friction.
function handleFrictionDisplayChange(
  _event,
  display
) {
  if (
    frictionDisplayId !== null &&
    display.id === frictionDisplayId
  ) {
    endKittoFriction("reset");
  }
}

ipcMain.on(
  "pet:panel",
  (event, open) => {
    const win =
      BrowserWindow.fromWebContents(
        event.sender
      );

    if (
      !win ||
      !crewWindows.includes(win) ||
      event.senderFrame !==
        event.sender.mainFrame ||
      crewCharacters.get(win) !== "kitto"
    ) {
      return;
    }

    kittoPanelOpen =
      open === true;

    if (kittoPanelOpen) {
      cancelKittoFrictionByUser();
    }
  }
);

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
  crewCharacters.set(win, character);



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
    activeGestureWindows.delete(win);
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

      activeGestureWindows.add(win);

      // Any grab ends friction at once; the drag itself stays normal.
      if (character === "kitto") {
        cancelKittoFrictionByUser();
      }
    }

    else if (
      action === "end" &&
      gesture
    ) {
      updateGesture();

      const clicked =
        !gesture.dragged;

      stopGesture();

      // Dragging KITTØ somewhere is intentional placement: fresh grace period.
      // (A grab during TRAVEL/LYING already cancelled into COOLDOWN, so this is a no-op then.)
      if (
        character === "kitto" &&
        !clicked
      ) {
        kittoFriction.restartSession();
      }

      else {
        noteCrewInteraction();
      }

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

  function resetKittoForWindow() {
    if (character === "kitto") {
      kittoPanelOpen = false;
      endKittoFriction("reset");
    }
  }

  win.webContents.on(
    "did-start-loading",
    () => {
      stopGesture();
      stopRoam();
      resetKittoForWindow();
    }
  );

  win.on(
    "closed",
    () => {
      stopGesture();
      stopRoam();
      resetKittoForWindow();

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

    // Hidden time never counts; showing the crew is a fresh interaction.
    if (crewHidden) {
      endKittoFriction("reset");
    }

    else {
      noteCrewInteraction();
    }
  }
);

app.whenReady().then(
  () => {
    if (!hasInstanceLock) {
      return;
    }

    createCrew();
    createHouse();

    setInterval(
      tickKittoFriction,
      1000
    );

    screen.on(
      "display-removed",
      handleFrictionDisplayChange
    );

    screen.on(
      "display-metrics-changed",
      handleFrictionDisplayChange
    );

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




