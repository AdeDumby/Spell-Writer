const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs/promises");

const DEV = !!process.env.ELECTRON_DEV;
const DEV_URL = "http://127.0.0.1:5173";

// Everything (categories + spells) lives in one JSON file in the user's app-data folder.
const dataFile = () => path.join(app.getPath("userData"), "spellbook.json");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0b0d17",
    title: "Spell Writer",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Links to the web open in the system browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    const inApp = url.startsWith(DEV_URL) || url.startsWith("file://");
    if (!inApp) event.preventDefault();
  });

  if (DEV) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

/* ---------------- storage ---------------- */

ipcMain.handle("store:load", async () => {
  try {
    return await fs.readFile(dataFile(), "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
});

ipcMain.handle("store:save", async (_event, json) => {
  if (typeof json !== "string") throw new Error("Expected a JSON string");
  const file = dataFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  // Write to a temp file first so a crash mid-write never corrupts the spellbook.
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, json, "utf8");
  await fs.rename(tmp, file);
  return true;
});

/* ---------------- import / export dialogs ---------------- */

ipcMain.handle("file:export", async (event, { defaultName, content }) => {
  if (typeof defaultName !== "string" || typeof content !== "string") {
    throw new Error("Invalid export request");
  }
  const win = BrowserWindow.fromWebContents(event.sender);
  const ext = path.extname(defaultName).slice(1) || "txt";
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: path.basename(defaultName),
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (canceled || !filePath) return null;
  await fs.writeFile(filePath, content, "utf8");
  return filePath;
});

ipcMain.handle("file:import", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (canceled || !filePaths[0]) return null;
  return fs.readFile(filePaths[0], "utf8");
});

/* ---------------- lifecycle ---------------- */

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
