import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Folder,
  ArrowUpRight,
  Link2,
  Sparkles,
  ShieldCheck,
  Code2,
} from "lucide-react";
import type { DesktopEnvironment } from "../desktop/bridge";
import type { Status } from "../shared";
import "./onboarding.css";
import { AIAccessSettings } from "./ai-access";

type Request = <T>(route: string, body?: unknown) => Promise<T>;
export function Onboarding({
  educator = false,
  state,
  request,
  onDone,
  onRefresh,
}: {
  educator?: boolean;
  state: Status;
  request: Request;
  onDone: () => void;
  onRefresh: () => Promise<unknown>;
}) {
  const [step, setStep] = useState(() => {
    try {
      const saved = Number(localStorage.getItem("gitlearn-setup-step"));
      return state.settings.configured && [2, 3].includes(saved)
        ? educator
          ? 2
          : saved
        : 0;
    } catch {
      return 0;
    }
  });
  const [environment, setEnvironment] = useState<DesktopEnvironment>();
  const [folder, setFolder] = useState("");
  const [key, setKey] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    window
      .gitLearnDesktop!.environment()
      .then((result) => {
        setEnvironment(result);
        setFolder(result.defaultLearningFolder);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("gitlearn-setup-step", String(step));
    } catch {}
  }, [step]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="onboarding">
      <aside className="onboarding-aside">
        <div className="onboarding-brand">
          <ArrowUpRight size={25} />
          <strong>{educator ? "OutClass Educator" : "OutClass"}</strong>
          <span>01 / YOUR WORKSPACE</span>
        </div>
        <div className="onboarding-story">
          <p>
            {educator ? "YOUR TEACHING WORKSPACE" : "FROM LESSON TO PRACTICE"}
          </p>
          {educator ? (
            <h1>
              Build courses that <span>teach by doing.</span>
            </h1>
          ) : (
            <h1>
              A place for
              <br />
              what you’re
              <br />
              <span>learning.</span>
            </h1>
          )}
          <p>
            {educator
              ? "Design in Academy, preview in Learn, and prepare your launch."
              : "Your courses, your code, your next breakthrough. All together, on your computer."}
          </p>
        </div>
        <div className="onboarding-local">
          <ShieldCheck size={16} /> Your files stay on your computer.
        </div>
      </aside>
      <main className="onboarding-main">
        <nav className="onboarding-progress" aria-label="Setup progress">
          {[
            "Welcome",
            "Workspace",
            "AI help",
            ...(educator ? [] : ["Browser"]),
          ].map((name, i) => (
            <span
              key={name}
              aria-current={step === i ? "step" : undefined}
              className={step >= i ? "current" : ""}
            >
              <b>{step > i ? <Check size={12} /> : i + 1}</b>
              {name}
            </span>
          ))}
        </nav>
        <section className="onboarding-content" aria-live="polite">
          {step === 0 && (
            <>
              <Code2 className="onboarding-symbol" size={30} />
              <div className="eyebrow">
                {educator
                  ? "ACADEMY · CREATOR STUDIO · GTM"
                  : "A SMALL SETUP. A BETTER WAY TO LEARN."}
              </div>
              <h2>
                {educator
                  ? "Set up your educator workspace."
                  : "Make yourself at home."}
              </h2>
              <p>
                {educator
                  ? "Choose a folder for your courses and connect AI if you want help building exercises and capstones."
                  : "Set up a learning folder, connect your browser, and build alongside your Udemy courses. VS Code and GitHub are optional."}
              </p>
              {!educator && (
                <div className="onboarding-preview">
                  <span>
                    <Folder size={18} /> Courses find their own folder
                  </span>
                  <span>
                    <Code2 size={18} /> A real editor, ready to practice
                  </span>
                  <span>
                    <Sparkles size={18} /> Course answers with sources
                  </span>
                </div>
              )}
              <button
                className="button primary"
                disabled={!environment || busy}
                onClick={() => setStep(1)}
              >
                Let’s get started <ArrowRight size={16} />
              </button>
            </>
          )}
          {step === 1 && (
            <>
              <Folder className="onboarding-symbol" size={30} />
              <div className="eyebrow">YOUR LOCAL HOME</div>
              <h2>One folder. Every course.</h2>
              <p>
                Choose a parent folder. OutClass creates separate practice
                folders and versioned history inside it, then organizes every
                course and lesson for you.
              </p>
              <label>
                Parent learning folder
                <div className="input-with-button">
                  <input
                    aria-label="Parent learning folder"
                    value={folder}
                    onChange={(e) => setFolder(e.target.value)}
                  />
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        const picked =
                          await window.gitLearnDesktop!.chooseFolder();
                        if (picked) setFolder(picked);
                      })
                    }
                  >
                    Browse
                  </button>
                </div>
              </label>
              <div className="onboarding-tree">
                <strong>My Learning/</strong>
                <span>
                  ├ history/ <small>Git checkpoints, all courses</small>
                </span>
                <span>
                  ├ projects/ <small>One evolving project per course</small>
                </span>
                <span>
                  └ workspaces/ <small>Optional separate lesson folders</small>
                </span>
              </div>
              {!state.gitAvailable && (
                <p className="onboarding-warning">
                  Git is needed for local checkpoints.{" "}
                  <a
                    href="https://git-scm.com/downloads/win"
                    onClick={(e) => {
                      e.preventDefault();
                      window
                        .gitLearnDesktop!.openExternal(e.currentTarget.href)
                        .catch((e) => setError(e.message));
                    }}
                  >
                    Install Git for Windows
                  </a>
                  , then restart OutClass. Python is only needed for Python
                  lessons.
                </p>
              )}
              <button
                className="button primary"
                disabled={busy || !folder.trim() || !state.gitAvailable}
                onClick={() =>
                  action(async () => {
                    const separator = folder.includes("\\") ? "\\" : "/";
                    await request("setup", {
                      repoPath:
                        folder.replace(/[\\/]+$/, "") + separator + "history",
                      aiEnabled: false,
                    });
                    setStep(2);
                  })
                }
              >
                {busy ? "Creating your workspace…" : "Create my workspace"}
                <ArrowRight size={16} />
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <Sparkles className="onboarding-symbol" size={30} />
              <div className="eyebrow">OPTIONAL, ON YOUR TERMS</div>
              <h2>A little help when you need it.</h2>
              <p>
                OffCourse helps you reason about your code and course material.
                Use a personal key, a local model, or included AI when its
                hosted service is connected. You can also keep learning without
                AI.
              </p>
              {state.hasApiKey || environment?.hasSavedKey ? (
                <div className="onboarding-ready">
                  <Check size={17} /> Your local companion already has an API
                  key.
                </div>
              ) : (
                <>
                  <label>
                    OpenAI API key
                    <input
                      autoComplete="off"
                      type="password"
                      aria-label="OpenAI API key"
                      placeholder="sk-…"
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                    />
                  </label>
                  <p className="hint">
                    Stored with Windows encryption. Never included in your
                    course folders or Git history.
                  </p>
                </>
              )}
              <div className="onboarding-actions">
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() =>
                    action(async () => {
                      if (key.trim()) {
                        await window.gitLearnDesktop!.setApiKey(key.trim());
                        setKey("");
                      }
                      const connection = await request<{ ready: boolean }>(
                        "ai-access",
                      );
                      if (connection.ready)
                        await request("assistant-enable", { enabled: true });
                      if (educator) {
                        localStorage.removeItem("gitlearn-setup-step");
                        onDone();
                      } else setStep(3);
                    })
                  }
                >
                  {busy
                    ? "Saving…"
                    : key.trim() || (state.hasAI ?? state.hasApiKey)
                      ? "Continue with AI help"
                      : "Continue without AI"}
                  <ArrowRight size={16} />
                </button>
              </div>
              <p className="hint">
                You can add or remove your key later in Workspace settings.
                Commit-message AI has its own separate switch.
              </p>
              <details className="onboarding-ai-options">
                <summary>Use a local model or connect included AI</summary>
                <AIAccessSettings
                  api={request}
                  enabled={!!state.settings.assistantEnabled}
                  onRefresh={onRefresh}
                />
              </details>
            </>
          )}
          {step === 3 && (
            <>
              <Link2 className="onboarding-symbol" size={30} />
              <div className="eyebrow">CONNECT THE LESSON</div>
              <h2>Bring Udemy into your workspace.</h2>
              <p>
                The Chrome extension keeps your course and current lesson in
                context. The store listing is being prepared; you can use the
                included extension now.
              </p>
              <ol className="onboarding-extension">
                <li>
                  <button
                    className="text-action"
                    onClick={() =>
                      action(() =>
                        window.gitLearnDesktop!.openExtensionFolder(),
                      )
                    }
                  >
                    Open the included extension folder ↗
                  </button>
                </li>
                <li>
                  In Chrome, open <code>chrome://extensions</code>, enable
                  Developer mode, and choose <strong>Load unpacked</strong>.
                  Select that folder.
                </li>
                <li>
                  Generate a code below, open the OutClass extension, and enter
                  it to connect.
                </li>
              </ol>
              <div className="onboarding-pair">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    action(async () => {
                      const result = await request<{ code: string }>(
                        "pair-code",
                        {},
                      );
                      setCode(result.code);
                    })
                  }
                >
                  {code ? "New connection code" : "Get connection code"}
                </button>
                {code && <output aria-label="Connection code">{code}</output>}
              </div>
              {state.extensionConnected && (
                <div className="onboarding-ready">
                  <Check size={17} /> Browser connected.
                </div>
              )}
              <p className="hint">
                Then open a Udemy lesson, return here, and start coding. Use
                Import visible transcript in the extension to add course
                sources. You can finish connecting later in settings.
              </p>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => {
                  try {
                    localStorage.removeItem("gitlearn-setup-step");
                  } catch {}
                  onDone();
                }}
              >
                Open my workspace
                <ArrowRight size={16} />
              </button>
            </>
          )}
          {error && (
            <p className="onboarding-error" role="alert">
              {error}
            </p>
          )}
        </section>
        <footer className="onboarding-footer">
          {step === 3 && (
            <button className="text-action" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={14} /> Back
            </button>
          )}
          <span>
            OutClass for Windows · {environment?.version || "Preview"}
          </span>
        </footer>
      </main>
    </div>
  );
}

export function DesktopKeySettings({
  onSaved,
}: {
  onSaved: () => Promise<unknown>;
}) {
  const [key, setKey] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (!window.gitLearnDesktop) return null;
  async function save(remove = false) {
    setBusy(true);
    setMessage("");
    try {
      await window.gitLearnDesktop!.setApiKey(remove ? "" : key.trim());
      setKey("");
      await onSaved();
      setMessage(
        remove ? "API key removed." : "API key saved with Windows encryption.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save the key.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="setup-card">
      <div className="setup-heading">
        <span className="setup-icon">
          <Sparkles size={23} />
        </span>
        <div>
          <h2>Your OpenAI connection</h2>
          <p>
            Your key is stored locally with Windows encryption. API usage is
            billed by OpenAI.
          </p>
        </div>
      </div>
      <label>
        New OpenAI API key
        <input
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-…"
        />
      </label>
      <div className="onboarding-actions">
        <button
          className="button primary"
          disabled={busy || !key.trim()}
          onClick={() => save()}
        >
          Save key
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => save(true)}
        >
          Remove key
        </button>
      </div>
      <p role="status" className="hint">
        {message ||
          "AI assistance and commit messages have separate consent switches."}
      </p>
      <button
        className="text-action"
        onClick={() =>
          window
            .gitLearnDesktop!.openExtensionFolder()
            .catch((e) => setMessage(e.message))
        }
      >
        Open included Chrome extension folder ↗
      </button>
    </section>
  );
}
