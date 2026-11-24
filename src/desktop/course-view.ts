import { session, WebContentsView, type BrowserWindow } from "electron";
import { isIP } from "node:net";
import { courseViewUrl } from "../course-view-url";
import type { ViewerBounds } from "./bridge";

export function createCourseView(window: BrowserWindow, applicationId: string) {
  const browsing = session.fromPartition("persist:outclass-course-viewer");
  browsing.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  browsing.setPermissionCheckHandler(() => false);
  browsing.on("will-download", (event) => event.preventDefault());
  browsing.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    const host = url.hostname.replace(/^\[|\]$|\.$/g, "");
    const network = ["https:", "wss:", "http:", "ws:"].includes(url.protocol);
    callback({
      cancel:
        url.protocol === "file:" ||
        (network &&
          (!host.includes(".") ||
            !!isIP(host) ||
            /\.(?:localhost|local|internal)$/i.test(host))),
    });
  });

  let view: WebContentsView | undefined;
  function close() {
    if (!view) return;
    if (!window.isDestroyed()) window.contentView.removeChildView(view);
    view.webContents.close();
    view = undefined;
  }
  function bounds(value: ViewerBounds) {
    if (
      !view ||
      !value ||
      ![value.x, value.y, value.width, value.height].every(Number.isFinite)
    )
      return;
    const { width, height } = window.getContentBounds();
    const zoom = window.webContents.getZoomFactor();
    const x = Math.max(0, Math.min(width, Math.round(value.x * zoom)));
    const y = Math.max(0, Math.min(height, Math.round(value.y * zoom)));
    const w = Math.max(0, Math.min(width - x, Math.round(value.width * zoom)));
    const h = Math.max(
      0,
      Math.min(height - y, Math.round(value.height * zoom)),
    );
    view.setBounds({ x, y, width: w, height: h });
    view.setVisible(w > 0 && h > 0);
  }
  async function open(value: string, rectangle: ViewerBounds) {
    const url = typeof value === "string" && courseViewUrl(value);
    if (!url) throw new Error("This course site cannot open in the viewer.");
    close();
    const current = new WebContentsView({
      webPreferences: {
        session: browsing,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    const contents = current.webContents;
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event, target) => {
      if (!courseViewUrl(target)) event.preventDefault();
    });
    contents.on("will-redirect", (event, target, _inPlace, mainFrame) => {
      if (mainFrame && !courseViewUrl(target)) event.preventDefault();
    });
    let hovered = false;
    contents.on("before-mouse-event", (_event, mouse) => {
      const next = mouse.type === "mouseLeave" ? false : true;
      if (hovered === next || window.isDestroyed()) return;
      hovered = next;
      window.webContents.send("course-view:hover", hovered);
    });
    view = current;
    window.contentView.addChildView(current);
    bounds(rectangle);
    try {
      if (
        url.hostname === "www.youtube.com" &&
        url.pathname.startsWith("/embed/")
      ) {
        await contents.loadURL(url.href, {
          httpReferrer: `https://${applicationId}/`,
        });
      } else await contents.loadURL(url.href);
    } catch {
      if (view !== current) return;
      close();
      throw new Error(
        "This lesson could not open in the viewer. Try opening it in your browser.",
      );
    }
  }
  window.once("closed", close);
  return { open, bounds, close };
}
