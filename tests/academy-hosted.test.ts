import { it, expect } from "vitest";
import { Pool, type PoolClient } from "pg";
import { parse } from "dotenv";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { serviceConfig } from "../services/ai/config";
import { HostedAcademy } from "../services/ai/academy";
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
    try {
      expect((await service.publish(author, input)).id).toBe(id);
      console.info("Hosted Academy: unpublished test transaction created");
      expect((await service.publish(author, input)).id).toBe(id);
      await expect(
        service.publish(author, {
          ...input,
          course: { ...course, title: "Mutated" },
        }),
      ).rejects.toThrow(/new version/);
      expect((await service.catalog()).some((c) => c.id === id)).toBe(true);
      await expect(service.grant(other, id, 34)).rejects.toThrow(/Enroll/);
      await service.enroll(learner, id);
      await service.enroll(learner, id);
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
