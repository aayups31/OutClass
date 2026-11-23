import { randomUUID, createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { parseHTML } from "linkedom";
import { academyReference } from "../academy-reference-contract.js";
import { assertClean, UserError } from "./safety.js";
import type { Application } from "./application.js";

export const researchInput = z
  .object({
    reference: academyReference,
    topics: z.array(z.string().trim().min(1).max(100)).max(20),
    level: z.enum(["introductory", "intermediate", "advanced"]),
    format: z.enum(["text", "html", "transcript", "pdf"]),
    body: z.string().min(1).max(3000000),
    expiresOn: z.union([z.literal(""), z.iso.date()]),
  })
  .strict();
type ResearchInput = z.infer<typeof researchInput>;
export class CourseResearch {
  constructor(private app: Application) {
    app.store.db
      .exec(`CREATE TABLE IF NOT EXISTS academy_readings(id TEXT PRIMARY KEY, source_id TEXT NOT NULL, version INTEGER NOT NULL, hash TEXT NOT NULL, metadata TEXT NOT NULL, created_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
      CREATE VIRTUAL TABLE IF NOT EXISTS academy_passages USING fts5(document_id UNINDEXED, location UNINDEXED, text);`);
  }
  list() {
    return (
      this.app.store.db
        .prepare(
          "SELECT id,source_id,version,hash,metadata,created_at,active FROM academy_readings ORDER BY created_at DESC LIMIT 1000",
        )
        .all() as {
        id: string;
        source_id: string;
        version: number;
        hash: string;
        metadata: string;
        created_at: string;
        active: number;
      }[]
    ).map((row) => ({
      ...row,
      metadata: JSON.parse(row.metadata) as Omit<ResearchInput, "body">,
    }));
  }
  async ingest(raw: unknown) {
    const input = researchInput.parse(raw);
    if (!input.reference.approved)
      throw new UserError(
        "Review source permission and approve sending its passages to the configured AI before indexing.",
      );
    if (
      input.expiresOn &&
      input.expiresOn < new Date().toISOString().slice(0, 10)
    )
      throw new UserError("The source permission has expired.");
    let sections: { location: string; text: string }[] = [];
    if (input.format === "pdf") {
      const bytes = Buffer.from(input.body, "base64");
      if (bytes.length > 2000000 || bytes.subarray(0, 5).toString() !== "%PDF-")
        throw new UserError(
          "Choose a text PDF under 2 MB; scanned pages require a separately reviewed transcript.",
        );
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const task = getDocument({
        data: Uint8Array.from(bytes),
        useSystemFonts: false,
      });
      const timeout = setTimeout(() => void task.destroy(), 15000);
      try {
        const doc = await task.promise;
        if (doc.numPages > 100)
          throw new UserError(
            "Split the PDF into documents of at most 100 pages.",
          );
        for (let page = 1; page <= doc.numPages; page++) {
          const content = await (await doc.getPage(page)).getTextContent();
          sections.push({
            location: `page ${page}`,
            text: content.items
              .map((item) => ("str" in item ? item.str : ""))
              .join(" "),
          });
        }
      } finally {
        clearTimeout(timeout);
        await task.destroy();
      }
    } else {
      let body = input.body;
      if (input.format === "html") {
        const { document } = parseHTML(body);
        document
          .querySelectorAll("script,style,iframe,object,nav,footer,form")
          .forEach((node) => node.remove());
        body =
          [...document.querySelectorAll("h1,h2,h3,p,li,pre,blockquote")]
            .map((node) => node.textContent || "")
            .join("\n\n") ||
          document.body.textContent ||
          "";
      }
      sections = body
        .split(/\n\s*\n/)
        .map((text, index) => ({
          location:
            input.format === "transcript"
              ? `transcript block ${index + 1}`
              : `section ${index + 1}`,
          text,
        }));
    }
    if (!sections.some((section) => section.text.trim()))
      throw new UserError(
        "No readable text was extracted. Supply a reviewed transcript instead.",
      );
    const plain = sections.map((section) => section.text).join("\n\n");
    if (plain.length > 500000)
      throw new UserError(
        "Split source text into documents under 500,000 characters.",
      );
    assertClean(plain, "research source");
    const { body: _, ...metadata } = input;
    const hash = createHash("sha256")
      .update(JSON.stringify({ metadata, sections }))
      .digest("hex");
    const prior = this.list().find(
      (row) =>
        row.source_id === input.reference.id && row.hash === hash && row.active,
    );
    if (prior) return prior;
    const version =
      1 +
      Math.max(
        0,
        ...this.list()
          .filter((row) => row.source_id === input.reference.id)
          .map((row) => row.version),
      );
    const id = randomUUID();
    this.app.store.transaction(() => {
      this.app.store.db
        .prepare("UPDATE academy_readings SET active=0 WHERE source_id=?")
        .run(input.reference.id);
      this.app.store.db
        .prepare(
          "INSERT INTO academy_readings(id,source_id,version,hash,metadata,created_at) VALUES(?,?,?,?,?,?)",
        )
        .run(
          id,
          input.reference.id,
          version,
          hash,
          JSON.stringify(metadata),
          new Date().toISOString(),
        );
      const insert = this.app.store.db.prepare(
        "INSERT INTO academy_passages(document_id,location,text) VALUES(?,?,?)",
      );
      for (const section of sections)
        for (let start = 0; start < section.text.length; start += 1500)
          insert.run(
            id,
            `${section.location}, character ${start}`,
            section.text.slice(start, start + 1500),
          );
    });
    return this.list().find((row) => row.id === id)!;
  }
  revoke(id: string) {
    this.app.store.db
      .prepare("UPDATE academy_readings SET active=0 WHERE id=?")
      .run(id);
  }
  search(query: string, topics: string[] = [], level?: string) {
    const terms = [...new Set(query.match(/[\p{L}\p{N}]{3,}/gu) || [])].slice(
      0,
      20,
    );
    if (!terms.length) return [];
    const docs = new Map(
      this.list()
        .filter(
          (doc) =>
            doc.active &&
            (!doc.metadata.expiresOn ||
              doc.metadata.expiresOn >=
                new Date().toISOString().slice(0, 10)) &&
            (!level || level === doc.metadata.level) &&
            (!topics.length ||
              topics.some((topic) => doc.metadata.topics.includes(topic))),
        )
        .map((doc) => [doc.id, doc]),
    );
    const rows = this.app.store.db
      .prepare(
        "SELECT document_id,location,text,bm25(academy_passages) AS rank FROM academy_passages WHERE academy_passages MATCH ? ORDER BY rank LIMIT 100",
      )
      .all(terms.map((term) => `"${term}"`).join(" OR ")) as {
      document_id: string;
      location: string;
      text: string;
      rank: number;
    }[];
    return rows
      .filter((row) => docs.has(row.document_id))
      .slice(0, 6)
      .map((row) => {
        const document = docs.get(row.document_id)!;
        return {
          id: `research:${document.id}:${createHash("sha256").update(row.location).digest("hex").slice(0, 12)}`,
          title: document.metadata.reference.title,
          text: JSON.stringify({
            passage: row.text,
            location: row.location,
            url: document.metadata.reference.url,
            authors: document.metadata.reference.authors,
            license: document.metadata.reference.license,
            permissionNote: document.metadata.reference.permissionNote,
            hash: document.hash,
            version: document.version,
          }),
          documentId: document.id,
          hash: document.hash,
        };
      });
  }
  routes() {
    const router = Router();
    router.get("/", (_req, res) => res.json(this.list()));
    router.post("/", async (req, res) => res.json(await this.ingest(req.body)));
    router.post("/:id/revoke", (req, res) => {
      this.revoke(z.string().uuid().parse(req.params.id));
      res.json({ revoked: true });
    });
    router.get("/search", (req, res) =>
      res.json(this.search(z.string().min(1).max(1000).parse(req.query.q))),
    );
    return router;
  }
}
