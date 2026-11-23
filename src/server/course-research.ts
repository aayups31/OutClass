import { randomUUID, createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { parseHTML } from "linkedom";
import { academyReference } from "../academy-reference-contract.js";
import { assertClean, UserError } from "./safety.js";
import type { Application } from "./application.js";
import type { AcademyDraft } from "../expansion-contract.js";

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
    app.store.db.exec(
      "CREATE TABLE IF NOT EXISTS academy_reading_sections(document_id TEXT PRIMARY KEY, sections TEXT NOT NULL)",
    );
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
      sections = body.split(/\n\s*\n/).map((text, index) => ({
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
    if (this.list().length >= 1000)
      throw new UserError(
        "Back up and remove older research versions before exceeding 1,000 documents.",
      );
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
      this.app.store.db
        .prepare(
          "INSERT INTO academy_reading_sections(document_id,sections) VALUES(?,?)",
        )
        .run(id, JSON.stringify(sections));
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
  issues(course: AcademyDraft) {
    const sources = new Map(this.list().map((row) => [row.id, row]));
    return course.lessons.flatMap((lesson, index) =>
      (lesson.researchEvidence || []).flatMap((evidence) => {
        const source = sources.get(evidence.documentId);
        return !source?.active ||
          source.hash !== evidence.hash ||
          (evidence.expiresOn &&
            evidence.expiresOn < new Date().toISOString().slice(0, 10))
          ? [
              {
                lessonIndex: index,
                detail:
                  "A used research source changed, was revoked or expired. Review its permission and current passages before releasing this course.",
              },
            ]
          : [];
      }),
    );
  }
  backup() {
    const backup = {
      format: "outclass-research-library",
      version: 1,
      documents: this.list().map((document) => ({
        document,
        sections: JSON.parse(
          (
            this.app.store.db
              .prepare(
                "SELECT sections FROM academy_reading_sections WHERE document_id=?",
              )
              .get(document.id) as { sections: string } | undefined
          )?.sections || "null",
        ),
      })),
    };
    if (Buffer.byteLength(JSON.stringify(backup)) > 32000000)
      throw new UserError("Split research backups above 32 MB.");
    return backup;
  }
  restore(raw: unknown) {
    const input = z
      .object({
        format: z.literal("outclass-research-library"),
        version: z.literal(1),
        documents: z
          .array(
            z.object({
              document: z.object({
                id: z.string().uuid(),
                source_id: z.string().uuid(),
                version: z.number().int().positive(),
                hash: z.string().regex(/^[a-f0-9]{64}$/),
                metadata: researchInput.omit({ body: true }),
                created_at: z.iso.datetime(),
                active: z.number().int().min(0).max(1),
              }),
              sections: z
                .array(
                  z.object({
                    location: z.string().max(300),
                    text: z.string().max(500000),
                  }),
                )
                .max(5000),
            }),
          )
          .max(1000),
      })
      .strict()
      .parse(raw);
    const existing = new Map(this.list().map((doc) => [doc.id, doc]));
    if (Buffer.byteLength(JSON.stringify(raw)) > 32000000)
      throw new UserError("Split research backups above 32 MB.");
    if (
      new Set([
        ...existing.keys(),
        ...input.documents.map((row) => row.document.id),
      ]).size > 1000
    )
      throw new UserError("This backup would exceed 1,000 research documents.");
    for (const { document, sections } of input.documents) {
      assertClean(JSON.stringify({ document, sections }), "research backup");
      if (
        document.source_id !== document.metadata.reference.id ||
        createHash("sha256")
          .update(JSON.stringify({ metadata: document.metadata, sections }))
          .digest("hex") !== document.hash
      )
        throw new UserError(
          "Research backup integrity failed. No documents were restored.",
        );
      if (
        existing.has(document.id) &&
        existing.get(document.id)!.hash !== document.hash
      )
        throw new UserError("A research identity conflicts with this backup.");
    }
    this.app.store.transaction(() => {
      for (const { document, sections } of input.documents) {
        if (existing.has(document.id)) continue;
        this.app.store.db
          .prepare(
            "INSERT INTO academy_readings(id,source_id,version,hash,metadata,created_at,active) VALUES(?,?,?,?,?,?,0)",
          )
          .run(
            document.id,
            document.source_id,
            document.version,
            document.hash,
            JSON.stringify(document.metadata),
            document.created_at,
          );
        this.app.store.db
          .prepare(
            "INSERT INTO academy_reading_sections(document_id,sections) VALUES(?,?)",
          )
          .run(document.id, JSON.stringify(sections));
        for (const section of sections)
          for (let start = 0; start < section.text.length; start += 1500)
            this.app.store.db
              .prepare(
                "INSERT INTO academy_passages(document_id,location,text) VALUES(?,?,?)",
              )
              .run(
                document.id,
                `${section.location}, character ${start}`,
                section.text.slice(start, start + 1500),
              );
      }
    });
    return { restored: input.documents.length, requiresPermissionReview: true };
  }
  approve(id: string) {
    const doc = this.list().find((row) => row.id === id);
    if (!doc || !doc.metadata.reference.approved)
      throw new UserError(
        "Choose an attributed source with a permission record.",
      );
    if (
      doc.metadata.expiresOn &&
      doc.metadata.expiresOn < new Date().toISOString().slice(0, 10)
    )
      throw new UserError(
        "This source permission expired. Import a new permission record.",
      );
    this.app.store.transaction(() => {
      this.app.store.db
        .prepare("UPDATE academy_readings SET active=0 WHERE source_id=?")
        .run(doc.source_id);
      this.app.store.db
        .prepare("UPDATE academy_readings SET active=1 WHERE id=?")
        .run(id);
    });
    return { approved: true };
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
    if (!docs.size) return [];
    const rows = this.app.store.db
      .prepare(
        `SELECT document_id,location,text,bm25(academy_passages) AS rank FROM academy_passages WHERE academy_passages MATCH ? AND document_id IN (${[...docs.keys()].map(() => "?").join(",")}) ORDER BY rank LIMIT 6`,
      )
      .all(
        terms.map((term) => `"${term}"`).join(" OR "),
        ...[...docs.keys()],
      ) as {
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
    router.get("/backup", (_req, res) => res.json(this.backup()));
    router.post("/restore", (req, res) => res.json(this.restore(req.body)));
    router.post("/:id/approve", (req, res) => {
      z.object({ reviewedPermission: z.literal(true) })
        .strict()
        .parse(req.body);
      res.json(this.approve(z.string().uuid().parse(req.params.id)));
    });
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
