const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pet", {
  start: () => ipcRenderer.send("pet:gesture", "start"),
  end: () => ipcRenderer.send("pet:gesture", "end"),
  cancel: () => ipcRenderer.send("pet:gesture", "cancel"),

  onToggle: (callback) => {
    ipcRenderer.on("pet:toggle", () => callback());
  },

  roamStart: (direction, speed) => {
    ipcRenderer.send("pet:roam-start", {
      direction,
      speed
    });
  },

  roamStop: () => {
    ipcRenderer.send("pet:roam-stop");
  },

  onRoamDirection: (callback) => {
    ipcRenderer.on(
      "pet:roam-direction",
      (_event, direction) => {
        callback(direction);
      }
    );
  },

  setPanelOpen: (open) => {
    ipcRenderer.send(
      "pet:panel",
      open === true
    );
  },

  onFriction: (callback) => {
    ipcRenderer.on(
      "pet:friction",
      (_event, mode) => {
        callback(mode);
      }
    );
  },

  onBusBubble: (callback) => {
    ipcRenderer.on(
      "pet:bus-bubble",
      (_event, messageKey) => {
        callback(messageKey);
      }
    );
  }
});

contextBridge.exposeInMainWorld("crew", {
  send: (submission) => {
    return ipcRenderer.invoke(
      "bus:send",
      submission
    );
  }
});

contextBridge.exposeInMainWorld("house", {
  toggleCrew: () => ipcRenderer.send("crew:toggle")
});

contextBridge.exposeInMainWorld("ai", {
  askLocal: (prompt) => {
    return ipcRenderer.invoke(
      "ai:ask-local",
      prompt
    );
  }
});

contextBridge.exposeInMainWorld("launcher", {
  open: (destination) => {
    return ipcRenderer.invoke(
      "launcher:open",
      destination
    );
  }
});