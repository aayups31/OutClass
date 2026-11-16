import path from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import dotenv from "dotenv";
import express from "express";
import { Store } from "./store.js";
import { Application } from "./application.js";
import { createApp } from "./http.js";

const isDev = process.argv.includes("--dev");
const projectRoot = isDev
  ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(projectRoot, ".env"), quiet: true });
if (isDev)
  dotenv.config({
    path: path.join(projectRoot, ".local", "creator-platform.env"),
    quiet: true,
  });
const port = Number(process.env.GITLEARN_PORT || "47831");
const dataDirectory =
  process.env.GITLEARN_DATA_DIR ||
  path.join(
    process.env.LOCALAPPDATA || path.join(homedir(), ".local", "share"),
    "GitForLearning",
  );
const store = new Store(dataDirectory);
const application = new Application(
  store,
  process.env.OPENAI_API_KEY || process.env.OPEN_AI_API,
);
await application.recover();
const app = createApp(application, port);
if (isDev) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root: projectRoot,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use("/welcome", express.static(path.join(projectRoot, "src/site")));
  app.use(vite.middlewares);
} else {
  app.use((_req, res, next) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
    );
    next();
  });
  app.use("/welcome", express.static(path.join(projectRoot, "dist/site")));
  app.use(express.static(path.join(projectRoot, "dist", "web")));
  app.get("/{*splat}", (_req, res) =>
    res.sendFile(path.join(projectRoot, "dist", "web", "index.html")),
  );
}
const server = app.listen(port, "127.0.0.1", () =>
  console.log(
    `OutClass is ready at http://127.0.0.1:${port}. Your files and API key stay in the local companion.`,
  ),
);
server.on("error", () => {
  console.error("OutClass could not start. The port may already be in use.");
  store.close();
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await app.locals.stopPrograms();
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
