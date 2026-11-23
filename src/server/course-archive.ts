import express from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Application } from "./application.js";
import { courseDraft, academyLesson } from "../expansion-contract.js";
import {
  courseManifest,
  lessonHash,
  storeCourse,
  loadCourse,
} from "./course-content.js";
import { academyResource } from "../academy-resource-contract.js";
import { assessmentKey } from "../course-workshop-contract.js";
import { AcademyResources } from "./academy-resources.js";
import { Expansion } from "./expansion.js";
import { courseContent } from "./academy-studio.js";
import { UserError } from "./safety.js";
import { CourseResearch } from "./course-research.js";
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
            base64: z.string().max(112000000).optional(),
          })
          .strict(),
      )
      .max(50000),
    privateKeys: z.array(assessmentKey).max(800).optional(),
    privateSolutions: z.record(z.string(), z.string().max(40000)).optional(),
    history: z
      .array(
        courseDraft.extend({
          revision: z.number().int().positive(),
          lessonHashes: z.array(z.string().length(64)).max(200),
        }),
      )
      .max(20)
      .optional(),
    lessonContent: z
      .record(z.string().regex(/^[a-f0-9]{64}$/), academyLesson)
      .optional(),
    privateHistory: z
      .array(
        z.object({
          revision: z.number().int().positive(),
          keys: z.array(assessmentKey).max(800),
          solutions: z.record(z.string(), z.string().max(40000)),
        }),
      )
      .max(20)
      .optional(),
    privateResearch: z.unknown().optional(),
  })
  .strict();
export class CourseArchive {
  constructor(private app: Application) {}
  async export(id: string, privateContent = false, bundle = false) {
    const course = new Expansion(this.app)
      .state()
      .courses.find((course) => course.id === id);
    if (!course) throw new UserError("Save the course first.", 404);
    const history = new Expansion(this.app).history(course.id),
      lessonContent = Object.fromEntries(
        history.flatMap((course) =>
          course.lessons.map((lesson) => [lessonHash(lesson), lesson]),
        ),
      );
    const resources = new Map(
      [course, ...history]
        .flatMap((course) => course.lessons)
        .flatMap((lesson) => lesson.resources || [])
        .map((item) => [item.id, item]),
    );
    if (
      !bundle &&
      [...resources.values()].reduce((sum, item) => sum + item.bytes, 0) >
        100000000
    )
      throw new UserError("Split portable media packages above 100 MB.");
    const library = new AcademyResources(this.app),
      files = [];
    for (const resource of resources.values())
      files.push({
        resource,
        ...(!bundle
          ? { base64: (await library.bytes(resource)).toString("base64") }
          : {}),
      });
    return {
      format: "outclass-portable-course" as const,
      version: 1 as const,
      course: courseContent(course),
      resources: files,
      history: history.map((course) =>
        courseManifest({ ...courseContent(course), revision: course.revision }),
      ),
      lessonContent,
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
            privateHistory: history.map((previous) => ({
              revision: previous.revision,
              keys:
                this.app.store.get(
                  `academy:teacher:${course.id}:${previous.revision}`,
                ) || [],
              solutions:
                this.app.store.get(
                  `academy:solutions:${course.id}:${previous.revision}`,
                ) || {},
            })),
            privateResearch: ((backup) => ({
              ...backup,
              documents: backup.documents.filter((row) =>
                [course, ...history].some((course) =>
                  course.lessons.some((lesson) =>
                    lesson.researchEvidence?.some(
                      (evidence) => evidence.documentId === row.document.id,
                    ),
                  ),
                ),
              ),
            }))(new CourseResearch(this.app).backup()),
          }
        : {}),
    };
  }
  async restore(raw: unknown, bundle = false) {
    const input = archive.parse(raw),
      hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const restored = this.app.store.get<{ id: string; revision: number }>(
      `academy:archive:${hash}`,
    );
    if (restored) return restored;
    const historical = (input.history || []).map((manifest) => {
      const { lessonHashes, ...content } = manifest;
      const lessons = lessonHashes.map((hash) => {
        const lesson = input.lessonContent?.[hash];
        if (!lesson || lessonHash(lesson) !== hash)
          throw new UserError(
            "A historical lesson is missing or corrupt. No course was imported.",
          );
        return lesson;
      });
      if (lessons.length !== manifest.lessons.length)
        throw new UserError("The draft-history manifest is incomplete.");
      return { ...content, lessons };
    });
    const resources = new Map(
      input.resources.map((item) => [item.resource.id, item]),
    );
    if (resources.size !== input.resources.length)
      throw new UserError("Duplicate resource identities in archive.");
    const refs = [input.course, ...historical]
      .flatMap((course) => course.lessons)
      .flatMap((lesson) => lesson.resources || []);
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
      !bundle &&
      input.resources.reduce((sum, item) => sum + item.resource.bytes, 0) >
        100000000
    )
      throw new UserError("Split portable media packages above 100 MB.");
    if (!bundle && input.resources.some((item) => item.base64 === undefined))
      throw new UserError(
        "This manifest requires its media folder. Use Restore portable folder.",
      );
    if (bundle)
      for (const item of input.resources)
        await new AcademyResources(this.app).bytes(item.resource);
    const decoded = input.resources
      .filter(
        (item): item is typeof item & { base64: string } =>
          item.base64 !== undefined,
      )
      .map((item) => ({
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
    for (const bank of input.privateHistory || []) {
      const course = historical.find(
        (course) => course.revision === bank.revision,
      );
      if (!course)
        throw new UserError(
          "A private historical bank has no matching draft revision.",
        );
      const items = course.lessons.flatMap(
        (lesson) => lesson.assessments || [],
      );
      if (
        new Set(bank.keys.map((key) => key.itemId)).size !== bank.keys.length ||
        bank.keys.some((key) => {
          const item = items.find((item) => item.id === key.itemId);
          return (
            !item ||
            key.correctChoice >= item.choices.length ||
            key.feedback.length !== item.choices.length
          );
        })
      )
        throw new UserError(
          "A private historical key does not match its assignment.",
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
      if (input.privateResearch)
        new CourseResearch(this.app).restore(input.privateResearch);
      const course = new Expansion(this.app).saveCourse({
        ...input.course,
        expectedRevision: 0,
      });
      if (historical.length)
        this.app.store.put(
          `academy:history:${course.id}`,
          historical.map((previous) =>
            storeCourse(this.app.store, {
              ...previous,
              id: course.id,
              updatedAt: new Date().toISOString(),
              rightsConfirmed: false,
            }),
          ),
        );
      for (const previous of input.privateHistory || [])
        this.app.store.put(
          `academy:history-private:${course.id}:${previous.revision}`,
          previous,
        );
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
          req.query.bundle === "1",
        ),
      ),
    );
    router.post("/bundle", async (req, res) =>
      res.json(await this.app.serial(() => this.restore(req.body, true))),
    );
    router.post(
      "/resource",
      express.raw({ type: "application/octet-stream", limit: "80mb" }),
      async (req, res) => {
        const metadata = academyResource.parse(
          JSON.parse(z.string().max(2000).parse(req.query.metadata)),
        );
        if (!Buffer.isBuffer(req.body))
          throw new UserError("Choose the original binary resource file.");
        res.json(
          await this.app.serial(() =>
            new AcademyResources(this.app).restore(metadata, req.body),
          ),
        );
      },
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
