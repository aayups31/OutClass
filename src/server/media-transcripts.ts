import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { Application } from "./application.js";
import type { CreatorProduction } from "./creator-production.js";
import { assertClean, UserError } from "./safety.js";
export type MediaCue = {
  index: number;
  start: number;
  end: number;
  text: string;
};
export type MediaTranscript = {
  assetId: string;
  sourceHash: string;
  revision: number;
  name: string;
  hash: string;
  importedAt: string;
  cues: MediaCue[];
  provenance: "owner_import";
};
const key = "creator:transcripts:v1";
function seconds(input: string) {
  const parts = input.replace(",", ".").split(":").map(Number);
  if (
    parts.length < 2 ||
    parts.length > 3 ||
    parts.some((n) => !Number.isFinite(n) || n < 0) ||
    parts.at(-1)! >= 60 ||
    parts.at(-2)! >= 60
  )
    throw new UserError("Use valid SRT or WebVTT timestamps.");
  return parts.reduce((n, v) => n * 60 + v, 0);
}
function plain(input: string) {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(
      /&(?:amp|lt|gt|quot|apos|nbsp);/g,
      (v) =>
        ({
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&apos;": "'",
          "&nbsp;": " ",
        })[v]!,
    )
    .replace(/\s+/g, " ")
    .trim();
}
export function parseMediaTranscript(
  text: string,
  duration: number,
): MediaCue[] {
  if (Buffer.byteLength(text, "utf8") > 240000)
    throw new UserError("Choose a transcript under 240 KB.");
  const lines = text
      .replace(/^\uFEFF/, "")
      .replace(/\r\n?/g, "\n")
      .split("\n"),
    cues: MediaCue[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^(NOTE|STYLE|REGION)(?:\s|$)/.test(line)) {
      while (i < lines.length && lines[i].trim()) i++;
      continue;
    }
    if (!line.includes("-->")) continue;
    const match = line.match(
      /^((?:\d{1,3}:)?\d{2}:\d{2}[.,]\d{3})\s+-->\s+((?:\d{1,3}:)?\d{2}:\d{2}[.,]\d{3})(?:\s+.*)?$/,
    );
    if (!match)
      throw new UserError(
        "A cue has an invalid timestamp. Correct it before importing.",
      );
    const start = seconds(match[1]),
      end = seconds(match[2]),
      body: string[] = [];
    while (i + 1 < lines.length && lines[i + 1].trim()) {
      if (lines[i + 1].includes("-->"))
        throw new UserError("Separate transcript cues with a blank line.");
      body.push(lines[++i]);
    }
    const content = plain(body.join(" "));
    if (end <= start || end > duration + 0.05)
      throw new UserError(
        "Transcript cues must fit the selected footage duration.",
      );
    if (content.length > 1200)
      throw new UserError(
        "Split transcript cues longer than 1,200 characters.",
      );
    if (content)
      cues.push({
        index: cues.length,
        start,
        end: Math.min(end, duration),
        text: content,
      });
    if (cues.length > 4000)
      throw new UserError("Split transcripts with more than 4,000 cues.");
  }
  if (!cues.length)
    throw new UserError(
      "No timed speech cues found. Import an SRT or WebVTT transcript.",
    );
  cues.sort((a, b) => a.start - b.start || a.end - b.end);
  return cues.map((c, index) => ({ ...c, index }));
}
export class MediaTranscripts {
  constructor(
    private app: Application,
    private media: CreatorProduction,
  ) {}
  list() {
    return this.app.store.get<MediaTranscript[]>(key) || [];
  }
  get(assetId: string) {
    return this.list().find((t) => t.assetId === assetId);
  }
  save(raw: unknown) {
    const input = z
      .object({
        assetId: z.string().uuid(),
        expectedRevision: z.number().int().min(0),
        name: z.string().min(1).max(160),
        text: z.string().max(240000),
        rightsConfirmed: z.literal(true),
      })
      .strict()
      .parse(raw);
    const asset = this.media.state().assets.find((a) => a.id === input.assetId),
      old = this.get(input.assetId);
    if (!asset)
      throw new UserError("Select imported source footage first.", 404);
    if (!/\.(srt|vtt)$/i.test(input.name))
      throw new UserError("Import an SRT or WebVTT file.");
    if ((old?.revision || 0) !== input.expectedRevision)
      throw new UserError(
        "This transcript changed. Reload before replacing it.",
        409,
      );
    assertClean(input.text, "media transcript");
    const cues = parseMediaTranscript(input.text, asset.duration),
      hash = createHash("sha256")
        .update(JSON.stringify({ sourceHash: asset.hash, cues }))
        .digest("hex");
    if (old?.hash === hash) return old;
    const transcript: MediaTranscript = {
      assetId: asset.id,
      sourceHash: asset.hash,
      revision: input.expectedRevision + 1,
      name: input.name,
      hash,
      importedAt: new Date().toISOString(),
      cues,
      provenance: "owner_import",
    };
    this.app.store.put(key, [
      ...this.list().filter((t) => t.assetId !== asset.id),
      transcript,
    ]);
    return transcript;
  }
  search(assetId: string, query: string, limit = 8) {
    const asset = this.media.state().assets.find((a) => a.id === assetId),
      transcript = this.get(assetId);
    if (!asset || !transcript || transcript.sourceHash !== asset.hash)
      return [];
    const stop = new Set([
      "the",
      "and",
      "with",
      "from",
      "this",
      "that",
      "for",
      "into",
      "your",
      "create",
      "develop",
      "explain",
      "lesson",
      "preview",
      "source",
      "task",
      "selected",
    ]);
    const terms = [
      ...new Set(
        (query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []).filter(
          (t) => !stop.has(t),
        ),
      ),
    ].slice(0, 40);
    const ranked = transcript.cues.map((c) => ({
      ...c,
      score: terms.reduce(
        (n, t) => n + (c.text.toLowerCase().includes(t) ? 1 : 0),
        0,
      ),
    }));
    return ranked
      .filter((c) => !terms.length || c.score > 0)
      .sort((a, b) => b.score - a.score || a.start - b.start)
      .slice(0, Math.min(12, limit))
      .map((c) => ({
        ...c,
        id: `transcript:${assetId}:${c.index}`,
        transcriptHash: transcript.hash,
      }));
  }
  sources(assetId: string, query: string) {
    const transcript = this.get(assetId);
    if (!transcript) return [];
    const matches = this.search(assetId, query),
      cues = matches.length ? matches : this.search(assetId, "");
    return cues
      .slice(0, 8)
      .map((c) => ({
        id: c.id,
        title: `${transcript.name} · ${c.start.toFixed(2)}–${c.end.toFixed(2)}s`,
        text: JSON.stringify({
          start: c.start,
          end: c.end,
          text: c.text,
          provenance: "owner_import",
          sourceHash: transcript.sourceHash,
          transcriptHash: transcript.hash,
        }),
      }));
  }
  routes() {
    const router = Router();
    router.get("/:assetId", (req, res) =>
      res.json(this.get(z.string().uuid().parse(req.params.assetId)) || null),
    );
    router.get("/:assetId/search", (req, res) =>
      res.json(
        this.search(
          z.string().uuid().parse(req.params.assetId),
          z
            .string()
            .max(1000)
            .parse(req.query.q || ""),
        ),
      ),
    );
    router.post("/", (req, res) => res.json(this.save(req.body)));
    return router;
  }
}
