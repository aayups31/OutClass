import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const { parse, embed } = vi.hoisted(() => ({ parse: vi.fn(), embed: vi.fn() }));
vi.mock("openai", () => ({
  default: class {
    responses = { parse };
    embeddings = { create: embed };
  },
}));
import { CourseLibrary, chunks } from "../src/server/library";
import { Store } from "../src/server/store";
import { Application } from "../src/server/application";
import { Workspace } from "../src/server/workspace";
import { Practice } from "../src/server/practice";
import { teacherInstructions } from "../src/ai-contract";
import { UserError } from "../src/server/safety";
let directory: string, store: Store, app: Application, library: CourseLibrary;
beforeEach(async () => {
  parse.mockReset();
  embed.mockReset();
  directory = await mkdtemp(path.join(tmpdir(), "gitlearn-rag-"));
  store = new Store(path.join(directory, "data"));
  app = new Application(store, "unit-only-placeholder");
  await app.setup(path.join(directory, "history"), false);
  for (const id of ["agents", "python"])
    app.observe({
      eventId: id,
      courseId: id,
      title: id,
      url: `https://www.udemy.com/course/${id}/learn/lecture/1`,
      lessons: [{ id: "1", title: "Tools", section: "Basics", order: 0 }],
    });
  library = new CourseLibrary(app);
  const state = store.state();
  state.settings.assistantEnabled = true;
  store.save(state);
});
afterEach(async () => {
  store.close();
  await rm(directory, { recursive: true, force: true });
});
it("retrieves relevant lecture passages while isolating courses and source kinds", async () => {
  library.document(
    "agents",
    "Tools transcript",
    "A tool is a callable function exposed to the agent. Give each tool a concise description.",
    "transcript",
    "1",
  );
  library.document(
    "python",
    "Other course",
    "A tool can print the other course private answer.",
    "transcript",
    "1",
  );
  library.document(
    "agents",
    "My code",
    "tool = lambda: print('my code')",
    "code",
    "1",
  );
  const evidence = await library.retrieve(
    "agents",
    "How should a tool be described?",
    "1",
    true,
  );
  expect(evidence).toHaveLength(1);
  expect(evidence[0].title).toBe("Tools transcript");
  expect(evidence[0].text).not.toContain("private answer");
});
it("deduplicates imported sources and removes their search entries", async () => {
  const id = library.document(
    "agents",
    "Transcript",
    "Vector embeddings represent meaning for retrieval.",
    "transcript",
  );
  expect(
    library.document(
      "agents",
      "Transcript",
      "Vector embeddings represent meaning for retrieval.",
      "transcript",
    ),
  ).toBe(id);
  expect(library.status("agents").sources).toHaveLength(1);
  library.remove("agents", id);
  expect(await library.retrieve("agents", "embeddings")).toEqual([]);
});
it("gives all AI modes the canonical teaching policy with actual checks, progressive stage and command output", async () => {
  parse.mockResolvedValue({
    output_parsed: {
      answer:
        "What do you predict for an empty input? Run just that case first.",
      citations: [],
    },
  });
  await library.ask(
    "agents",
    "Explain my failing check",
    "help",
    undefined,
    undefined,
    "hint",
    {
      practice: {
        taskId: "task",
        hintsRequested: 1,
        latestAttempt: {
          passed: false,
          stale: false,
          checks: [{ label: "empty input", passed: false }],
        },
      } as any,
      projectCommand: {
        command: "node --test",
        output: "Expected 0, received undefined",
        state: "finished",
        exitCode: 1,
        truncated: false,
      },
    },
  );
  const call = parse.mock.calls[0][0];
  expect(call.instructions).toBe(teacherInstructions);
  const context = JSON.parse(call.input.at(-1).content.split("\nQuestion:")[0]);
  expect(context.guidance.stage).toBe("experiment");
  expect(context.learningContext.projectCommand.output).toContain(
    "received undefined",
  );
  expect(context.learningContext.practice.latestAttempt.checks[0].passed).toBe(
    false,
  );
});
it("keeps actual local passages and a useful recovery action when an account or service fails", async () => {
  library.document(
    "agents",
    "Tool note",
    "A tool description explains when a function should be used.",
    "transcript",
  );
  vi.spyOn(app.ai, "structured").mockRejectedValue(
    new UserError("Sign in again to continue.", 401),
  );
  const expired = await library.ask(
    "agents",
    "Explain tool descriptions",
    "help",
  );
  expect(expired).toMatchObject({ mode: "retrieval", recovery: "ai-settings" });
  expect(expired.sources).toHaveLength(1);
  vi.mocked(app.ai.structured).mockRejectedValue(
    new UserError(
      "Included AI is at service capacity. Your allowance was not charged.",
      503,
    ),
  );
  const outage = await library.ask(
    "agents",
    "Explain tool descriptions",
    "help",
  );
  expect(outage).toMatchObject({ mode: "retrieval", recovery: "retry" });
  expect(outage.text).toContain("not charged");
});
it("refreshes changed code without stale search results or paid local indexing", async () => {
  await app.start("agents", "1");
  const file = path.join(store.state().session!.workspace, "main.py");
  await writeFile(file, "obsolete_cache = 1");
  await library.index("agents", false);
  await writeFile(file, "fresh_callback = 2");
  await library.index("agents", false);
  expect(await library.retrieve("agents", "obsolete_cache")).toEqual([]);
  expect(
    (await library.retrieve("agents", "fresh_callback"))[0].text,
  ).toContain("fresh_callback");
  expect(embed).not.toHaveBeenCalled();
  expect(parse).not.toHaveBeenCalled();
});
it("blocks secrets before storing course material or making an AI request", async () => {
  const secret = "sk-proj-" + "a".repeat(40);
  expect(() =>
    library.document("agents", "Bad source", secret, "transcript"),
  ).toThrow("API key");
  await expect(library.ask("agents", secret, "help")).rejects.toThrow(
    "API key",
  );
  expect(parse).not.toHaveBeenCalled();
});
it("does not pretend course titles are lecture content", async () => {
  await library.index("agents", false);
  const answer = await library.ask(
    "agents",
    "What does the instructor teach about tools?",
    "course",
  );
  expect(answer.mode).toBe("missing-context");
  expect(answer.text).toContain("Save the lesson");
  expect(answer.sources || []).toHaveLength(0);
  expect(parse).not.toHaveBeenCalled();
});
it("returns validated citations and stores course conversation locally", async () => {
  library.document(
    "agents",
    "Tools transcript",
    "Describe every tool clearly. A tool description tells the agent when to use it.",
    "transcript",
    "1",
  );
  parse.mockResolvedValue({
    output_parsed: { answer: "Describe the tool clearly [1].", citations: [1] },
  });
  const result = await library.ask(
    "agents",
    "How do I describe a tool?",
    "course",
  );
  expect(result.mode).toBe("grounded");
  expect(result.sources![0]).toMatchObject({
    title: "Tools transcript",
    number: 1,
    startLine: 1,
  });
  expect(library.history("agents")).toHaveLength(2);
  expect(library.history("python")).toHaveLength(0);
  expect(parse.mock.calls[0][0]).toMatchObject({ store: false });
  expect(JSON.stringify(parse.mock.calls[0])).not.toContain(
    "unit-only-placeholder",
  );
});
it("rejects fabricated citations and preserves a local retrieval fallback on API failures", async () => {
  library.document(
    "agents",
    "Tools transcript",
    "Each tool has a name and a description.",
    "transcript",
  );
  parse.mockResolvedValue({
    output_parsed: { answer: "Unfounded claim [99].", citations: [99] },
  });
  const answer = await library.ask(
    "agents",
    "Explain a tool description",
    "course",
  );
  expect(answer.mode).toBe("retrieval");
  expect(answer.text).not.toContain("Unfounded claim");
  expect(answer.sources![0].title).toBe("Tools transcript");
});
it("uses persisted semantic vectors to retrieve passages with different words", async () => {
  library.document(
    "agents",
    "Memory",
    "A cache retains previous results so repeated work can be avoided.",
    "transcript",
  );
  store.db
    .prepare("UPDATE rag_chunks SET embedding=?,model=? WHERE course_id=?")
    .run("[1,0]", "text-embedding-3-small", "agents");
  embed.mockResolvedValue({ data: [{ index: 0, embedding: [1, 0] }] });
  const result = await library.retrieve(
    "agents",
    "reusing computations",
    "",
    true,
  );
  expect(result[0].title).toBe("Memory");
});
it("embeds new passages once and preserves cached vectors on unchanged refreshes", async () => {
  library.document(
    "agents",
    "Tool resource",
    "A focused tool takes explicit inputs and returns a useful result.",
    "material",
  );
  embed.mockImplementation(async (request: { input: string[] }) => ({
    data: request.input.map((_text, index) => ({ index, embedding: [1, 0] })),
  }));
  const first = await library.index("agents", true);
  expect(first.embedded).toBe(first.chunks);
  const calls = embed.mock.calls.length;
  await library.index("agents", true);
  expect(embed.mock.calls.length).toBe(calls);
  expect(embed.mock.calls[0][0]).toMatchObject({
    model: "text-embedding-3-small",
    dimensions: 384,
  });
});
it("reports missing course context when the model cannot support a cited answer", async () => {
  library.document(
    "agents",
    "Tools",
    "A tool describes its responsibility.",
    "transcript",
  );
  parse.mockResolvedValue({
    output_parsed: { answer: "Not supported by this passage.", citations: [] },
  });
  const result = await library.ask("agents", "What is a tool?", "course");
  expect(result.mode).toBe("missing-context");
  expect(result.text).toContain("couldn’t ground");
});
it("bounds long transcript chunks and preserves source line positions", () => {
  const result = chunks("intro\n" + "x".repeat(5000) + "\nend");
  expect(result.length).toBeGreaterThan(3);
  expect(result.every((item) => item.text.length <= 1800)).toBe(true);
  expect(result[0].startLine).toBe(1);
  expect(result[result.length - 1].endLine).toBe(3);
});
it("keeps practical teaching diagnostic and prevents returning the task implementation", async () => {
  const workspace = new Workspace(app),
    practice = new Practice(app, workspace);
  await practice.start("agents", "javascript-validation");
  parse.mockResolvedValue({
    output_parsed: {
      answer:
        "```js\nexport function discountedPrice(p,d) { return p*(1-d/100); }\n```",
      citations: [],
    },
  });
  const answer = await library.ask(
    "agents",
    "Write the whole solution for me",
    "help",
    undefined,
    undefined,
    "explain",
    { practice: practice.context("agents") },
  );
  expect(answer.text).not.toContain("export function");
  expect(answer.text).toContain("Which input");
  const request = parse.mock.calls[0][0];
  expect(request.instructions).toContain(
    "never provide a complete task implementation",
  );
  expect(request.input.at(-1).content).toContain("Functions and validation");
  expect(request.tools).toBeUndefined();
});
it("grounds hint-first error help in an actual run and labels evidence stale after a saved edit", async () => {
  await app.start("agents", "1");
  const workspace = new Workspace(app),
    id = store.state().session!.id;
  const file = await workspace.save(
    id,
    "main.js",
    "console.log(missingTool);",
    null,
  );
  const result = await workspace.run(id, file.path);
  await workspace.save(
    id,
    file.path,
    "const missingTool = 'ready'; console.log(missingTool);",
    file.version,
  );
  const context = await workspace.runContext(id, result.run.id);
  parse.mockResolvedValue({
    output_parsed: {
      answer: "Check where missingTool is defined, then rerun your saved edit.",
      citations: [],
    },
  });
  await library.ask(
    "agents",
    "Give me a hint about this error",
    "help",
    undefined,
    context,
    "hint",
  );
  const request = parse.mock.calls[0][0];
  const input = JSON.parse(
    request.input.at(-1).content.split("\nQuestion: ")[0],
  );
  expect(input.tutorStyle).toBe("hint");
  expect(input.runContext.output).toContain("ReferenceError");
  expect(input.runContext.source).toBe("console.log(missingTool);");
  expect(input.runContext.fileVersion).toBe(file.version);
  expect(input.runContext.stale).toBe(true);
  expect(input.runContext.workspace).toBeUndefined();
  expect(request.instructions).toContain(
    "never provide a complete task implementation",
  );
  expect(request.instructions).toContain("tested a fix");
  expect(request.store).toBe(false);
});
