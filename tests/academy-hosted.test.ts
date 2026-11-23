import { it, expect } from "vitest";
import { Pool, type PoolClient } from "pg";
import { parse } from "dotenv";
import { readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { serviceConfig } from "../services/ai/config";
import { HostedAcademy } from "../services/ai/academy";
import { auditAcademy } from "../src/server/academy-studio";
import { HostedCourseAssessment } from "../services/ai/academy-assessment";
it.skipIf(process.env.OUTCLASS_DATABASE_TEST !== "1")(
  "isolates real account access, freezes releases and consumes launch grants exactly once",
  async () => {
    const env = parse(await readFile(".local/ai-service.env")),
      pool = new Pool({
        ...serviceConfig(env).pool,
        query_timeout: 8000,
        statement_timeout: 8000,
      }),
      db = await pool.connect();
    console.info("Hosted Academy: database connected");
    await db.query("BEGIN");
    // Every service transaction is a savepoint inside this test's rollback.
    const wrapped = {
      connect: async () =>
        ({
          query: (sql: string, values?: unknown[]) =>
            db.query(
              sql === "BEGIN"
                ? "SAVEPOINT academy_test"
                : sql === "COMMIT"
                  ? "RELEASE SAVEPOINT academy_test"
                  : sql === "ROLLBACK"
                    ? "ROLLBACK TO SAVEPOINT academy_test"
                    : sql,
              values,
            ),
          release: () => {},
        }) as unknown as PoolClient,
    } as Pool;
    const service = new HostedAcademy(wrapped),
      author = randomUUID(),
      learner = randomUUID(),
      other = randomUUID(),
      id = randomUUID(),
      course = {
        title: "Rollback-only Academy test",
        audience: "Test learners",
        outcome: "Verify a free enrollment",
        rightsConfirmed: true,
        lessons: Array.from({ length: 35 }, (_, index) => ({
          title: `Apply it · lesson ${index + 1}`,
          objective: "Build a total",
          practice: "Test empty input",
          content: "A dictionary can accumulate a total.",
        })),
        learningProject: {
          title: "Activity report",
          problem: "An organizer needs total minutes per person",
          deliverable: "A report that handles repeated and empty records",
          milestones: [
            {
              lessonIndex: 34,
              title: "Handle an empty week",
              brief: "Return an empty report for an empty input.",
              acceptanceCriteria: ["No rows produce an empty report"],
            },
          ],
        },
      },
      input = {
        releaseId: id,
        lineageId: randomUUID(),
        revision: 1,
        course,
        projectTemplate: null,
        approvePublicRelease: true,
      };
    const bytes = Buffer.from("# Original fixture starter\n");
    const resource = {
      id: randomUUID(),
      name: "fixture.py",
      kind: "code" as const,
      mime: "text/plain",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    Object.assign(course.lessons[0], {
      resources: [resource],
      assessments: [
        {
          id: "fixture-question",
          outcomeIds: ["grouping"],
          kind: "application",
          prompt:
            "Two records contribute 4 and 3 minutes. What total preserves both?",
          choices: ["7", "3"],
          reviewAfterDays: [1, 3, 7],
          remediationLessonIds: [],
        },
      ],
    });
    Object.assign(input, {
      privateKeys: [
        {
          itemId: "fixture-question",
          correctChoice: 0,
          rationale: "Both records contribute to the running total.",
          feedback: [
            "Both contributions are retained.",
            "This replaces rather than adds to the earlier value.",
          ],
        },
      ],
    });
    Object.assign(course.lessons[34],{learn:{minutes:20,prerequisiteLessons:[],acceptanceCriteria:["No rows produce an empty report"],hints:["Trace the empty input before adding records.","Check whether the loop body can run."],reflection:"Which check demonstrates the empty result?",transferChallenge:"Add a zero-minute record without removing its person.",starterFiles:[]}});
    const audit = auditAcademy({
      ...course,
      id,
      revision: 1,
      updatedAt: "fixture",
    });
    Object.assign(input, {
      review: {
        courseHash: audit.courseHash,
        acknowledged: audit.findings
          .filter((f) => f.level === "review")
          .map((f) => f.id),
      },
    });
    try {
      await service.media.begin(author, resource);
      await expect(service.media.read(other, resource.id, 0)).rejects.toThrow(
        /unavailable/,
      );
      await service.media.chunk(author, resource.id, {
        position: 0,
        base64: bytes.toString("base64"),
      });
      await service.media.finish(author, resource.id);
      expect((await service.publish(author, input)).id).toBe(id);
      console.info("Hosted Academy: unpublished test transaction created");
      expect((await service.publish(author, input)).id).toBe(id);
      await expect(
        service.publish(author, {
          ...input,
          course: { ...course, title: "Mutated" },
          review: {
            courseHash: auditAcademy({
              ...course,
              title: "Mutated",
              id,
              revision: 1,
              updatedAt: "fixture",
            }).courseHash,
            acknowledged: audit.findings
              .filter((f) => f.level === "review")
              .map((f) => f.id),
          },
        }),
      ).rejects.toThrow(/new version/);
      expect((await service.catalog()).some((c) => c.id === id)).toBe(true);
      await expect(service.grant(other, id, 34)).rejects.toThrow(/Enroll/);
      await service.enroll(learner, id);
      await service.enroll(learner, id);
      expect((await service.media.read(learner, resource.id, 0)).base64).toBe(
        bytes.toString("base64"),
      );
      await expect(service.media.read(other, resource.id, 0)).rejects.toThrow(
        /unavailable/,
      );
      const grading = new HostedCourseAssessment(service),
        requestId = randomUUID();
      await expect(
        grading.submit(other, id, {
          requestId: randomUUID(),
          itemId: "fixture-question",
          choice: 0,
          expectedAttempt: 0,
        }),
      ).rejects.toThrow(/Enroll/);
      const graded = await grading.submit(learner, id, {
        requestId,
        itemId: "fixture-question",
        choice: 0,
        expectedAttempt: 0,
      });
      expect(graded.correct).toBe(true);
      expect(
        (
          await grading.submit(learner, id, {
            requestId,
            itemId: "fixture-question",
            choice: 0,
            expectedAttempt: 0,
          })
        ).attempt,
      ).toBe(1);
      const learnerView = await grading.view(learner, id);
      expect(learnerView.attempts).toHaveLength(1);
      expect(JSON.stringify(learnerView)).not.toContain("correctChoice");
      console.info(
        "Hosted Academy: publication isolation and enrollment checked",
      );
      expect(
        (await service.mine(author)).find((c) => c.id === id).enrollments,
      ).toBe(1);
      const grant = await service.grant(learner, id, 34);
      await expect(service.redeem(other, grant.grant)).rejects.toThrow(
        /another account/,
      );
      const launch = await service.redeem(learner, grant.grant);
      expect(launch.lessonIndex).toBe(34);
      expect(launch.course).toEqual(course);
      await expect(service.redeem(learner, grant.grant)).rejects.toThrow(
        /consumed/,
      );
      console.info(
        "Hosted Academy: launch ownership and single-use grant checked",
      );
      await expect(service.withdraw(other, id)).rejects.toThrow(/creator/);
      await service.withdraw(author, id);
      await expect(service.detail(id)).rejects.toThrow(/not publicly/);
      expect((await service.mine(other)).some((c) => c.id === id)).toBe(false);
    } finally {
      await db.query("ROLLBACK");
      db.release();
      await pool.end();
    }
  },
  90000,
);
