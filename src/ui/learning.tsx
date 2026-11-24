import React, { useEffect, useState } from "react";
import { ArrowRight, Check, Code2, Folder, RefreshCw } from "lucide-react";
import type { Course, Diagnostics, Status } from "../shared";

export function ContinueLearning({
  state,
  busy,
  onContinue,
  onChooseFolder,
}: {
  state: Status;
  busy: boolean;
  onContinue: (courseId: string) => void;
  onChooseFolder: (course: Course) => void;
}) {
  if (!state.continueItems?.length) return null;
  return (
    <section className="continue-learning" aria-label="Continue learning">
      <div className="section-heading">
        <h2>Continue building</h2>
        <span className="quiet-note">Your place is saved on this device</span>
      </div>
      {state.continueItems.slice(0, 3).map((anchor) => {
        const course = state.courses.find(
          (item) => item.id === anchor.courseId,
        )!;
        const lesson = course.lessons.find(
          (item) => item.id === anchor.lessonId,
        );
        const checkpoint = state.checkpoints.find(
          (item) => item.courseId === course.id,
        );
        const otherSession =
          !!state.session && state.session.courseId !== course.id;
        return (
          <div className="continue-row" key={course.id}>
            <span className="continue-icon">
              <Code2 size={19} />
            </span>
            <div className="continue-copy">
              <strong>{course.title}</strong>
              <p>
                {lesson?.title || "Last lesson"}
                {anchor.file ? ` · ${anchor.file}` : ""}
              </p>
              <small>
                {!anchor.folderAvailable
                  ? "Coding folder is missing. Choose its current location to continue."
                  : !anchor.fileAvailable
                    ? "Last file is missing. Available files will open."
                    : anchor.lastAction === "checkpoint"
                      ? "Last session checkpointed. Ready for your next change."
                      : anchor.lastAction === "paused"
                        ? "Session paused. Pick up where you left off."
                        : "Your last workspace is ready."}
              </small>
              {anchor.note && (
                <p className="continue-note">{anchor.note.slice(0, 220)}</p>
              )}
              {checkpoint && (
                <small>
                  Last checkpoint · {checkpoint.message.split("\n")[0]}
                </small>
              )}
              {otherSession && (
                <small>Finish the current session to switch courses.</small>
              )}
            </div>
            <button
              className="button secondary"
              disabled={busy || otherSession}
              onClick={() =>
                anchor.folderAvailable
                  ? onContinue(course.id)
                  : onChooseFolder({
                      ...course,
                      currentLessonId: anchor.lessonId,
                    })
              }
            >
              {anchor.folderAvailable ? (
                <>
                  Continue <ArrowRight size={14} />
                </>
              ) : (
                <>
                  Choose folder <Folder size={14} />
                </>
              )}
            </button>
          </div>
        );
      })}
    </section>
  );
}

export function SetupDiagnostics({
  api,
}: {
  api: <T>(route: string, body?: unknown) => Promise<T>;
}) {
  const [result, setResult] = useState<Diagnostics>(),
    [error, setError] = useState(""),
    [checking, setChecking] = useState(false);
  const check = async () => {
    setChecking(true);
    setError("");
    try {
      setResult(await api<Diagnostics>("diagnostics"));
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not check this device.",
      );
    } finally {
      setChecking(false);
    }
  };
  useEffect(() => {
    void check();
  }, []);
  const rows: [string, boolean, string][] = result
    ? [
        ["JavaScript", true, `Node ${result.nodeVersion} · ready locally`],
        [
          "TypeScript",
          true,
          "Erasable .ts/.mts/.cts scripts run locally · use a project type check before claiming type safety",
        ],
        [
          "Web projects",
          result.webToolchainAvailable && !!result.npmAvailable,
          result.webToolchainAvailable && result.npmAvailable
            ? "Node.js/npm detected · React, Next.js and Node projects use Project console"
            : "Install Node.js with npm for web projects. Short JavaScript runs work now.",
        ],
        [
          "Python",
          result.pythonAvailable,
          result.pythonAvailable
            ? `Ready · ${result.pythonRuntime}`
            : "Install Python, then restart OutClass. JavaScript works now.",
        ],
        [
          "C",
          !!result.cCompiler,
          result.cCompiler
            ? `${result.cCompiler} · single-file C11 compile/run ready`
            : "Install GCC or Clang, add it to PATH, then restart OutClass.",
        ],
        [
          "C++",
          !!result.cppCompiler,
          result.cppCompiler
            ? `${result.cppCompiler} · single-file C++17 compile/run ready`
            : "Install G++ or Clang++, add it to PATH, then restart OutClass.",
        ],
        [
          "Checkpoints",
          result.gitAvailable && result.historyWritable,
          !result.gitAvailable
            ? "Install Git, then restart OutClass."
            : result.historyWritable
              ? "Git and learning folder are ready"
              : "Choose a writable learning folder below",
        ],
        ...(result.workspaceWritable === null
          ? []
          : [
              [
                "Coding folder",
                result.workspaceWritable,
                result.workspaceWritable
                  ? "Available and writable"
                  : "Folder is missing or read-only. Choose its current location.",
              ] as [string, boolean, string],
            ]),
        [
          "Learning assistant",
          (result.hasAI ?? result.hasApiKey) && result.assistantEnabled,
          !(result.hasAI ?? result.hasApiKey)
            ? "Choose Included AI, your own key or a local model below. Coding and checkpoints work locally."
            : result.assistantEnabled
              ? "AI connected · guides enabled"
              : "AI connected · enable guides below",
        ],
        [
          "Chrome extension",
          result.extensionConnected,
          result.extensionConnected
            ? "Paired with this device"
            : "Pair below, or add a course manually",
        ],
      ]
    : [];
  return (
    <section className="setup-card diagnostics" aria-label="Device readiness">
      <div className="setup-heading">
        <span className="setup-icon">
          <Code2 size={22} />
        </span>
        <div>
          <h2>Your device is ready when you are</h2>
          <p>Check the tools OutClass uses for local learning.</p>
        </div>
        <button className="text-button" disabled={checking} onClick={check}>
          <RefreshCw size={14} className={checking ? "spin" : ""} />
          {checking ? "Checking…" : "Check again"}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="diagnostic-list">
        {rows.map(([label, ready, detail]) => (
          <div key={label}>
            <span
              className={ready ? "diagnostic-ready" : "diagnostic-optional"}
            >
              {ready ? <Check size={14} /> : <span className="dot offline" />}
            </span>
            <strong>{label}</strong>
            <p>{detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
