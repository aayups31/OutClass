import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { HostedAcademy } from "./academy.js";
import {
  academyResource,
  type AcademyResource,
} from "../../src/academy-resource-contract.js";
import { UserError } from "../../src/server/safety.js";
const CHUNK = 240000;
export class HostedAcademyMedia {
  constructor(private academy: HostedAcademy) {}
  async begin(actor: string, raw: unknown) {
    const resource = academyResource.parse(raw);
    return this.academy.scoped(actor, async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,31))", [
        actor,
      ]);
      const prior = await db.query(
        "SELECT * FROM outclass_platform.media_assets WHERE id=$1",
        [resource.id],
      );
      if (prior.rows.length) {
        const row = prior.rows[0];
        if (
          row.author_id !== actor ||
          row.sha256 !== resource.sha256 ||
          row.bytes !== resource.bytes ||
          row.name !== resource.name ||
          row.mime !== resource.mime ||
          row.kind !== resource.kind
        )
          throw new UserError(
            "This media identity already belongs to different content.",
            409,
          );
        return { id: resource.id, complete: row.complete, chunkBytes: CHUNK };
      }
      const total = await db.query(
        "SELECT coalesce(sum(bytes),0)::bigint AS bytes FROM outclass_platform.media_assets WHERE author_id=$1",
        [actor],
      );
      if (Number(total.rows[0].bytes) + resource.bytes > 500000000)
        throw new UserError(
          "This creator's 500 MB media allowance is full.",
          413,
        );
      await db.query(
        "INSERT INTO outclass_platform.media_assets(id,author_id,name,kind,mime,bytes,sha256) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          resource.id,
          actor,
          resource.name,
          resource.kind,
          resource.mime,
          resource.bytes,
          resource.sha256,
        ],
      );
      return { id: resource.id, complete: false, chunkBytes: CHUNK };
    });
  }
  async chunk(actor: string, id: string, raw: unknown) {
    z.string().uuid().parse(id);
    const input = z
        .object({
          position: z.number().int().min(0).max(349),
          base64: z.string().max(320000),
        })
        .strict()
        .parse(raw),
      bytes = Buffer.from(input.base64, "base64");
    if (!bytes.length || bytes.length > CHUNK)
      throw new UserError("Invalid media chunk size.");
    return this.academy.scoped(actor, async (db) => {
      const asset = (
        await db.query(
          "SELECT * FROM outclass_platform.media_assets WHERE id=$1 AND author_id=$2 FOR UPDATE",
          [id, actor],
        )
      ).rows[0];
      if (!asset || asset.complete)
        throw new UserError(
          "Choose an unfinished upload owned by this account.",
          409,
        );
      const expected = Math.min(CHUNK, asset.bytes - input.position * CHUNK);
      if (bytes.length !== expected)
        throw new UserError(
          "The chunk does not match the declared media length.",
        );
      const previous = (
        await db.query(
          "SELECT data FROM outclass_platform.media_chunks WHERE asset_id=$1 AND position=$2",
          [id, input.position],
        )
      ).rows[0];
      if (previous && !Buffer.from(previous.data).equals(bytes))
        throw new UserError(
          "A different chunk already occupies this position.",
          409,
        );
      await db.query(
        "INSERT INTO outclass_platform.media_chunks(asset_id,position,data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [id, input.position, bytes],
      );
      return { stored: true };
    });
  }
  async finish(actor: string, id: string) {
    z.string().uuid().parse(id);
    return this.academy.scoped(actor, async (db) => {
      const asset = (
        await db.query(
          "SELECT * FROM outclass_platform.media_assets WHERE id=$1 AND author_id=$2 FOR UPDATE",
          [id, actor],
        )
      ).rows[0];
      if (!asset) throw new UserError("Media upload not found.", 404);
      const rows = (
        await db.query(
          "SELECT position,data FROM outclass_platform.media_chunks WHERE asset_id=$1 ORDER BY position",
          [id],
        )
      ).rows;
      if (
        rows.length !== Math.ceil(asset.bytes / CHUNK) ||
        rows.some((row, index) => row.position !== index)
      )
        throw new UserError(
          "Upload every media chunk before completing this upload.",
          409,
        );
      const bytes = Buffer.concat(rows.map((row) => Buffer.from(row.data)));
      if (
        bytes.length !== asset.bytes ||
        createHash("sha256").update(bytes).digest("hex") !== asset.sha256
      )
        throw new UserError("Uploaded media failed its integrity check.");
      await db.query(
        "UPDATE outclass_platform.media_assets SET complete=true WHERE id=$1",
        [id],
      );
      return { complete: true, id };
    });
  }
  async assertUploaded(
    db: PoolClient,
    resources: AcademyResource[],
    actor: string,
  ) {
    for (const ref of resources) {
      const row = (
        await db.query(
          "SELECT * FROM outclass_platform.media_assets WHERE id=$1 AND author_id=$2 AND complete=true",
          [ref.id, actor],
        )
      ).rows[0];
      if (
        !row ||
        row.sha256 !== ref.sha256 ||
        row.bytes !== ref.bytes ||
        row.name !== ref.name ||
        row.kind !== ref.kind ||
        row.mime !== ref.mime
      )
        throw new UserError(
          `Upload and verify ${ref.name} before publishing this course.`,
        );
    }
  }
  async read(actor: string, id: string, position: number) {
    z.string().uuid().parse(id);
    return this.academy.scoped(actor, async (db) => {
      // RLS additionally enforces ownership or enrollment in a published linked course.
      const row = (
        await db.query(
          "SELECT c.data FROM outclass_platform.media_chunks c JOIN outclass_platform.media_assets a ON a.id=c.asset_id WHERE a.id=$1 AND a.complete=true AND c.position=$2",
          [id, position],
        )
      ).rows[0];
      if (!row)
        throw new UserError(
          "Media chunk is unavailable for this account.",
          404,
        );
      return { base64: Buffer.from(row.data).toString("base64") };
    });
  }
  routes() {
    const router = Router();
    router.post("/", async (req, res) =>
      res.json(await this.begin(res.locals.user, req.body)),
    );
    router.post("/:id/chunk", async (req, res) =>
      res.json(await this.chunk(res.locals.user, req.params.id, req.body)),
    );
    router.post("/:id/finish", async (req, res) =>
      res.json(await this.finish(res.locals.user, req.params.id)),
    );
    router.get("/:id/chunks/:position", async (req, res) =>
      res.json(
        await this.read(
          res.locals.user,
          req.params.id,
          z.coerce.number().int().min(0).max(349).parse(req.params.position),
        ),
      ),
    );
    return router;
  }
}
