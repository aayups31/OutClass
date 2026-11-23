import express from "express";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import {
  ACADEMY_RESOURCE_MAX_BYTES,
  type AcademyResource,
} from "../academy-resource-contract.js";
import type { Application } from "./application.js";
import { assertClean, UserError } from "./safety.js";

const key = "academy:resources:v1";
const codeExtensions = new Set(
  ".py .js .jsx .ts .tsx .html .css .json .md .txt .csv .sql .c .cpp .h .hpp .rs .go .java .rb .ipynb .yaml .yml .toml .sh .ps1 .cs .swift .kt .r".split(
    " ",
  ),
);
export function classify(
  name: string,
  bytes: Buffer,
): Pick<AcademyResource, "kind" | "mime"> {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".pdf" && bytes.subarray(0, 5).toString() === "%PDF-")
    return { kind: "pdf", mime: "application/pdf" };
  if (
    ext === ".zip" &&
    ["504b0304", "504b0506"].includes(bytes.subarray(0, 4).toString("hex"))
  )
    return { kind: "archive", mime: "application/zip" };
  if (ext === ".mp4" && bytes.subarray(4, 8).toString() === "ftyp")
    return { kind: "video", mime: "video/mp4" };
  if (ext === ".webm" && bytes.subarray(0, 4).toString("hex") === "1a45dfa3")
    return { kind: "video", mime: "video/webm" };
  if (codeExtensions.has(ext)) {
    let source: string;
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new UserError("Save code resources as UTF-8 text.");
    }
    if (source.includes("\0"))
      throw new UserError("Code files must contain text.");
    assertClean(source, "lesson code resource");
    return { kind: "code", mime: "text/plain" };
  }
  throw new UserError(
    "Choose a valid MP4, WebM, PDF, ZIP, or supported code file.",
  );
}
export class AcademyResources {
  constructor(private app: Application) {}

  private all() {
    return this.app.store.get<Record<string, AcademyResource>>(key) || {};
  }
  async bytes(resource: AcademyResource) {
    this.check([resource]);
    return this.verifiedBytes(resource);
  }
  async restore(resource: AcademyResource, bytes: Buffer) {
    const kind = classify(resource.name, bytes);
    if (
      bytes.length !== resource.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== resource.sha256 ||
      kind.kind !== resource.kind ||
      kind.mime !== resource.mime
    )
      throw new UserError(`Resource integrity failed for ${resource.name}.`);
    const old = this.all()[resource.id];
    if (old) {
      if (JSON.stringify(old) !== JSON.stringify(resource))
        throw new UserError(
          "A resource identity already has different metadata.",
          409,
        );
      try {
        await this.verifiedBytes(old);
        return old;
      } catch {
        await writeFile(this.file(old.id), bytes, { mode: 0o600 });
        return old;
      }
    }
    if (
      Object.values(this.all()).reduce(
        (sum, item) => sum + item.bytes,
        bytes.length,
      ) >
      1024 ** 3
    )
      throw new UserError("The local resource library is full.", 413);
    await mkdir(path.dirname(this.file(resource.id)), { recursive: true });
    await writeFile(this.file(resource.id), bytes, { flag: "wx", mode: 0o600 });
    this.app.store.put(key, { ...this.all(), [resource.id]: resource });
    return resource;
  }
  private file(id: string) {
    return path.resolve(this.app.store.directory, "academy-resources", id);
  }
  private async verifiedBytes(item: AcademyResource) {
    let bytes: Buffer;
    try {
      bytes = await readFile(this.file(item.id));
    } catch {
      throw new UserError(
        `The file for “${item.name}” is missing. Upload the original resource again.`,
        409,
      );
    }
    if (
      bytes.length !== item.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== item.sha256
    )
      throw new UserError(
        `The file for “${item.name}” has changed. Upload the original resource again.`,
        409,
      );
    return bytes;
  }
  check(refs: AcademyResource[]) {
    if (!refs.length) return;
    const stored = this.all();
    for (const ref of refs) {
      const item = stored[ref.id];
      if (
        !item ||
        (["name", "kind", "mime", "bytes", "sha256"] as const).some(
          (field) => item[field] !== ref[field],
        )
      )
        throw new UserError(
          `Upload “${ref.name}” on this device before saving the course.`,
        );
    }
  }
  private async upload(name: string, bytes: Buffer) {
    if (
      !Buffer.isBuffer(bytes) ||
      !bytes.length ||
      bytes.length > ACADEMY_RESOURCE_MAX_BYTES
    )
      throw new UserError("Choose a resource between 1 byte and 80 MB.");
    if (/[\\/\x00-\x1f\x7f]/.test(name) || name.startsWith("."))
      throw new UserError("Choose a file with a visible, simple file name.");
    assertClean(name, "resource name");
    const format = classify(name, bytes);
    const records = this.all();
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const prior = Object.values(records).find(
      (r) => r.sha256 === sha256 && r.name === name,
    );
    if (prior) {
      // Re-uploading the same original repairs a deleted or damaged local file.
      try {
        await this.verifiedBytes(prior);
      } catch {
        await mkdir(path.dirname(this.file(prior.id)), { recursive: true });
        await writeFile(this.file(prior.id), bytes, { mode: 0o600 });
      }
      return prior;
    }
    if (
      Object.values(records).reduce(
        (size, item) => size + item.bytes,
        bytes.length,
      ) >
      1024 ** 3
    )
      throw new UserError(
        "This device’s 1 GB Academy resource library is full.",
        413,
      );
    const resource: AcademyResource = {
      id: randomUUID(),
      name,
      ...format,
      bytes: bytes.length,
      sha256,
    };
    const file = this.file(resource.id);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes, { flag: "wx", mode: 0o600 });
    this.app.store.put(key, { ...records, [resource.id]: resource });
    return resource;
  }
  routes() {
    const router = express.Router();
    router.post(
      "/",
      express.raw({ type: "application/octet-stream", limit: "80mb" }),
      async (req, res) => {
        const name = z.string().trim().min(1).max(180).parse(req.query.name);
        res.json(await this.app.serial(() => this.upload(name, req.body)));
      },
    );
    router.get("/:id", async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const item = this.all()[id];
      if (!item)
        throw new UserError(
          "This resource is unavailable on this device.",
          404,
        );
      const bytes = await this.verifiedBytes(item);
      if (item.kind === "code" && req.query.text === "1") {
        const content = bytes.toString("utf8");
        if (content.length > 40000)
          throw new UserError(
            "Starter code is limited to 40,000 characters per file.",
          );
        res.json({ content });
        return;
      }
      res.set("X-OutClass-Resource", "1");
      res.type(item.mime).attachment(item.name);
      // attachment() may infer a type from the file extension.
      res.type(item.mime).sendFile(this.file(id));
    });
    return router;
  }
}
