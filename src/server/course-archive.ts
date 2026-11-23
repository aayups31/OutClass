import express from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Application } from "./application.js";
import { courseDraft } from "../expansion-contract.js";
import { academyResource } from "../academy-resource-contract.js";
import { assessmentKey } from "../course-workshop-contract.js";
import { AcademyResources } from "./academy-resources.js";
import { Expansion } from "./expansion.js";
import { courseContent } from "./academy-studio.js";
import { UserError } from "./safety.js";
const archive = z
  .object({
    format: z.literal("outclass-portable-course"),
    version: z.literal(1),
    course: courseDraft,
    resources: z
      .array(
        z
          .object({
            resource: academyResource,
            base64: z.string().max(112000000),
          })
          .strict(),
      )
      .max(200),
    privateKeys: z.array(assessmentKey).max(800).optional(),
    privateSolutions: z.record(z.string(), z.string().max(40000)).optional(),
  })
  .strict();
export class CourseArchive {
  constructor(private app: Application) {}
  async export(id: string, privateContent = false) {
    const course = new Expansion(this.app)
      .state()
      .courses.find((course) => course.id === id);
    if (!course) throw new UserError("Save the course first.", 404);
    const resources = new Map(
      course.lessons
        .flatMap((lesson) => lesson.resources || [])
        .map((item) => [item.id, item]),
    );
    if (
      [...resources.values()].reduce((sum, item) => sum + item.bytes, 0) >
      100000000
    )
      throw new UserError("Split portable media packages above 100 MB.");
    const library = new AcademyResources(this.app),
      files = [];
    for (const resource of resources.values())
      files.push({
        resource,
        base64: (await library.bytes(resource)).toString("base64"),
      });
    return {
      format: "outclass-portable-course" as const,
      version: 1 as const,
      course: courseContent(course),
      resources: files,
      ...(privateContent
        ? {
            privateKeys:
              this.app.store.get(
                `academy:teacher:${course.id}:${course.revision}`,
              ) || [],
            privateSolutions:
              this.app.store.get(
                `academy:solutions:${course.id}:${course.revision}`,
              ) || {},
          }
        : {}),
    };
  }
  async restore(raw: unknown) {
    const input = archive.parse(raw),
      hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const restored = this.app.store.get<{ id: string; revision: number }>(
      `academy:archive:${hash}`,
    );
    if (restored) return restored;
    const resources = new Map(
      input.resources.map((item) => [item.resource.id, item]),
    );
    if (resources.size !== input.resources.length)
      throw new UserError("Duplicate resource identities in archive.");
    const refs = input.course.lessons.flatMap(
      (lesson) => lesson.resources || [],
    );
    if (
      refs.some(
        (ref) =>
          !resources.has(ref.id) ||
          JSON.stringify(resources.get(ref.id)!.resource) !==
            JSON.stringify(ref),
      )
    )
      throw new UserError(
        "The archive is missing a referenced resource or its metadata differs.",
      );
    if (
      input.resources.reduce((sum, item) => sum + item.resource.bytes, 0) >
      100000000
    )
      throw new UserError("Split portable media packages above 100 MB.");
    const decoded = input.resources.map((item) => ({
      ...item,
      bytes: Buffer.from(item.base64, "base64"),
    }));
    for (const item of decoded)
      if (
        item.bytes.length !== item.resource.bytes ||
        createHash("sha256").update(item.bytes).digest("hex") !==
          item.resource.sha256
      )
        throw new UserError(
          `Corrupt archive resource: ${item.resource.name}. No course was imported.`,
        );
    const items = input.course.lessons.flatMap(
      (lesson) => lesson.assessments || [],
    );
    for (const key of input.privateKeys || []) {
      const item = items.find((item) => item.id === key.itemId);
      if (
        !item ||
        key.correctChoice >= item.choices.length ||
        key.feedback.length !== item.choices.length
      )
        throw new UserError(
          "A private assessment key does not match the course.",
        );
    }
    for (const item of decoded)
      await new AcademyResources(this.app).restore(item.resource, item.bytes);
    input.course.rightsConfirmed = false;
    input.course.lessons.forEach((lesson) =>
      lesson.references?.forEach((reference) => {
        reference.approved = false;
      }),
    );
    return this.app.store.transaction(() => {
      const course = new Expansion(this.app).saveCourse({
        ...input.course,
        expectedRevision: 0,
      });
      if (input.privateKeys)
        this.app.store.put(
          `academy:teacher:${course.id}:${course.revision}`,
          input.privateKeys,
        );
      if (input.privateSolutions)
        this.app.store.put(
          `academy:solutions:${course.id}:${course.revision}`,
          input.privateSolutions,
        );
      const receipt = { id: course.id, revision: course.revision };
      this.app.store.put(`academy:archive:${hash}`, receipt);
      return receipt;
    });
  }
  routes() {
    const router = express.Router();
    router.get("/:id", async (req, res) =>
      res.json(
        await this.export(
          z.string().uuid().parse(req.params.id),
          req.query.private === "1",
        ),
      ),
    );
    router.post(
      "/",
      express.raw({ type: "application/octet-stream", limit: "160mb" }),
      async (req, res) => {
        if (!Buffer.isBuffer(req.body))
          throw new UserError("Upload a portable course file.");
        let raw: unknown;
        try {
          raw = JSON.parse(req.body.toString("utf8"));
        } catch {
          throw new UserError("Choose a valid portable course file.");
        }
        res.json(await this.app.serial(() => this.restore(raw)));
      },
    );
    return router;
  }
}
