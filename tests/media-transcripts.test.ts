import { it, expect } from "vitest";
import {
  parseMediaTranscript,
  MediaTranscripts,
} from "../src/server/media-transcripts";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { Store } from "../src/server/store";
import { Application } from "../src/server/application";
import { CreatorProduction } from "../src/server/creator-production";
import { Expansion } from "../src/server/expansion";
const srt =
  "1\n00:00:01,000 --> 00:00:03,500\nA <b>dictionary</b> groups repeated records.\n\n2\n00:00:04,000 --> 00:00:07,000\nTrace the accumulation for a person.\n";
it("parses real timed SRT and WebVTT cues while rejecting invalid or invented ranges", () => {
  expect(parseMediaTranscript(srt, 10)).toEqual([
    {
      index: 0,
      start: 1,
      end: 3.5,
      text: "A dictionary groups repeated records.",
    },
    {
      index: 1,
      start: 4,
      end: 7,
      text: "Trace the accumulation for a person.",
    },
  ]);
  const vtt =
    "WEBVTT\n\nNOTE do not index comments\nignore this\n\n00:01.000 --> 00:03.000 align:start\nA &amp; B are values.\n";
  expect(parseMediaTranscript(vtt, 10)[0]).toMatchObject({
    start: 1,
    end: 3,
    text: "A & B are values.",
  });
  expect(() => parseMediaTranscript(srt, 2)).toThrow(/duration/);
  expect(() =>
    parseMediaTranscript("00:00:61,000 --> 00:01:20,000\nInvalid", 100),
  ).toThrow(/timestamps/);
  expect(() =>
    parseMediaTranscript("There is no timed transcript.", 10),
  ).toThrow(/No timed/);
  expect(() =>
    parseMediaTranscript("00:00:01,000 --> 00:00:01,000\nEmpty", 10),
  ).toThrow(/duration/);
});
it("indexes owned transcripts with source hashes, revision conflicts and evidence-linked search", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "outclass-transcripts-")),
    store = new Store(dir),
    app = new Application(store),
    e = new Expansion(app),
    media = new CreatorProduction(app, () => e.state()),
    transcripts = new MediaTranscripts(app, media),
    assetId = randomUUID();
  try {
    store.put("creator:production:v1", {
      assets: [
        { id: assetId, name: "lesson.mp4", hash: "a".repeat(64), duration: 10 },
      ],
      jobs: [],
      drafts: [],
    });
    const input = {
      assetId,
      expectedRevision: 0,
      name: "lesson.srt",
      text: srt,
      rightsConfirmed: true,
    };
    const row = transcripts.save(input);
    expect(row.cues).toHaveLength(2);
    expect(row.provenance).toBe("owner_import");
    const matches = transcripts.search(assetId, "dictionary repeated");
    expect(matches[0]).toMatchObject({ start: 1, end: 3.5 });
    expect(matches[0].id).toContain(assetId);
    expect(transcripts.sources(assetId, "dictionary")[0].text).toContain(
      row.hash,
    );
    expect(() =>
      transcripts.save({ ...input, text: srt.replace("dictionary", "map") }),
    ).toThrow(/changed/);
    expect(transcripts.save({ ...input, expectedRevision: 1 }).revision).toBe(
      1,
    );
    expect(() =>
      transcripts.save({
        ...input,
        expectedRevision: 1,
        rightsConfirmed: false,
      }),
    ).toThrow();
    const state = media.state();
    state.assets[0].hash = "b".repeat(64);
    store.put("creator:production:v1", state);
    expect(transcripts.sources(assetId, "dictionary")).toEqual([]);
  } finally {
    media.stop();
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
