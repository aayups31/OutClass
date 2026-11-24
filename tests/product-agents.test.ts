import { it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store } from "../src/server/store";
import { Application } from "../src/server/application";
import { Expansion } from "../src/server/expansion";
import { ProductAgents } from "../src/server/product-agents";
it("uses bounded source-scoped proposals, preserves drafts, and rejects invented source IDs", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "outclass-agents-")),
    store = new Store(dir),
    app = new Application(store, "test-fixture-not-a-real-key"),
    e = new Expansion(app),
    agents = new ProductAgents(app, () => e.state());
  try {
    const c = e.saveCourse({
      title: "Python",
      audience: "Beginners",
      outcome: "Build",
      rightsConfirmed: true,
      lessons: [
        {
          title: "Collections",
          objective: "Group records",
          practice: "Write totals",
          content: "A dictionary stores values by key.",
        },
        {
          title: "Private later lesson",
          objective: "Compare totals",
          practice: "Explain the final report",
          content: "Unique full text reserved for another lesson.",
        },
      ],
      expectedRevision: 0,
    });
    const reply = {
      summary: "A grounded proposal",
      steps: [
        {
          title: "Try accumulation",
          detail: "Trace repeated users",
          sourceIds: ["lesson:0"],
        },
      ],
      draftText: "An editable brief",
      limitations: ["Not executed"],
    };
    const model = vi.spyOn(app.ai, "structured").mockResolvedValue(reply);
    const focused = await agents.run("academy", c.id, 1, 0);
    expect(focused).toMatchObject({ state: "completed", lessonIndex: 0 });
    expect(focused.sources.map(({ id }) => id)).toEqual(["lesson:0"]);
    const sent = model.mock.calls[0][0].context;
    expect(sent).not.toContain("Unique full text reserved");
    expect(JSON.parse(sent).teachingPatterns.length).toBeGreaterThan(0);
    expect(model).toHaveBeenCalledTimes(1);
    expect(e.state().courses[0].revision).toBe(1);
    model.mockResolvedValue({
      ...reply,
      steps: [{ ...reply.steps[0], sourceIds: ["invented"] }],
    });
    expect((await agents.run("academy", c.id, 1)).state).toBe("failed");
    expect(agents.list()).toHaveLength(2);
    await expect(agents.run("academy", c.id, 9)).rejects.toThrow(/Reload/);
  } finally {
    vi.restoreAllMocks();
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
