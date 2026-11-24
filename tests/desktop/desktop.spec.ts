import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const { version } = createRequire(import.meta.url)("../../package.json");
test("desktop first-run, encrypted key persistence, local files, and bundled JavaScript runtime", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "gitlearn-desktop-"));
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    GITLEARN_PORT: "47834",
    GITLEARN_DATA_DIR: path.join(directory, "data"),
    GITLEARN_DESKTOP_USER_DATA: path.join(directory, "profile"),
    GITLEARN_DISABLE_DEV_KEY: "1",
    GITLEARN_HEADLESS_TEST: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const args = process.env.GITLEARN_PACKAGED_TEST ? [] : ["."];
  const executablePath = process.env.GITLEARN_PACKAGED_TEST;
  let desktop = await electron.launch({ args, executablePath, env });
  try {
    const page = await desktop.firstWindow();
    expect(await desktop.evaluate(({ app }) => app.getName())).toBe("OutClass");
    await expect(page).toHaveTitle("OutClass · Keep what you learn");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await expect(
      page.getByRole("heading", { name: "Make yourself at home." }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => ({
        require: typeof (window as any).require,
        bridge: typeof window.gitLearnDesktop?.chooseFolder,
      })),
    ).toEqual({ require: "undefined", bridge: "function" });
    await desktop.evaluate(({ shell }) => {
      shell.openPath = async () => "";
    });
    await page.evaluate(() => window.gitLearnDesktop!.openExtensionFolder());
    const extensionDirectory = path.join(
      directory,
      "profile",
      "extension",
      version,
    );
    const extensionManifest = JSON.parse(
      await readFile(path.join(extensionDirectory, "manifest.json"), "utf8"),
    );
    expect(extensionManifest.version).toBe(version);
    expect(extensionManifest.name).toBe("OutClass — Learning companion");
    expect(
      (await readFile(path.join(extensionDirectory, "background.js"))).length,
    ).toBeGreaterThan(1000);
    if (!process.env.GITLEARN_PACKAGED_TEST)
      await page.screenshot({ path: ".local/design/desktop-first-run.png" });
    await page.getByRole("button", { name: "Let’s get started" }).click();
    await page
      .getByLabel("Parent learning folder")
      .fill(path.join(directory, "My Learning"));
    await page.getByRole("button", { name: "Create my workspace" }).click();
    await expect(
      page.getByRole("heading", { name: "Make it your workspace." }),
    ).toBeVisible();
    const sampleKey = "sk-localdesktoptest123456789";
    await expect(page.getByRole("button", { name: "Sign in with password" })).toBeVisible();
    await page.getByText("Use a personal key", { exact: true }).click();
    await page.getByLabel("OpenAI API key").fill(sampleKey);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Bring the web into your workspace." }),
    ).toBeVisible();
    const encrypted = await readFile(
      path.join(directory, "profile", "openai-key.encrypted"),
    );
    expect(encrypted.includes(Buffer.from(sampleKey))).toBe(false);
    await page.getByRole("button", { name: "Get connection code" }).click();
    await expect(page.getByLabel("Connection code")).toHaveText(/^\d{6}$/);
    await desktop.close();
    await expect
      .poll(async () =>
        fetch("http://127.0.0.1:47834/api/health")
          .then(() => true)
          .catch(() => false),
      )
      .toBe(false);
    desktop = await electron.launch({ args, executablePath, env });
    let reopened = await desktop.firstWindow();
    await expect(
      reopened.getByRole("heading", {
        name: "Bring the web into your workspace.",
      }),
    ).toBeVisible();
    const state = await reopened.evaluate(async () => {
      const { token } = await (
        await fetch("/api/bootstrap", { method: "POST" })
      ).json();
      return (
        await fetch("/api/state", {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).json();
    });
    expect(state.hasApiKey).toBe(true);
    expect(state.settings.assistantEnabled).toBe(true);
    await reopened
      .getByRole("button", { name: "Open my workspace", exact: true })
      .click();
    const result = await reopened.evaluate(async () => {
      const { token } = await (
        await fetch("/api/bootstrap", { method: "POST" })
      ).json();
      const api = async (route: string, body: any) => {
        const response = await fetch("/api/" + route, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        if (!response.ok) throw Error(data.error);
        return data;
      };
      await api("observations", {
        eventId: "desktop-fixture",
        courseId: "desktop-fixture",
        title: "JavaScript practice",
        url: "https://www.udemy.com/course/desktop-fixture/learn/lecture/1",
        currentLessonId: "1",
        lessons: [
          { id: "1", title: "Local runtime", section: "Basics", order: 0 },
        ],
      });
      await api("mirror", { courseId: "desktop-fixture" });
      await api("course-project", {
        courseId: "desktop-fixture",
        mode: "project",
      });
      const started = await api("start", {
        courseId: "desktop-fixture",
        lessonId: "1",
      });
      const { session } = started;
      await api("workspace-file", {
        sessionId: session.id,
        path: "main.js",
        content:
          "console.log('Bundled desktop runtime',21*2); console.log('API key inherited',!!process.env.OPENAI_API_KEY);",
        version: null,
      });
      await api("editor-anchor", {
        sessionId: session.id,
        path: "main.js",
        cursor: 10,
      });
      await api("note", {
        sessionId: session.id,
        note: "Next: add an input check.",
      });
      return {
        session,
        run: await api("workspace-run", {
          sessionId: session.id,
          path: "main.js",
        }),
      };
    });
    expect(result.run.output).toContain("Bundled desktop runtime 42");
    expect(result.run.output).toContain("API key inherited false");
    expect(result.session.workspace).toContain(
      path.join("My Learning", "projects"),
    );
    await reopened.reload();
    await expect(
      reopened.getByRole("textbox", { name: "Code editor" }),
    ).toBeVisible();
    await expect(reopened.locator(".studio-bottom")).toBeHidden();
    const dimensions = await reopened.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
    }));
    const codingSurface = (await reopened
      .locator(".code-editor")
      .boundingBox())!;
    expect(codingSurface.width).toBeGreaterThan(dimensions.width * 0.65);
    expect(codingSurface.height).toBeGreaterThan(dimensions.height * 0.65);
    await reopened.screenshot({
      path: ".local/design/outclass-minimal-desktop.png",
    });
    await reopened
      .locator(".studio-dock-tabs")
      .getByRole("button", { name: "Output", exact: true })
      .click();
    await expect(
      reopened.getByLabel("Program output", { exact: true }),
    ).toContainText("Bundled desktop runtime 42");
    await desktop.close();
    await expect
      .poll(() =>
        fetch("http://127.0.0.1:47834/api/health").then(
          () => true,
          () => false,
        ),
      )
      .toBe(false);
    desktop = await electron.launch({ args, executablePath, env });
    reopened = await desktop.firstWindow();
    await expect(reopened).toHaveURL("http://127.0.0.1:47834/", {
      timeout: 15000,
    });
    await expect(reopened.getByRole("textbox", { name: "Code editor" }))
      .toContainText("Bundled desktop runtime", { timeout: 15000 })
      .catch(async (error) => {
        await reopened.screenshot({
          path: ".local/design/desktop-restart-diagnostic.png",
        });
        console.log(
          "Restart diagnostic",
          await reopened.evaluate(() => ({
            url: location.href,
            title: document.title,
            text: document.body.innerText.slice(0, 3000),
            setupStep: localStorage.getItem("gitlearn-setup-step"),
          })),
        );
        throw error;
      });
    await expect(reopened.locator(".studio-bottom")).toBeHidden();
    await reopened
      .locator(".studio-dock-tabs")
      .getByRole("button", { name: "Output", exact: true })
      .click();
    await expect(
      reopened.getByLabel("Program output", { exact: true }),
    ).toContainText("Bundled desktop runtime 42");
    await reopened.getByRole("button", { name: "Notes", exact: true }).click();
    await expect(reopened.getByLabel("Studio session notes")).toHaveValue(
      "Next: add an input check.",
    );
    await reopened
      .getByRole("button", { name: "Setup & preferences", exact: true })
      .click();
    await expect(
      reopened.getByRole("region", { name: "Device readiness" }),
    ).toContainText("Available and writable");
    await reopened
      .getByRole("button", { name: "Remove key", exact: true })
      .click();
    await expect(
      reopened.getByRole("status").filter({ hasText: "API key removed." }),
    ).toBeVisible();
    expect(
      await readFile(path.join(directory, "profile", "openai-key.encrypted"))
        .then(() => true)
        .catch(() => false),
    ).toBe(false);
    const nativeTool = await reopened.evaluate(
      async (command) => {
        const { token } = await (
          await fetch("/api/bootstrap", { method: "POST" })
        ).json();
        const headers = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        };
        const state = await (await fetch("/api/state", { headers })).json();
        const launched = await fetch("/api/project-command", {
          method: "POST",
          headers,
          body: JSON.stringify({ sessionId: state.session.id, command }),
        });
        if (!launched.ok) throw Error("Native tool did not launch");
        for (let i = 0; i < 80; i++) {
          const { commands } = await (
            await fetch(`/api/project-commands?sessionId=${state.session.id}`, {
              headers,
            })
          ).json();
          if (commands[0].state !== "running") return commands[0];
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw Error("Native tool did not finish");
      },
      `& '${process.execPath.replaceAll("'", "''")}' --version; exit 23`,
    );
    expect(nativeTool.output).toContain(process.version);
    expect(nativeTool.exitCode).toBe(23);
    const practical = await reopened.evaluate(async () => {
      const { token } = await (
        await fetch("/api/bootstrap", { method: "POST" })
      ).json();
      const api = async (route: string, body?: unknown) => {
        const response = await fetch("/api/" + route, {
          method: body ? "POST" : "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const value = await response.json();
        if (!response.ok) throw Error(value.error);
        return value;
      };
      const state = await api("state"),
        sessionId = state.session.id;
      const task = await api("practice-start", {
        courseId: "desktop-fixture",
        exerciseId: "javascript-validation",
      });
      const file = await api(
        `workspace-file?sessionId=${sessionId}&path=${encodeURIComponent(task.path)}`,
      );
      await api("workspace-file", {
        sessionId,
        path: task.path,
        version: file.version,
        content:
          "export function discountedPrice(p,d){if(p<0||d<0||d>100)throw Error('invalid');return Math.round(p*(1-d/100)*100)/100;}",
      });
      const checked = await api("practice-check", {
        taskId: task.id,
        sessionId,
      });
      const direction = await api("learning-direction", {
        courseId: "desktop-fixture",
        goal: "Build a local spending tracker",
        experience: "new",
        minutes: 25,
      });
      const transfer = await api("practice-start", {
        courseId: "desktop-fixture",
        exerciseId: "javascript-validation-transfer",
        transferOf: task.id,
      });
      const changedRequirement = await api("practice-check", {
        taskId: transfer.id,
        sessionId,
      });
      const ledger = await api(
        "learning-ledger?courseId=desktop-fixture&format=html",
      );
      const scaffold = await api("project-scaffold", {
        sessionId,
        kind: "react",
      });
      const next = await api("project-scaffold", { sessionId, kind: "next" });
      await api("workspace-file", {
        sessionId,
        path: "runtime.ts",
        version: null,
        content:
          'const answer: number = 42; console.log("Bundled TypeScript", answer);',
      });
      const typescript = await api("workspace-run", {
        sessionId,
        path: "runtime.ts",
      });
      const diagnostics = await api("diagnostics");
      let native;
      if (diagnostics.cppCompiler) {
        await api("workspace-file", {
          sessionId,
          path: "native.cpp",
          version: null,
          content:
            '#include <iostream>\nint main(){std::cout << "Packaged C++ 42\\n";return 0;}',
        });
        native = await api("workspace-run", { sessionId, path: "native.cpp" });
      }
      const command = await api("project-command", {
        sessionId,
        command: 'node -e "console.log(process.pid); setInterval(()=>{},1000)"',
      });
      return {
        checked,
        direction,
        changedRequirement,
        ledger,
        scaffold,
        next,
        typescript,
        native,
        command,
        sessionId,
      };
    });
    expect(practical.checked.status).toBe("completed");
    expect(practical.direction.direction.goal).toContain("spending tracker");
    expect(practical.changedRequirement.attempts[0].passed).toBe(false);
    expect(practical.ledger.content).toContain("OutClass Learning Ledger");
    expect(practical.scaffold.entry).toContain("main.jsx");
    expect(practical.next.entry).toContain("app/page.tsx");
    expect(practical.typescript.exitCode).toBe(0);
    expect(practical.typescript.output).toContain("Bundled TypeScript 42");
    if (practical.native) {
      expect(practical.native.exitCode).toBe(0);
      expect(practical.native.output).toContain("Packaged C++ 42");
    }
    let childPid = 0;
    await expect
      .poll(async () => {
        const { commands } = await reopened.evaluate(async (sessionId) => {
          const { token } = await (
            await fetch("/api/bootstrap", { method: "POST" })
          ).json();
          return (
            await fetch(`/api/project-commands?sessionId=${sessionId}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
          ).json();
        }, practical.sessionId);
        childPid = Number(
          commands
            .find((c: any) => c.id === practical.command.id)
            ?.output.match(/^\d+\r?$/m)?.[0],
        );
        return childPid;
      })
      .toBeGreaterThan(0);
    await desktop.close();
    await expect
      .poll(() => {
        try {
          process.kill(childPid, 0);
          return true;
        } catch {
          return false;
        }
      })
      .toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await desktop.close().catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});
