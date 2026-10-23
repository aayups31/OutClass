import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Code2,
  Copy,
  Folder,
  GitCommitHorizontal,
  Github,
  History,
  LayoutGrid,
  Link2,
  Loader2,
  Moon,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import type { Course, PublicPreview as Preview, Status } from "../shared";
import "./style.css";
import "./studio.css";
import { Onboarding, DesktopKeySettings } from "./onboarding";
import { ContinueLearning, SetupDiagnostics } from "./learning";
import { Divider, useWorkspaceLayout } from "./workspace-layout";
import { ArchitectNotebook, LaunchIdeaPrompt } from "./notebook";
import { AIAccessSettings } from "./ai-access";
import { EditorsAndExtensions } from "./editors";
import { LearningHub, LiveWorkHub, PracticePrompt } from "./practical";
import "./workspace-clean.css";
import "./workspace-frame.css";
const Studio = lazy(() =>
  import("./studio").then((module) => ({ default: module.Studio })),
);
const ProductWorkspace = lazy(() =>
  import("./products").then((module) => ({ default: module.ProductWorkspace })),
);

let token = "";
type Theme = "light" | "dark";
const initialTheme: Theme =
  document.documentElement.dataset.theme === "dark" ? "dark" : "light";
async function request<T>(route: string, body?: unknown): Promise<T> {
  const binary = body instanceof Blob;
  const response = await fetch(`/api/${route}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": binary ? "application/octet-stream" : "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : binary ? body : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Could not complete this action.");
  return result as T;
}
type Page =
  | "overview"
  | "courses"
  | "history"
  | "setup"
  | "studio"
  | "practice"
  | "live"
  | "ideas"
  | "editors"
  | "academy"
  | "creator"
  | "gtm";
function App() {
  const layoutControl = useWorkspaceLayout();
  const { layout } = layoutControl;
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#101114" : "#fcfcfd");
    try {
      localStorage.setItem("gitlearn-theme", theme);
    } catch {}
  }, [theme]);
  const [state, setState] = useState<Status>();
  const [onboarding, setOnboarding] = useState(false);
  const [page, setPage] = useState<Page>(() => {
    const view = new URLSearchParams(location.search).get("view");
    return [
      "overview",
      "courses",
      "history",
      "setup",
      "studio",
      "practice",
      "live",
      "ideas",
      "editors",
      "academy",
      "creator",
      "gtm",
    ].includes(view || "")
      ? (view as Page)
      : "overview";
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [add, setAdd] = useState(false);
  const [starting, setStarting] = useState<Course>();
  const [recovering, setRecovering] = useState<Course>();
  const [preview, setPreview] = useState<Preview>();
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [selectedCourse, setSelectedCourse] = useState<string>();
  const [draftDirty, setDraftDirty] = useState(false);
  const [practiceTab, setPracticeTab] = useState("practice");
  function navigate(next: Page, courseId?: string) {
    if (
      draftDirty &&
      (next !== page ||
        (courseId &&
          courseId !==
            (selectedCourse ||
              state?.session?.courseId ||
              state?.courses[0]?.id))) &&
      !confirm(
        "Leave the editor with unsaved changes? Save your files and let notes finish saving first to keep them.",
      )
    )
      return;
    if (courseId) setSelectedCourse(courseId);
    if (
      ["academy", "creator", "gtm"].includes(next) ||
      ["academy", "creator", "gtm"].includes(page)
    ) {
      const url = new URL(location.href);
      url.searchParams.set("view", next);
      history.replaceState(null, "", url);
    }
    setPage(next);
  }
  const refresh = async () => {
    const result = await request<Status>("state");
    setState(result);
    return result;
  };
  useEffect(() => {
    fetch("/api/bootstrap", { method: "POST" })
      .then((response) => response.json())
      .then(async (result) => {
        token = result.token;
        const loaded = await refresh();
        if (
          window.gitLearnDesktop &&
          (!loaded.settings.configured ||
            ["2", "3"].includes(
              localStorage.getItem("gitlearn-setup-step") || "",
            ))
        )
          setOnboarding(true);
        setNote(loaded.session?.note || "");
        if (
          loaded.session &&
          !new URLSearchParams(location.search).has("view")
        ) {
          setSelectedCourse(loaded.session.courseId);
          setPage("studio");
        }
      })
      .catch(() =>
        setError(
          "The local companion is not reachable. Open Start OutClass, then refresh this page.",
        ),
      );
    const timer = setInterval(() => {
      if (token) refresh().catch(() => {});
    }, 6000);
    return () => clearInterval(timer);
  }, []);
  async function act(
    label: string,
    fn: () => Promise<unknown>,
    success?: string,
  ) {
    setError("");
    setBusy(label);
    try {
      await fn();
      await refresh();
      if (success) setNotice(success);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy("");
    }
  }
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 6500);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  function continueLearning(courseId: string, workspace?: string) {
    return act("continue", async () => {
      const continued = await request<Status>("continue", {
        courseId,
        workspace,
      });
      setNote(continued.session?.note || "");
      setSelectedCourse(courseId);
      setRecovering(undefined);
      navigate("studio", courseId);
    });
  }
  async function finish(studioNote?: string) {
    if (studioNote !== undefined) setNote(studioNote);
    await request("note", { note: studioNote ?? note });
    const result = await request<Preview>("preview", {});
    setPreview(result);
    setMessage(result.message);
  }
  async function save() {
    if (!preview) return;
    await request("commit", { previewId: preview.id, message });
    setPreview(undefined);
    setNote("");
    setNotice("Checkpoint saved. Your work now has a local version history.");
  }
  const configured = state?.settings.configured;
  if (state && onboarding)
    return (
      <Onboarding
        state={state}
        request={request}
        onRefresh={refresh}
        onDone={() => {
          setOnboarding(false);
          setPage("courses");
          refresh().catch(() => {});
        }}
      />
    );
  return (
    <div
      className={`shell adjustable ${layout.hideSidebar && page === "studio" ? "sidebar-hidden" : ""} ${!configured ? "first-visit" : ""} ${page === "studio" ? "studio-shell" : ""}`}
      style={{ "--sidebar-size": `${layout.sidebar}px` } as React.CSSProperties}
    >
      <aside className="sidebar">
        <a
          className="brand"
          aria-label="OutClass home"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            navigate("overview");
          }}
        >
          <BrandMark />
          <span className="brand-name">OutClass</span>
          <small>Personal workspace</small>
        </a>
        {page === "studio" && (
          <div className="studio-rail-tools" aria-label="Explorer views">
            <button
              aria-label="Show files"
              title="Files"
              className={
                !layout.hideExplorer && layout.explorerTab === "files"
                  ? "selected"
                  : ""
              }
              onClick={() =>
                layoutControl.update({
                  hideExplorer:
                    layout.explorerTab === "files"
                      ? !layout.hideExplorer
                      : false,
                  explorerTab: "files",
                })
              }
            >
              <Folder size={19} />
            </button>
            <button
              aria-label="Show course explorer"
              title="Courses"
              className={
                !layout.hideExplorer && layout.explorerTab === "courses"
                  ? "selected"
                  : ""
              }
              onClick={() =>
                layoutControl.update({
                  hideExplorer:
                    layout.explorerTab === "courses"
                      ? !layout.hideExplorer
                      : false,
                  explorerTab: "courses",
                })
              }
            >
              <BookOpen size={19} />
            </button>
          </div>
        )}
        <div className="nav-caption">Workspace</div>
        <nav aria-label="Workspace navigation">
          {(
            [
              { id: "overview", label: "Overview", icon: LayoutGrid },
              { id: "studio", label: "Code & learn", icon: Code2 },
              { id: "courses", label: "My courses", icon: BookOpen },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "nav active" : "nav"}
              onClick={() => navigate(item.id)}
              aria-label={item.label}
              aria-current={page === item.id ? "page" : undefined}
            >
              <item.icon size={17} strokeWidth={1.5} />
              <span className="nav-label">{item.label}</span>
              {item.id === "courses" && !!state?.courses.length && (
                <span className="count">{state.courses.length}</span>
              )}
            </button>
          ))}
          <details
            className="workspace-more"
            key={page}
            open={[
              "practice",
              "live",
              "ideas",
              "editors",
              "history",
              "academy",
              "creator",
              "gtm",
            ].includes(page)}
          >
            <summary title="More tools">
              <MoreHorizontal size={17} />
              <span>More tools</span>
            </summary>
            <div className="workspace-more-items">
              {(
                [
                  { id: "practice", label: "Learn by doing", icon: Sparkles },
                  { id: "live", label: "Live work", icon: Github },
                  {
                    id: "ideas",
                    label: "Ideas & architecture",
                    icon: Sparkles,
                  },
                  { id: "history", label: "Checkpoints", icon: History },
                  { id: "editors", label: "Editors & extensions", icon: Code2 },
                  { id: "academy", label: "Academy", icon: BookOpen },
                  { id: "creator", label: "Creator Studio", icon: LayoutGrid },
                  { id: "gtm", label: "GTM", icon: ArrowUpRight },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  className={page === item.id ? "nav active" : "nav"}
                  onClick={() => navigate(item.id)}
                  aria-label={item.label}
                  aria-current={page === item.id ? "page" : undefined}
                >
                  <item.icon size={17} strokeWidth={1.5} />
                  <span className="nav-label">{item.label}</span>
                </button>
              ))}
            </div>
          </details>
        </nav>
        {!!state?.courses.length && (
          <div className="sidebar-course-list">
            <div className="sidebar-course-caption">
              Your courses <span>{state.courses.length}</span>
            </div>
            {state.courses.map((course) => (
              <button
                key={course.id}
                className={
                  page === "studio" &&
                  (selectedCourse ||
                    state.session?.courseId ||
                    state.courses[0]?.id) === course.id
                    ? "selected"
                    : ""
                }
                onClick={() => navigate("studio", course.id)}
                title={course.title}
              >
                <BookOpen size={13} />
                <span>
                  {course.title}
                  <small>
                    {state.session?.courseId === course.id
                      ? "Session in progress"
                      : `${course.lessons.length} lessons`}
                  </small>
                </span>
                {state.session?.courseId === course.id && <i />}
              </button>
            ))}
          </div>
        )}
        <div className="sidebar-bottom">
          <button
            className={page === "setup" ? "nav active" : "nav"}
            onClick={() => navigate("setup")}
            aria-label="Setup & preferences"
            aria-current={page === "setup" ? "page" : undefined}
          >
            <Settings2 size={17} strokeWidth={1.5} />
            <span className="nav-label">Settings</span>
            <span className="mobile-nav-label">Settings</span>
          </button>
          <div className="connection">
            <span className={state ? "dot" : "dot offline"} />
            {state ? "Companion connected" : "Connecting…"}
            <span className="version">v0.7.1</span>
          </div>
        </div>
      </aside>
      {!layout.hideSidebar && page === "studio" && (
        <Divider
          className="sidebar-divider"
          label="Course sidebar width"
          value={layout.sidebar}
          min={180}
          max={340}
          onChange={(sidebar) => layoutControl.update({ sidebar })}
        />
      )}
      <main>
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace</span>
            <ChevronRight size={14} />
            <span>
              {page === "overview"
                ? "Overview"
                : page === "courses"
                  ? "My courses"
                  : page === "history"
                    ? "Checkpoints"
                    : page === "studio"
                      ? "Code & learn"
                      : page === "practice"
                        ? "Learn by doing"
                        : page === "live"
                          ? "Live work"
                          : page === "ideas"
                            ? "Ideas & architecture"
                            : page === "editors"
                              ? "Editors & extensions"
                              : page === "academy"
                                ? "Academy"
                                : page === "creator"
                                  ? "Creator Studio"
                                  : page === "gtm"
                                    ? "GTM"
                                    : "Settings"}
            </span>
          </div>
          <div className="topbar-actions">
            <a
              href="/welcome/"
              className="workspace-guide"
              onClick={(event) => {
                if (window.gitLearnDesktop) {
                  event.preventDefault();
                  window.gitLearnDesktop
                    .openExternal(`${location.origin}/welcome/`)
                    .catch((e) => setError(e.message));
                }
              }}
            >
              Product & guide <ArrowUpRight size={13} />
            </a>
            <span className="local-pill">
              <span className="dot" />
              {state?.settings.remote
                ? "Private GitHub connected"
                : "Local first"}
            </span>
            <button
              className="theme-toggle"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              title={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>
        <div className="content">
          {error && (
            <div role="alert" className="alert error">
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={17} />
              </button>
            </div>
          )}
          {notice && !add && !starting && !preview && (
            <div role="status" className="alert success">
              <CheckCircle2 size={18} />
              {notice}
            </div>
          )}
          {!state ? (
            <div className="loading">
              <Loader2 className="spin" />
              Opening your learning workspace…
            </div>
          ) : (
            <>
              {page === "ideas" && (
                <ArchitectNotebook api={request} courses={state.courses} />
              )}
              {page === "editors" && (
                <EditorsAndExtensions api={request} state={state} />
              )}
              {configured && page === "overview" && (
                <LaunchIdeaPrompt
                  api={request}
                  onOpen={() => navigate("ideas")}
                />
              )}
              {page === "studio" && (
                <Suspense
                  fallback={
                    <div className="loading">
                      <Loader2 className="spin" />
                      Opening your learning desk…
                    </div>
                  }
                >
                  <Studio
                    key={`${selectedCourse || state.session?.courseId || state.courses[0]?.id || "welcome"}:${state.session?.id || "inactive"}`}
                    state={state}
                    selectedCourse={selectedCourse}
                    theme={theme}
                    onToggleTheme={() =>
                      setTheme(theme === "dark" ? "light" : "dark")
                    }
                    onSelectCourse={(id) => navigate("studio", id)}
                    api={request}
                    onCourses={() => navigate("courses")}
                    onSetup={() => navigate("setup")}
                    onStart={(course) => setStarting(course)}
                    onFinish={(nextNote) =>
                      act("preview", () => finish(nextNote))
                    }
                    onRefresh={refresh}
                    onDirty={setDraftDirty}
                    sessionNote={note}
                    onNoteChange={setNote}
                    busy={!!busy}
                    onPractice={() => {
                      setPracticeTab("practice");
                      navigate("practice");
                    }}
                    onPath={() => {
                      setPracticeTab("path");
                      navigate("practice");
                    }}
                    onLive={() => navigate("live")}
                  />
                </Suspense>
              )}
              {page === "overview" && (
                <>
                  <div className="page-heading">
                    <div className="eyebrow">Personal workspace</div>
                    <h1>
                      {configured ? (
                        state.session ? (
                          "Current session"
                        ) : (
                          "Learning overview"
                        )
                      ) : (
                        <>
                          Keep what you{" "}
                          <span className="heading-emphasis">learn.</span>
                        </>
                      )}
                    </h1>
                    <p>
                      {configured
                        ? state.session
                          ? "Stay with the lesson. Keep the work that matters."
                          : "Pick up a lesson and keep building your learning history."
                        : "Your courses, code, and checkpoints. All in one place."}
                    </p>
                  </div>
                  <div
                    className="workspace-summary"
                    aria-label="Workspace summary"
                  >
                    <button onClick={() => setPage("courses")}>
                      <BookOpen size={15} />
                      <span>Courses</span>
                      <strong>{state.courses.length}</strong>
                    </button>
                    <button onClick={() => setPage("history")}>
                      <GitCommitHorizontal size={15} />
                      <span>Checkpoints</span>
                      <strong>{state.checkpoints.length}</strong>
                    </button>
                    <div>
                      <span
                        className={
                          state.session?.status === "active"
                            ? "dot"
                            : "dot offline"
                        }
                      />
                      <span>Session</span>
                      <strong>
                        {state.session
                          ? state.session.status === "active"
                            ? "In progress"
                            : "Paused"
                          : configured
                            ? "Idle"
                            : "Not started"}
                      </strong>
                    </div>
                  </div>
                  {!configured ? (
                    <section className="welcome">
                      <div className="welcome-text">
                        <span className="tag">
                          <BrandMark /> UDEMY → YOUR WORKSPACE
                        </span>
                        <h2>
                          Give your learning
                          <br />a place to build.
                        </h2>
                        <p>
                          Follow the course. Write code in your own editor. Keep
                          every useful step in a history you can return to.
                        </p>
                        <button
                          className="button primary"
                          onClick={() => setPage("setup")}
                        >
                          Set up my workspace <ArrowRight size={17} />
                        </button>
                        <span className="quiet-note">
                          No GitHub repository needed to get started.
                        </span>
                      </div>
                      <WorkspaceChecklist
                        state={state}
                        onSetup={() => setPage("setup")}
                      />
                    </section>
                  ) : state.session ? (
                    <section className="session-panel">
                      <div className="session-top">
                        <span className="tag">
                          <span
                            className={
                              state.session.status === "active"
                                ? "dot"
                                : "dot offline"
                            }
                          />
                          {state.session.status === "active"
                            ? "LEARNING SESSION"
                            : "SESSION PAUSED"}
                        </span>
                        <button
                          className="text-button"
                          disabled={!!busy}
                          onClick={() =>
                            act("pause", () =>
                              request("session", {
                                action:
                                  state.session!.status === "active"
                                    ? "pause"
                                    : "resume",
                              }),
                            )
                          }
                        >
                          {state.session.status === "active" ? (
                            <Pause size={16} />
                          ) : (
                            <Play size={16} />
                          )}{" "}
                          {state.session.status === "active"
                            ? "Pause"
                            : "Resume"}
                        </button>
                      </div>
                      <div className="session-grid">
                        <div>
                          <p className="course-label">
                            {state.session.courseTitle}{" "}
                            <span>/ {state.session.section}</span>
                          </p>
                          <h2>{state.session.lessonTitle}</h2>
                          <div className="session-facts">
                            <span>
                              <Clock3 size={16} />
                              <Elapsed started={state.session.startedAt} />
                            </span>
                            <span>
                              <Code2 size={16} />
                              {state.sourceFiles}{" "}
                              {state.sourceFiles === 1 ? "file" : "files"} in
                              coding folder
                            </span>
                          </div>
                          <div className="path-box">
                            <Folder size={17} />
                            <span>{state.session.workspace}</span>
                          </div>
                          <button
                            className="button secondary"
                            onClick={() =>
                              act("editor", () => request("open-workspace", {}))
                            }
                          >
                            Open in VS Code <ArrowUpRight size={16} />
                          </button>
                        </div>
                        <div className="session-note">
                          <label htmlFor="session-note">
                            What clicked today? <span>Optional</span>
                          </label>
                          <textarea
                            id="session-note"
                            placeholder="A useful idea, a question, or something you want to remember…"
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            onBlur={() => {
                              if (note !== state.session?.note)
                                request("note", { note }).catch((error) =>
                                  setError(error.message),
                                );
                            }}
                          />
                          <small>Your own notes stay with this lesson.</small>
                        </div>
                      </div>
                      <div className="session-footer">
                        <span>
                          <ShieldCheck size={17} />
                          Only your selected folder is included.
                        </span>
                        <div>
                          <button
                            className="button secondary"
                            onClick={() => {
                              setSelectedCourse(state.session!.courseId);
                              navigate("studio");
                            }}
                          >
                            <Code2 size={16} />
                            Open in OutClass
                          </button>
                          <button
                            className="text-button"
                            disabled={!!busy}
                            onClick={() => {
                              if (
                                confirm(
                                  "End this session without a checkpoint? Your source files will stay untouched.",
                                )
                              )
                                act("discard", () =>
                                  request("session", { action: "discard" }),
                                );
                            }}
                          >
                            End without saving
                          </button>
                          <button
                            className="button primary"
                            disabled={!!busy}
                            onClick={() => act("preview", finish)}
                          >
                            {busy === "preview" ? (
                              <Loader2 className="spin" size={16} />
                            ) : (
                              <GitCommitHorizontal size={18} />
                            )}
                            Finish & review
                          </button>
                        </div>
                      </div>
                    </section>
                  ) : (
                    <section className="ready-panel">
                      <span className="ready-index" aria-hidden="true">
                        <BookOpen size={22} strokeWidth={1.5} />
                      </span>
                      <div>
                        <span className="eyebrow">Next session</span>
                        <h2>Pick up your next lesson.</h2>
                        <p>
                          Open Udemy to detect your course, or add a lesson
                          yourself.
                        </p>
                      </div>
                      <button
                        className="button primary"
                        onClick={() => setAdd(true)}
                      >
                        <Plus size={17} />
                        Add a course
                      </button>
                    </section>
                  )}
                  {configured && (
                    <ContinueLearning
                      state={state}
                      busy={!!busy}
                      onChooseFolder={setRecovering}
                      onContinue={(courseId) => void continueLearning(courseId)}
                    />
                  )}
                  {configured && (
                    <PracticePrompt
                      api={request}
                      changed={state.checkpoints.length}
                      onOpen={() => navigate("practice")}
                      onLive={() => navigate("live")}
                    />
                  )}
                  <div className="section-heading">
                    <h2>{configured ? "Your courses" : "The workflow"}</h2>
                    {configured && (
                      <button
                        className="text-button"
                        onClick={() => setPage("courses")}
                      >
                        View all <ArrowRight size={16} />
                      </button>
                    )}
                  </div>
                  {configured ? (
                    state.courses.length ? (
                      <div className="course-grid">
                        {state.courses.slice(0, 3).map((course, index) => (
                          <CourseCard
                            key={course.id}
                            index={index + 1}
                            course={course}
                            onStart={() => setStarting(course)}
                            onMirror={() =>
                              act(
                                "mirror",
                                () =>
                                  request("mirror", { courseId: course.id }),
                                "Course structure ready. Your lesson folders are waiting.",
                              )
                            }
                            busy={!!busy}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="empty-inline">
                        <BookOpen size={25} />
                        <div>
                          <strong>Your course will appear here.</strong>
                          <p>
                            Connect the Chrome extension in Setup, or add a
                            course manually.
                          </p>
                        </div>
                        <button
                          className="button secondary"
                          onClick={() => setAdd(true)}
                        >
                          Add manually <Plus size={16} />
                        </button>
                      </div>
                    )
                  ) : (
                    <div className="steps">
                      {[
                        {
                          number: "01",
                          icon: BookOpen,
                          title: "Bring the lesson in.",
                          text: "Connect Udemy or add the lesson you’re watching.",
                        },
                        {
                          number: "02",
                          icon: Code2,
                          title: "Do your own work.",
                          text: "Write the code. Make a note. Use the tools you know.",
                        },
                        {
                          number: "03",
                          icon: GitCommitHorizontal,
                          title: "Leave a record.",
                          text: "Review your changes and keep a version you can return to.",
                        },
                      ].map((step) => (
                        <article key={step.number}>
                          <span className="step-number">{step.number}</span>
                          <step.icon
                            size={20}
                            className="step-icon"
                            strokeWidth={1.5}
                          />
                          <h3>{step.title}</h3>
                          <p>{step.text}</p>
                        </article>
                      ))}
                    </div>
                  )}
                  {configured && (
                    <>
                      <div className="section-heading">
                        <h2>Recent checkpoints</h2>
                        <span className="muted">A record of the work.</span>
                      </div>
                      <HistoryList state={state} small />
                    </>
                  )}
                </>
              )}
              {(["academy", "creator", "gtm"] as string[]).includes(page) && (
                <Suspense fallback={<p>Opening product workspace…</p>}>
                  <ProductWorkspace
                    key={page}
                    mode={page as "academy" | "creator" | "gtm"}
                    api={request}
                    onDirty={setDraftDirty}
                    onCode={(id) => {
                      void refresh().then((next) => {
                        setNote(next.session?.note || "");
                        navigate("studio", id);
                      });
                    }}
                  />
                </Suspense>
              )}
              {page === "practice" && (
                <LearningHub
                  state={state}
                  api={request}
                  onRefresh={refresh}
                  initialTab={practiceTab}
                  onCode={(id) => {
                    void refresh().then((next) => {
                      setNote(next.session?.note || "");
                      navigate("studio", id);
                    });
                  }}
                />
              )}
              {page === "live" && (
                <LiveWorkHub
                  state={state}
                  api={request}
                  onRefresh={refresh}
                  onCode={(id) => {
                    void refresh().then((next) => {
                      setNote(next.session?.note || "");
                      navigate("studio", id);
                    });
                  }}
                />
              )}
              {page === "courses" && (
                <>
                  <div className="page-heading heading-with-action">
                    <div>
                      <div className="eyebrow">Library</div>
                      <h1>My courses</h1>
                      <p>The lessons you follow. The work you make of them.</p>
                    </div>
                    <button
                      className="button primary"
                      disabled={!configured}
                      onClick={() => setAdd(true)}
                    >
                      <Plus size={17} />
                      Add a course
                    </button>
                  </div>
                  {!configured ? (
                    <SetupPrompt onClick={() => setPage("setup")} />
                  ) : state.courses.length ? (
                    <div className="course-grid">
                      {state.courses.map((course, index) => (
                        <CourseCard
                          key={course.id}
                          index={index + 1}
                          course={course}
                          onStart={() => setStarting(course)}
                          onMirror={() =>
                            act(
                              "mirror",
                              () => request("mirror", { courseId: course.id }),
                              "Course folders created.",
                            )
                          }
                          busy={!!busy}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="empty-big">
                      <BookOpen size={36} />
                      <h2>Your learning library starts here.</h2>
                      <p>
                        Add your Udemy course, or let the extension detect it.
                      </p>
                      <button
                        className="button primary"
                        onClick={() => setAdd(true)}
                      >
                        <Plus size={16} />
                        Add a course
                      </button>
                    </div>
                  )}
                </>
              )}
              {page === "history" && (
                <>
                  <div className="page-heading">
                    <div className="eyebrow">Version history</div>
                    <h1>Your checkpoints</h1>
                    <p>
                      Code, notes, and the lesson behind them. Saved together.
                    </p>
                  </div>
                  {state.settings.remote &&
                    state.checkpoints.some(
                      (item) => item.sync !== "synced",
                    ) && (
                      <div className="sync-banner">
                        <Github size={22} />
                        <div>
                          <strong>Your local work is ready to sync.</strong>
                          <p>
                            Push your saved checkpoints to your private
                            repository.
                          </p>
                        </div>
                        <button
                          className="button primary"
                          disabled={!!busy}
                          onClick={() =>
                            act(
                              "sync",
                              () => request("sync", {}),
                              "All checkpoints synced to GitHub.",
                            )
                          }
                        >
                          {busy === "sync" ? (
                            <Loader2 className="spin" size={17} />
                          ) : (
                            <RefreshCw size={17} />
                          )}
                          Sync now
                        </button>
                      </div>
                    )}
                  <HistoryList state={state} />
                </>
              )}
              {page === "setup" && (
                <Setup
                  state={state}
                  busy={busy}
                  act={act}
                  onReady={() => setPage("overview")}
                />
              )}
            </>
          )}
        </div>
      </main>
      {add && state && (
        <ManualCourse
          state={state}
          close={() => setAdd(false)}
          act={act}
          busy={!!busy}
        />
      )}
      {starting && state && (
        <StartSession
          course={starting}
          state={state}
          close={() => setStarting(undefined)}
          act={act}
          busy={!!busy}
          onStarted={() => {
            if (starting) setSelectedCourse(starting.id);
            if (page !== "studio") setPage("overview");
            setNote("");
          }}
        />
      )}
      {recovering && (
        <RecoverFolder
          course={recovering}
          busy={!!busy}
          act={act}
          close={() => setRecovering(undefined)}
          onContinue={(root) => void continueLearning(recovering.id, root)}
        />
      )}
      {preview && (
        <Modal
          title="Review your checkpoint"
          subtitle="These are the exact saved files that will go into your history."
          close={() => {
            if (busy !== "commit") setPreview(undefined);
          }}
        >
          <div className="preview-meta">
            <span>
              <ShieldCheck size={16} />
              Secret checks passed
            </span>
            <span>
              {preview.aiUsed ? (
                <>
                  <Sparkles size={15} />
                  AI-assisted message
                </>
              ) : (
                <>Default message</>
              )}
            </span>
          </div>
          {preview.aiNotice && <p className="hint">{preview.aiNotice}</p>}
          <label>
            Commit message
            <textarea
              className="commit-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
          <div className="files-heading">
            {preview.changes.length} files in this checkpoint
          </div>
          <ul className="file-list">
            {preview.changes.map((change) => (
              <li key={change.path}>
                <span className={`file-status ${change.status}`}>
                  {change.status}
                </span>
                <code>{change.path}</code>
              </li>
            ))}
          </ul>
          <details className="diff">
            <summary>Inspect the changes</summary>
            <pre>{preview.diff}</pre>
          </details>
          <p className="hint">
            New edits made after this preview stay in your coding folder. This
            checkpoint saves the version you reviewed.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setPreview(undefined)}
            >
              Keep learning
            </button>
            <button
              className="button primary"
              disabled={!!busy}
              onClick={() => act("commit", save)}
            >
              {busy === "commit" ? (
                <Loader2 className="spin" size={17} />
              ) : (
                <Check size={17} />
              )}
              Save checkpoint
            </button>
          </div>
        </Modal>
      )}
      {busy && (
        <div className="busy-indicator" role="status">
          <Loader2 className="spin" size={15} />
          {busy === "preview"
            ? "Preparing your checkpoint…"
            : busy === "commit"
              ? "Saving your checkpoint…"
              : "Working…"}
        </div>
      )}
    </div>
  );
}
function BrandMark() {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M37 24A14 14 0 1 1 24 10M24 24 38 10M29 10h9v9"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function WorkspaceChecklist({
  state,
  onSetup,
}: {
  state: Status;
  onSetup: () => void;
}) {
  const items = [
    {
      icon: Folder,
      title: "Learning archive",
      detail: "Choose where your history lives",
      done: state.settings.configured,
      label: "Required",
    },
    {
      icon: Link2,
      title: "Udemy connection",
      detail: "Bring in lessons with the extension",
      done: state.extensionConnected,
      label: "Optional",
    },
    {
      icon: Github,
      title: "GitHub backup",
      detail: "Add a private remote when you're ready",
      done: !!state.settings.remote,
      label: "Optional",
    },
  ];
  return (
    <section className="workspace-checklist" aria-label="Workspace setup">
      <div className="checklist-header">
        <span>Workspace setup</span>
        <span className="checklist-count">
          {items.filter((item) => item.done).length} / 3 connected
        </span>
      </div>
      {items.map((item) => (
        <button key={item.title} className="checklist-item" onClick={onSetup}>
          <span
            className={
              item.done ? "checklist-icon connected" : "checklist-icon"
            }
          >
            {item.done ? <Check size={17} /> : <item.icon size={17} />}
          </span>
          <span className="checklist-text">
            <strong>{item.title}</strong>
            <small>{item.detail}</small>
          </span>
          <span
            className={
              item.done ? "checklist-status connected" : "checklist-status"
            }
          >
            {item.done ? "Ready" : item.label}
          </span>
          <ChevronRight size={14} />
        </button>
      ))}
      <div className="checklist-foot">
        <ShieldCheck size={14} /> Local saving works without GitHub or AI.
      </div>
    </section>
  );
}
function Elapsed({ started }: { started: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  const minutes = Math.max(0, Math.floor((now - Date.parse(started)) / 60000));
  return (
    <>
      {minutes < 60
        ? `${minutes} min since start`
        : `${Math.floor(minutes / 60)}h ${minutes % 60}m since start`}
    </>
  );
}
function SetupPrompt({ onClick }: { onClick: () => void }) {
  return (
    <div className="empty-big">
      <Folder size={34} />
      <h2>First, give your learning a home.</h2>
      <p>Choose where your local history should live.</p>
      <button className="button primary" onClick={onClick}>
        Set up workspace <ArrowRight size={16} />
      </button>
    </div>
  );
}
function CourseCard({
  course,
  index,
  onStart,
  onMirror,
  busy,
}: {
  course: Course;
  index: number;
  onStart: () => void;
  onMirror: () => void;
  busy: boolean;
}) {
  const lesson =
    course.lessons.find((item) => item.id === course.currentLessonId) ||
    course.lessons[0];
  return (
    <article className="course-card">
      <span className="course-number">{String(index).padStart(2, "0")}</span>
      <div className="course-information">
        <div className="course-card-top">
          <span className="platform">UDEMY</span>
          <a
            href={course.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${course.title} on Udemy`}
          >
            <ArrowUpRight size={18} />
          </a>
        </div>
        <h3>{course.title}</h3>
        <p className="lesson-count">
          {course.lessons.length}{" "}
          {course.lessons.length === 1 ? "lesson" : "lessons"} discovered{" "}
          <span>·</span>{" "}
          {course.mirrored ? "Workspace ready" : "Ready to mirror"}
        </p>
      </div>
      <div className="current-lesson">
        <span>{lesson ? "CURRENT LESSON" : "COURSE DETECTED"}</span>
        <p>{lesson?.title || "Add a lesson manually to get started."}</p>
      </div>
      <div className="course-actions">
        <button
          className="button secondary"
          disabled={!lesson || busy}
          onClick={onStart}
        >
          <Play size={15} />
          Start lesson
        </button>
        <button
          className="text-button mirror-action"
          disabled={busy}
          onClick={onMirror}
          title={course.mirrored ? "Refresh course structure" : "Mirror course"}
          aria-label={
            course.mirrored ? "Refresh course structure" : "Mirror course"
          }
        >
          {course.mirrored ? <RefreshCw size={17} /> : <Folder size={17} />}
          <span>{course.mirrored ? "Refresh" : "Mirror course"}</span>
        </button>
      </div>
    </article>
  );
}
function HistoryList({ state, small }: { state: Status; small?: boolean }) {
  return state.checkpoints.length ? (
    <div className="history-list">
      {state.checkpoints.slice(0, small ? 3 : 100).map((item) => (
        <article key={item.id}>
          <div className="history-icon">
            <span>
              {new Date(item.timestamp).toLocaleString(undefined, {
                month: "short",
              })}
            </span>
            <strong>{new Date(item.timestamp).getDate()}</strong>
          </div>
          <div className="history-text">
            <strong>{item.message.split("\n")[0]}</strong>
            <p>
              {item.courseTitle} <span>·</span> {item.lessonTitle}
            </p>
            <small>
              {new Date(item.timestamp).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}{" "}
              <span>·</span> {item.files.length} files <span>·</span>{" "}
              <code>{item.sha.slice(0, 7)}</code>
            </small>
            {item.video && (
              <a
                className="text-button"
                href={`${item.video.url}?outclassTime=${item.video.seconds}`}
                target="_blank"
                rel="noreferrer"
              >
                Sync to video · {Math.floor(item.video.seconds / 60)}:
                {String(item.video.seconds % 60).padStart(2, "0")} ↗
              </a>
            )}
          </div>
          <span
            className={`save-status ${item.sync === "synced" ? "synced" : ""}`}
          >
            <Check size={14} />
            {item.sync === "synced"
              ? "Synced"
              : item.sync === "pending"
                ? "Saved · sync pending"
                : "Saved locally"}
          </span>
        </article>
      ))}
    </div>
  ) : (
    <div className="history-empty">
      <GitCommitHorizontal size={25} />
      <div>
        <strong>Your first checkpoint is ahead of you.</strong>
        <p>
          Finish a learning session to save code, notes, and a little context.
        </p>
      </div>
    </div>
  );
}
function Modal({
  title,
  subtitle,
  close,
  children,
}: {
  title: string;
  subtitle?: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const old = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],[tabindex="0"]',
        ) || [],
      ).filter((element) => element.getClientRects().length > 0);
    const initial =
      dialogRef.current?.querySelector<HTMLElement>(
        "input:not([disabled]),textarea:not([disabled]),select:not([disabled])",
      ) || focusable()[0];
    initial?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab") {
        const elements = focusable();
        const first = elements[0],
          last = elements.at(-1);
        if (!first) {
          event.preventDefault();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !dialogRef.current?.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !dialogRef.current?.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", handle);
      previousFocus?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button
          className="modal-close"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={21} />
        </button>
        <span className="dialog-eyebrow">OUTCLASS / WORKSPACE</span>
        <h2>{title}</h2>
        {subtitle && <p className="modal-subtitle">{subtitle}</p>}
        {children}
      </section>
    </div>
  );
}
type Act = (
  label: string,
  fn: () => Promise<unknown>,
  success?: string,
) => Promise<void>;
function ManualCourse({
  state,
  close,
  act,
  busy,
}: {
  state: Status;
  close: () => void;
  act: Act;
  busy: boolean;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [section, setSection] = useState("Lessons");
  const [lesson, setLesson] = useState("");
  const existing = state.courses.find((course) => {
    try {
      return (
        new URL(course.url).pathname.split("/")[2] ===
        new URL(url).pathname.split("/")[2]
      );
    } catch {
      return false;
    }
  });
  return (
    <Modal
      title="Bring in your Udemy lesson"
      subtitle="Use the lesson link from your browser. You can add more lessons as you go."
      close={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          act(
            "course",
            async () => {
              const parsed = new URL(url);
              const courseId = parsed.pathname.split("/")[2];
              const match = parsed.pathname.match(/lecture\/(\d+)/);
              const lessonId = match?.[1] || `manual-${crypto.randomUUID()}`;
              await request("observations", {
                eventId: crypto.randomUUID(),
                courseId,
                title: title || existing?.title,
                url,
                currentLessonId: lessonId,
                lessons: [{ id: lessonId, title: lesson, section, order: 0 }],
              });
              close();
            },
            "Lesson added. Choose Start lesson when you’re ready.",
          );
        }}
      >
        <label>
          Udemy lesson link
          <input
            type="url"
            required
            placeholder="https://www.udemy.com/course/…/learn/lecture/…"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
            }}
          />
        </label>
        <label>
          Course name
          <input
            required
            value={title}
            placeholder={existing?.title || "e.g. C++ Masterclass"}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <div className="form-row">
          <label>
            Section
            <input
              required
              value={section}
              onChange={(event) => setSection(event.target.value)}
            />
          </label>
          <label>
            Lesson title
            <input
              required
              value={lesson}
              placeholder="e.g. Dynamic memory"
              onChange={(event) => setLesson(event.target.value)}
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={close}>
            Cancel
          </button>
          <button className="button primary" type="submit" disabled={busy}>
            Add lesson <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
function RecoverFolder({
  course,
  busy,
  act,
  close,
  onContinue,
}: {
  course: Course;
  busy: boolean;
  act: Act;
  close: () => void;
  onContinue: (root: string) => void;
}) {
  const [root, setRoot] = useState("");
  return (
    <Modal
      title="Find your coding folder"
      subtitle={course.title}
      close={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) onContinue(root);
        }}
      >
        <p className="hint">
          Choose the current location of this course’s code. Your lesson, note,
          and last file position will stay with it.
        </p>
        <label>
          Current coding folder
          <div className="input-with-button">
            <input
              aria-label="Current coding folder"
              required
              value={root}
              onChange={(event) => setRoot(event.target.value)}
              placeholder="Full path to your existing folder"
            />
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() =>
                act("browse", async () => {
                  const result = await request<{ path: string }>("browse", {});
                  if (result.path) setRoot(result.path);
                })
              }
            >
              <Folder size={14} />
              Browse
            </button>
          </div>
        </label>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            Continue <ArrowRight size={14} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
function StartSession({
  course,
  state,
  close,
  act,
  onStarted,
  busy,
}: {
  course: Course;
  state: Status;
  close: () => void;
  act: Act;
  onStarted: () => void;
  busy: boolean;
}) {
  const [lesson, setLesson] = useState(
    course.currentLessonId || course.lessons[0]?.id || "",
  );
  const [folderMode, setFolderMode] = useState<"lesson" | "project" | "custom">(
    course.workspaceMode ||
      (state.continueItems?.some((item) => item.courseId === course.id)
        ? "lesson"
        : "project"),
  );
  const [existingProject, setExistingProject] = useState(false);
  const [workspace, setWorkspace] = useState(course.project?.root || "");
  const custom = folderMode === "custom";
  return (
    <Modal
      title="Start a learning session"
      subtitle={course.title}
      close={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          act("start", async () => {
            if (!custom)
              await request("course-project", {
                courseId: course.id,
                mode: folderMode,
                root:
                  folderMode === "project" && existingProject
                    ? workspace
                    : undefined,
              });
            await request("start", {
              courseId: course.id,
              lessonId: lesson,
              workspace: custom ? workspace : undefined,
            });
            onStarted();
            close();
          });
        }}
      >
        <label>
          Lesson
          <select
            aria-label="Lesson"
            value={lesson}
            onChange={(event) => setLesson(event.target.value)}
          >
            {course.lessons.map((item) => (
              <option key={item.id} value={item.id}>
                {item.section} / {item.title}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="workspace-options">
          <legend>Where will you code?</legend>
          <label
            className={
              folderMode === "project"
                ? "radio-option selected"
                : "radio-option"
            }
          >
            <input
              type="radio"
              name="workspace"
              checked={folderMode === "project"}
              onChange={() => setFolderMode("project")}
            />
            <div>
              <strong>One project for the whole course</strong>
              <p>Keep building the same files as you move through lessons.</p>
            </div>
            <span className="recommended">Recommended</span>
          </label>
          <label
            className={
              folderMode === "lesson" ? "radio-option selected" : "radio-option"
            }
          >
            <input
              type="radio"
              name="workspace"
              checked={folderMode === "lesson"}
              onChange={() => setFolderMode("lesson")}
            />
            <div>
              <strong>Create a lesson folder</strong>
              <p>A separate coding folder for each lesson.</p>
            </div>
          </label>
          <label className={custom ? "radio-option selected" : "radio-option"}>
            <input
              type="radio"
              name="workspace"
              checked={custom}
              onChange={() => setFolderMode("custom")}
            />
            <div>
              <strong>Use my existing coding folder</strong>
              <p>
                Copy selected work into history. Your originals stay in place.
              </p>
            </div>
          </label>
        </fieldset>
        {folderMode === "project" && (
          <>
            {course.project && (
              <p className="hint">Course project: {course.project.root}</p>
            )}
            <label className="project-folder-choice">
              <input
                type="checkbox"
                checked={existingProject}
                onChange={(event) => setExistingProject(event.target.checked)}
              />
              {course.project
                ? "Choose a different existing project folder"
                : "Use an existing folder as my course project"}
            </label>
            {!course.project && !existingProject && (
              <p className="hint">
                OutClass creates a project folder for this course beside your
                learning history.
              </p>
            )}
          </>
        )}
        {(custom || (folderMode === "project" && existingProject)) && (
          <label>
            Coding folder
            <div className="input-with-button">
              <input
                aria-label="Coding folder"
                required
                value={workspace}
                onChange={(event) => setWorkspace(event.target.value)}
                placeholder="C:\Users\you\practice\cpp"
              />
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  act("browse", async () => {
                    const result = await request<{ path: string }>(
                      "browse",
                      {},
                    );
                    if (result.path) setWorkspace(result.path);
                  })
                }
              >
                <Folder size={16} />
                Browse
              </button>
            </div>
          </label>
        )}
        <p className="hint">
          Choose a folder containing your own work. Secrets, dependencies, and
          build output are excluded.
        </p>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={close}>
            Cancel
          </button>
          <button
            type="submit"
            className="button primary"
            disabled={!!state.session || busy}
          >
            <Play size={16} />
            Start session
          </button>
        </div>
        {state.session && (
          <p className="hint">Finish the current session first.</p>
        )}
      </form>
    </Modal>
  );
}
function Setup({
  state,
  busy,
  act,
  onReady,
}: {
  state: Status;
  busy: string;
  act: Act;
  onReady: () => void;
}) {
  const [root, setRoot] = useState(state.settings.repoPath);
  const [ai, setAi] = useState(state.settings.aiEnabled);
  const [code, setCode] = useState("");
  const [remote, setRemote] = useState(state.settings.remote);
  const [repositoryName, setRepositoryName] = useState("learning");
  const [githubAccount, setGithubAccount] = useState<{
    installed: boolean;
    authenticated: boolean;
    login: string;
  }>();
  const checkGithub = async () => {
    const result = await request<{
      installed: boolean;
      authenticated: boolean;
      login: string;
    }>("github-status");
    setGithubAccount(result);
  };
  useEffect(() => {
    checkGithub().catch(() => {});
  }, []);
  useEffect(() => {
    setRemote(state.settings.remote);
  }, [state.settings.remote]);
  const githubReady = !!githubAccount?.authenticated;
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">Preferences</div>
        <h1>Workspace settings</h1>
        <p>Start locally. Connect the extras when you want them.</p>
      </div>
      <div className="setup-stack">
        <SetupDiagnostics api={request} />
        <AIAccessSettings
          api={request}
          enabled={!!state.settings.assistantEnabled}
          onRefresh={() => act("ai-refresh", async () => {})}
        />
        <DesktopKeySettings
          onSaved={() => act("key-refresh", async () => {})}
        />
        <section className="setup-card">
          <div className="setup-heading">
            <span className="setup-icon">
              <Folder size={23} />
            </span>
            <div>
              <h2>Your learning folder</h2>
              <p>
                Versioned code and notes live here. Your coding folders stay
                separate.
              </p>
            </div>
            {state.settings.configured && (
              <span className="save-status">
                <Check size={14} />
                Ready
              </span>
            )}
          </div>
          <label>
            Learning history folder
            <div className="input-with-button">
              <input
                aria-label="Learning history folder"
                value={root}
                onChange={(event) => setRoot(event.target.value)}
                disabled={state.settings.configured}
              />
              {!state.settings.configured && (
                <button
                  className="button secondary"
                  onClick={() =>
                    act("browse", async () => {
                      const result = await request<{ path: string }>(
                        "browse",
                        {},
                      );
                      if (result.path) setRoot(result.path);
                    })
                  }
                >
                  <Folder size={16} />
                  Browse
                </button>
              )}
            </div>
          </label>
          <p className="hint">
            Choose an empty folder. OutClass creates the Git history for you.
          </p>
          <label className="toggle-row">
            <div>
              <strong>
                <Sparkles size={16} />
                AI-assisted commit messages
              </strong>
              <p>
                Send a small, secret-scanned diff to your selected AI
                connection. Optional; local saving works without it.
              </p>
              <small>
                {(state.hasAI ?? state.hasApiKey)
                  ? "Your selected AI connection is ready."
                  : "Connect Included AI, a personal key or a local model above to enable this."}
              </small>
            </div>
            <input
              role="switch"
              type="checkbox"
              checked={ai}
              disabled={!(state.hasAI ?? state.hasApiKey)}
              onChange={(event) => setAi(event.target.checked)}
            />
          </label>
          <div className="setup-actions">
            <span>
              <ShieldCheck size={16} />
              {ai
                ? "GitHub stays off until connected."
                : "Fully local while GitHub is disconnected."}
            </span>
            <button
              className="button primary"
              disabled={!!busy || !state.gitAvailable}
              onClick={() =>
                act(
                  "setup",
                  async () => {
                    if (state.settings.configured)
                      await request("settings", { aiEnabled: ai });
                    else
                      await request("setup", { repoPath: root, aiEnabled: ai });
                    onReady();
                  },
                  "Your learning workspace is ready.",
                )
              }
            >
              {state.settings.configured
                ? "Save preferences"
                : "Create my workspace"}
              <ArrowRight size={16} />
            </button>
          </div>
          {!state.gitAvailable && (
            <p className="hint">
              Install Git for Windows, then restart the companion.
            </p>
          )}
        </section>
        <section className="setup-card">
          <div className="setup-heading">
            <span className="setup-icon">
              <Link2 size={23} />
            </span>
            <div>
              <h2>Connect the Chrome extension</h2>
              <p>Let your Udemy lesson find its way into your workspace.</p>
            </div>
            {state.extensionConnected && (
              <span className="save-status">
                <Check size={14} />
                Connected
              </span>
            )}
          </div>
          <ol className="setup-instructions">
            <li>
              Open{" "}
              <a
                href="chrome://extensions"
                onClick={(event) => {
                  event.preventDefault();
                  navigator.clipboard
                    .writeText("chrome://extensions")
                    .then(() =>
                      alert(
                        "Copied chrome://extensions. Paste it into your Chrome address bar.",
                      ),
                    );
                }}
              >
                chrome://extensions
              </a>{" "}
              and enable <strong>Developer mode</strong>.
            </li>
            <li>
              Choose <strong>Load unpacked</strong> and select the project’s{" "}
              <code>dist/extension</code> folder.
            </li>
            <li>
              Pin <strong>OutClass</strong>. Enter the connection code below in
              its popup.
            </li>
          </ol>
          <div className="pair-row">
            <button
              className="button secondary"
              onClick={() =>
                act("pair", async () => {
                  const result = await request<{ code: string }>(
                    "pair-code",
                    {},
                  );
                  setCode(result.code);
                })
              }
            >
              Get connection code <Link2 size={16} />
            </button>
            {code && (
              <>
                <code className="pair-code">{code}</code>
                <button
                  className="text-button"
                  aria-label="Copy connection code"
                  onClick={() => navigator.clipboard.writeText(code)}
                >
                  <Copy size={16} />
                </button>
                <span className="muted">Expires in 5 minutes</span>
              </>
            )}
            {state.extensionConnected && (
              <button
                className="text-button"
                onClick={() =>
                  act(
                    "unpair",
                    () => request("unpair", {}),
                    "Extension disconnected.",
                  )
                }
              >
                Disconnect
              </button>
            )}
          </div>
          <p className="hint">
            You can add lessons manually while the extension is disconnected.
          </p>
        </section>
        <section className="setup-card">
          <div className="setup-heading">
            <span className="setup-icon">
              <Github size={23} />
            </span>
            <div>
              <h2>One repository. Every course.</h2>
              <p>
                Back up your entire learning archive to one private GitHub
                repository.
              </p>
            </div>
            <span className="optional">OPTIONAL</span>
          </div>
          <p className="github-help">
            Courses, sections, and lessons get their own folders automatically
            inside your archive. Connect it once; future courses use the same
            repository. No repository yet? Create one below, or{" "}
            <a
              href="https://github.com/new?name=learning&visibility=private"
              target="_blank"
              rel="noreferrer"
            >
              Create a private learning repository <ArrowUpRight size={13} />
            </a>
            . Leave it empty, then connect it here.
          </p>
          {!(githubAccount?.installed ?? state.ghAvailable) ? (
            <div className="hint github-note">
              For automatic verification and sync, install{" "}
              <a
                href="https://cli.github.com/"
                target="_blank"
                rel="noreferrer"
              >
                GitHub CLI
              </a>{" "}
              then choose Check connection below. You can keep learning locally
              in the meantime.
            </div>
          ) : (
            <div className="github-login">
              <p className="hint">
                {githubReady
                  ? `Signed in as @${githubAccount!.login}. Ready to connect your archive.`
                  : "Sign in through GitHub, then choose Check connection. OutClass never asks for a GitHub token."}
              </p>
              <button
                className="button secondary"
                disabled={!!busy}
                onClick={() =>
                  act(
                    "login",
                    () => request("github-login", {}),
                    "Complete sign-in in the GitHub window, then return here.",
                  )
                }
              >
                {githubReady ? "Sign in again" : "Sign in to GitHub"}{" "}
                <ArrowUpRight size={16} />
              </button>
            </div>
          )}
          <button
            className="text-button github-check"
            disabled={!!busy}
            onClick={() =>
              act("github-check", checkGithub, "GitHub connection checked.")
            }
          >
            <RefreshCw size={14} /> Check connection
          </button>
          {githubAccount?.installed && !githubReady && (
            <p className="hint">
              Not connected yet. Finish sign-in, and make sure you’re online
              when checking.
            </p>
          )}
          <label>
            Private repository URL
            <div className="input-with-button">
              <input
                value={remote}
                onChange={(event) => setRemote(event.target.value)}
                placeholder="https://github.com/you/learning"
              />
              <button
                className="button secondary"
                disabled={
                  !!busy ||
                  !state.settings.configured ||
                  !githubReady ||
                  !remote
                }
                onClick={() =>
                  act(
                    "remote",
                    () => request("remote", { url: remote }),
                    "Private repository connected. Choose Sync now in Checkpoints to upload your archive.",
                  )
                }
              >
                Connect <ArrowRight size={16} />
              </button>
            </div>
          </label>
          {(githubAccount?.installed ?? state.ghAvailable) &&
            !state.settings.remote && (
              <div className="create-repository">
                <label>
                  Or create a new private repository
                  <div className="input-with-button">
                    <input
                      aria-label="New repository name"
                      value={repositoryName}
                      onChange={(event) =>
                        setRepositoryName(event.target.value)
                      }
                      placeholder="learning"
                    />
                    <button
                      className="button secondary"
                      disabled={
                        !!busy ||
                        !state.settings.configured ||
                        !githubReady ||
                        !repositoryName.trim()
                      }
                      onClick={() =>
                        act(
                          "create-repo",
                          () =>
                            request("create-repository", {
                              name: repositoryName,
                            }),
                          "Your private repository was created and connected.",
                        )
                      }
                    >
                      Create private repo <Plus size={16} />
                    </button>
                  </div>
                </label>
              </div>
            )}
          {state.settings.remote && (
            <p className="hint">
              Connected to{" "}
              <a
                href={state.settings.remote.replace(/\.git$/, "")}
                target="_blank"
                rel="noreferrer"
              >
                {state.settings.remote
                  .replace("https://github.com/", "")
                  .replace(/\.git$/, "")}{" "}
                <ArrowUpRight size={12} />
              </a>
              . Save a checkpoint, then choose <strong>Sync now</strong> in
              Checkpoints. Sync is manual and includes all saved courses.
            </p>
          )}
        </section>
      </div>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
