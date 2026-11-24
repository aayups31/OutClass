import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "./bridge";
import { outClassEdition } from "../outclass-edition";
const bridge: DesktopBridge = {
  edition: outClassEdition(
    process.argv
      .find((arg) => arg.startsWith("--outclass-edition="))
      ?.split("=")[1],
  ),
  environment: () => ipcRenderer.invoke("desktop:environment"),
  chooseFolder: () => ipcRenderer.invoke("desktop:folder"),
  setApiKey: (key) => ipcRenderer.invoke("desktop:key", key),
  openExternal: (url) => ipcRenderer.invoke("desktop:external", url),
  openExtensionFolder: () => ipcRenderer.invoke("desktop:extension"),
  courseViewer: {
    open: (url, bounds) => ipcRenderer.invoke("course-view:open", url, bounds),
    bounds: (bounds) => ipcRenderer.invoke("course-view:bounds", bounds),
    close: () => ipcRenderer.invoke("course-view:close"),
    onHover: (listener) => {
      const receive = (_event: Electron.IpcRendererEvent, hovered: boolean) =>
        listener(hovered);
      ipcRenderer.on("course-view:hover", receive);
      return () => ipcRenderer.removeListener("course-view:hover", receive);
    },
  },
  terminals: {
    list: () => ipcRenderer.invoke("terminal:list"),
    create: (sessionId) => ipcRenderer.invoke("terminal:create", sessionId),
    snapshot: (id) => ipcRenderer.invoke("terminal:snapshot", id),
    input: (id, data) => ipcRenderer.invoke("terminal:input", id, data),
    resize: (id, cols, rows) =>
      ipcRenderer.invoke("terminal:resize", id, cols, rows),
    close: (id) => ipcRenderer.invoke("terminal:close", id),
    subscribe: (listener) => {
      const receive = (
        _event: Electron.IpcRendererEvent,
        event: Parameters<typeof listener>[0],
      ) => listener(event);
      ipcRenderer.on("terminal:event", receive);
      return () => ipcRenderer.removeListener("terminal:event", receive);
    },
  },
};
contextBridge.exposeInMainWorld("gitLearnDesktop", bridge);
