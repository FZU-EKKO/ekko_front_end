const { app, BrowserWindow, Menu, Tray, ipcMain } = require("electron");
const path = require("node:path");
const { dialog } = require("electron");

const devServerUrl = process.env.EKKO_RENDERER_URL;
const assetsDir = path.join(__dirname, "..", "public", "assets");
const iconPath = path.join(assetsDir, process.platform === "win32" ? "E256.ico" : "E.png");
const VIEW_BOUNDS = {
  login: { width: 420, height: 420 },
  register: { width: 500, height: 640 },
  reset: { width: 500, height: 560 },
  workspace: { width: 850, height: 540 },
  settings: { width: 850, height: 540 },
};
const WORKSPACE_MIN_BOUNDS = { width: 850, height: 540 };

let mainWindow = null;
let tray = null;
let isQuitting = false;
let minimizeToTrayOnClose = true;
let currentView = "login";

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.setSkipTaskbar(false);
  mainWindow.show();
  mainWindow.focus();
}

function isWorkspaceView(view) {
  return view === "workspace" || view === "settings";
}

function applyViewBounds(view) {
  if (!mainWindow) {
    return;
  }

  const bounds = VIEW_BOUNDS[view] ?? VIEW_BOUNDS.login;
  const isWorkspace = isWorkspaceView(view);
  const wasWorkspace = isWorkspaceView(currentView);

  if (!isWorkspace && mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  }

  mainWindow.setResizable(isWorkspace);
  mainWindow.setMaximizable(isWorkspace);
  mainWindow.setFullScreenable(isWorkspace);

  if (isWorkspace) {
    mainWindow.setMinimumSize(WORKSPACE_MIN_BOUNDS.width, WORKSPACE_MIN_BOUNDS.height);
    mainWindow.setMaximumSize(9999, 9999);
  } else {
    mainWindow.setMinimumSize(bounds.width, bounds.height);
    mainWindow.setMaximumSize(bounds.width, bounds.height);
  }

  if (isWorkspace && wasWorkspace) {
    currentView = view;
    return;
  }

  mainWindow.setSize(bounds.width, bounds.height, true);
  mainWindow.center();
  currentView = view;
}

function createTray() {
  if (tray) {
    return tray;
  }

  tray = new Tray(iconPath);
  tray.setToolTip("EKKO");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "显示窗口", click: () => showMainWindow() },
      {
        label: "退出",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("click", () => showMainWindow());
  tray.on("double-click", () => showMainWindow());
  return tray;
}

function createWindow() {
  const window = new BrowserWindow({
    width: VIEW_BOUNDS.login.width,
    height: VIEW_BOUNDS.login.height,
    center: true,
    backgroundColor: "#050505",
    frame: false,
    autoHideMenuBar: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.on("close", (event) => {
    if (isQuitting) {
      return;
    }

    if (minimizeToTrayOnClose) {
      event.preventDefault();
      window.setSkipTaskbar(true);
      window.hide();
      return;
    }

    isQuitting = true;
  });

  window.on("closed", () => {
    mainWindow = null;
  });

  window.on("show", () => {
    window.setSkipTaskbar(false);
  });

  if (devServerUrl) {
    window.loadURL(devServerUrl);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  window.once("ready-to-show", () => window.center());
  mainWindow = window;
  return window;
}

function getAutoLaunchOptions(openAtLogin) {
  const options = { openAtLogin: Boolean(openAtLogin) };

  if (!app.isPackaged && process.platform === "win32") {
    options.path = process.execPath;
    options.args = [path.join(__dirname, "main.cjs")];
  }

  return options;
}

function getAutoLaunchEnabled() {
  return app.getLoginItemSettings(getAutoLaunchOptions(false)).openAtLogin;
}

app.on("second-instance", () => showMainWindow());

app.whenReady().then(() => {
  ipcMain.handle("app:get-version", () => app.getVersion());
  ipcMain.handle("app:get-auto-launch", () => getAutoLaunchEnabled());
  ipcMain.handle("app:set-auto-launch", (_event, enabled) => {
    app.setLoginItemSettings(getAutoLaunchOptions(enabled));
    return getAutoLaunchEnabled();
  });
  ipcMain.handle("app:select-download-path", async (_event, currentPath) => {
    const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
      title: "选择下载路径",
      defaultPath: typeof currentPath === "string" && currentPath ? currentPath : app.getPath("downloads"),
      properties: ["openDirectory", "createDirectory"],
    });

    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    return result.filePaths[0];
  });
  ipcMain.handle("app:set-view", (_event, view) => {
    applyViewBounds(view);
    return true;
  });
  ipcMain.handle("window:minimize", () => {
    mainWindow?.minimize();
    return true;
  });
  ipcMain.handle("window:toggle-maximize", () => {
    if (!mainWindow) {
      return false;
    }

    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
    return true;
  });
  ipcMain.handle("app:set-minimize-on-close", (_event, enabled) => {
    minimizeToTrayOnClose = Boolean(enabled);
    return true;
  });
  ipcMain.handle("window:close", () => {
    if (!mainWindow) {
      return false;
    }

    if (minimizeToTrayOnClose) {
      mainWindow.close();
      return true;
    }

    isQuitting = true;
    app.quit();
    return true;
  });

  createTray();
  createWindow();

  app.on("activate", () => {
    showMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform === "darwin") {
    return;
  }
});

app.on("before-quit", () => {
  isQuitting = true;
});

