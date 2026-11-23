import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { request as rawRequest } from "node:http";
import { Store } from "../src/server/store";
import { Application } from "../src/server/application";
import { createApp } from "../src/server/http";
let directory: string;
let store: Store;
let server: Server;
let base: string;
let localToken: string;
let focused: number;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "gitlearn-http-"));
  store = new Store(directory);
  localToken = store.get<string>("localToken")!;
  const app = new Application(store);
  const port = 49153 + Math.floor(Math.random() * 1000);
  focused = 0;
  server = createApp(app, port, () => focused++).listen(port, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${port}`;
}, 30000);
afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  store.close();
  await rm(directory, { recursive: true, force: true });
});
it("rejects foreign pages and DNS rebinding hosts", async () => {
  expect(
    (
      await fetch(`${base}/api/bootstrap`, {
        method: "POST",
        headers: { Origin: "https://evil.example" },
      })
    ).status,
  ).toBe(403);
  const hostStatus = await new Promise<number>((resolve) => {
    const req = rawRequest(
      `${base}/api/health`,
      { headers: { Host: "evil.example" } },
      (response) => {
        response.resume();
        resolve(response.statusCode!);
      },
    );
    req.end();
  });
  expect(hostStatus).toBe(403);
  expect(
    (
      await fetch(`${base}/api/bootstrap`, {
        method: "POST",
        headers: { Origin: base, "Sec-Fetch-Site": "cross-site" },
      })
    ).status,
  ).toBe(403);
  expect(
    (await fetch(`${base}/api/bootstrap`, { method: "POST" })).status,
  ).toBe(403);
  expect(
    (
      await fetch(`${base}/api/bootstrap`, {
        method: "POST",
        headers: { Origin: base },
      })
    ).status,
  ).toBe(200);
});
it("connects AI guides before folder setup while still requiring a ready provider", async () => {
  const post = (route: string, body: unknown) =>
    fetch(`${base}/api/${route}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localToken}`,
      },
      body: JSON.stringify(body),
    });
  expect((await post("assistant-enable", { enabled: true })).status).toBe(400);
  expect(
    (
      await post("ai-config", {
        mode: "local",
        service: "",
        localEndpoint: "http://127.0.0.1:11434/v1",
        localModel: "fixture",
      })
    ).status,
  ).toBe(200);
  const enabled = await post("assistant-enable", { enabled: true });
  expect(enabled.status).toBe(200);
  expect((await enabled.json()).settings).toMatchObject({
    configured: false,
    assistantEnabled: true,
  });
});
it("requires authentication and never publishes the API key", async () => {
  expect((await fetch(`${base}/api/state`)).status).toBe(401);
  const result = await fetch(`${base}/api/state`, {
    headers: { Authorization: `Bearer ${localToken}` },
  });
  expect(result.status).toBe(200);
  expect(await result.text()).not.toContain("localToken");
});
it("pairs an editor with one course, excludes local privileges and supports revocation", async () => {
  const post = (route: string, body: unknown, token = localToken) =>
    fetch(`${base}/api/${route}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  await post("setup", {
    repoPath: path.join(directory, "history"),
    aiEnabled: false,
  });
  for (const id of ["one", "two"])
    await post("observations", {
      eventId: id,
      courseId: id,
      title: id,
      url: `https://www.udemy.com/course/${id}/learn/lecture/1`,
      lessons: [{ id: "1", title: "Functions", section: "Basics", order: 0 }],
    });
  await post("start", { courseId: "one", lessonId: "1" });
  const { code } = await (await post("editor-code", {})).json();
  const pair = await post("editor-pair", { code }, "");
  expect(pair.status).toBe(200);
  const { token } = await pair.json();
  expect(
    (
      await fetch(`${base}/api/editor-context`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await fetch(`${base}/api/state`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await post(
        "assistant-chat",
        { courseId: "two", question: "Unrelated", mode: "help" },
        token,
      )
    ).status,
  ).toBe(403);
  expect((await post("ai-config", { mode: "local" }, token)).status).toBe(403);
  expect((await post("editor-pair", { code }, "")).status).toBe(401);
  const connection = store.get<any[]>("editorConnections")![0];
  await post("workspace-file", {
    sessionId: store.state().session!.id,
    path: "main.js",
    content: "console.log('EDITOR_PROOF');",
    version: null,
  });
  const execution = await post(
    "editor-run",
    { courseId: "one", path: "main.js" },
    token,
  );
  expect(execution.status).toBe(200);
  expect((await execution.json()).output).toContain("EDITOR_PROOF");
  expect(
    (await post("editor-run", { courseId: "two", path: "main.js" }, token))
      .status,
  ).toBe(403);
  await post("editor-revoke", { id: connection.id });
  expect(
    (
      await fetch(`${base}/api/editor-context`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status,
  ).toBe(401);
});
it("rejects invented and cross-course run IDs before requesting any AI help", async () => {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${localToken}`,
  };
  const post = (route: string, body: unknown) =>
    fetch(`${base}/api/${route}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  expect(
    (
      await post("setup", {
        repoPath: path.join(directory, "history"),
        aiEnabled: false,
      })
    ).status,
  ).toBe(200);
  for (const courseId of ["one", "two"])
    await post("observations", {
      eventId: courseId,
      courseId,
      title: courseId,
      url: `https://www.udemy.com/course/${courseId}/learn/lecture/1`,
      lessons: [{ id: "1", title: "Functions", section: "Basics", order: 0 }],
    });
  await post("start", { courseId: "one", lessonId: "1" });
  const id = store.state().session!.id;
  await post("workspace-file", {
    sessionId: id,
    path: "main.js",
    content: "throw new Error('Real error');",
    version: null,
  });
  const result = (await (
    await post("workspace-run", { sessionId: id, path: "main.js" })
  ).json()) as { run: { id: string } };
  expect(
    (
      await post("assistant-chat", {
        courseId: "one",
        mode: "help",
        question: "Explain",
        runId: "00000000-0000-4000-8000-000000000000",
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await post("assistant-chat", {
        courseId: "two",
        mode: "help",
        question: "Explain",
        runId: result.run.id,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await post("assistant-chat", {
        courseId: "one",
        mode: "course",
        question: "Explain",
        runId: result.run.id,
      })
    ).status,
  ).toBe(400);
  const diagnostics = await (
    await fetch(`${base}/api/diagnostics`, { headers })
  ).json();
  expect(diagnostics).toMatchObject({
    gitAvailable: true,
    historyWritable: true,
    hasApiKey: false,
    workspaceWritable: true,
  });
  expect(diagnostics).not.toHaveProperty("apiKey");
});
it("pairs an extension with a one-use code and limits its authority", async () => {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${localToken}`,
  };
  const code = (await (
    await fetch(`${base}/api/pair-code`, {
      method: "POST",
      headers,
      body: "{}",
    })
  ).json()) as { code: string };
  const origin = `chrome-extension://${"a".repeat(32)}`;
  const paired = await fetch(`${base}/api/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(code),
  });
  expect(paired.status).toBe(200);
  const { token } = (await paired.json()) as { token: string };
  expect(
    (await fetch(`${base}/api/open-desktop`, { method: "POST" })).status,
  ).toBe(401);
  expect(focused).toBe(0);
  const opened = await fetch(`${base}/api/open-desktop`, {
    method: "POST",
    headers: { Origin: origin, Authorization: `Bearer ${token}` },
  });
  expect(await opened.json()).toEqual({ opened: true });
  expect(focused).toBe(1);
  expect(
    (
      await fetch(`${base}/api/state`, {
        headers: { Origin: origin, Authorization: `Bearer ${token}` },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await fetch(`${base}/api/extension-status`, {
        headers: { Origin: origin, Authorization: `Bearer ${token}` },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await fetch(`${base}/api/extension-status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await fetch(`${base}/api/state`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status,
  ).toBe(403);
  for (const route of [
    "workspace-file",
    "workspace-run",
    "library-index",
    "assistant-chat",
    "assistant-enable",
    "course-project",
    "continue",
    "editor-anchor",
    "diagnostics",
    "workspace-runs",
    "practice-start",
    "practice-check",
    "practice-update",
    "practice-hint",
    "practice",
    "project-command",
    "project-scaffold",
    "project-input",
    "project-stop",
    "project-commands",
    "live-search",
    "live-select",
    "live-clone",
    "live-open",
    "live-draft",
    "learning-export",
  ]) {
    expect(
      (
        await fetch(`${base}/api/${route}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
    ).toBe(403);
  }
  expect(
    (
      await fetch(`${base}/api/extension-status`, {
        headers: {
          Origin: `chrome-extension://${"c".repeat(32)}`,
          Authorization: `Bearer ${token}`,
        },
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await fetch(`${base}/api/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify(code),
      })
    ).status,
  ).toBe(401);
});
it("bounds pairing attempts and validates malformed requests", async () => {
  const origin = `chrome-extension://${"b".repeat(32)}`;
  for (let i = 0; i < 5; i++)
    await fetch(`${base}/api/pair`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ code: "000000" }),
    });
  expect(
    (
      await fetch(`${base}/api/pair`, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ code: "000000" }),
      })
    ).status,
  ).toBe(429);
  const result = await fetch(`${base}/api/start`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${localToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  expect(result.status).toBe(400);
});
it("rejects a delayed note save for a different lesson session", async () => {
  const response = await fetch(`${base}/api/note`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${localToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sessionId: "old-lesson-session",
      note: "An old tab’s note",
    }),
  });
  expect(response.status).toBe(409);
  expect(store.state().session).toBeNull();
});
