/**
 * aiman desktop shell.
 *
 * A deliberately thin Electron wrapper around the normal aiman server:
 *  - frameless BrowserWindow, so the web UI can draw its own themed titlebar
 *  - starts `bin/aiman.mjs` only when no manager is already listening
 *  - remembers window bounds
 *  - keeps the native window background in sync with the selected theme
 */
const { app, BrowserWindow, ipcMain, Menu, shell, screen } = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";
const PROTOCOL = "aiman";
const HOST = process.env.AIMAN_HOST || process.env.HOST || "127.0.0.1";
const PORT = process.env.AIMAN_PORT || process.env.PORT || "4097";
const AIMAN_URL = (process.env.AIMAN_URL || `http://${HOST}:${PORT}`).replace(/\/+$/, "");
const EXPLICIT_URL = Boolean(process.env.AIMAN_URL);
const APP_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, "aiman")
  : path.resolve(__dirname, "..");

if (process.env.AIMAN_DEBUG_PORT) {
  app.commandLine.appendSwitch("remote-debugging-port", String(process.env.AIMAN_DEBUG_PORT));
}

// Keep the desktop shell's log/window state away from aiman's manager.db.
app.setPath("userData", path.join(app.getPath("appData"), "aiman-desktop"));

let mainWindow = null;
let serverChild = null;
let quitting = false;
let stateFile = "";
let logFile = "";
let pendingDeepLink = null;

function handleDeepLink(url) {
  if (typeof url !== "string" || !url.startsWith(`${PROTOCOL}://`)) return;
  pendingDeepLink = url;
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    try {
      mainWindow.webContents.send("aiman:deep-link", url);
    } catch {}
  }
}

function deepLinkFromArgs(args) {
  for (const arg of args || []) {
    if (typeof arg === "string" && arg.startsWith(`${PROTOCOL}://`)) return arg;
  }
  return null;
}

if (process.defaultApp && process.argv[1]) {
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findBun() {
  const exe = IS_WIN ? "bun.exe" : "bun";
  const candidates = [
    process.env.BUN_PATH,
    path.join(os.homedir(), ".bun", "bin", exe),
    IS_WIN ? "C:\\Program Files\\Bun\\bun.exe" : "/usr/local/bin/bun",
    "/opt/homebrew/bin/bun",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {}
  }
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    const candidate = path.join(dir, exe);
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {}
  }
  return null;
}

async function isAiman() {
  try {
    const res = await fetch(`${AIMAN_URL}/api/auth/me`, {
      signal: AbortSignal.timeout(1400),
      headers: { accept: "application/json" },
    });
    const data = await res.json().catch(() => null);
    // `/api/auth/me` is public and returns 200 on older builds, but newer
    // builds reply 401 with an UnauthorizedError when there is no cookie.
    // Both responses still prove we are talking to aiman.
    if (res.status === 401) {
      return !!data && (data._tag === "UnauthorizedError" || data.error === "authentication required");
    }
    if (!res.ok) return false;
    return (
      data &&
      (typeof data.authenticated === "boolean" ||
        typeof data.needsSetup === "boolean" ||
        typeof data.user !== "undefined")
    );
  } catch {
    return false;
  }
}

function appendLog(stream) {
  if (!stream) return;
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    try {
      fs.appendFileSync(logFile, chunk);
    } catch {}
  });
}

async function startServer() {
  if (await isAiman()) return;

  if (EXPLICIT_URL) {
    throw new Error(`No AiMAN server answered at ${AIMAN_URL}.`);
  }

  const bun = findBun();
  if (!bun) {
    throw new Error(
      "Bun was not found. Install it from https://bun.sh, then launch AiMAN Desktop again.",
    );
  }

  const launcher = path.join(APP_ROOT, "bin", "aiman.mjs");
  if (!fs.existsSync(launcher)) {
    throw new Error(`Cannot find the aiman launcher at ${launcher}.`);
  }

  fs.mkdirSync(path.dirname(logFile), { recursive: true });

  serverChild = spawn(bun, [launcher], {
    cwd: APP_ROOT,
    env: { ...process.env, HOST, PORT },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  appendLog(serverChild.stdout);
  appendLog(serverChild.stderr);

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await isAiman()) return;
    if (serverChild.exitCode !== null) {
      throw new Error(
        `AiMAN exited while starting (code ${serverChild.exitCode}). See ${logFile}.`,
      );
    }
    await sleep(450);
  }
  throw new Error(`AiMAN did not start within 60 seconds. See ${logFile}.`);
}

function stopServer() {
  const child = serverChild;
  serverChild = null;
  if (!child) return;
  if (IS_WIN) {
    try {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } catch {}
  } else {
    try {
      child.kill("SIGTERM");
    } catch {}
  }
}

function readWindowState() {
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    if (
      raw &&
      Number.isFinite(raw.width) &&
      Number.isFinite(raw.height) &&
      Number.isFinite(raw.x) &&
      Number.isFinite(raw.y)
    ) {
      return raw;
    }
  } catch {}
  return null;
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const bounds = mainWindow.getNormalBounds();
    fs.writeFileSync(
      stateFile,
      JSON.stringify({ ...bounds, maximized: mainWindow.isMaximized() }, null, 2),
    );
  } catch {}
}

function sendWindowState(win = mainWindow) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("aiman:window-state", {
    maximized: win.isMaximized(),
    focused: win.isFocused(),
  });
}

function wireWindowState(win) {
  for (const event of ["maximize", "unmaximize", "focus", "blur"]) {
    win.on(event, () => sendWindowState(win));
  }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);
}

function loadingPage(message = "Starting AiMAN") {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    :root { color-scheme: dark; }
    html,body{height:100%;margin:0;background:#0e1013;color:#e6e8eb;
      font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
    body{display:grid;place-items:center}
    .box{display:flex;flex-direction:column;align-items:center;gap:14px;color:#8b93a1}
    .ring{width:34px;height:34px;border-radius:50%;border:3px solid #2a2e36;
      border-top-color:#5b9dff;animation:spin .9s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    .brand{font-weight:700;letter-spacing:.08em;color:#e6e8eb}
    .brand span{color:#5b9dff}
    .msg{font-size:12px;max-width:520px;text-align:center}
  </style></head><body><div class="box">
    <div class="ring"></div>
    <div class="brand">Ai<span>MAN</span></div>
    <div class="msg">${escapeHtml(message)}</div>
  </div></body></html>`;
}

function errorPage(error) {
  const message = escapeHtml(error?.message || error || "Unknown error");
  const log = escapeHtml(logFile);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    :root { color-scheme: dark; }
    html,body{height:100%;margin:0;background:#0e1013;color:#e6e8eb;
      font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
    body{display:grid;place-items:center;padding:32px}
    .card{max-width:680px;background:#16181d;border:1px solid #3a2a2e;border-radius:10px;
      padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
    h1{font-size:18px;margin:0 0 10px;color:#f87171}
    p{margin:0 0 10px;color:#c3c9d4}
    code{font-family:ui-monospace,Consolas,monospace;font-size:12px;color:#fbbf24;
      overflow-wrap:anywhere}
  </style></head><body><div class="card">
    <h1>AiMAN Desktop could not start</h1>
    <p>${message}</p>
    <p>Server log: <code>${log}</code></p>
    <p>You can still start AiMAN normally with <code>bun run bin/aiman.mjs</code> and open it in a browser.</p>
  </div></body></html>`;
}

function createWindow() {
  const saved = readWindowState();
  const display = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.min(saved?.width || 1280, display.width);
  const height = Math.min(saved?.height || 860, display.height);
  const x = Number.isFinite(saved?.x) ? saved.x : undefined;
  const y = Number.isFinite(saved?.y) ? saved.y : undefined;

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 900,
    minHeight: 620,
    frame: false,
    show: false,
    transparent: true,
    backgroundColor: "#00000000",
    title: "AiMAN",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  mainWindow.removeMenu();
  mainWindow.once("ready-to-show", () => {
    if (!mainWindow.isDestroyed()) mainWindow.show();
  });
  wireWindowState(mainWindow);
  mainWindow.on("close", () => {
    saveWindowState();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.on("before-input-event", (_event, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F12" || (input.control && input.shift && input.key.toLowerCase() === "i")) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Pop-out session windows are part of aiman; keep them inside the desktop
    // shell but with a normal frame so they are still easy to move/close.
    if (url.startsWith(AIMAN_URL) && url.includes("popout")) {
      const pop = new BrowserWindow({
        width: 920,
        height: 720,
        minWidth: 720,
        minHeight: 480,
        title: "AiMAN session",
        frame: false,
        backgroundColor: "#0e1013",
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      pop.removeMenu();
      wireWindowState(pop);
      pop.once("ready-to-show", () => {
        if (!pop.isDestroyed()) pop.show();
      });
      pop.loadURL(url);
      return { action: "deny" };
    }
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(AIMAN_URL)) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.webContents.on("did-finish-load", () => {
    if (pendingDeepLink) {
      try {
        mainWindow.webContents.send("aiman:deep-link", pendingDeepLink);
      } catch {}
    }
  });

  mainWindow
    .loadURL("data:text/html;charset=utf-8," + encodeURIComponent(loadingPage()))
    .catch(() => {}); // superseded by the real aiman URL a moment later

  return mainWindow;
}

async function boot() {
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    stateFile = path.join(app.getPath("userData"), "window-state.json");
    logFile = path.join(app.getPath("userData"), "server.log");

    await startServer();
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
    await mainWindow.loadURL(AIMAN_URL);
  } catch (error) {
    console.error(error);
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
    await mainWindow.loadURL(
      "data:text/html;charset=utf-8," + encodeURIComponent(errorPage(error)),
    );
  }
}

ipcMain.handle("aiman:deep-link-pending", () => pendingDeepLink);

ipcMain.handle("aiman:window", (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (action === "minimize") win.minimize();
  else if (action === "toggle-maximize") {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  } else if (action === "close") win.close();
});

ipcMain.on("aiman:theme", (event, theme) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || !theme || typeof theme.bg !== "string") return;
  if (theme.id === "xeno3000") {
    try {
      win.setBackgroundColor("#00000000");
    } catch {}
    return;
  }
  if (/^#[0-9a-f]{3,8}$/i.test(theme.bg)) {
    try {
      win.setBackgroundColor(theme.bg);
    } catch {}
  }
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const link = deepLinkFromArgs(argv);
    if (link) handleDeepLink(link);
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  const initialLink = deepLinkFromArgs(process.argv);
  if (initialLink) pendingDeepLink = initialLink;

  app.whenReady().then(() => {
    if (!IS_MAC) Menu.setApplicationMenu(null);
    createWindow();
    boot();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      boot();
    }
  });

  app.on("window-all-closed", () => {
    if (!IS_MAC) app.quit();
  });

  app.on("before-quit", () => {
    if (quitting) return;
    quitting = true;
    saveWindowState();
    stopServer();
  });
}
