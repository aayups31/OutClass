import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { basicSetup } from "codemirror";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { cpp } from "@codemirror/lang-cpp";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import {
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Code2,
  Copy,
  FileCode2,
  Folder,
  GitCommitHorizontal,
  Loader2,
  MessageSquare,
  PanelRightClose,
  PanelLeft,
  ChevronDown,
  Sun,
  Moon,
  Maximize2,
  Minimize2,
  Settings2,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Square,
  Terminal,
  Upload,
  X,
} from "lucide-react";
import type { Course, Status, ResumeAnchor, RunContext } from "../shared";
import type { ChatMessage, Evidence } from "../server/library";
import "./studio.css";
import { ProjectConsole, TaskGuide, PracticePrompt } from "./practical";
import { Divider, useWorkspaceLayout } from "./workspace-layout";
import { IntegratedTerminal } from "./terminal";
import { ArchitectNotebook, type NotebookState } from "./notebook";
import { SessionDirection } from "./session-direction";
import type { PracticeTask } from "../server/practice";
import { LearnAssignment } from "./learn-package";

type Api = <T>(route: string, body?: unknown) => Promise<T>;
type File = {
  path: string;
  content: string;
  version: string;
  saved: string;
  cursor?: number;
};
type Library = {
  enabled: boolean;
  hasApiKey: boolean;
  sources: { id: string; title: string; kind: string; lessonId: string }[];
  chunks: number;
  embedded: number;
  messages: ChatMessage[];
  notice?: string;
  model: string;
};
function language(file: string) {
  if (/\.(?:c|h|cpp|cc|cxx|hpp|hxx)$/i.test(file)) return cpp();
  if (/\.py$/i.test(file)) return python();
  if (/\.[cm]?[jt]sx?$/i.test(file))
    return javascript({
      typescript: /\.[cm]?tsx?$/i.test(file),
      jsx: /x$/.test(file),
    });
  if (/\.html?$/i.test(file)) return html();
  if (/\.css$/i.test(file)) return css();
  if (/\.json$/i.test(file)) return json();
  if (/\.md$/i.test(file)) return markdown();
  return [];
}
function Editor({
  file,
  theme,
  onChange,
  onSave,
  onRun,
  onSelect,
  onCursor,
}: {
  file: File;
  theme: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onRun: () => void;
  onSelect: (value: string) => void;
  onCursor: (value: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    view = useRef<EditorView>(null);
  const handlers = useRef({ onChange, onSave, onRun, onSelect, onCursor });
  handlers.current = { onChange, onSave, onRun, onSelect, onCursor };
  useEffect(() => {
    const dark = theme === "dark";
    view.current = new EditorView({
      parent: container.current!,
      state: EditorState.create({
        doc: file.content,
        selection: { anchor: Math.min(file.cursor || 0, file.content.length) },
        extensions: [
          basicSetup,
          language(file.path),
          EditorView.contentAttributes.of({
            "aria-label": "Code editor",
            spellcheck: "false",
          }),
          EditorView.theme(
            {
              "&": {
                height: "100%",
                backgroundColor: "var(--paper)",
                color: "var(--ink)",
                fontSize: "13px",
              },
              ".cm-scroller": {
                overflow: "auto",
                fontFamily: '"Cascadia Code", Consolas, monospace',
                lineHeight: "1.8",
              },
              ".cm-content": { padding: "18px 0" },
              ".cm-gutters": {
                backgroundColor: "var(--paper)",
                color: "var(--muted)",
                border: "none",
                padding: "0 10px 0 4px",
                fontSize: "11px",
              },
              ".cm-activeLine, .cm-activeLineGutter": {
                backgroundColor: "var(--soft)",
              },
              ".cm-cursor": { borderLeftColor: "var(--accent)" },
              "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
                backgroundColor: "var(--active)",
              },
              ".cm-tooltip": {
                backgroundColor: "var(--surface)",
                color: "var(--ink)",
                borderColor: "var(--line)",
              },
              "&.cm-focused": { outline: "none" },
            },
            { dark },
          ),
          syntaxHighlighting(
            HighlightStyle.define([
              { tag: tags.keyword, color: dark ? "#b7a5f4" : "#7555a7" },
              { tag: tags.string, color: dark ? "#9fc9a3" : "#386e48" },
              { tag: tags.number, color: dark ? "#e5b17b" : "#9b5829" },
              { tag: tags.comment, color: dark ? "#7f899e" : "#788091" },
              {
                tag: tags.function(tags.variableName),
                color: dark ? "#9dbcf1" : "#37629e",
              },
            ]),
          ),
          keymap.of([
            {
              key: "Mod-s",
              run: () => {
                handlers.current.onSave();
                return true;
              },
            },
            {
              key: "Mod-Enter",
              run: () => {
                handlers.current.onRun();
                return true;
              },
            },
          ]),
          EditorView.updateListener.of((update) => {
            if (update.selectionSet || update.docChanged)
              handlers.current.onCursor(update.state.selection.main.head);
            if (update.docChanged)
              handlers.current.onChange(update.state.doc.toString());
            if (update.selectionSet)
              handlers.current.onSelect(
                update.state
                  .sliceDoc(
                    update.state.selection.main.from,
                    update.state.selection.main.to,
                  )
                  .slice(0, 8000),
              );
          }),
        ],
      }),
    });
    return () => {
      view.current?.destroy();
      view.current = null;
    };
  }, [file.path, theme]);
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== file.content)
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: file.content },
      });
  }, [file.content]);
  return <div className="code-editor" ref={container} />;
}
function SuggestedCode({ children }: { children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const child = React.Children.toArray(children)[0];
  const props = React.isValidElement<{ className?: string; children?: string }>(
    child,
  )
    ? child.props
    : {};
  const content = String(props.children || "").replace(/\n$/, "");
  return (
    <div className="answer-code">
      <div>
        <span>{props.className?.replace("language-", "") || "code"}</span>
        <button
          aria-label="Copy suggested code"
          onClick={() => {
            void navigator.clipboard
              .writeText(content)
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
      <pre>{content}</pre>
    </div>
  );
}
function Answer({ text }: { text: string }) {
  return (
    <div className="answer-text">
      <ReactMarkdown
        skipHtml
        components={{
          pre: SuggestedCode,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
export function Studio({
  state,
  selectedCourse,
  theme,
  onToggleTheme,
  onSelectCourse,
  api,
  onCourses,
  onSetup,
  onStart,
  onFinish,
  onRefresh,
  onDirty,
  sessionNote,
  onNoteChange,
  busy,
  onPractice,
  onPath,
  onLive,
}: {
  state: Status;
  selectedCourse?: string;
  theme: string;
  onToggleTheme: () => void;
  onSelectCourse: (id: string) => void;
  api: Api;
  onCourses: () => void;
  onSetup: () => void;
  onStart: (course: Course) => void;
  onFinish: (note: string) => Promise<void>;
  onRefresh: () => Promise<unknown>;
  onDirty: (dirty: boolean) => void;
  sessionNote: string;
  onNoteChange: (value: string) => void;
  busy: boolean;
  onPractice: () => void;
  onPath: () => void;
  onLive: () => void;
}) {
  const course =
    state.courses.find((item) => item.id === selectedCourse) ||
    state.courses.find((item) => item.id === state.session?.courseId) ||
    state.courses[0];
  const {
    layout,
    update: updateLayout,
    reset: resetLayout,
  } = useWorkspaceLayout();
  const session = state.session?.courseId === course?.id ? state.session : null;
  const [dock, setDock] = useState<"none" | "output" | "project" | "notes">(
    "none",
  );
  const focusRestore = useRef<{
    layout: typeof layout;
    dock: typeof dock;
  } | null>(null);
  const outputOpen = dock === "output" && !layout.terminalOpen;
  const focused =
    layout.hideSidebar &&
    layout.hideExplorer &&
    layout.hideAssistant &&
    !layout.terminalOpen &&
    dock === "none";
  const setOutputOpen = (open: boolean) => {
    setDock(open ? "output" : "none");
    if (open) updateLayout({ terminalOpen: false, terminalMax: false });
  };
  const toggleDock = (panel: typeof dock) => {
    setDock(dock === panel && !layout.terminalOpen ? "none" : panel);
    updateLayout({ terminalOpen: false, terminalMax: false });
  };
  const toggleFocus = () => {
    if (focused) {
      updateLayout(
        focusRestore.current?.layout || {
          hideSidebar: false,
          hideExplorer: false,
          hideAssistant: true,
        },
      );
      setDock(focusRestore.current?.dock || "none");
    } else {
      focusRestore.current = { layout, dock };
      updateLayout({
        hideSidebar: true,
        hideExplorer: true,
        hideAssistant: true,
        terminalOpen: false,
        terminalMax: false,
      });
      setMobileTab("editor");
      setDock("none");
    }
  };
  const openAssistant = (tab: typeof rightTab) => {
    setRightTab(tab);
    setMobileTab("assistant");
    updateLayout({ hideAssistant: false });
  };

  const [assignmentDirty, setAssignmentDirty] = useState(false);
  const [practiceReady, setPracticeReady] = useState(false);
  const note = session ? sessionNote : "";
  const [files, setFiles] = useState<{ path: string; size: number }[]>([]),
    [drafts, setDrafts] = useState<Record<string, File>>({}),
    [active, setActive] = useState("");
  const [error, setError] = useState(""),
    [action, setAction] = useState("");
  const [newFile, setNewFile] = useState(false),
    [fileName, setFileName] = useState("main.py");
  const [output, setOutput] = useState(""),
    [exitCode, setExitCode] = useState<number | null>(null),
    [running, setRunning] = useState(false),
    [previewUrl, setPreviewUrl] = useState("");
  const [lastRun, setLastRun] = useState<RunContext>(),
    [attachedRun, setAttachedRun] = useState(false),
    [tutorStyle, setTutorStyle] = useState<"hint" | "explain">("hint"),
    [cursor, setCursor] = useState(0);
  const [projectRunning, setProjectRunning] = useState(false);
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [taskWorking, setTaskWorking] = useState(false);
  const [sharedProjects, setSharedProjects] = useState<
      NotebookState["projects"]
    >([]),
    [sharedProject, setSharedProject] = useState("");
  const [runInput, setRunInput] = useState("");
  useEffect(() => {
    if (!running || !session) return;
    let cancelled = false;
    const timer = setInterval(() => {
      api<{ output: string }>(`workspace-run-status?sessionId=${session.id}`)
        .then((r) => {
          if (!cancelled && r.output) setOutput(r.output);
        })
        .catch(() => {});
    }, 300);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [running, session?.id]);
  const [savedNote, setSavedNote] = useState(session?.note || ""),
    [selection, setSelection] = useState("");
  const [library, setLibrary] = useState<Library>(),
    [question, setQuestion] = useState(""),
    [chatBusy, setChatBusy] = useState(false),
    [chatError, setChatError] = useState(""),
    [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"help" | "course">("help"),
    [attachCode, setAttachCode] = useState(true),
    [rightTab, setRightTab] = useState<
      "chat" | "sources" | "architect" | "lesson"
    >("chat"),
    [mobileTab, setMobileTab] = useState<"editor" | "assistant">("editor");
  useEffect(() => {
    setSharedProject("");
    void api<NotebookState>("notebook")
      .then((d) =>
        setSharedProjects(
          d.projects.filter(
            (p) =>
              p.shareWithOffCourse && p.courseIds.includes(course?.id || ""),
          ),
        ),
      )
      .catch(() => {});
  }, [course?.id, rightTab]);
  const [importing, setImporting] = useState(false),
    [sourceTitle, setSourceTitle] = useState(""),
    [sourceText, setSourceText] = useState(""),
    [sourceKind, setSourceKind] = useState("transcript"),
    [evidence, setEvidence] = useState<Evidence>();
  const upload = useRef<HTMLInputElement>(null),
    bottom = useRef<HTMLDivElement>(null);
  const file = drafts[active],
    dirty =
      Object.values(drafts).some((item) => item.content !== item.saved) ||
      (!!session && note !== savedNote);
  const runDraft = lastRun && drafts[lastRun.path];
  const runChanged =
    !!lastRun &&
    (lastRun.stale ||
      (!!runDraft &&
        (runDraft.version !== lastRun.fileVersion ||
          runDraft.content !== runDraft.saved)));
  useEffect(() => {
    if (!session || !active) return;
    const timer = setTimeout(() => {
      void api("editor-anchor", {
        sessionId: session.id,
        path: active,
        cursor,
      }).catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [session?.id, active, cursor]);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty || assignmentDirty;
  useEffect(() => {
    onDirty(dirty || assignmentDirty);
    const protect = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protect);
    return () => {
      window.removeEventListener("beforeunload", protect);
      onDirty(false);
    };
  }, [dirty, assignmentDirty]);
  useEffect(() => {
    if (!session || note === savedNote) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api("note", { note, sessionId: session.id })
        .then(() => {
          if (!cancelled) setSavedNote(note);
        })
        .catch((error) => {
          if (!cancelled) setError(error.message);
        });
    }, 750);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [session?.id, note, savedNote]);
  const safe = async (label: string, fn: () => Promise<void>) => {
    setError("");
    setAction(label);
    try {
      await fn();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Try again.");
    } finally {
      setAction("");
    }
  };
  const libraryAction = async (fn: () => Promise<void>) => {
    setChatError("");
    setChatBusy(true);
    try {
      await fn();
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : "The assistant could not connect.",
      );
    } finally {
      setChatBusy(false);
    }
  };
  const loadLibrary = async () => {
    if (course)
      setLibrary(
        await api<Library>(`library?courseId=${encodeURIComponent(course.id)}`),
      );
  };
  const loadFiles = async () => {
    if (!session) return;
    const result = await api<{ files: { path: string; size: number }[] }>(
      `workspace-files?sessionId=${session.id}`,
    );
    setFiles(result.files);
    return result.files;
  };
  const openFile = async (name: string) => {
    if (!session) return;
    setPreviewUrl("");
    setSelection("");
    if (!drafts[name]) {
      const loaded = await api<Omit<File, "saved">>(
        `workspace-file?sessionId=${session.id}&path=${encodeURIComponent(name)}`,
      );
      setDrafts((previous) => ({
        ...previous,
        [name]: { ...loaded, saved: loaded.content },
      }));
    }
    setActive(name);
    setCursor(drafts[name]?.cursor || 0);
  };
  useEffect(() => {
    let cancelled = false;
    setDrafts({});
    setFiles([]);
    setActive("");
    setOutput("");
    setLastRun(undefined);
    setAttachedRun(false);
    setPreviewUrl("");
    setSavedNote(session?.note || "");
    setError("");
    if (session)
      api<{
        files: { path: string; size: number }[];
        anchor?: ResumeAnchor;
        lastRun?: RunContext;
      }>(`workspace-files?sessionId=${session.id}`)
        .then(async (result) => {
          if (cancelled) return;
          setFiles(result.files);
          setLastRun(result.lastRun);
          setOutput(result.lastRun?.output || "");
          setDock("none");
          setExitCode(result.lastRun?.exitCode ?? null);
          const first =
            result.files.find((item) => item.path === result.anchor?.file) ||
            result.files.find((item) => !/\.md$/i.test(item.path)) ||
            result.files[0];
          if (first) {
            const loaded = await api<Omit<File, "saved">>(
              `workspace-file?sessionId=${session.id}&path=${encodeURIComponent(first.path)}`,
            );
            if (!cancelled) {
              const cursor =
                first.path === result.anchor?.file
                  ? result.anchor.cursor || 0
                  : 0;
              setDrafts({
                [first.path]: { ...loaded, saved: loaded.content, cursor },
              });
              setCursor(cursor);
              setActive(first.path);
            }
          }
        })
        .catch((error) => {
          if (!cancelled) setError(error.message);
        });
    return () => {
      cancelled = true;
    };
  }, [session?.id]);
  useEffect(() => {
    let cancelled = false;
    setLibrary(undefined);
    setChatError("");
    setNotice("");
    setEvidence(undefined);
    setQuestion("");
    if (course && state.settings.configured)
      api<Library>("library-index", { courseId: course.id, semantic: false })
        .then((result) => {
          if (!cancelled) setLibrary(result);
        })
        .catch(async (error) => {
          if (!cancelled) {
            setChatError(error.message);
            await loadLibrary();
          }
        });
    return () => {
      cancelled = true;
    };
  }, [course?.id, session?.id]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [library?.messages.length, chatBusy]);
  const saveFile = async (name = active) => {
    const current = drafts[name];
    if (!session || !current || current.content === current.saved) return;
    const result = await api<Omit<File, "saved">>("workspace-file", {
      sessionId: session.id,
      path: name,
      content: current.content,
      version: current.version,
    });
    setDrafts((previous) => ({
      ...previous,
      [name]: {
        ...previous[name],
        version: result.version,
        saved: result.content,
      },
    }));
  };
  const run = () =>
    safe("run", async () => {
      if (!session || !file || running) return;
      for (const name of Object.keys(drafts)) await saveFile(name);
      if (/\.html?$/i.test(active)) {
        const result = await api<{ url: string }>("workspace-preview", {
          sessionId: session.id,
          path: active,
        });
        setPreviewUrl(result.url);
        return;
      }
      setRunning(true);
      setOutputOpen(true);
      setOutput("Running locally…");
      setLastRun(undefined);
      setAttachedRun(false);
      setExitCode(null);
      setPreviewUrl("");
      try {
        const result = await api<{
          output: string;
          exitCode: number | null;
          run: RunContext;
        }>("workspace-run", { sessionId: session.id, path: active });
        setOutput(result.output || "Program finished without output.");
        setExitCode(result.exitCode);
        setLastRun(result.run);
        setWorkspaceRevision((v) => v + 1);
      } finally {
        setRunning(false);
      }
    });
  const finish = () =>
    safe("finish", async () => {
      for (const name of Object.keys(drafts)) await saveFile(name);
      await onFinish(note);
    });
  const importSource = () =>
    libraryAction(async () => {
      if (!course) return;
      await api("course-material", {
        courseId: course.id,
        title: sourceTitle || "Lesson transcript",
        content: sourceText,
        kind: sourceKind,
        lessonId: session?.lessonId || "",
      });
      setSourceText("");
      setSourceTitle("");
      setImporting(false);
      await loadLibrary();
      setNotice(
        "Source saved locally. Refresh the index to add semantic search.",
      );
    });
  const ask = (preset?: string, withRun = attachedRun, style = tutorStyle) =>
    libraryAction(async () => {
      const q = preset || question;
      const requestMode = preset && withRun ? "help" : mode;
      if (!course || !q.trim()) return;
      if (
        requestMode === "help" &&
        Object.values(drafts).some((d) => d.content !== d.saved)
      )
        throw new Error(
          "Test your changes first. Save and run your edited code before requesting another hint.",
        );
      if (session) {
        await api("note", { note, sessionId: session.id });
        setSavedNote(note);
      }
      await api("library-index", { courseId: course.id, semantic: false });
      const result = await api<{ messages: ChatMessage[] }>("assistant-chat", {
        courseId: course.id,
        question: q,
        mode: requestMode,
        runId: requestMode === "help" && withRun ? lastRun?.id : undefined,
        tutorStyle: style,
        projectId:
          requestMode === "help" ? sharedProject || undefined : undefined,
        selectedCode:
          requestMode === "help" && attachCode && file
            ? {
                path: active,
                content: (selection || file.content).slice(0, 16000),
              }
            : undefined,
      });
      setLibrary((previous) =>
        previous ? { ...previous, messages: result.messages } : previous,
      );
      setQuestion("");
      await onRefresh();
    });
  const guideQuestion = (q: string) => {
    setMode("help");
    setTutorStyle("hint");
    setQuestion(q);
    setAttachedRun(false);
    setRightTab("chat");
    setMobileTab("assistant");
    updateLayout({ hideAssistant: false });
  };
  const taskChanged = async (path?: string) => {
    await loadFiles();
    if (path) {
      await openFile(path);
      setOutputOpen(false);
      setAttachedRun(false);
    }
    setWorkspaceRevision((v) => v + 1);
    await onRefresh();
  };
  if (!state.settings.configured)
    return (
      <div className="studio-welcome">
        <div className="studio-emblem">
          <Code2 size={28} />
        </div>
        <h1>Your learning desk.</h1>
        <p>
          A lesson, your code, and a thoughtful assistant. Together in one local
          workspace.
        </p>
        <button className="button primary" onClick={onSetup}>
          Set up my workspace <ChevronRight size={15} />
        </button>
      </div>
    );
  if (!course)
    return (
      <div className="studio-welcome">
        <BookOpen size={28} />
        <h1>Bring your first course.</h1>
        <p>
          Open a Udemy lesson with the extension connected, or add its details
          manually.
        </p>
        <button className="button primary" onClick={onCourses}>
          Go to my courses <ChevronRight size={15} />
        </button>
      </div>
    );
  return (
    <div
      className={`studio adjustable-studio ${focused ? "editor-focused" : ""} ${layout.assistantSide === "left" ? "assistant-left" : ""} ${layout.hideAssistant ? "assistant-hidden" : ""} ${layout.hideExplorer ? "explorer-hidden" : ""} ${layout.terminalMax && layout.terminalOpen ? "terminal-focus" : ""} ${mobileTab === "assistant" ? "mobile-assistant" : "mobile-editor"}`}
      style={
        {
          "--assistant-size": `${layout.assistant}px`,
          "--explorer-size": `${layout.explorer}px`,
        } as React.CSSProperties
      }
    >
      <div className="layout-tools" aria-label="Workspace layout">
        <div className="workspace-location">
          <button
            className="workspace-course-switch"
            aria-label="Switch course"
            title={course.title}
            onClick={() =>
              updateLayout({ hideExplorer: false, explorerTab: "courses" })
            }
          >
            {course.title}
          </button>
          <ChevronRight size={12} />
          <h1
            title={[session?.section, session?.lessonTitle || course.title]
              .filter(Boolean)
              .join(" · ")}
          >
            {session?.lessonTitle || "Course workspace"}
          </h1>
          <details className="workspace-lesson-menu">
            <summary aria-label="Lesson details" title="Lesson details">
              <ChevronDown size={12} />
            </summary>
            <div>
              <strong>{course.title}</strong>
              <p>{session?.section || `${course.lessons.length} lessons`}</p>
              <a href={course.url} target="_blank" rel="noreferrer">
                Open on Udemy <ArrowUpRight size={12} />
              </a>
              <button onClick={onCourses}>Manage courses</button>
            </div>
          </details>
        </div>
        {session && (
          <button
            className="button primary studio-checkpoint"
            disabled={busy || !!action || running || projectRunning}
            onClick={
              session.contributionId
                ? () =>
                    safe("end", async () => {
                      for (const name of Object.keys(drafts))
                        await saveFile(name);
                      await api("note", { sessionId: session.id, note });
                      await api("session", { action: "discard" });
                      await onRefresh();
                      onLive();
                    })
                : finish
            }
          >
            <GitCommitHorizontal size={15} />
            {session.contributionId ? "End work session" : "Checkpoint"}
          </button>
        )}
        <button
          className="lesson-toggle"
          aria-label="Lesson"
          title={
            practiceReady
              ? "Lesson guidance · A practice opportunity is ready"
              : "Lesson guidance & practice"
          }
          aria-expanded={!layout.hideAssistant && rightTab === "lesson"}
          onClick={() => {
            if (
              !layout.hideAssistant &&
              rightTab === "lesson" &&
              mobileTab === "assistant"
            ) {
              updateLayout({ hideAssistant: true });
              setMobileTab("editor");
            } else openAssistant("lesson");
          }}
        >
          <BookOpen size={14} />
          Lesson
          {practiceReady && (
            <span
              className="dot practice-ready"
              aria-label="Practice available"
            />
          )}
        </button>
        <button
          data-wide
          className="assistant-toggle"
          aria-label={
            layout.hideAssistant || rightTab === "lesson"
              ? "Show OffCourse"
              : "Hide OffCourse"
          }
          aria-expanded={!layout.hideAssistant && rightTab !== "lesson"}
          onClick={() => {
            if (!layout.hideAssistant && rightTab !== "lesson")
              updateLayout({ hideAssistant: true });
            else openAssistant("chat");
          }}
        >
          <MessageSquare size={14} />
          OffCourse
        </button>
        <button
          data-wide
          className="layout-icon"
          onClick={toggleFocus}
          aria-label={focused ? "Exit focus mode" : "Focus editor"}
          title={focused ? "Exit focus mode" : "Focus editor"}
          aria-pressed={focused}
        >
          {focused ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
        <details className="layout-menu">
          <summary aria-label="Layout options" title="Layout options">
            <Settings2 size={15} />
          </summary>
          <div>
            <button
              aria-label={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              onClick={onToggleTheme}
            >
              {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}{" "}
              {theme === "dark" ? "Light appearance" : "Dark appearance"}
            </button>
            <button
              onClick={() =>
                updateLayout({
                  hideExplorer: !layout.hideExplorer,
                  explorerTab: "files",
                })
              }
            >
              {layout.hideExplorer ? "Open file explorer" : "Close explorer"}
            </button>
            <button
              onClick={() =>
                updateLayout({ hideExplorer: false, explorerTab: "courses" })
              }
            >
              Open course explorer
            </button>
            <button
              onClick={() =>
                updateLayout({
                  assistantSide:
                    layout.assistantSide === "right" ? "left" : "right",
                })
              }
            >
              Assistant on the{" "}
              {layout.assistantSide === "right" ? "left" : "right"}
            </button>
            <button
              onClick={() => {
                resetLayout();
                setDock("none");
                setMobileTab("editor");
              }}
            >
              Reset layout
            </button>
          </div>
        </details>
      </div>
      <div className="studio-mobile-switch">
        <button
          className={mobileTab === "editor" ? "selected" : ""}
          onClick={() => setMobileTab("editor")}
        >
          <Code2 size={14} />
          Code
        </button>
        <button
          className={mobileTab === "assistant" ? "selected" : ""}
          onClick={() => openAssistant("chat")}
        >
          <MessageSquare size={14} />
          Assistant
        </button>
      </div>
      <section className="studio-main" aria-label="Local coding workspace">
        {error && (
          <div className="studio-error" role="alert">
            {error}
            <button
              aria-label="Dismiss coding error"
              onClick={() => setError("")}
            >
              <X size={13} />
            </button>
          </div>
        )}
        {!session ? (
          <div className="studio-empty-session">
            <div className="studio-emblem">
              <Code2 size={28} />
            </div>
            <h2>Make this lesson yours.</h2>
            <p>
              Start a lesson to open its files here. You can write, run, and
              checkpoint your work without leaving OutClass.
            </p>
            <button
              className="button primary"
              disabled={!!state.session || !course.lessons.length}
              onClick={() => onStart(course)}
            >
              <Play size={14} />
              Start lesson
            </button>
            {state.session && (
              <p className="muted">
                Finish your active session before starting another course.
              </p>
            )}
            <div className="studio-lesson-list">
              {course.lessons.slice(0, 8).map((item) => (
                <div key={item.id}>
                  <BookOpen size={13} />
                  <span>{item.title}</span>
                  <small>{item.section}</small>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {newFile && (
              <form
                className="new-file"
                onSubmit={(event) => {
                  event.preventDefault();
                  safe("create", async () => {
                    const created = await api<Omit<File, "saved">>(
                      "workspace-file",
                      {
                        sessionId: session.id,
                        path: fileName,
                        content: /\.py$/i.test(fileName)
                          ? '# Your next idea starts here.\nprint("Hello, OutClass")\n'
                          : /\.js$/i.test(fileName)
                            ? '// Your next idea starts here.\nconsole.log("Hello, OutClass");\n'
                            : /\.html?$/i.test(fileName)
                              ? '<!doctype html>\n<html lang="en">\n<head><title>My lesson</title></head>\n<body><h1>Hello, OutClass</h1></body>\n</html>\n'
                              : "",
                        version: null,
                      },
                    );
                    setDrafts((previous) => ({
                      ...previous,
                      [created.path]: { ...created, saved: created.content },
                    }));
                    setActive(created.path);
                    setNewFile(false);
                    await loadFiles();
                  });
                }}
              >
                <input
                  aria-label="New file path"
                  autoFocus
                  value={fileName}
                  onChange={(event) => setFileName(event.target.value)}
                  placeholder="main.py or src/main.js"
                />
                <button type="submit" disabled={!!action}>
                  Create
                </button>
                <button
                  type="button"
                  aria-label="Cancel new file"
                  onClick={() => setNewFile(false)}
                >
                  <X size={14} />
                </button>
              </form>
            )}
            <div className="studio-code-area">
              {layout.explorerTab === "courses" ? (
                <aside
                  className="file-explorer course-explorer"
                  aria-label="Course explorer"
                >
                  <div>
                    <span>Your courses</span>
                    <button
                      aria-label="Close course explorer"
                      onClick={() => updateLayout({ hideExplorer: true })}
                    >
                      <X size={12} />
                    </button>
                  </div>
                  {state.courses.map((item) => (
                    <button
                      key={item.id}
                      title={item.title}
                      className={course.id === item.id ? "selected" : ""}
                      onClick={() => onSelectCourse(item.id)}
                    >
                      <BookOpen size={13} />
                      <span>{item.title}</span>
                    </button>
                  ))}
                  <button className="manage-course-link" onClick={onCourses}>
                    <Plus size={12} />
                    Manage courses
                  </button>
                </aside>
              ) : (
                <aside className="file-explorer" aria-label="File explorer">
                  <div>
                    <span>Files</span>
                    <button
                      aria-label="Refresh files"
                      onClick={() =>
                        safe("refresh", async () => {
                          await loadFiles();
                        })
                      }
                    >
                      <RefreshCw size={12} />
                    </button>
                  </div>
                  {files.map((item) => (
                    <button
                      key={item.path}
                      className={active === item.path ? "selected" : ""}
                      title={item.path}
                      onClick={() => safe("open", () => openFile(item.path))}
                    >
                      <FileCode2 size={12} />
                      <span>
                        {item.path.split("/").pop()}
                        {item.path.includes("/") && (
                          <small>
                            {item.path.slice(0, item.path.lastIndexOf("/"))}
                          </small>
                        )}
                      </span>
                      {drafts[item.path] &&
                        drafts[item.path].content !==
                          drafts[item.path].saved && <i />}
                    </button>
                  ))}
                  {!files.length && <p>Create a file to start building.</p>}
                </aside>
              )}

              {!layout.hideExplorer && (
                <Divider
                  className="explorer-divider"
                  label="File explorer width"
                  value={layout.explorer}
                  min={120}
                  max={320}
                  onChange={(explorer) => updateLayout({ explorer })}
                />
              )}
              <div className="editor-wrap">
                <div className="editor-tabs">
                  <div className="editor-file-tabs">
                    {Object.values(drafts).map((item) => (
                      <button
                        key={item.path}
                        className={active === item.path ? "selected" : ""}
                        onClick={() => {
                          setActive(item.path);
                          setPreviewUrl("");
                          setSelection("");
                        }}
                      >
                        <FileCode2 size={12} />
                        {item.path.split("/").pop()}
                        {item.content !== item.saved && <i />}
                      </button>
                    ))}
                  </div>
                  <div className="editor-actions">
                    <button
                      disabled={!!action || running}
                      onClick={() => setNewFile(!newFile)}
                    >
                      <Plus size={13} />
                      New file
                    </button>
                    <button
                      disabled={
                        !file ||
                        !!action ||
                        running ||
                        projectRunning ||
                        taskWorking
                      }
                      onClick={() =>
                        safe("save", async () => {
                          await saveFile();
                          await loadFiles();
                        })
                      }
                      title="Ctrl / Cmd + S"
                    >
                      <Save size={13} />
                      {file && file.content !== file.saved
                        ? "Save changes"
                        : "Saved"}
                    </button>
                    <button
                      className="run-button"
                      disabled={
                        !file ||
                        !!action ||
                        running ||
                        projectRunning ||
                        taskWorking
                      }
                      onClick={run}
                    >
                      <Play size={13} />
                      {/\.html?$/i.test(active) ? "Preview" : "Run"}
                    </button>
                  </div>
                  {file && (
                    <button
                      className="reload-file"
                      title="Reload from disk"
                      aria-label="Reload current file from disk"
                      onClick={() =>
                        safe("reload", async () => {
                          if (
                            file.content !== file.saved &&
                            !confirm(
                              "Reload and discard this file’s unsaved changes?",
                            )
                          )
                            return;
                          const loaded = await api<Omit<File, "saved">>(
                            `workspace-file?sessionId=${session.id}&path=${encodeURIComponent(active)}`,
                          );
                          setDrafts((previous) => ({
                            ...previous,
                            [active]: { ...loaded, saved: loaded.content },
                          }));
                        })
                      }
                    >
                      <RefreshCw size={12} />
                    </button>
                  )}
                </div>
                {previewUrl ? (
                  <iframe
                    className="html-preview"
                    title="Local HTML preview"
                    sandbox="allow-scripts"
                    src={previewUrl}
                  />
                ) : file ? (
                  <Editor
                    file={file}
                    theme={theme}
                    onChange={(content) =>
                      setDrafts((previous) => ({
                        ...previous,
                        [active]: { ...previous[active], content },
                      }))
                    }
                    onSave={() => {
                      if (!action) void safe("save", () => saveFile());
                    }}
                    onRun={() => {
                      if (!action && !running) void run();
                    }}
                    onSelect={setSelection}
                    onCursor={(value) => {
                      setCursor(value);
                      setDrafts((previous) => ({
                        ...previous,
                        [active]: { ...previous[active], cursor: value },
                      }));
                    }}
                  />
                ) : (
                  <div className="editor-blank">
                    <FileCode2 size={27} />
                    <span>Select a file, or create your first one.</span>
                    <button onClick={() => setNewFile(true)}>
                      Create a file <Plus size={13} />
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="studio-dock-tabs" aria-label="Workspace tools">
              <button
                aria-label="Output"
                aria-expanded={outputOpen}
                aria-controls="studio-output"
                className={outputOpen ? "selected" : ""}
                onClick={() => toggleDock("output")}
              >
                <Terminal size={13} />
                Output
                {running ? (
                  <span className="dot" />
                ) : exitCode !== null ? (
                  <small className={exitCode === 0 ? "success" : "failure"}>
                    {exitCode === 0 ? "✓" : `Exit ${exitCode}`}
                  </small>
                ) : null}
              </button>
              <button
                aria-expanded={layout.terminalOpen}
                className={layout.terminalOpen ? "selected" : ""}
                onClick={() => {
                  setDock("none");
                  updateLayout({
                    terminalOpen: !layout.terminalOpen,
                    terminalMax: false,
                  });
                }}
              >
                <Code2 size={13} />
                Terminal
              </button>
              <button
                aria-label="Project"
                aria-expanded={dock === "project" && !layout.terminalOpen}
                aria-controls="studio-project"
                className={
                  dock === "project" && !layout.terminalOpen ? "selected" : ""
                }
                onClick={() => toggleDock("project")}
              >
                <Folder size={13} />
                Project
                {projectRunning && (
                  <Loader2
                    size={12}
                    className="spin"
                    aria-label="Project running"
                  />
                )}
              </button>
              <button
                aria-label="Notes"
                aria-expanded={dock === "notes" && !layout.terminalOpen}
                aria-controls="studio-notes"
                className={
                  dock === "notes" && !layout.terminalOpen ? "selected" : ""
                }
                onClick={() => toggleDock("notes")}
              >
                <BookOpen size={13} />
                Notes{note !== savedNote ? " ·" : ""}
              </button>
              {(dock !== "none" || layout.terminalOpen) && (
                <button
                  className="dock-close"
                  aria-label="Close bottom panel"
                  onClick={() => {
                    setDock("none");
                    updateLayout({ terminalOpen: false, terminalMax: false });
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div
              className="studio-bottom"
              hidden={dock === "none" || layout.terminalOpen}
              style={{ height: layout.panel }}
            >
              <Divider
                label="Bottom panel height"
                axis="y"
                reverse
                value={layout.panel}
                min={140}
                max={480}
                onChange={(panel) => updateLayout({ panel })}
              />
              <div
                id="studio-project"
                className="dock-project"
                hidden={dock !== "project"}
              >
                <ProjectConsole
                  embedded
                  api={api}
                  sessionId={session.id}
                  onRunning={setProjectRunning}
                  onFilesChanged={loadFiles}
                  beforeCommand={async () => {
                    for (const name of Object.keys(drafts))
                      await saveFile(name);
                  }}
                  onAsk={guideQuestion}
                />
              </div>
              <details
                id="studio-notes"
                className="studio-notes"
                open
                hidden={dock !== "notes"}
              >
                <summary>
                  <BookOpen size={13} />
                  Session notes{" "}
                  <span>
                    {note !== savedNote
                      ? "Saving…"
                      : note
                        ? "Note saved"
                        : "What clicked today?"}
                  </span>
                </summary>
                <textarea
                  aria-label="Studio session notes"
                  value={note}
                  maxLength={12000}
                  onChange={(event) => onNoteChange(event.target.value)}
                  placeholder="An idea worth keeping, a question for later…"
                />
              </details>
              <div
                id="studio-output"
                className="dock-output"
                hidden={!outputOpen}
              >
                <div className="output-header">
                  <span>
                    <Terminal size={13} />
                    <button
                      aria-label={
                        outputOpen
                          ? "Collapse program output"
                          : "Expand program output"
                      }
                      onClick={() => setOutputOpen(!outputOpen)}
                    >
                      Output{" "}
                      <ChevronRight
                        size={11}
                        style={{
                          transform: outputOpen ? "rotate(90deg)" : undefined,
                        }}
                      />
                    </button>
                    {exitCode !== null && (
                      <small className={exitCode === 0 ? "success" : "failure"}>
                        Exit {exitCode}
                      </small>
                    )}
                  </span>
                  {running ? (
                    <button
                      onClick={() =>
                        safe("stop", async () => {
                          await api("workspace-stop", {
                            sessionId: session.id,
                          });
                        })
                      }
                    >
                      <Square size={12} />
                      Stop
                    </button>
                  ) : lastRun && exitCode !== 0 ? (
                    <div className="run-help-actions">
                      <button
                        disabled={chatBusy}
                        onClick={() => {
                          setMode("help");
                          openAssistant("chat");
                          setAttachedRun(true);
                          setTutorStyle("hint");
                          if (library?.enabled)
                            void ask(
                              "Give me one hint to understand this run’s failure, without solving it for me.",
                              true,
                              "hint",
                            );
                          else
                            setQuestion(
                              "Give me one hint to understand this run’s failure.",
                            );
                        }}
                      >
                        Give me a hint
                      </button>
                      <button
                        disabled={chatBusy}
                        onClick={() => {
                          setMode("help");
                          openAssistant("chat");
                          setAttachedRun(true);
                          setTutorStyle("explain");
                          if (library?.enabled)
                            void ask(
                              "Explain the error in this run and suggest a small next step.",
                              true,
                              "explain",
                            );
                          else
                            setQuestion(
                              "Explain the error in this run and suggest a small next step.",
                            );
                        }}
                      >
                        Explain this error <MessageSquare size={12} />
                      </button>
                    </div>
                  ) : (
                    <small>Local runtime · 10s limit</small>
                  )}
                </div>
                {outputOpen && lastRun && (
                  <div className="run-evidence-note">
                    {lastRun.path} ·{" "}
                    {new Date(lastRun.finishedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {runChanged
                      ? " · Code changed — save and rerun"
                      : " · Saved entry file"}
                    {lastRun.stopped ? " · Stopped" : ""}
                    {lastRun.timedOut ? " · Timed out" : ""}
                    {lastRun.outputTruncated
                      ? " · Stored output shortened"
                      : ""}
                  </div>
                )}
                {outputOpen && (
                  <>
                    <pre className="program-output" aria-label="Program output">
                      {output ||
                        "Run a JavaScript, TypeScript, Python, C or C++ file. Start React/Next.js apps from Project console."}
                    </pre>
                    <div className="runner-note">
                      {lastRun?.regression && (
                        <div role="alert">
                          <strong>Regression Alert</strong>
                          <p>
                            This file passed in an earlier lesson and now fails.
                            Review the changed files and earlier checkpoint; a
                            failed run does not prove the cause.
                          </p>
                          <small>
                            {lastRun.regression.changedFiles.join(", ")}
                          </small>
                        </div>
                      )}
                      {running && (
                        <form
                          className="run-line-input"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void safe("input", async () => {
                              await api("workspace-input", {
                                sessionId: session.id,
                                text: runInput,
                              });
                              setRunInput("");
                            });
                          }}
                        >
                          <label htmlFor="run-line">
                            Program input · one line · 10s run limit
                          </label>
                          <input
                            id="run-line"
                            value={runInput}
                            maxLength={4000}
                            onChange={(e) => setRunInput(e.target.value)}
                            autoComplete="off"
                          />
                          <button type="submit">Send line</button>
                        </form>
                      )}
                      <ShieldCheck size={11} />
                      Runs saved code with your computer’s permissions. Your API
                      key is excluded from the runner environment.
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
        {session && <IntegratedTerminal sessionId={session.id} theme={theme} />}
      </section>
      <Divider
        className="assistant-divider"
        label="OffCourse panel width"
        reverse={layout.assistantSide === "right"}
        value={layout.assistant}
        min={280}
        max={650}
        onChange={(assistant) => updateLayout({ assistant })}
      />
      <aside className="studio-assistant" aria-label="Course assistant">
        <div className="assistant-header">
          <div className="assistant-mark">
            <MessageSquare size={15} />
          </div>
          <strong>
            {rightTab === "architect"
              ? "The Architect"
              : rightTab === "lesson"
                ? "Your lesson"
                : "OffCourse"}
          </strong>
          <span className="assistant-tag">Course aware</span>
          <button
            className="assistant-mobile-close"
            aria-label="Close assistant panel"
            title="Close assistant panel"
            onClick={() => {
              setMobileTab("editor");
              updateLayout({ hideAssistant: true });
            }}
          >
            <PanelRightClose size={15} />
          </button>
        </div>
        <div className="assistant-tabs">
          <button
            className={rightTab === "lesson" ? "selected" : ""}
            onClick={() => setRightTab("lesson")}
          >
            Lesson
          </button>
          <button
            className={rightTab === "architect" ? "selected" : ""}
            onClick={() => setRightTab("architect")}
          >
            Architect
          </button>
          <button
            className={rightTab === "chat" ? "selected" : ""}
            onClick={() => setRightTab("chat")}
          >
            Conversation
          </button>
          <button
            className={rightTab === "sources" ? "selected" : ""}
            onClick={() => {
              setRightTab("sources");
              void loadLibrary().catch((error) => setChatError(error.message));
            }}
          >
            Sources{" "}
            <span>
              {library?.sources.filter(
                (item) =>
                  item.kind === "material" || item.kind === "transcript",
              ).length || 0}
            </span>
          </button>
          <button
            className="new-conversation"
            aria-label="Start a new conversation"
            disabled={chatBusy}
            onClick={() =>
              libraryAction(async () => {
                await api("assistant-clear", { courseId: course.id });
                await loadLibrary();
              })
            }
          >
            <Plus size={14} />
          </button>
        </div>
        {chatError && (
          <div className="assistant-alert" role="alert">
            {chatError}
          </div>
        )}
        {notice && (
          <div className="assistant-notice" role="status">
            {notice}
          </div>
        )}
        <div className="lesson-panel" hidden={rightTab !== "lesson"}>
          <div className="lesson-panel-heading">
            <BookOpen size={17} />
            <h2>{session?.lessonTitle || course.title}</h2>
          </div>
          <p className="lesson-panel-section">
            {session?.section || `${course.lessons.length} lessons`}
          </p>
          {session ? (
            <>
              <LearnAssignment
                api={api}
                onDirty={setAssignmentDirty}
                courseId={course.id}
                lessonId={session.lessonId}
              />
              {session.contributionId ? (
                <div className="contribution-context">
                  Contribution workspace · you write the change; the teacher
                  guides your reasoning.
                  <button onClick={onLive}>Plan & review</button>
                </div>
              ) : (
                <>
                  <SessionDirection
                    api={api}
                    courseId={course.id}
                    changed={workspaceRevision}
                    onOpen={onPath}
                  />
                  <PracticePrompt
                    onOpportunity={setPracticeReady}
                    api={api}
                    courseId={course.id}
                    changed={`${lastRun?.id}:${workspaceRevision}`}
                    quietAfterTask
                    onOpen={onPractice}
                    onLive={onLive}
                    onStart={async (exerciseId) => {
                      for (const name of Object.keys(drafts))
                        await saveFile(name);
                      const task = await api<PracticeTask>("practice-start", {
                        courseId: course.id,
                        exerciseId,
                      });
                      await taskChanged(task.path);
                    }}
                  />
                  <TaskGuide
                    api={api}
                    sessionId={session.id}
                    courseId={course.id}
                    workspace={session.workspace}
                    changed={workspaceRevision}
                    onWorking={setTaskWorking}
                    blocked={running || projectRunning}
                    onChanged={taskChanged}
                    onOpenFile={(path) => {
                      setMobileTab("editor");
                      void safe("open", () => openFile(path));
                    }}
                    onPath={onPath}
                    beforeCheck={async () => {
                      for (const name of Object.keys(drafts))
                        await saveFile(name);
                    }}
                    onAsk={guideQuestion}
                  />
                </>
              )}
            </>
          ) : (
            <p>Start a lesson to see its practice and project guidance here.</p>
          )}
        </div>
        {rightTab === "lesson" ? null : rightTab === "architect" ? (
          <ArchitectNotebook
            api={api}
            courses={state.courses}
            courseId={course.id}
            compact
          />
        ) : rightTab === "sources" ? (
          <div className="sources-panel">
            <div className="sources-heading">
              <h2>Grounded in your course.</h2>
              <p>
                Add lecture transcripts, resources, and your own notes. Sources
                stay on your machine; enabled AI sends relevant excerpts to your
                selected connection when you request help.
              </p>
            </div>
            <div className="source-actions">
              <button onClick={() => setImporting(!importing)}>
                <Plus size={13} />
                Add material
              </button>
              <button onClick={() => upload.current?.click()}>
                <Upload size={13} />
                Import file
              </button>
              <input
                hidden
                type="file"
                ref={upload}
                accept=".txt,.md,.srt,.vtt"
                onChange={async (event) => {
                  const selected = event.target.files?.[0];
                  if (!selected) return;
                  if (selected.size > 960000) {
                    setChatError(
                      "Choose a text file up to 240,000 characters.",
                    );
                    return;
                  }
                  const text = await selected.text();
                  setSourceText(text);
                  setSourceTitle(selected.name);
                  setSourceKind(
                    /\.(srt|vtt)$/i.test(selected.name)
                      ? "transcript"
                      : "material",
                  );
                  setImporting(true);
                  event.target.value = "";
                }}
              />
            </div>
            {importing && (
              <form
                className="source-import"
                onSubmit={(event) => {
                  event.preventDefault();
                  importSource();
                }}
              >
                <input
                  aria-label="Source title"
                  value={sourceTitle}
                  onChange={(event) => setSourceTitle(event.target.value)}
                  placeholder="Lecture 7 · Agent tools"
                />
                <select
                  aria-label="Source type"
                  value={sourceKind}
                  onChange={(event) => setSourceKind(event.target.value)}
                >
                  <option value="transcript">Lecture transcript</option>
                  <option value="material">Course resource / notes</option>
                </select>
                <textarea
                  aria-label="Course source text"
                  maxLength={240000}
                  value={sourceText}
                  onChange={(event) => setSourceText(event.target.value)}
                  placeholder="Paste the transcript or resource text you want to learn from…"
                />
                <button
                  className="button primary"
                  disabled={chatBusy || !sourceText.trim()}
                  type="submit"
                >
                  Save source locally <Check size={13} />
                </button>
              </form>
            )}
            <div className="source-index">
              <div>
                <span>
                  <Search size={13} />
                  {library?.chunks || 0} searchable passages
                </span>
                <small>{library?.embedded || 0} semantic vectors</small>
              </div>
              <button
                disabled={chatBusy}
                onClick={() =>
                  libraryAction(async () => {
                    const result = await api<Library>("library-index", {
                      courseId: course.id,
                    });
                    setLibrary(result);
                    setNotice(result.notice || "Index refreshed.");
                  })
                }
              >
                <RefreshCw size={13} />
                {chatBusy ? "Indexing…" : "Refresh index"}
              </button>
            </div>
            <p className="source-help">
              In Udemy, open the Transcript panel. In the extension choose{" "}
              <strong>Import visible transcript</strong>. Only the text exposed
              in that panel is imported. You can also paste or import TXT, MD,
              SRT, or VTT here.
            </p>
            <div className="source-list">
              {library?.sources.map((source) => (
                <div key={source.id}>
                  <BookOpen size={13} />
                  <div>
                    <strong>{source.title}</strong>
                    <small>
                      {source.kind === "transcript"
                        ? "Lecture transcript"
                        : source.kind === "material"
                          ? "Course material"
                          : "Local learning context"}
                    </small>
                  </div>
                  {["transcript", "material"].includes(source.kind) && (
                    <button
                      aria-label={`Remove ${source.title}`}
                      disabled={chatBusy}
                      onClick={() =>
                        libraryAction(async () => {
                          const result = await api<Library>("library-remove", {
                            courseId: course.id,
                            documentId: source.id,
                          });
                          setLibrary(result);
                        })
                      }
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              className="assistant-disable"
              disabled={!library?.enabled || chatBusy}
              onClick={() =>
                libraryAction(async () => {
                  await api("assistant-enable", { enabled: false });
                  await loadLibrary();
                  await onRefresh();
                })
              }
            >
              Turn off AI assistance
            </button>
          </div>
        ) : (
          <>
            <div className="chat-messages" aria-live="polite">
              {!library?.messages.length && (
                <div className="chat-intro">
                  <div className="chat-orbit">
                    <MessageSquare size={23} />
                  </div>
                  <h2>Where are you stuck?</h2>
                  <p>Get a hint for your code or ask about this lesson.</p>
                  <div className="chat-context">
                    <BookOpen size={12} />
                    <span>{course.title}</span>
                  </div>
                  {library?.enabled ? (
                    <div className="chat-prompts">
                      <button
                        disabled={chatBusy}
                        onClick={() =>
                          ask(
                            "Explain the code I’m working on, and suggest one small next step.",
                          )
                        }
                      >
                        Help me understand my code <ChevronRight size={12} />
                      </button>
                      <button
                        onClick={() => {
                          setRightTab("sources");
                          setImporting(true);
                        }}
                      >
                        Add course material <Plus size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="assistant-enable">
                      <p>
                        OffCourse uses your question, selected code and relevant
                        passages through the AI connection you choose in
                        Settings. Files and the course index stay local.
                      </p>
                      <button
                        className="button primary"
                        disabled={chatBusy || !(state.hasAI ?? state.hasApiKey)}
                        onClick={() =>
                          libraryAction(async () => {
                            await api("assistant-enable", { enabled: true });
                            await loadLibrary();
                            await onRefresh();
                          })
                        }
                      >
                        Enable learning assistant <ArrowUpRight size={13} />
                      </button>
                      {!(state.hasAI ?? state.hasApiKey) && (
                        <small>
                          Choose included AI, a personal key or a local model in
                          Settings first.
                        </small>
                      )}
                    </div>
                  )}
                </div>
              )}
              {library?.messages.map((message) => (
                <article
                  key={message.id}
                  className={`chat-message ${message.role}`}
                >
                  <div className="message-label">
                    {message.role === "user" ? "You" : "OffCourse"}
                    {message.role === "assistant" && (
                      <small>
                        {message.mode === "grounded"
                          ? "With sources"
                          : message.mode === "general"
                            ? "General guidance"
                            : message.mode === "retrieval"
                              ? "Local retrieval"
                              : "Course context needed"}
                      </small>
                    )}
                  </div>
                  <Answer text={message.text} />
                  {message.recovery && (
                    <div className="assistant-recovery">
                      {message.recovery === "ai-settings" ? (
                        <button onClick={onSetup}>
                          Review AI connection <ArrowUpRight size={12} />
                        </button>
                      ) : (
                        <button
                          disabled={chatBusy}
                          onClick={() => {
                            const index = library.messages.findIndex(
                              (m) => m.id === message.id,
                            );
                            const previous = library.messages[index - 1];
                            if (previous?.role === "user") {
                              guideQuestion(previous.text);
                            }
                          }}
                        >
                          Try this question again <RefreshCw size={12} />
                        </button>
                      )}
                    </div>
                  )}
                  {!!message.sources?.length && (
                    <div className="answer-sources">
                      {message.sources.map((source, i) => (
                        <button
                          key={source.id}
                          onClick={() => setEvidence(source)}
                        >
                          <span>{source.number || i + 1}</span>
                          {source.title}
                          <ArrowUpRight size={11} />
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              ))}
              {chatBusy && (
                <div className="assistant-thinking">
                  <span />
                  <span />
                  <span />
                  Finding a useful next step…
                </div>
              )}
              <div ref={bottom} />
            </div>
            <form
              className="chat-composer"
              onSubmit={(event) => {
                event.preventDefault();
                if (!chatBusy && !taskWorking && library?.enabled) ask();
              }}
            >
              {!library?.enabled && !!library?.messages.length && (
                <div className="assistant-enable">
                  <p>
                    AI is off. Enabling it sends questions, selected code, and
                    retrieved excerpts to your selected AI connection.
                  </p>
                  <button
                    type="button"
                    className="button primary"
                    disabled={chatBusy || !(state.hasAI ?? state.hasApiKey)}
                    onClick={() =>
                      libraryAction(async () => {
                        await api("assistant-enable", { enabled: true });
                        await loadLibrary();
                        await onRefresh();
                      })
                    }
                  >
                    Enable learning assistant <ArrowUpRight size={13} />
                  </button>
                </div>
              )}
              <div className="chat-mode">
                <button
                  type="button"
                  className={mode === "help" ? "selected" : ""}
                  onClick={() => setMode("help")}
                >
                  <Code2 size={12} />
                  Code help
                </button>
                <button
                  type="button"
                  className={mode === "course" ? "selected" : ""}
                  onClick={() => setMode("course")}
                >
                  <BookOpen size={12} />
                  Ask the course
                </button>
              </div>
              {mode === "help" && (
                <details className="tutor-controls">
                  <summary>
                    Hint style & context{attachedRun ? " · Run attached" : ""}
                  </summary>
                  <label>
                    Help style{" "}
                    <select
                      aria-label="Help style"
                      value={tutorStyle}
                      onChange={(event) =>
                        setTutorStyle(event.target.value as "hint" | "explain")
                      }
                    >
                      <option value="hint">Hint first</option>
                      <option value="explain">Explain with an example</option>
                    </select>
                  </label>
                  <small className="teacher-context-note">
                    Code help includes an active task's brief, checks and
                    reflection, or the selected issue, contributor sources and
                    recorded commands. You write the implementation.
                  </small>
                  {lastRun && (
                    <label>
                      <input
                        type="checkbox"
                        checked={attachedRun}
                        onChange={(event) =>
                          setAttachedRun(event.target.checked)
                        }
                      />
                      Attach recorded run · {lastRun.path}
                    </label>
                  )}
                  {attachedRun && lastRun && (
                    <small>
                      {runChanged
                        ? "Code changed since this run. Save and rerun for current evidence."
                        : `Saved entry file · exit ${lastRun.exitCode ?? "stopped"}`}{" "}
                      · Output and saved source are sent with your question.
                    </small>
                  )}
                </details>
              )}
              <textarea
                aria-label="Ask learning assistant"
                placeholder={
                  mode === "course"
                    ? "What does this course say about…"
                    : "Ask about your code or the lesson…"
                }
                value={question}
                maxLength={4000}
                disabled={!library?.enabled}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !chatBusy &&
                    !taskWorking &&
                    library?.enabled
                  ) {
                    event.preventDefault();
                    ask();
                  }
                }}
              />
              <div className="composer-footer">
                {mode === "help" && !!sharedProjects.length && (
                  <select
                    aria-label="Attach Architect project"
                    value={sharedProject}
                    onChange={(e) => setSharedProject(e.target.value)}
                  >
                    <option value="">No notebook attached</option>
                    {sharedProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                )}
                {mode === "help" && file ? (
                  <label>
                    <input
                      type="checkbox"
                      checked={attachCode}
                      onChange={(event) => setAttachCode(event.target.checked)}
                    />
                    {selection ? "Selected code" : active.split("/").pop()}
                  </label>
                ) : (
                  <span>Course materials only</span>
                )}
                <button
                  type="submit"
                  aria-label="Send question"
                  disabled={
                    !library?.enabled ||
                    chatBusy ||
                    taskWorking ||
                    running ||
                    projectRunning ||
                    !question.trim()
                  }
                >
                  {chatBusy ? (
                    <Loader2 className="spin" size={16} />
                  ) : (
                    <ArrowUp size={16} />
                  )}
                </button>
              </div>
              <small className="assistant-footnote">
                {library?.enabled
                  ? "OffCourse · Check sources and test your own changes."
                  : "Enable the assistant to start a conversation."}
              </small>
            </form>
          </>
        )}
        {evidence && (
          <div className="evidence-view">
            <div>
              <strong>Source {evidence.number}</strong>
              <button
                aria-label="Close source passage"
                onClick={() => setEvidence(undefined)}
              >
                <X size={14} />
              </button>
            </div>
            <h3>{evidence.title}</h3>
            <span>
              Lines {evidence.startLine}–{evidence.endLine}
            </span>
            <pre>{evidence.text}</pre>
            <small>
              Retrieved from the local course index at the time of this answer.
            </small>
          </div>
        )}
      </aside>
    </div>
  );
}
