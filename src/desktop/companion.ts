import path from "node:path";
import express from "express";
import { Store } from "../server/store";
import { Application } from "../server/application";
import { createApp } from "../server/http";
import { randomUUID } from "node:crypto";
import type { AccountSession } from "../server/ai-provider";
const parentPort = process.parentPort;

parentPort!.once("message", async ({ data }) => {
  const { root, dataDirectory, port, apiKey } = data;
  const store = new Store(dataDirectory);
  const application = new Application(store, apiKey || undefined);
  if (data.accountSession)
    application.ai.session = data.accountSession as AccountSession;
  const pendingAccounts = new Map<string, (ok: boolean) => void>();
  application.ai.persist = (session) =>
    new Promise<void>((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        pendingAccounts.delete(id);
        reject(
          new Error(
            "Your sign-in could not be saved securely. Reopen OutClass.",
          ),
        );
      }, 5000);
      pendingAccounts.set(id, (ok) => {
        clearTimeout(timer);
        ok
          ? resolve()
          : reject(
              new Error(
                "Your account was not saved. Windows encryption is unavailable.",
              ),
            );
      });
      parentPort.postMessage({ type: "account-save", id, session });
    });
  await application.recover();
  const web = createApp(
    application,
    port,
    () => parentPort.postMessage({ type: "focus" }),
    data.editorVsix,
    {
      initial: data.socialSessions,
      ...(data.secureStorage
        ? {
            persist: (sessions: unknown) =>
              new Promise<void>((resolve, reject) => {
                const id = randomUUID(),
                  timer = setTimeout(() => {
                    pendingAccounts.delete(id);
                    reject(
                      Error(
                        "Your channel connection could not be saved securely.",
                      ),
                    );
                  }, 5000);
                pendingAccounts.set(id, (ok) => {
                  clearTimeout(timer);
                  ok
                    ? resolve()
                    : reject(
                        Error(
                          "Windows could not encrypt this channel connection.",
                        ),
                      );
                });
                parentPort.postMessage({ type: "social-save", id, sessions });
              }),
          }
        : {}),
    },
  );
  web.use((_req, res, next) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
    );
    next();
  });
  web.use("/welcome", express.static(path.join(root, "dist/site")));
  web.use(express.static(path.join(root, "dist/web")));
  web.get("/{*splat}", (_req, res) =>
    res.sendFile(path.join(root, "dist/web/index.html")),
  );
  const server = web.listen(port, "127.0.0.1", () =>
    parentPort!.postMessage({ type: "ready" }),
  );
  server.on("error", () => {
    parentPort!.postMessage({
      type: "error",
      message:
        "OutClass's local port is in use. Close the other companion and reopen OutClass.",
    });
    store.close();
    process.exit(1);
  });
  parentPort!.on("message", async ({ data: message }) => {
    if (message.type === "account-saved" || message.type === "social-saved") {
      pendingAccounts.get(message.id)?.(message.ok);
      pendingAccounts.delete(message.id);
    }
    if (message.type === "key") {
      application.apiKey = message.key || undefined;
      parentPort!.postMessage({ type: "key-saved", id: message.id });
    }
    if (message.type === "shutdown") {
      await web.locals.stopPrograms();
      server.close(() => {
        store.close();
        process.exit(0);
      });
      server.closeAllConnections();
    }
  });
});
