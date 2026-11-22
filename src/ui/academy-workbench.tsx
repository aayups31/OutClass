import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Download,
  FileUp,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type {
  AcademyDraft,
  ExpansionState,
  Revision,
} from "../expansion-contract";
import type { AcademyAudit, AcademyFinding } from "../academy-design-contract";
import { arrangeLessons } from "../academy-design";
import {
  COURSE_CHAR_LIMIT,
  COURSE_LESSON_LIMIT,
  COURSE_SOURCE_LIMIT,
} from "../course-limits";
import { defaultLearnPackage, LearnPackageEditor } from "./learn-package";
import { AcademyResourceList } from "./academy-resources";
import {
  ACADEMY_RESOURCE_MAX_BYTES,
  type AcademyResource,
} from "../academy-resource-contract";
import { starterPath } from "../learn-package-contract";
import { AgentPanel, CompilerPanel } from "./product-intelligence";
import { HostedAcademyPanel } from "./academy-hosted";
import { HandoffInbox } from "./agent-handoffs";
import "./academy-workbench.css";
import { AcademyDialog } from "./academy-dialog";
import { academyExample } from "../academy-example";
import { AcademyReferences } from "./academy-references";
type API = <T>(route: string, body?: unknown) => Promise<T>;
type Tab = "overview" | "lessons" | "project" | "review" | "releases";
type Recovery = { course: AcademyDraft; id?: string; revision?: number };
const recoveryKey = "outclass:academy:unsaved";
function loadRecovery(): Recovery | undefined {
  try {
    const copy = JSON.parse(localStorage.getItem(recoveryKey) || "null");
    if (copy?.course && Array.isArray(copy.course.lessons)) return copy;
  } catch {
    // The course editor can still save and export when browser storage fails.
  }
}
const empty = (): AcademyDraft => ({
  title: "",
  audience: "",
  outcome: "",
  rightsConfirmed: false,
  lessons: [],
});
const values = (c: AcademyDraft): AcademyDraft => ({
  title: c.title,
  audience: c.audience,
  outcome: c.outcome,
  rightsConfirmed: c.rightsConfirmed,
  lessons: c.lessons,
  ...(c.learningProject ? { learningProject: c.learningProject } : {}),
});
const newLesson = () => ({
  title: "",
  objective: "",
  practice: "",
  content: "",
});
const download = (name: string, value: unknown) => {
  const url = URL.createObjectURL(
    new Blob(
      [typeof value === "string" ? value : JSON.stringify(value, null, 2)],
      {
        type: typeof value === "string" ? "text/markdown" : "application/json",
      },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const outlineTemplate = `# Practical activity reports
Audience: Python learners who can write a loop
Outcome: Build a useful weekly report for a club organizer

## Group records
Objective: Produce one total per person
Practice: Combine repeated people and test an empty input
Records contain a person and minutes. A dictionary can retain a running total for each person.

## Investigate edge cases
Objective: Explain and handle an empty week
Practice: Change the input, predict the result and test your prediction
An empty collection should produce a useful empty result. Keep the behavior explicit.
`;
export function AcademyWorkbench({
  api,
  onCode,
  onDirty,
}: {
  api: API;
  onCode: (id: string) => void;
  onDirty: (v: boolean) => void;
}) {
  const [data, setData] = useState<ExpansionState>();
  const [recovery, setRecovery] = useState(loadRecovery);
  const [course, setCourse] = useState<AcademyDraft>(empty),
    [selected, setSelected] = useState<Revision<AcademyDraft>>();
  const [tab, setTab] = useState<Tab>("overview"),
    [lessonIndex, setLessonIndex] = useState(0),
    [lessonTab, setLessonTab] = useState<"material" | "resources" | "practice">(
      "material",
    );
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [showAgent, setShowAgent] = useState(false),
    [audit, setAudit] = useState<AcademyAudit>(),
    [ack, setAck] = useState<string[]>([]);
  const [forgeRequest, setForgeRequest] = useState<{
    kind: "exercise" | "capstone";
  }>();
  const [imported, setImported] = useState<{
    course: AcademyDraft;
    warnings: string[];
  }>();
  const [material, setMaterial] = useState<{
    text: string;
    name: string;
    index: number;
    epoch: number;
  }>();
  const [previewLesson, setPreviewLesson] = useState<Record<string, number>>(
    {},
  );
  const importInput = useRef<HTMLInputElement>(null),
    materialInput = useRef<HTMLInputElement>(null);
  const epoch = useRef(0),
    mounted = useRef(true),
    unsaved = useRef(false),
    locked = useRef(false),
    activeCourse = useRef<string | undefined>(undefined);
  activeCourse.current = selected?.id;
  unsaved.current = dirty;
  locked.current = busy;
  useEffect(() => {
    mounted.current = true;
    void api<ExpansionState>("expansion/state")
      .then((d) => {
        if (mounted.current) setData(d);
      })
      .catch((e) => {
        if (mounted.current) setError(e.message);
      });
    return () => {
      mounted.current = false;
      onDirty(false);
    };
  }, [api, onDirty]);
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  useEffect(() => {
    if (!dirty || recovery) return;
    try {
      localStorage.setItem(
        recoveryKey,
        JSON.stringify({
          course,
          id: selected?.id,
          revision: selected?.revision,
        }),
      );
    } catch {
      // The explicit JSON export is available if local storage is unavailable.
    }
  }, [course, dirty, recovery, selected?.id, selected?.revision]);
  useEffect(() => {
    let live = true;
    setAudit(undefined);
    setAck([]);
    if (selected && !dirty)
      void api<AcademyAudit>(`academy/courses/${selected.id}/audit`)
        .then((r) => {
          if (live) {
            setAudit(r);
            setAck(r.review?.acknowledged || []);
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [api, selected?.id, selected?.revision, dirty]);
  function change(next: AcademyDraft) {
    epoch.current++;
    setCourse(next);
    setDirty(true);
    setNotice("");
    setAudit(undefined);
    setAck([]);
  }
  function canSwitch() {
    return (
      !locked.current &&
      (!unsaved.current ||
        confirm(
          "Discard your unsaved course changes? You can export a copy before switching.",
        ))
    );
  }
  function choose(id: string) {
    if (!canSwitch()) return;
    if (dirty && !recovery) clearRecovery();
    epoch.current++;
    const c = data?.courses.find((c) => c.id === id);
    setSelected(c);
    setCourse(c ? values(c) : empty());
    setDirty(false);
    setLessonIndex(0);
    setLessonTab("material");
    setTab(c?.lessons.length ? "lessons" : "overview");
    setError("");
    setNotice("");
    setMaterial(undefined);
  }
  function clearRecovery() {
    try {
      localStorage.removeItem(recoveryKey);
    } catch {
      // Do not make saving depend on browser storage.
    }
    setRecovery(undefined);
  }
  function restoreRecovery() {
    if (!recovery || !canSwitch()) return;
    const saved = data?.courses.find((item) => item.id === recovery.id);
    const sameRevision = saved && saved.revision === recovery.revision;
    setSelected(sameRevision ? saved : undefined);
    change(recovery.course);
    setLessonIndex(0);
    setTab("overview");
    setLessonTab("material");
    setError("");
    setNotice(
      recovery.id && !sameRevision
        ? "The saved course changed. Your recovered edits opened as a separate course."
        : "Unsaved changes recovered. Save the course to keep them.",
    );
    setRecovery(undefined);
  }
  async function reload() {
    const d = await api<ExpansionState>("expansion/state");
    if (mounted.current) setData(d);
    return d;
  }
  async function action<T>(fn: () => Promise<T>, message?: string) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await fn();
      if (mounted.current && message) setNotice(message);
      return result;
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function save() {
    return action(async () => {
      const c = await api<Revision<AcademyDraft>>("expansion/courses/save", {
        ...course,
        id: selected?.id,
        expectedRevision: selected?.revision || 0,
      });
      if (mounted.current) {
        setSelected(c);
        setCourse(values(c));
        setDirty(false);
        if (!recovery) clearRecovery();
        setData(
          (current) =>
            current && {
              ...current,
              courses: current.courses.some((item) => item.id === c.id)
                ? current.courses.map((item) => (item.id === c.id ? c : item))
                : [...current.courses, c],
            },
        );
      }
      return c;
    }, "Saved on this device.");
  }
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (unsaved.current && !locked.current) void saveRef.current();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  async function workApplied() {
    const owner = selected?.id;
    const d = await reload();
    if (!mounted.current || activeCourse.current !== owner) return;
    if (unsaved.current) {
      setNotice(
        "The agent saved a new revision. Your unsaved edits are preserved; export them or reload the saved course before continuing.",
      );
      return;
    }
    const c = d.courses.find((c) => c.id === owner);
    if (c) {
      setSelected(c);
      setCourse(values(c));
      setNotice(
        "The agent’s reviewed assignment is saved. Inspect it in Practice & review.",
      );
      setLessonTab("practice");
    }
  }
  function lessonChange(
    field: "title" | "objective" | "practice" | "content" | "chapter",
    text: string,
  ) {
    change({
      ...course,
      lessons: course.lessons.map((l, i) =>
        i === lessonIndex ? { ...l, [field]: text } : l,
      ),
    });
  }
  function addLesson(after = course.lessons.length - 1) {
    if (course.lessons.length >= COURSE_LESSON_LIMIT) return;
    const chapter = course.lessons[after]?.chapter;
    const index = after + 1;
    const order = course.lessons.map((_, i) => i);
    order.splice(index, 0, course.lessons.length);
    change(
      arrangeLessons(
        {
          ...course,
          lessons: [
            ...course.lessons,
            { ...newLesson(), ...(chapter ? { chapter } : {}) },
          ],
        },
        order,
      ),
    );
    setLessonIndex(index);
    setLessonTab("material");
    setTab("lessons");
  }
  function moveLesson(delta: number) {
    const next = lessonIndex + delta;
    if (next < 0 || next >= course.lessons.length) return;
    const order = course.lessons.map((_, i) => i);
    [order[lessonIndex], order[next]] = [order[next], order[lessonIndex]];
    change(arrangeLessons(course, order));
    setLessonIndex(next);
  }
  function removeLesson() {
    if (
      !confirm(
        "Remove this lesson and its linked project increment? Prerequisite links will be updated. The saved release history stays available.",
      )
    )
      return;
    change(
      arrangeLessons(
        course,
        course.lessons.map((_, i) => i).filter((i) => i !== lessonIndex),
      ),
    );
    setLessonIndex(Math.max(0, lessonIndex - 1));
  }
  function openFinding(f: AcademyFinding) {
    if (f.lessonIndex !== undefined) {
      setLessonIndex(f.lessonIndex);
      setTab("lessons");
      setLessonTab(f.field === "learn" ? "practice" : "material");
    } else setTab(f.field === "project" ? "project" : "overview");
  }
  const lesson = course.lessons[lessonIndex],
    releases = (
      data?.releases.filter((r) => !selected || r.courseId === selected.id) ||
      []
    ).sort((a, b) => b.revision - a.revision);
  const latest = releases[0],
    blockers = audit?.findings.filter((f) => f.level === "blocker") || [],
    reviews = audit?.findings.filter((f) => f.level === "review") || [];
  if (!data)
    return (
      <section className="academy-workbench">
        <p role={error ? "alert" : "status"}>{error || "Opening Academy…"}</p>
      </section>
    );
  const updateLesson = (updates: Partial<AcademyDraft["lessons"][number]>) =>
    change({
      ...course,
      lessons: course.lessons.map((l, i) =>
        i === lessonIndex ? { ...l, ...updates } : l,
      ),
    });
  function uploadResource(file: File) {
    if (!lesson) return;
    void action(async () => {
      if (file.size > ACADEMY_RESOURCE_MAX_BYTES)
        throw Error("This file exceeds 80 MB.");
      if ((lesson.resources?.length || 0) >= 12)
        throw Error("This lesson already has 12 resources.");
      const item = await api<AcademyResource>(
        `academy-resources?name=${encodeURIComponent(file.name)}`,
        file,
      );
      if (mounted.current && !lesson.resources?.some((r) => r.id === item.id))
        updateLesson({ resources: [...(lesson.resources || []), item] });
    });
  }
  function useResourceAsStarter(item: AcademyResource) {
    if (!lesson) return;
    void action(async () => {
      const plan = lesson.learn || defaultLearnPackage();
      const parsedPath = starterPath.safeParse(item.name);
      if (!parsedPath.success)
        throw Error(
          "Rename this file with a simple code filename before using it as starter code.",
        );
      if (
        plan.starterFiles.some(
          (f) => f.path.toLowerCase() === item.name.toLowerCase(),
        )
      )
        throw Error("A starter file already has this name.");
      if (plan.starterFiles.length >= 12)
        throw Error("This assignment already has 12 starter files.");
      const { content } = await api<{ content: string }>(
        `academy-resources/${item.id}?text=1`,
      );
      if (!mounted.current) return;
      updateLesson({
        learn: {
          ...plan,
          starterFiles: [
            ...plan.starterFiles,
            { path: parsedPath.data, content },
          ],
        },
      });
      setLessonTab("practice");
    });
  }
  return (
    <section
      className="academy-workbench"
      aria-label="Academy instructor workbench"
    >
      <header className="academy-top">
        <div>
          <span>
            <BookOpen size={15} /> Academy
          </span>
          <h1>
            {course.title || (selected ? "Untitled course" : "New course")}
          </h1>
        </div>
        <div className="academy-top-actions">
          <small role="status">
            {busy
              ? "Working…"
              : dirty
                ? "Unsaved changes"
                : selected
                  ? `Saved · revision ${selected.revision}`
                  : "New course"}
          </small>
          <button
            className="button"
            onClick={() => setShowAgent((v) => !v)}
            aria-expanded={showAgent}
          >
            <Sparkles size={14} /> Atlas
          </button>
          <button
            className="button primary"
            disabled={busy || !course.title.trim() || (!dirty && !!selected)}
            onClick={() => void save()}
          >
            <Save size={14} /> Save course draft
          </button>
        </div>
      </header>
      {error && (
        <p className="academy-message error" role="alert">
          {error}
          {selected && dirty && (
            <button
              className="button small"
              onClick={() =>
                download("outclass-unsaved-course.json", {
                  format: "outclass-academy",
                  version: 1,
                  course,
                })
              }
            >
              Export unsaved copy
            </button>
          )}
        </p>
      )}
      {notice && (
        <p className="academy-message" role="status">
          {notice}
        </p>
      )}
      {recovery && (
        <div className="academy-message" role="status">
          Unsaved changes for {recovery.course.title || "an untitled course"}.
          <button
            className="button small"
            onClick={restoreRecovery}
            disabled={busy}
          >
            Recover draft
          </button>
          <button
            className="text-button"
            onClick={clearRecovery}
            disabled={busy}
          >
            Discard recovery
          </button>
        </div>
      )}
      <div className={`academy-frame${showAgent ? " with-agent" : ""}`}>
        <aside className="academy-outline">
          <div className="academy-library">
            <label>
              Course library
              <select
                aria-label="Academy course"
                value={selected?.id || ""}
                disabled={busy}
                onChange={(e) => choose(e.target.value)}
              >
                <option value="">New course</option>
                {data.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <button
                className="button small"
                disabled={busy}
                onClick={() => choose("")}
              >
                <Plus size={13} /> New
              </button>
              <button
                className="button small"
                disabled={busy}
                onClick={() => importInput.current?.click()}
              >
                <FileUp size={13} /> Import
              </button>
              <button
                className="button small"
                disabled={busy}
                onClick={() =>
                  download("outclass-course.json", {
                    format: "outclass-academy",
                    version: 1,
                    course,
                  })
                }
                aria-label="Export course"
              >
                <Download size={13} />
              </button>
            </div>
          </div>
          <nav
            aria-label="Academy course sections"
            className="academy-sections"
          >
            {(
              [
                ["overview", "Course overview"],
                ["project", "Evolving project"],
                ["review", "Review & release"],
                ["releases", "Release history"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                disabled={busy}
                aria-label={label}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => setTab(id)}
              >
                {label}
                {id === "review" && audit && (
                  <small>
                    {
                      audit.findings.filter((f) => f.level !== "suggestion")
                        .length
                    }
                  </small>
                )}
              </button>
            ))}
          </nav>
          <div className="academy-outline-heading">
            <span>
              Lessons{" "}
              <small>
                {course.lessons.length}/{COURSE_LESSON_LIMIT}
              </small>
            </span>
            <button
              className="button small"
              onClick={() => addLesson()}
              disabled={busy || course.lessons.length >= COURSE_LESSON_LIMIT}
              aria-label="Add lesson"
            >
              <Plus size={14} />
            </button>
          </div>
          <nav className="academy-lessons" aria-label="Course lessons">
            {course.lessons.map((l, i) => (
              <React.Fragment key={i}>
                {(i === 0 ||
                  (l.chapter || "").trim() !==
                    (course.lessons[i - 1]?.chapter || "").trim()) && (
                  <div className="academy-chapter-label">
                    <span>{l.chapter?.trim() || "Unsectioned"}</span>
                    {l.chapter?.trim() && (
                      <button
                        type="button"
                        aria-label={`Add lesson to chapter ${l.chapter.trim()}`}
                        disabled={
                          busy || course.lessons.length >= COURSE_LESSON_LIMIT
                        }
                        onClick={() => {
                          let last = i;
                          while (
                            course.lessons[last + 1]?.chapter?.trim() ===
                            l.chapter?.trim()
                          )
                            last++;
                          addLesson(last);
                        }}
                      >
                        <Plus size={13} />
                      </button>
                    )}
                  </div>
                )}
                <button
                  disabled={busy}
                  aria-current={
                    tab === "lessons" && lessonIndex === i ? "step" : undefined
                  }
                  onClick={() => {
                    setLessonIndex(i);
                    setTab("lessons");
                  }}
                >
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <span>
                    {l.title || "Untitled lesson"}
                    <small>
                      {l.learn
                        ? `${l.learn.minutes} min · ${l.learn.kind === "capstone" ? "Capstone" : "Exercise"}`
                        : l.resources?.length
                          ? `${l.resources.length} resources`
                          : "Teaching material"}
                      {course.learningProject?.milestones.some(
                        (m) => m.lessonIndex === i,
                      )
                        ? " · Project"
                        : ""}
                    </small>
                  </span>
                  {l.learn && (
                    <Check size={12} aria-label="Learn package added" />
                  )}
                </button>
              </React.Fragment>
            ))}
          </nav>
          {!course.lessons.length && (
            <p className="academy-outline-empty">
              Import your outline or add a lesson. Your teaching material stays
              yours.
            </p>
          )}
        </aside>
        <section className="academy-canvas" aria-label="Academy editor">
          <fieldset className="academy-fieldset" disabled={busy}>
            {tab === "overview" && (
              <div className="academy-page">
                <div className="academy-page-heading">
                  <span>Course direction</span>
                  <h2>
                    A clear starting point.
                    <br />A useful result.
                  </h2>
                  <p>
                    Describe your learner and what they will be able to do.
                    Build on your existing course material.
                  </p>
                </div>
                <label>
                  Course title
                  <input
                    maxLength={200}
                    value={course.title}
                    placeholder="Practical Python for club organizers"
                    onChange={(e) =>
                      change({ ...course, title: e.target.value })
                    }
                  />
                </label>
                <label>
                  Who is it for?
                  <textarea
                    maxLength={1000}
                    value={course.audience}
                    placeholder="Starting experience, prerequisites and constraints"
                    onChange={(e) =>
                      change({ ...course, audience: e.target.value })
                    }
                  />
                </label>
                <label>
                  What will they build?
                  <textarea
                    maxLength={2000}
                    value={course.outcome}
                    placeholder="A result they can demonstrate with their own work"
                    onChange={(e) =>
                      change({ ...course, outcome: e.target.value })
                    }
                  />
                </label>
                <label className="product-checkbox">
                  <input
                    type="checkbox"
                    checked={course.rightsConfirmed}
                    onChange={(e) =>
                      change({ ...course, rightsConfirmed: e.target.checked })
                    }
                  />{" "}
                  I own or have permission to use this material.
                </label>
                <div className="academy-next">
                  <button
                    className="button"
                    onClick={() => addLesson()}
                    disabled={course.lessons.length >= COURSE_LESSON_LIMIT}
                  >
                    <Plus size={14} /> Add lesson
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      download("academy-outline-template.md", outlineTemplate)
                    }
                  >
                    Download outline template <Download size={13} />
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      download("academy-teaching-example.json", {
                        format: "outclass-academy",
                        version: 1,
                        course: academyExample(),
                      })
                    }
                  >
                    Download teaching example <Download size={13} />
                  </button>
                </div>
                <details className="academy-helper">
                  <summary>How to import an existing course</summary>
                  <p>
                    Use an OutClass JSON export, or a Markdown outline with a
                    course title, audience, outcome and lesson headings. No AI
                    call is needed. Imports open for review as a new draft.
                  </p>
                  <pre>{outlineTemplate}</pre>
                </details>
                <HandoffInbox api={api} domain="academy" />
              </div>
            )}
            {tab === "lessons" && lesson && (
              <div className="academy-page academy-lesson-page">
                <div className="academy-lesson-bar">
                  <span>
                    Lesson {lessonIndex + 1} of {course.lessons.length}
                  </span>
                  <div>
                    <button
                      className="button small"
                      onClick={() => moveLesson(-1)}
                      disabled={!lessonIndex}
                      aria-label="Move lesson earlier"
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      className="button small"
                      onClick={() => moveLesson(1)}
                      disabled={lessonIndex === course.lessons.length - 1}
                      aria-label="Move lesson later"
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button
                      className="button small"
                      onClick={removeLesson}
                      aria-label="Remove selected lesson"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <label>
                  Lesson title
                  <input
                    aria-label={`Lesson title ${lessonIndex + 1}`}
                    className="academy-lesson-title"
                    value={lesson.title}
                    maxLength={200}
                    placeholder="What will this lesson unlock?"
                    onChange={(e) => lessonChange("title", e.target.value)}
                  />
                </label>
                <div
                  className="academy-lesson-tabs"
                  role="group"
                  aria-label="Lesson workspace"
                >
                  <button
                    className={lessonTab === "material" ? "selected" : ""}
                    aria-pressed={lessonTab === "material"}
                    onClick={() => setLessonTab("material")}
                  >
                    Teaching material
                  </button>
                  <button
                    className={lessonTab === "resources" ? "selected" : ""}
                    aria-pressed={lessonTab === "resources"}
                    onClick={() => setLessonTab("resources")}
                  >
                    Resources {lesson.resources?.length || ""}
                  </button>
                  <button
                    className={lessonTab === "practice" ? "selected" : ""}
                    aria-pressed={lessonTab === "practice"}
                    onClick={() => setLessonTab("practice")}
                  >
                    Practice & review
                  </button>
                </div>
                {lessonTab === "material" ? (
                  <>
                    <label>
                      Chapter
                      <input
                        aria-label={`Chapter for lesson ${lessonIndex + 1}`}
                        value={lesson.chapter || ""}
                        maxLength={100}
                        list="academy-chapter-names"
                        placeholder="Choose or name a chapter"
                        onChange={(e) =>
                          lessonChange("chapter", e.target.value)
                        }
                      />
                      <datalist id="academy-chapter-names">
                        {[
                          ...new Set(
                            course.lessons
                              .map((l) => l.chapter?.trim())
                              .filter(Boolean),
                          ),
                        ].map((chapter) => (
                          <option value={chapter} key={chapter} />
                        ))}
                      </datalist>
                    </label>
                    <label>
                      Measurable objective
                      <textarea
                        aria-label={`Measurable objective ${lessonIndex + 1}`}
                        value={lesson.objective}
                        maxLength={1000}
                        placeholder="What can they build, explain or diagnose?"
                        onChange={(e) =>
                          lessonChange("objective", e.target.value)
                        }
                      />
                    </label>
                    <label>
                      Hands-on practice brief
                      <textarea
                        aria-label={`Hands-on practice brief ${lessonIndex + 1}`}
                        value={lesson.practice}
                        maxLength={2000}
                        placeholder="Give a concrete task, input and observable result"
                        onChange={(e) =>
                          lessonChange("practice", e.target.value)
                        }
                      />
                    </label>
                    <div className="academy-material-heading">
                      <span>
                        Lesson content{" "}
                        <small>
                          {lesson.content.length.toLocaleString()} /{" "}
                          {COURSE_SOURCE_LIMIT.toLocaleString()}
                        </small>
                      </span>
                      <button
                        className="button small"
                        onClick={() => materialInput.current?.click()}
                      >
                        <FileUp size={13} /> Import material
                      </button>
                    </div>
                    <textarea
                      aria-label={`Lesson content ${lessonIndex + 1}`}
                      className="academy-source-editor"
                      value={lesson.content}
                      maxLength={COURSE_SOURCE_LIMIT}
                      rows={16}
                      spellCheck={false}
                      placeholder="Paste your transcript, teaching notes or source material. The agent uses this evidence."
                      onChange={(e) => lessonChange("content", e.target.value)}
                    />
                    <small className="academy-fineprint">
                      Plain text, Markdown and timed captions are preserved as
                      source material. Importing does not execute code or call
                      AI.
                    </small>
                    <AcademyReferences
                      key={`${selected?.id || "draft"}:${lessonIndex}`}
                      value={lesson.references}
                      onChange={(references) => updateLesson({ references })}
                    />
                  </>
                ) : lessonTab === "resources" ? (
                  <section className="academy-resource-workspace">
                    <div className="academy-page-heading small">
                      <h2>Lesson resources</h2>
                      <p>
                        Upload MP4, WebM, PDF, ZIP or code files for this
                        lesson. Up to 80 MB per file.
                      </p>
                    </div>
                    <label className="academy-upload-resource">
                      <FileUp size={19} />
                      <strong>Choose a file</strong>
                      <input
                        type="file"
                        aria-label="Upload lesson resource"
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          event.currentTarget.value = "";
                          if (file) uploadResource(file);
                        }}
                      />
                    </label>
                    <AcademyResourceList
                      key={`${selected?.id || "draft"}:${lessonIndex}`}
                      api={api}
                      items={lesson.resources || []}
                      onStarter={useResourceAsStarter}
                      onRemove={(id) =>
                        updateLesson({
                          resources:
                            lesson.resources?.filter(
                              (item) => item.id !== id,
                            ) || [],
                        })
                      }
                    />
                    <p className="academy-fineprint">
                      Resources are available in Learn on this device. Course
                      JSON exports contain resource references.
                    </p>
                  </section>
                ) : (
                  <>
                    <div className="academy-page-heading small">
                      <h2>Exercises and capstones</h2>
                      <p>
                        Define what the learner attempts, how they check it, and
                        what changes after it works.
                      </p>
                    </div>
                    <div className="academy-forge-callout">
                      <Sparkles size={20} />
                      <div>
                        <strong>Forge</strong>
                        <p>
                          Draft a build guide, learner TODOs, and checks for
                          this lesson.
                        </p>
                      </div>
                      {(["exercise", "capstone"] as const).map((kind) => (
                        <button
                          key={kind}
                          className="button small"
                          onClick={() => {
                            setForgeRequest({ kind });
                            setShowAgent(true);
                          }}
                        >
                          {kind === "exercise"
                            ? "Design exercise"
                            : "Design capstone"}
                        </button>
                      ))}
                    </div>
                    <LearnPackageEditor
                      index={lessonIndex}
                      value={lesson.learn}
                      lessonTitles={course.lessons.map((l) => l.title)}
                      onChange={(learn) =>
                        change({
                          ...course,
                          lessons: course.lessons.map((l, i) =>
                            i === lessonIndex ? { ...l, learn } : l,
                          ),
                        })
                      }
                    />
                    {course.learningProject?.milestones.find(
                      (m) => m.lessonIndex === lessonIndex,
                    ) && (
                      <div className="academy-project-link">
                        <span>Connected project increment</span>
                        <h3>
                          {
                            course.learningProject.milestones.find(
                              (m) => m.lessonIndex === lessonIndex,
                            )!.title
                          }
                        </h3>
                        <button
                          className="text-button"
                          onClick={() => setTab("project")}
                        >
                          Edit the project connection <ArrowUpRight size={13} />
                        </button>
                      </div>
                    )}
                  </>
                )}
                <div className="academy-page-footer">
                  <button
                    className="text-button"
                    disabled={!lessonIndex}
                    onClick={() => setLessonIndex((i) => i - 1)}
                  >
                    Previous lesson
                  </button>
                  <button
                    className="text-button"
                    disabled={lessonIndex >= course.lessons.length - 1}
                    onClick={() => setLessonIndex((i) => i + 1)}
                  >
                    Next lesson <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            )}
            {tab === "lessons" && !lesson && (
              <div className="academy-page">
                <h2>Your next lesson starts here.</h2>
                <button className="button primary" onClick={() => addLesson()}>
                  <Plus size={14} /> Add lesson
                </button>
              </div>
            )}
            {tab === "project" && (
              <div className="academy-page">
                <div className="academy-page-heading">
                  <span>The throughline</span>
                  <h2>
                    One project.
                    <br />
                    More capable with every lesson.
                  </h2>
                  <p>
                    Connect useful increments to the point where learners have
                    enough context. A project is optional.
                  </p>
                </div>
                {!course.learningProject ? (
                  <button
                    className="button primary"
                    onClick={() =>
                      change({
                        ...course,
                        learningProject: {
                          title: "",
                          problem: "",
                          deliverable: "",
                          milestones: [],
                        },
                      })
                    }
                  >
                    <Plus size={14} /> Design an evolving project
                  </button>
                ) : (
                  <>
                    <label>
                      Project title
                      <input
                        maxLength={200}
                        value={course.learningProject.title}
                        onChange={(e) =>
                          change({
                            ...course,
                            learningProject: {
                              ...course.learningProject!,
                              title: e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                    <label>
                      Whose problem does it solve?
                      <textarea
                        maxLength={2000}
                        value={course.learningProject.problem}
                        onChange={(e) =>
                          change({
                            ...course,
                            learningProject: {
                              ...course.learningProject!,
                              problem: e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                    <label>
                      Final deliverable
                      <textarea
                        maxLength={2000}
                        value={course.learningProject.deliverable}
                        onChange={(e) =>
                          change({
                            ...course,
                            learningProject: {
                              ...course.learningProject!,
                              deliverable: e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                    <div className="academy-material-heading">
                      <h3>Project increments</h3>
                      <button
                        className="button small"
                        disabled={
                          !course.lessons.some(
                            (_, i) =>
                              !course.learningProject!.milestones.some(
                                (m) => m.lessonIndex === i,
                              ),
                          )
                        }
                        onClick={() => {
                          const index = course.lessons.findIndex(
                            (_, i) =>
                              !course.learningProject!.milestones.some(
                                (m) => m.lessonIndex === i,
                              ),
                          );
                          if (index >= 0)
                            change({
                              ...course,
                              learningProject: {
                                ...course.learningProject!,
                                milestones: [
                                  ...course.learningProject!.milestones,
                                  {
                                    lessonIndex: index,
                                    title: "",
                                    brief: "",
                                    acceptanceCriteria: [],
                                  },
                                ],
                              },
                            });
                        }}
                      >
                        <Plus size={13} /> Add increment
                      </button>
                    </div>
                    {course.learningProject.milestones.map((m, i) => (
                      <article className="academy-milestone" key={i}>
                        <span>Increment {i + 1}</span>
                        <label>
                          After lesson
                          <select
                            aria-label={`Milestone lesson ${i + 1}`}
                            value={m.lessonIndex}
                            onChange={(e) =>
                              change({
                                ...course,
                                learningProject: {
                                  ...course.learningProject!,
                                  milestones:
                                    course.learningProject!.milestones.map(
                                      (n, j) =>
                                        j === i
                                          ? {
                                              ...n,
                                              lessonIndex: Number(
                                                e.target.value,
                                              ),
                                            }
                                          : n,
                                    ),
                                },
                              })
                            }
                          >
                            {course.lessons.map((l, n) => (
                              <option
                                key={n}
                                value={n}
                                disabled={course.learningProject!.milestones.some(
                                  (other, j) =>
                                    j !== i && other.lessonIndex === n,
                                )}
                              >
                                {n + 1}. {l.title || "Untitled lesson"}
                              </option>
                            ))}
                          </select>
                        </label>
                        {(
                          [
                            ["title", "Increment title", 200],
                            ["brief", "What will the learner build?", 2000],
                          ] as const
                        ).map(([field, label, max]) => (
                          <label key={field}>
                            {label}
                            <textarea
                              aria-label={`${label} ${i + 1}`}
                              maxLength={max}
                              value={m[field]}
                              rows={field === "title" ? 1 : 3}
                              onChange={(e) =>
                                change({
                                  ...course,
                                  learningProject: {
                                    ...course.learningProject!,
                                    milestones:
                                      course.learningProject!.milestones.map(
                                        (n, j) =>
                                          j === i
                                            ? { ...n, [field]: e.target.value }
                                            : n,
                                      ),
                                  },
                                })
                              }
                            />
                          </label>
                        ))}
                        <label>
                          Observable checks · one per line
                          <textarea
                            aria-label={`Milestone checks ${i + 1}`}
                            value={m.acceptanceCriteria.join("\n")}
                            maxLength={3000}
                            onChange={(e) =>
                              change({
                                ...course,
                                learningProject: {
                                  ...course.learningProject!,
                                  milestones:
                                    course.learningProject!.milestones.map(
                                      (n, j) =>
                                        j === i
                                          ? {
                                              ...n,
                                              acceptanceCriteria:
                                                e.target.value.split("\n"),
                                            }
                                          : n,
                                    ),
                                },
                              })
                            }
                          />
                        </label>
                        <button
                          className="text-button"
                          onClick={() =>
                            change({
                              ...course,
                              learningProject: {
                                ...course.learningProject!,
                                milestones:
                                  course.learningProject!.milestones.filter(
                                    (_, j) => j !== i,
                                  ),
                              },
                            })
                          }
                        >
                          Remove increment
                        </button>
                      </article>
                    ))}
                    <p className="academy-fineprint">
                      Learn opens one project folder for this course. Lesson
                      resources stay separate, and the learner’s existing files
                      are preserved.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => {
                        if (
                          confirm(
                            "Remove this project design from the draft? Released versions and learner files stay available.",
                          )
                        ) {
                          const { learningProject: _, ...rest } = course;
                          change(rest);
                        }
                      }}
                    >
                      Remove project design
                    </button>
                  </>
                )}
              </div>
            )}
            {tab === "review" && (
              <div className="academy-page">
                <div className="academy-page-heading">
                  <span>Instructor review</span>
                  <h2>Make the next step clear.</h2>
                  <p>
                    Inspect this exact revision before it reaches Learn. These
                    checks identify design gaps; they do not certify teaching
                    quality or mastery.
                  </p>
                </div>
                {!selected || dirty ? (
                  <div className="academy-empty-review">
                    <p>
                      Save your changes to inspect the current course revision.
                    </p>
                    <button
                      className="button primary"
                      disabled={!course.title.trim()}
                      onClick={() => void save()}
                    >
                      Save and review
                    </button>
                  </div>
                ) : !audit ? (
                  <p role="status">Checking the saved course…</p>
                ) : (
                  <>
                    <div
                      className="academy-coverage"
                      aria-label="Course coverage"
                    >
                      <div>
                        <strong>
                          {audit.coverage.assignments}/{audit.coverage.lessons}
                        </strong>
                        <span>Learn assignments</span>
                      </div>
                      <div>
                        <strong>{audit.coverage.reflections}</strong>
                        <span>Reflections</span>
                      </div>
                      <div>
                        <strong>{audit.coverage.transfers}</strong>
                        <span>Transfer challenges</span>
                      </div>
                      <div>
                        <strong>{audit.coverage.minutes} min</strong>
                        <span>Planned practice</span>
                      </div>
                    </div>
                    <div className="academy-review-status">
                      <strong>
                        {blockers.length
                          ? `${blockers.length} release blocker${blockers.length === 1 ? "" : "s"}`
                          : audit.review
                            ? "This revision is reviewed"
                            : "Ready for your review"}
                      </strong>
                      <span>
                        {reviews.length} teaching-quality findings ·{" "}
                        {audit.coverage.milestones} project increments
                      </span>
                    </div>
                    {audit.findings.map((f) => (
                      <article
                        className={`academy-finding ${f.level}`}
                        key={f.id}
                      >
                        <div>
                          <span>
                            {f.level === "blocker"
                              ? "Resolve"
                              : f.level === "review"
                                ? "Review"
                                : "Consider"}
                            {f.lessonIndex !== undefined
                              ? ` · Lesson ${f.lessonIndex + 1}`
                              : ""}
                          </span>
                          <h3>{f.title}</h3>
                          <p>{f.detail}</p>
                          {f.level === "review" && (
                            <label className="product-checkbox">
                              <input
                                type="checkbox"
                                checked={ack.includes(f.id)}
                                disabled={!!audit.review}
                                onChange={(e) =>
                                  setAck((old) =>
                                    e.target.checked
                                      ? [...old, f.id]
                                      : old.filter((id) => id !== f.id),
                                  )
                                }
                              />{" "}
                              Reviewed; I accept this choice for this release.
                            </label>
                          )}
                        </div>
                        <button
                          className="text-button"
                          onClick={() => openFinding(f)}
                        >
                          Open <ArrowUpRight size={13} />
                        </button>
                      </article>
                    ))}
                    {latest && (
                      <details className="academy-release-diff">
                        <summary>
                          Changes since released revision {latest.revision}
                        </summary>
                        <p>
                          {course.lessons.length - latest.lessons.length} net
                          lesson change ·{" "}
                          {
                            course.lessons.filter(
                              (l, i) =>
                                JSON.stringify(l) !==
                                JSON.stringify(latest.lessons[i]),
                            ).length
                          }{" "}
                          current lessons differ
                        </p>
                        {course.lessons.map(
                          (l, i) =>
                            JSON.stringify(l) !==
                              JSON.stringify(latest.lessons[i]) && (
                              <article key={i}>
                                <strong>
                                  {i + 1}. {l.title || "Untitled"}
                                </strong>
                                <small>
                                  {latest.lessons[i]
                                    ? `Previously: ${latest.lessons[i].title}`
                                    : "New lesson"}
                                </small>
                                <p>
                                  {(
                                    [
                                      "title",
                                      "objective",
                                      "practice",
                                      "content",
                                      "learn",
                                    ] as const
                                  )
                                    .filter(
                                      (k) =>
                                        JSON.stringify(l[k]) !==
                                        JSON.stringify(latest.lessons[i]?.[k]),
                                    )
                                    .join(", ")}
                                </p>
                              </article>
                            ),
                        )}
                        <button
                          className="button small"
                          onClick={() =>
                            download(
                              `academy-revision-${latest.revision}.json`,
                              {
                                format: "outclass-academy",
                                version: 1,
                                course: values(latest),
                              },
                            )
                          }
                        >
                          Export previous version
                        </button>
                      </details>
                    )}
                    <div className="academy-review-actions">
                      <button
                        className="button"
                        disabled={
                          !!blockers.length ||
                          reviews.some((f) => !ack.includes(f.id)) ||
                          !!audit.review
                        }
                        onClick={() =>
                          void action(async () => {
                            const r = await api<AcademyAudit>(
                              `academy/courses/${selected.id}/review`,
                              {
                                expectedRevision: selected.revision,
                                hash: audit.hash,
                                acknowledged: ack,
                                approve: true,
                              },
                            );
                            if (mounted.current) setAudit(r);
                          }, "Exact revision reviewed.")
                        }
                      >
                        <Check size={14} />
                        {audit.review
                          ? "Review complete"
                          : "Complete instructor review"}
                      </button>
                      <button
                        className="button primary"
                        disabled={!audit.review}
                        onClick={() =>
                          void action(async () => {
                            await api(
                              `academy/courses/${selected.id}/release`,
                              {
                                expectedRevision: selected.revision,
                                reviewHash: audit.hash,
                                approve: true,
                              },
                            );
                            await reload();
                            setTab("releases");
                          }, "Released to your local catalog. Preview the learner experience next.")
                        }
                      >
                        Approve local release <ArrowUpRight size={14} />
                      </button>
                    </div>
                    <CompilerPanel course={selected} dirty={dirty} api={api} />
                  </>
                )}
              </div>
            )}
            {tab === "releases" && (
              <div className="academy-page">
                <div className="academy-page-heading">
                  <h2>
                    {selected ? "Release history" : "Local course catalog"}
                  </h2>
                  <p>
                    Preview uses separate files and review history. It does not
                    count as independent learner evidence.
                  </p>
                </div>
                {!releases.length && (
                  <p>
                    No releases for this course yet. Complete Review & release
                    to create the first version.
                  </p>
                )}
                {releases.map((r) => (
                  <article className="academy-release" key={r.id}>
                    <div>
                      <span>Released revision {r.revision}</span>
                      <h3>{r.title}</h3>
                      <p>{r.outcome}</p>
                      <small>
                        {r.lessons.length} lessons ·{" "}
                        {new Date(r.publishedAt).toLocaleDateString()} ·{" "}
                        {r.hash.slice(0, 12)}
                      </small>
                    </div>
                    <label>
                      Preview lesson
                      <select
                        aria-label={`Preview lesson revision ${r.revision}`}
                        value={
                          previewLesson[r.id] ??
                          Math.min(lessonIndex, r.lessons.length - 1)
                        }
                        onChange={(e) =>
                          setPreviewLesson((old) => ({
                            ...old,
                            [r.id]: Number(e.target.value),
                          }))
                        }
                      >
                        {r.lessons.map((l, i) => (
                          <option key={i} value={i}>
                            {i + 1}. {l.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="academy-next">
                      {data.courses.some((item) => item.id === r.courseId) && (
                        <button
                          className="button primary"
                          disabled={dirty}
                          onClick={() =>
                            void action(async () => {
                              const result = await api<{ courseId: string }>(
                                `expansion/releases/${r.id}/preview`,
                                {
                                  lessonIndex:
                                    previewLesson[r.id] ??
                                    Math.min(lessonIndex, r.lessons.length - 1),
                                },
                              );
                              onCode(result.courseId);
                            })
                          }
                        >
                          Preview as a learner <ArrowUpRight size={13} />
                        </button>
                      )}
                      {data.enrollments.some((e) => e.releaseId === r.id) ? (
                        <button
                          className="button"
                          disabled={dirty}
                          onClick={() =>
                            void action(async () => {
                              const result = await api<{ courseId: string }>(
                                `expansion/releases/${r.id}/launch`,
                                {
                                  lessonIndex:
                                    previewLesson[r.id] ??
                                    Math.min(lessonIndex, r.lessons.length - 1),
                                },
                              );
                              onCode(result.courseId);
                            })
                          }
                        >
                          Open{" "}
                          {
                            r.lessons[
                              previewLesson[r.id] ??
                                Math.min(lessonIndex, r.lessons.length - 1)
                            ]?.title
                          }{" "}
                          in Learn <ArrowUpRight size={13} />
                        </button>
                      ) : (
                        <button
                          className="button"
                          onClick={() =>
                            void action(async () => {
                              await api(
                                `expansion/releases/${r.id}/enroll`,
                                {},
                              );
                              await reload();
                            }, "Enrolled on this device.")
                          }
                        >
                          Enroll on this device
                        </button>
                      )}
                    </div>
                    <button
                      className="text-button"
                      onClick={() =>
                        download(`academy-release-${r.revision}.json`, {
                          format: "outclass-academy",
                          version: 1,
                          course: values(r),
                        })
                      }
                    >
                      Export this version <Download size={13} />
                    </button>
                  </article>
                ))}
                <details className="academy-helper">
                  <summary>Hosted course catalog</summary>
                  <HostedAcademyPanel
                    api={api}
                    releases={releases}
                    onCode={onCode}
                  />
                </details>
              </div>
            )}
          </fieldset>
        </section>
        <aside className="academy-architect" hidden={!showAgent}>
          <div className="academy-architect-heading">
            <span>
              <Sparkles size={14} /> Atlas
            </span>
            <button
              className="text-button"
              aria-label="Close Atlas"
              onClick={() => setShowAgent(false)}
            >
              <X size={14} />
            </button>
          </div>
          <p className="academy-fineprint">
            Works on the saved lesson you selected, using its teaching material
            and project connection. You review every change.
          </p>
          <AgentPanel
            api={api}
            domain="academy"
            entity={selected}
            dirty={dirty || busy}
            lessonIndex={lessonIndex}
            forgeRequest={forgeRequest}
            onWorkApplied={workApplied}
          />
        </aside>
      </div>
      <input
        ref={importInput}
        hidden
        type="file"
        accept=".json,.md,.txt"
        aria-label="Import course outline"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const owner = epoch.current;
          if (f.size > COURSE_CHAR_LIMIT * 4) {
            setError("Choose a course outline under 1.2 MB.");
            return;
          }
          await action(async () => {
            const result = await api<{
              course: AcademyDraft;
              warnings: string[];
            }>("academy/import", { name: f.name, text: await f.text() });
            if (mounted.current && epoch.current === owner) setImported(result);
          });
        }}
      />
      <input
        ref={materialInput}
        hidden
        type="file"
        accept=".txt,.md,.srt,.vtt"
        aria-label="Import selected lesson material"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const owner = epoch.current,
            index = lessonIndex;
          if (f.size > COURSE_SOURCE_LIMIT * 4) {
            setError(
              "Split the lesson material before importing. Nothing was truncated.",
            );
            return;
          }
          try {
            const text = await f.text();
            if (text.length > COURSE_SOURCE_LIMIT)
              throw Error(
                "Keep lesson material under 40,000 characters. Nothing was truncated.",
              );
            if (mounted.current && epoch.current === owner)
              setMaterial({ text, name: f.name, index, epoch: owner });
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      />
      {imported && (
        <AcademyDialog
          titleId="academy-import-title"
          onClose={() => setImported(undefined)}
        >
          <h2 id="academy-import-title">Review your course import</h2>
          <h3>{imported.course.title}</h3>
          <p>
            {imported.course.lessons.length} lessons ·{" "}
            {imported.course.lessons.filter((l) => l.learn).length} Learn
            assignments
          </p>
          <ol>
            {imported.course.lessons.map((l, i) => (
              <li key={i}>
                {l.title}
                <small>
                  {l.content.length.toLocaleString()} source characters
                </small>
              </li>
            ))}
          </ol>
          {imported.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
          <div className="academy-next">
            <button className="button" onClick={() => setImported(undefined)}>
              Cancel import
            </button>
            <button
              className="button primary"
              onClick={() => {
                if (!canSwitch()) return;
                epoch.current++;
                setSelected(undefined);
                setCourse(imported.course);
                setDirty(true);
                setLessonIndex(0);
                setTab("overview");
                setImported(undefined);
                setError("");
                setNotice(
                  "Imported as a new unsaved draft. Confirm permission and inspect the lessons before releasing.",
                );
              }}
            >
              Use as new course
            </button>
          </div>
        </AcademyDialog>
      )}
      {material && (
        <AcademyDialog
          titleId="academy-material-title"
          onClose={() => setMaterial(undefined)}
        >
          <h2 id="academy-material-title">Replace selected lesson material?</h2>
          <p>
            {material.name} · {material.text.length.toLocaleString()}{" "}
            characters. Existing saved releases stay available.
          </p>
          <pre>{material.text}</pre>
          <div className="academy-next">
            <button className="button" onClick={() => setMaterial(undefined)}>
              Cancel
            </button>
            <button
              className="button primary"
              onClick={() => {
                if (
                  epoch.current !== material.epoch ||
                  !course.lessons[material.index]
                ) {
                  setError(
                    "The draft changed while this file was open. Import it again for the current lesson.",
                  );
                  setMaterial(undefined);
                  return;
                }
                change({
                  ...course,
                  lessons: course.lessons.map((l, i) =>
                    i === material.index ? { ...l, content: material.text } : l,
                  ),
                });
                setMaterial(undefined);
              }}
            >
              Use this material
            </button>
          </div>
        </AcademyDialog>
      )}
    </section>
  );
}
