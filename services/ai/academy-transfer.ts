import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { HostedAcademy } from "./academy.js";
import { UserError } from "../../src/server/safety.js";

export const TRANSFER_CHUNK = 240000;
// Private publication staging has its own RLS tables. It can never be linked as learner media.
export class HostedAcademyTransfer {
  constructor(private academy: HostedAcademy) {}
  async begin(actor: string, raw: unknown) {
    const value = z
      .object({
        id: z.string().uuid(),
        bytes: z.number().int().min(1).max(48000000),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .parse(raw);
    return this.academy.scoped(actor, async (db) => {
      const ready=(await db.query("SELECT to_regclass('outclass_platform.course_transfers') AS relation")).rows[0].relation;
      if(!ready)throw new UserError("Large course uploads are awaiting the hosted storage migration. Your local release remains available; retry after the service upgrade.",503);
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,41))", [
        actor,
      ]);
      await db.query(
        "DELETE FROM outclass_platform.course_transfers WHERE author_id=$1 AND expires_at<now()",
        [actor],
      );
      const prior = (
        await db.query(
          "SELECT * FROM outclass_platform.course_transfers WHERE id=$1",
          [value.id],
        )
      ).rows[0];
      if (prior) {
        if (
          prior.author_id !== actor ||
          prior.bytes !== value.bytes ||
          prior.sha256 !== value.sha256
        )
          throw new UserError(
            "This transfer identity belongs to different content.",
            409,
          );
        return {
          id: value.id,
          complete: !!prior.receipt,
          chunkBytes: TRANSFER_CHUNK,
        };
      }
      const used = (
        await db.query(
          "SELECT coalesce(sum(bytes) FILTER(WHERE receipt IS NULL),0)::bigint AS bytes,count(*)::int AS count FROM outclass_platform.course_transfers WHERE author_id=$1",
          [actor],
        )
      ).rows[0];
      if (Number(used.bytes) + value.bytes > 100000000 || used.count >= 200)
        throw new UserError(
          "Finish existing course transfers before starting more uploads.",
          413,
        );
      await db.query(
        "INSERT INTO outclass_platform.course_transfers(id,author_id,bytes,sha256) VALUES($1,$2,$3,$4)",
        [value.id, actor, value.bytes, value.sha256],
      );
      return { id: value.id, complete: false, chunkBytes: TRANSFER_CHUNK };
    });
  }
  async chunk(actor: string, id: string, raw: unknown) {
    z.string().uuid().parse(id);
    const value = z
        .object({
          position: z.number().int().min(0).max(199),
          base64: z.string().max(320000),
        })
        .strict()
        .parse(raw),
      bytes = Buffer.from(value.base64, "base64");
    return this.academy.scoped(actor, async (db) => {
      const row = (
        await db.query(
          "SELECT * FROM outclass_platform.course_transfers WHERE id=$1 AND author_id=$2 AND expires_at>now() FOR UPDATE",
          [id, actor],
        )
      ).rows[0];
      if (!row || row.receipt)
        throw new UserError(
          "Choose an unfinished course transfer owned by this account.",
          409,
        );
      if (
        !bytes.length ||
        bytes.length !==
          Math.min(TRANSFER_CHUNK, row.bytes - value.position * TRANSFER_CHUNK)
      )
        throw new UserError(
          "The chunk does not match the declared transfer length.",
        );
      const prior = (
        await db.query(
          "SELECT data FROM outclass_platform.course_transfer_chunks WHERE transfer_id=$1 AND position=$2",
          [id, value.position],
        )
      ).rows[0];
      if (prior && !Buffer.from(prior.data).equals(bytes))
        throw new UserError(
          "This transfer position already contains different bytes.",
          409,
        );
      await db.query(
        "INSERT INTO outclass_platform.course_transfer_chunks(transfer_id,position,data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [id, value.position, bytes],
      );
      return { stored: true };
    });
  }
  async publish(actor: string, id: string) {
    z.string().uuid().parse(id);
    const staged = await this.academy.scoped(actor, async (db) => {
      const row = (
        await db.query(
          "SELECT * FROM outclass_platform.course_transfers WHERE id=$1 AND author_id=$2 AND expires_at>now()",
          [id, actor],
        )
      ).rows[0];
      if (!row)
        throw new UserError(
          "Course transfer not found or expired. Upload it again.",
          404,
        );
      if (row.receipt) return { receipt: row.receipt };
      const chunks = (
        await db.query(
          "SELECT position,data FROM outclass_platform.course_transfer_chunks WHERE transfer_id=$1 ORDER BY position",
          [id],
        )
      ).rows;
      if (
        chunks.length !== Math.ceil(row.bytes / TRANSFER_CHUNK) ||
        chunks.some((chunk, index) => chunk.position !== index)
      )
        throw new UserError(
          "Upload every course chunk before publishing.",
          409,
        );
      const bytes = Buffer.concat(
        chunks.map((chunk) => Buffer.from(chunk.data)),
      );
      if (
        bytes.length !== row.bytes ||
        createHash("sha256").update(bytes).digest("hex") !== row.sha256
      )
        throw new UserError("Course transfer failed its integrity check.");
      try {
        return { publication: JSON.parse(bytes.toString("utf8")) };
      } catch {
        throw new UserError("Course transfer is not valid JSON.");
      }
    });
    if (staged.receipt) return staged.receipt;
    // Publication itself validates the full course and exact review, atomically and idempotently.
    const receipt = await this.academy.publish(actor, staged.publication);
    await this.academy.scoped(actor, async (db) => {
      await db.query(
        "UPDATE outclass_platform.course_transfers SET receipt=$2 WHERE id=$1",
        [id, JSON.stringify(receipt)],
      );
      await db.query(
        "DELETE FROM outclass_platform.course_transfer_chunks WHERE transfer_id=$1",
        [id],
      );
    });
    return receipt;
  }
  routes() {
    const router = Router();
    router.post("/", async (req, res) =>
      res.json(await this.begin(res.locals.user, req.body)),
    );
    router.post("/:id/chunk", async (req, res) =>
      res.json(await this.chunk(res.locals.user, req.params.id, req.body)),
    );
    router.post("/:id/publish", async (req, res) => {
      z.object({}).strict().parse(req.body);
      res.json(await this.publish(res.locals.user, req.params.id));
    });
    return router;
  }
}
