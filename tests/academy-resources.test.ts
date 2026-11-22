import { afterEach, beforeEach, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store } from "../src/server/store";
import { Application } from "../src/server/application";
import { AcademyResources } from "../src/server/academy-resources";

let directory: string, store: Store, server: Server, base: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "outclass-resources-"));
  store = new Store(path.join(directory, "data"));
  const app = express();
  app.use("/resources", new AcademyResources(new Application(store)).routes());
  app.use((error: any, _req: any, res: any, _next: any) => {
    res.status(error.status || 500).json({ error: error.message });
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  base = `http://127.0.0.1:${address.port}/resources`;
});
afterEach(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  store.close();
  await rm(directory, { recursive: true, force: true });
});
async function upload(name: string, content: string | Buffer) {
  const response = await fetch(base + "?name=" + encodeURIComponent(name), {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: content,
  });
  expect(response.status).toBe(200);
  return response.json();
}
it("rejects a changed resource and repairs it when the original is re-uploaded", async () => {
  const resource = await upload(
    "lesson.py",
    "# TODO: implement the learner task\n",
  );
  const filename = path.join(store.directory, "academy-resources", resource.id);
  await writeFile(filename, "# changed");
  const corrupted = await fetch(base + "/" + resource.id);
  expect(corrupted.status).toBe(409);
  expect((await corrupted.json()).error).toContain("has changed");
  const restored = await upload(
    "lesson.py",
    "# TODO: implement the learner task\n",
  );
  expect(restored.id).toBe(resource.id);
  expect(
    await (await fetch(base + "/" + resource.id + "?text=1")).json(),
  ).toEqual({
    content: "# TODO: implement the learner task\n",
  });
  await rm(filename);
  expect((await fetch(base + "/" + resource.id)).status).toBe(409);
  expect(
    (await upload("lesson.py", "# TODO: implement the learner task\n")).id,
  ).toBe(resource.id);
});
it("uses the documented character limit for Unicode starter code", async () => {
  const source = "# " + "漢".repeat(15000);
  const resource = await upload("unicode.py", source);
  const response = await fetch(base + "/" + resource.id + "?text=1");
  expect(response.status).toBe(200);
  expect((await response.json()).content).toBe(source);
});
it("preserves byte range responses for video seeking", async () => {
  const bytes = Buffer.concat([
    Buffer.from([0, 0, 0, 24]),
    Buffer.from("ftyp"),
    Buffer.alloc(100),
  ]);
  const resource = await upload("lesson.mp4", bytes);
  const response = await fetch(base + "/" + resource.id, {
    headers: { Range: "bytes=8-15" },
  });
  expect(response.status).toBe(206);
  expect(response.headers.get("content-range")).toBe("bytes 8-15/108");
  expect((await response.arrayBuffer()).byteLength).toBe(8);
});
