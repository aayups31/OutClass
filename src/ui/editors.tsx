import React, { useEffect, useState } from "react";
import { Code2, Puzzle, Link2 } from "lucide-react";
import type { Status } from "../shared";
type Api = <T>(route: string, body?: unknown) => Promise<T>;
type Editors = {
  editors: { id: "vscode" | "codium"; title: string }[];
  companionAvailable: boolean;
  connections: { id: string; courseId: string }[];
};
export function EditorsAndExtensions({
  api,
  state,
}: {
  api: Api;
  state: Status;
}) {
  const [data, setData] = useState<Editors>(),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [installed, setInstalled] = useState<string[]>([]);
  const load = async () => setData(await api<Editors>("editors"));
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, []);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      await load();
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "The editor could not complete this action.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">Choose your workspace</div>
        <h1>Your editor. Your extensions.</h1>
        <p>
          Use OutClass's built-in editor, or connect VS Code / VSCodium to keep
          your terminal, debugger, language tools and extensions—with OffCourse
          beside your code.
        </p>
      </div>
      <div className="setup-stack">
        <section className="setup-card">
          <div className="setup-heading">
            <span className="setup-icon">
              <Code2 size={23} />
            </span>
            <div>
              <h2>Professional editor bridge</h2>
              <p>
                The OutClass companion stays running locally; the Udemy browser
                extension connects to it in either workflow.
              </p>
            </div>
          </div>
          {data?.editors.map((editor) => (
            <div className="editor-integration" key={editor.id}>
              <strong>{editor.title}</strong>
              <div className="onboarding-actions">
                <button
                  className="button primary"
                  disabled={busy || !state.session}
                  onClick={() =>
                    void act(() => api("editor-open", { id: editor.id }))
                  }
                >
                  Open course project
                </button>
                <button
                  className="button secondary"
                  disabled={busy || !data.companionAvailable}
                  onClick={() =>
                    void act(async () => {
                      await api("editor-install", { id: editor.id });
                      setMessage(
                        "OutClass companion installed. Open the OutClass activity bar in your editor and connect with a code.",
                      );
                    })
                  }
                >
                  Install OutClass companion
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      const r = await api<{ extensions: string[] }>(
                        "editor-extensions",
                        { id: editor.id },
                      );
                      setInstalled(r.extensions);
                    })
                  }
                >
                  Show installed extensions
                </button>
              </div>
            </div>
          ))}
          {!data?.editors.length && (
            <p className="hint">
              No supported editor detected in its standard installation
              location. Install{" "}
              <a
                href="https://code.visualstudio.com/"
                target="_blank"
                rel="noreferrer"
              >
                VS Code
              </a>{" "}
              or{" "}
              <a href="https://vscodium.com/" target="_blank" rel="noreferrer">
                VSCodium
              </a>
              , then refresh. Portable installations can install the released
              VSIX manually.
            </p>
          )}
          <button
            className="text-action"
            disabled={busy}
            onClick={() => void act(load)}
          >
            Refresh editor detection
          </button>
          {!!installed.length && (
            <ul className="editor-extension-list">
              {installed.map((id) => (
                <li key={id}>
                  <Puzzle size={12} />
                  <code>{id}</code>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="setup-card">
          <div className="setup-heading">
            <span className="setup-icon">
              <Link2 size={23} />
            </span>
            <div>
              <h2>Connect OffCourse to this course</h2>
              <p>
                Start or continue a course, open its exact project folder in
                your editor, then pair the OutClass companion extension.
              </p>
            </div>
          </div>
          <ol className="editor-steps">
            <li>
              Install the companion using the button above, or install its VSIX
              from the release.
            </li>
            <li>
              Generate the code below. It grants the editor access to the active
              course's teacher and retrieval only.
            </li>
            <li>
              Run <code>OutClass: Connect course workspace</code> in the editor
              command palette and enter the code.
            </li>
            <li>
              Save and test your attempt, then ask OffCourse. Use your editor's
              ordinary extensions, terminal and debugger.
            </li>
          </ol>
          <div className="onboarding-actions">
            <button
              className="button primary"
              disabled={busy || !state.session}
              onClick={() =>
                void act(async () => {
                  const r = await api<{ code: string }>("editor-code", {});
                  setCode(r.code);
                })
              }
            >
              Get editor connection code
            </button>
            {code && (
              <output
                className="editor-code"
                aria-label="Editor connection code"
              >
                {code}
              </output>
            )}
          </div>
          <p className="hint">
            Expires in five minutes. Separate from the Chrome extension pairing
            code. One active course session at a time; connect another course
            explicitly.
          </p>
          {data?.connections.map((c) => (
            <div className="editor-connection" key={c.id}>
              <span>
                {state.courses.find((course) => course.id === c.courseId)
                  ?.title || "Previous course"}
              </span>
              <button
                className="text-action"
                disabled={busy}
                onClick={() =>
                  void act(() => api("editor-revoke", { id: c.id }))
                }
              >
                Disconnect editor
              </button>
            </div>
          ))}
        </section>
        <p className="hint">
          VS Code extensions run in VS Code; VSCodium uses its own supported
          registry. OutClass's built-in editor does not run arbitrary VS Code
          extensions. Remote/SSH/WSL editor hosts are not supported in this
          preview.
        </p>
        {message && (
          <p role="status" className="hint">
            {message}
          </p>
        )}
      </div>
    </>
  );
}
