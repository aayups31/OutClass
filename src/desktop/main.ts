import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  shell,
  utilityProcess,
} from "electron";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import type { DesktopEnvironment } from "./bridge";
import { LocalTerminals } from "./terminal";
import { approvedSocialLink } from "./social-links";

app.setName("OutClass");
// Keep the encrypted key and saved workspace in the existing installation.
const profilePath =
  process.env.GITLEARN_DESKTOP_USER_DATA ||
  path.join(app.getPath("appData"), "GitLearn");
mkdirSync(profilePath, { recursive: true });
app.setPath("userData", profilePath);
const root = app.getAppPath();
const extensionSource = app.isPackaged
  ? path.join(process.resourcesPath, "extension")
  : path.join(root, "dist/extension");
const port = Number(process.env.GITLEARN_PORT || "47831");
const origin = `http://127.0.0.1:${port}`;
let window: BrowserWindow | undefined;
let companion: ReturnType<typeof utilityProcess.fork> | undefined;
let savedKey = "";
let quitting = false;
const terminals = new LocalTerminals((event) => {
  if (window && !window.isDestroyed())
    window.webContents.send("terminal:event", event);
});
const keyFile = path.join(app.getPath("userData"), "openai-key.encrypted");
const accountFile = path.join(app.getPath("userData"), "ai-account.encrypted");
const socialFile = path.join(
  app.getPath("userData"),
  "social-accounts.encrypted",
);
const acknowledgements = new Map<string, () => void>();
const allowedExternal = new Set([
  "git-learn-black.vercel.app",
  "github.com",
  "git-scm.com",
  "www.python.org",
  "nodejs.org",
  "platform.openai.com",
  "chromewebstore.google.com",
  "developer.chrome.com",
  "checkout.stripe.com",
  "billing.stripe.com",
  "code.visualstudio.com",
  "vscodium.com",
]);
function external(url: string) {
  const target = new URL(url);
  if (
    target.origin === origin &&
    target.pathname === "/welcome/" &&
    !target.search &&
    !target.hash
  )
    return shell.openExternal(target.href);
  if (
    target.protocol === "http:" &&
    target.hostname === "127.0.0.1" &&
    Number(target.port) >= 1024 &&
    Number(target.port) <= 65535 &&
    target.origin !== origin &&
    !target.username &&
    !target.password
  )
    return shell.openExternal(target.href);
  if (
    target.protocol !== "https:" ||
    (!allowedExternal.has(target.hostname) &&
      !approvedSocialLink(target) &&
      !(
        /^(?:[a-z0-9-]+\.)*udemy\.com$/.test(target.hostname) &&
        target.pathname.startsWith("/course/")
      )) ||
    target.username ||
    target.password
  )
    throw new Error("That link is not an approved OutClass resource.");
  return shell.openExternal(target.href);
}
async function available(command: string) {
  return new Promise<boolean>((resolve) => {
    const child = spawn(command, ["--version"], {
      shell: false,
      windowsHide: true,
      stdio: "ignore",
    });
    const timer = setTimeout(() => {
      child.kill();
      resolve(false);
    }, 4000);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}
async function startCompanion() {
  let accountSession: unknown = null;
  let socialSessions: unknown = [];
  try {
    const response = await fetch(`${origin}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    const health = await response.json();
    if (health.ok && health.name === "GitLearn") {
      if (health.version !== app.getVersion())
        throw new Error(
          "Another OutClass version is running. Save your files and close it, then open this version again.",
        );
      return;
    }
    throw new Error("The OutClass port is occupied by another application.");
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("occupied") ||
        error.message.includes("Another OutClass version"))
    )
      throw error;
  }
  if (safeStorage.isEncryptionAvailable()) {
    const social = await readFile(socialFile).catch(() => null);
    if (social) {
      try {
        socialSessions = JSON.parse(safeStorage.decryptString(social));
      } catch {
        /* Reconnect if the encrypted connection file cannot be restored. */
      }
    }
    const account = await readFile(accountFile).catch(() => null);
    if (account) {
      try {
        accountSession = JSON.parse(safeStorage.decryptString(account));
      } catch {
        /* The user can sign in again; never expose the encrypted account data. */
      }
    }
    const encrypted = await readFile(keyFile).catch(() => null);
    if (encrypted) {
      try {
        savedKey = safeStorage.decryptString(encrypted);
      } catch {
        throw new Error(
          "Your saved API key could not be opened. Remove the key file in OutClass's app data or restore access to your Windows account.",
        );
      }
    }
  }
  if (
    !app.isPackaged &&
    !savedKey &&
    process.env.GITLEARN_DISABLE_DEV_KEY !== "1"
  ) {
    const env = dotenv.config({
      path: path.join(root, ".env"),
      quiet: true,
    }).parsed;
    savedKey = env?.OPENAI_API_KEY || env?.OPEN_AI_API || "";
  }
  companion = utilityProcess.fork(
    path.join(root, "dist/desktop/companion.cjs"),
    [],
    { serviceName: "OutClass local companion", stdio: "pipe" },
  );
  // Neither the API key nor source contents are written to process logs.
  companion.stderr?.on("data", () => {});
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("The local workspace took too long to start.")),
      20000,
    );
    companion!.on("message", (message) => {
      if (message.type === "account-save") {
        void (async () => {
          if (!safeStorage.isEncryptionAvailable())
            throw new Error("Account encryption unavailable.");
          if (message.session)
            await writeFile(
              accountFile,
              safeStorage.encryptString(JSON.stringify(message.session)),
              { mode: 0o600 },
            );
          else
            await unlink(accountFile).catch((e) => {
              if (e.code !== "ENOENT") throw e;
            });
        })().then(
          () =>
            companion?.postMessage({
              type: "account-saved",
              id: message.id,
              ok: true,
            }),
          () =>
            companion?.postMessage({
              type: "account-saved",
              id: message.id,
              ok: false,
            }),
        );
      }
      if (message.type === "social-save") {
        void (async () => {
          if (!safeStorage.isEncryptionAvailable())
            throw Error("Connection encryption unavailable.");
          await writeFile(
            socialFile,
            safeStorage.encryptString(JSON.stringify(message.sessions)),
            { mode: 0o600 },
          );
        })().then(
          () =>
            companion?.postMessage({
              type: "social-saved",
              id: message.id,
              ok: true,
            }),
          () =>
            companion?.postMessage({
              type: "social-saved",
              id: message.id,
              ok: false,
            }),
        );
      }
      if (message.type === "ready") {
        clearTimeout(timer);
        resolve();
      }
      if (message.type === "error") {
        clearTimeout(timer);
        reject(new Error(message.message));
      }
      if (message.type === "key-saved") {
        acknowledgements.get(message.id)?.();
        acknowledgements.delete(message.id);
      }
      if (message.type === "focus") {
        if (window?.isMinimized()) window.restore();
        window?.show();
        window?.focus();
      }
    });
    companion!.on("exit", () => {
      clearTimeout(timer);
      reject(new Error("The local workspace stopped unexpectedly."));
      if (!quitting && window)
        dialog.showErrorBox(
          "OutClass stopped",
          "Reopen OutClass to reconnect to your local workspace.",
        );
    });
    companion!.postMessage({
      root,
      port,
      apiKey: savedKey,
      accountSession,
      socialSessions,
      secureStorage: safeStorage.isEncryptionAvailable(),
      editorVsix: app.isPackaged
        ? path.join(
            process.resourcesPath,
            "editor",
            `OutClass-Editor-${app.getVersion()}.vsix`,
          )
        : path.join(
            root,
            "dist/editor",
            `OutClass-Editor-${app.getVersion()}.vsix`,
          ),
      dataDirectory:
        process.env.GITLEARN_DATA_DIR ||
        path.join(
          process.env.LOCALAPPDATA || app.getPath("userData"),
          "GitForLearning",
        ),
    });
  });
}
function trusted(event: Electron.IpcMainInvokeEvent) {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    new URL(event.senderFrame.url).origin !== origin
  )
    throw new Error("Use the OutClass desktop workspace.");
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (window?.isMinimized()) window.restore();
    window?.show();
    window?.focus();
  });
  app.whenReady().then(async () => {
    try {
      await startCompanion();
      ipcMain.handle("terminal:list", (event) => {
        trusted(event);
        return terminals.list();
      });
      ipcMain.handle("terminal:create", async (event, sessionId: unknown) => {
        trusted(event);
        if (
          typeof sessionId !== "string" ||
          !/^[0-9a-f-]{36}$/i.test(sessionId)
        )
          throw new Error("Select an active course workspace.");
        const bootstrap = await fetch(`${origin}/api/bootstrap`, {
          method: "POST",
          headers: { Origin: origin },
        }).then((r) => r.json());
        const headers = {
          Authorization: `Bearer ${bootstrap.token}`,
          Origin: origin,
        };
        const state = await fetch(`${origin}/api/state`, { headers }).then(
          (r) => r.json(),
        );
        if (state.session?.id !== sessionId)
          throw new Error(
            "Select the active course before starting its terminal.",
          );
        // The file API revalidates the saved filesystem grant, including junctions.
        const check = await fetch(
          `${origin}/api/workspace-files?sessionId=${sessionId}`,
          { headers },
        );
        if (!check.ok)
          throw new Error(
            "Your course workspace is unavailable. Reopen it first.",
          );
        return terminals.create(
          sessionId,
          state.session.workspace,
          state.session.courseTitle,
        );
      });
      ipcMain.handle("terminal:snapshot", (event, id) => {
        trusted(event);
        return terminals.snapshot(String(id));
      });
      ipcMain.handle("terminal:input", (event, id, data) => {
        trusted(event);
        terminals.input(String(id), data);
      });
      ipcMain.handle("terminal:resize", (event, id, cols, rows) => {
        trusted(event);
        terminals.resize(String(id), cols, rows);
      });
      ipcMain.handle("terminal:close", (event, id) => {
        trusted(event);
        terminals.close(String(id));
      });
      ipcMain.handle("desktop:environment", async (event) => {
        trusted(event);
        return {
          version: app.getVersion(),
          defaultLearningFolder: path.join(
            app.getPath("desktop"),
            "My Learning",
          ),
          gitAvailable: await available("git"),
          keyManaged: !!companion,
          hasSavedKey: !!savedKey,
        } satisfies DesktopEnvironment;
      });
      ipcMain.handle("desktop:folder", async (event) => {
        trusted(event);
        const result = await dialog.showOpenDialog(window!, {
          title: "Choose your parent learning folder",
          defaultPath: app.getPath("desktop"),
          properties: ["openDirectory", "createDirectory"],
        });
        return result.canceled ? null : result.filePaths[0];
      });
      ipcMain.handle("desktop:key", async (event, key: unknown) => {
        trusted(event);
        if (!companion)
          throw new Error(
            "Close the standalone companion and reopen the desktop app to manage your API key here.",
          );
        if (
          typeof key !== "string" ||
          key.length > 500 ||
          (key && !/^sk-[A-Za-z0-9_-]{10,}$/.test(key))
        )
          throw new Error(
            "Enter a valid OpenAI API key, or leave it empty to remove the key.",
          );
        if (key && !safeStorage.isEncryptionAvailable())
          throw new Error(
            "Windows encryption is unavailable. Your API key has not been saved.",
          );
        const id = randomUUID();
        await mkdir(path.dirname(keyFile), { recursive: true });
        if (key)
          await writeFile(keyFile, safeStorage.encryptString(key), {
            mode: 0o600,
          });
        else
          await unlink(keyFile).catch((error) => {
            if (error.code !== "ENOENT") throw error;
          });
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            acknowledgements.delete(id);
            reject(
              new Error(
                "The companion did not confirm the change. Reopen OutClass.",
              ),
            );
          }, 5000);
          acknowledgements.set(id, () => {
            clearTimeout(timer);
            resolve();
          });
          companion!.postMessage({ type: "key", id, key });
        });
        savedKey = key;
      });
      ipcMain.handle("desktop:external", (event, url) => {
        trusted(event);
        return external(String(url));
      });
      ipcMain.handle("desktop:extension", async (event) => {
        trusted(event);
        // Chrome needs ordinary files. Packaged extension resources stay outside ASAR.
        const { cp } = await import("node:fs/promises");
        const target = path.join(
          app.getPath("userData"),
          "extension",
          app.getVersion(),
        );
        await cp(extensionSource, target, { recursive: true });
        const error = await shell.openPath(target);
        if (error) throw new Error(error);
      });
      window = new BrowserWindow({
        width: 1500,
        height: 1000,
        minWidth: 960,
        minHeight: 660,
        show: false,
        backgroundColor: "#101114",
        title: "OutClass",
        icon: path.join(extensionSource, "icons/icon-256.png"),
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(root, "dist/desktop/preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      window.webContents.setWindowOpenHandler(({ url }) => {
        external(url).catch(() => {});
        return { action: "deny" };
      });
      window.webContents.on("will-navigate", (event, url) => {
        if (new URL(url).origin !== origin) {
          event.preventDefault();
          external(url).catch(() => {});
        }
      });
      window.webContents.session.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
      );
      window.webContents.on("will-prevent-unload", (event) => {
        if (
          dialog.showMessageBoxSync(window!, {
            type: "question",
            buttons: ["Keep editing", "Leave without saving"],
            defaultId: 0,
            cancelId: 0,
            message: "You have unsaved work",
            detail:
              "Save your files and wait for notes to finish saving before closing OutClass.",
          }) === 1
        )
          event.preventDefault();
      });
      await window.loadURL(origin);
      if (process.env.GITLEARN_HEADLESS_TEST !== "1") window.show();
    } catch (error) {
      dialog.showErrorBox(
        "OutClass could not open",
        error instanceof Error ? error.message : "Please reopen OutClass.",
      );
      app.quit();
    }
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (event) => {
    terminals.closeAll();
    if (companion && !quitting) {
      event.preventDefault();
      quitting = true;
      companion.postMessage({ type: "shutdown" });
      const timer = setTimeout(() => {
        companion?.kill();
        app.quit();
      }, 3500);
      companion.once("exit", () => {
        clearTimeout(timer);
        app.quit();
      });
    }
  });
}
