import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  ArrowUp,
  Plus,
  Sparkles,
  X,
  Lightbulb,
  Pencil,
  Trash2,
  Compass,
} from "lucide-react";
import type { Course } from "../shared";
import type { ProjectIdea, NotebookNote } from "../server/notebook";
import { learningUrl } from "../learning-source";
import "./notebook.css";
type Api = <T>(route: string, body?: unknown) => Promise<T>;
export type NotebookState = {
  launchPrompt: boolean;
  automaticNotes: boolean;
  projects: ProjectIdea[];
  aiReady: boolean;
  reviewDue: string[];
};
export function LaunchIdeaPrompt({
  api,
  onOpen,
}: {
  api: Api;
  onOpen: () => void;
}) {
  const [data, setData] =
      useState<Pick<NotebookState, "launchPrompt" | "reviewDue">>(),
    [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const refresh = () =>
      void api<Pick<NotebookState, "launchPrompt" | "reviewDue">>(
        "notebook-launch",
      )
        .then(setData)
        .catch(() => {});
    refresh();
    window.addEventListener("outclass-notebook-changed", refresh);
    return () =>
      window.removeEventListener("outclass-notebook-changed", refresh);
  }, []);
  if (!data?.launchPrompt || dismissed) return null;
  return (
    <div className="idea-launch">
      <Lightbulb size={18} />
      <div>
        <strong>Anything you want to build or improve?</strong>
        <p>
          {data.reviewDue.length
            ? `${data.reviewDue.length} project review${data.reviewDue.length === 1 ? "" : "s"} ready when you are.`
            : "Capture a new thought, or take an existing idea a little further."}
        </p>
      </div>
      <button
        onClick={() => {
          setDismissed(true);
          onOpen();
        }}
      >
        Open idea notebook ↗
      </button>
      <button
        aria-label="Dismiss launch idea prompt"
        onClick={() => setDismissed(true)}
      >
        <X size={15} />
      </button>
    </div>
  );
}
export function ArchitectNotebook({
  api,
  courses,
  courseId,
  compact = false,
}: {
  api: Api;
  courses: Course[];
  courseId?: string;
  compact?: boolean;
}) {
  const [data, setData] = useState<NotebookState>(),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [form, setForm] = useState(false),
    [editing, setEditing] = useState(false),
    [title, setTitle] = useState(""),
    [problem, setProblem] = useState(""),
    [links, setLinks] = useState<string[]>([]),
    [share, setShare] = useState(false);
  const [note, setNote] = useState(""),
    [kind, setKind] = useState<NotebookNote["kind"]>("idea"),
    [noteId, setNoteId] = useState<string>(),
    [question, setQuestion] = useState("");
  const load = async () => {
    const d = await api<NotebookState>("notebook");
    setData(d);
    setSelected((old) =>
      d.projects.some((p) => p.id === old)
        ? old
        : d.projects.find((p) => courseId && p.courseIds.includes(courseId))
            ?.id ||
          d.projects[0]?.id ||
          "",
    );
  };
  useEffect(() => {
    setNote("");
    setNoteId(undefined);
    setQuestion("");
    setForm(false);
    void load().catch((e) => setError(e.message));
  }, [courseId]);
  useEffect(() => {
    setNote("");
    setNoteId(undefined);
    setQuestion("");
    setForm(false);
  }, [selected]);
  const project = data?.projects.find((p) => p.id === selected);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
      window.dispatchEvent(new Event("outclass-notebook-changed"));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The Architect could not complete this action.",
      );
    } finally {
      setBusy(false);
    }
  };
  function showForm(p?: ProjectIdea) {
    setEditing(!!p);
    setTitle(p?.title || "");
    setProblem(p?.problem || "");
    setLinks(p?.courseIds || (courseId ? [courseId] : []));
    setShare(p?.shareWithOffCourse || false);
    setForm(true);
  }
  return (
    <section
      className={`architect-notebook ${compact ? "compact" : ""}`}
      aria-label="Software architect and idea notebook"
    >
      {!compact && (
        <div className="page-heading">
          <div className="eyebrow">From learning to making</div>
          <h1>Your next useful idea.</h1>
          <p>
            The Architect helps you define it, test assumptions and design a
            first version. You build it—with OffCourse beside you.
          </p>
        </div>
      )}
      <div className="notebook-toolbar">
        <Compass size={16} />
        <strong>The Architect</strong>
        <select
          aria-label="Idea project"
          disabled={busy}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Choose a project</option>
          {data?.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <button
          aria-label="New idea project"
          onClick={() => showForm()}
          disabled={busy}
        >
          <Plus size={15} />
        </button>
        {project && (
          <button
            aria-label="Edit idea project"
            onClick={() => showForm(project)}
            disabled={busy}
          >
            <Pencil size={13} />
          </button>
        )}
      </div>
      {!compact && data && (
        <div className="notebook-preferences">
          <label>
            <input
              type="checkbox"
              checked={data.launchPrompt}
              disabled={busy}
              onChange={(e) =>
                void act(() =>
                  api("notebook-preferences", {
                    launchPrompt: e.target.checked,
                    automaticNotes: data.automaticNotes,
                  }),
                )
              }
            />{" "}
            Ask about ideas on launch
          </label>
          <label>
            <input
              type="checkbox"
              checked={data.automaticNotes}
              disabled={busy}
              onChange={(e) =>
                void act(() =>
                  api("notebook-preferences", {
                    launchPrompt: data.launchPrompt,
                    automaticNotes: e.target.checked,
                  }),
                )
              }
            />{" "}
            Keep notes from saved checkpoint reflections
          </label>
          <small>
            Only linked courses. No background recording. Delete or edit notes
            any time.
          </small>
        </div>
      )}
      {error && (
        <p className="assistant-alert" role="alert">
          {error}
        </p>
      )}
      {form ? (
        <form
          className="notebook-project-form"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              const p = await api<ProjectIdea>(
                editing ? "notebook-update" : "notebook-create",
                {
                  ...(editing ? { id: selected } : {}),
                  title,
                  problem,
                  courseIds: links,
                  shareWithOffCourse: share,
                },
              );
              setSelected(p.id);
              setForm(false);
            });
          }}
        >
          <h3>{editing ? "Shape this project" : "Start with an idea"}</h3>
          <label>
            Project title
            <input
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>
          <label>
            Who needs it, and what problem does it solve?
            <textarea
              value={problem}
              maxLength={3000}
              onChange={(e) => setProblem(e.target.value)}
              placeholder="A small useful outcome is enough to begin."
            />
          </label>
          <fieldset>
            <legend>Courses this project draws on</legend>
            {courses.map((c) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  checked={links.includes(c.id)}
                  onChange={(e) =>
                    setLinks(
                      e.target.checked
                        ? [...links, c.id]
                        : links.filter((id) => id !== c.id),
                    )
                  }
                />
                {c.title}
              </label>
            ))}
          </fieldset>
          <label className="check-label">
            <input
              type="checkbox"
              checked={share}
              onChange={(e) => setShare(e.target.checked)}
            />{" "}
            Allow attaching this notebook to OffCourse in linked courses
          </label>
          <small>
            The Architect sees linked course goals and recorded checkpoint
            counts. OffCourse receives notes only when you select this project
            in a question. Changing links/sharing clears derived conversations
            and reviews.
          </small>
          <div className="notebook-actions">
            <button className="button primary" disabled={busy || !title.trim()}>
              Save project
            </button>
            <button type="button" onClick={() => setForm(false)}>
              Cancel
            </button>
            {editing && (
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      "Delete this project's notes, decisions and Architect conversations?",
                    )
                  )
                    void act(() => api("notebook-remove", { id: selected }));
                }}
              >
                Delete project
              </button>
            )}
          </div>
        </form>
      ) : project ? (
        <div className="notebook-body">
          <div className="idea-notes">
            <div className="notebook-project-heading">
              <h3>{project.title}</h3>
              <p>
                {project.problem ||
                  "Describe one person, one problem, one useful outcome."}
              </p>
              <div className="notebook-course-links">
                {project.courseIds.map((id) => (
                  <span key={id}>
                    {courses.find((c) => c.id === id)?.title}
                  </span>
                ))}
              </div>
            </div>
            <form
              className="notebook-note-form"
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  await api("notebook-note", {
                    id: project.id,
                    text: note,
                    kind,
                    noteId,
                  });
                  setNote("");
                  setNoteId(undefined);
                });
              }}
            >
              {!noteId && project.courseIds.length > 0 && (
                <select
                  aria-label="Add a saved web lesson to the note"
                  value=""
                  disabled={busy || note.length >= 4300}
                  onChange={(event) => {
                    const [id, lessonId] = JSON.parse(event.target.value) as [
                      string,
                      string,
                    ];
                    const course = courses.find((item) => item.id === id);
                    const lesson = course?.lessons.find(
                      (item) => item.id === lessonId,
                    );
                    const url = lesson?.url && learningUrl(lesson.url);
                    if (!lesson || !url) return;
                    setBusy(true);
                    setError("");
                    void api<{ content: string } | null>(
                      `lesson-material?courseId=${encodeURIComponent(id)}&lessonId=${encodeURIComponent(lessonId)}`,
                    )
                      .then((source) => {
                        const excerpt = source?.content.slice(0, 1000);
                        const addition = [
                          `Lesson: ${lesson.title}`,
                          url.href,
                          excerpt && `Excerpt:\n${excerpt}`,
                        ]
                          .filter(Boolean)
                          .join("\n");
                        setNote((previous) =>
                          [previous, addition]
                            .filter(Boolean)
                            .join("\n\n")
                            .slice(0, 6000),
                        );
                      })
                      .catch((reason: Error) => setError(reason.message))
                      .finally(() => setBusy(false));
                  }}
                >
                  <option value="" disabled>
                    Attach a web lesson
                  </option>
                  {courses
                    .filter((course) => project.courseIds.includes(course.id))
                    .flatMap((course) =>
                      course.lessons
                        .filter((lesson) => !!lesson.url && !lesson.archived)
                        .map((lesson) => (
                          <option
                            key={`${course.id}:${lesson.id}`}
                            value={JSON.stringify([course.id, lesson.id])}
                          >
                            {lesson.title}
                          </option>
                        )),
                    )}
                </select>
              )}
              <label>
                {noteId ? "Edit your note" : "Capture a thought"}
                <textarea
                  aria-label="Idea note"
                  value={note}
                  maxLength={6000}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="An idea, a tradeoff, something you noticed…"
                />
              </label>
              <div className="notebook-actions">
                <select
                  aria-label="Note type"
                  value={kind}
                  onChange={(e) =>
                    setKind(e.target.value as NotebookNote["kind"])
                  }
                >
                  <option value="idea">Idea</option>
                  <option value="decision">Architecture decision</option>
                  <option value="reflection">Reflection</option>
                </select>
                <button
                  className="button primary"
                  disabled={busy || !note.trim()}
                >
                  {noteId ? "Save edit" : "Save note"}
                </button>
                {noteId && (
                  <button
                    type="button"
                    onClick={() => {
                      setNoteId(undefined);
                      setNote("");
                    }}
                  >
                    Cancel edit
                  </button>
                )}
              </div>
            </form>
            <div className="notebook-originals">
              <h4>Your original notes</h4>
              {!project.notes.length && (
                <p className="hint">
                  Your thoughts stay separate from AI interpretations.
                </p>
              )}
              {[...project.notes].reverse().map((n) => (
                <article key={n.id} className="notebook-note">
                  <header>
                    <span>
                      {n.kind} ·{" "}
                      {n.origin === "checkpoint"
                        ? "Saved checkpoint reflection"
                        : "Written by you"}
                    </span>
                    <time dateTime={n.at}>
                      {new Date(n.at).toLocaleDateString()}
                    </time>
                    <button
                      aria-label="Edit note"
                      disabled={busy}
                      onClick={() => {
                        setNoteId(n.id);
                        setNote(n.text);
                        setKind(n.kind);
                      }}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      aria-label="Delete note"
                      disabled={busy}
                      onClick={() => {
                        if (
                          confirm(
                            "Delete this note and clear derived conversations/reviews?",
                          )
                        )
                          void act(() =>
                            api("notebook-note-remove", {
                              id: project.id,
                              noteId: n.id,
                            }),
                          );
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </header>
                  <p>{n.text}</p>
                  {n.sourceId && (
                    <small>
                      Source checkpoint: {n.sourceId} ·{" "}
                      {courses.find((c) => c.id === n.courseId)?.title}
                    </small>
                  )}
                </article>
              ))}
            </div>
          </div>
          <div className="architect-conversation">
            <div className="architect-review">
              <div>
                <Sparkles size={15} />
                <strong>Idea review</strong>
                {data?.reviewDue.includes(project.id) && (
                  <span>Ready to revisit</span>
                )}
              </div>
              <p>
                Connect your notes, linked learning and next small experiment.
              </p>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  void act(() => api("architect-review", { id: project.id }))
                }
              >
                Review this project
              </button>
              {project.review && (
                <>
                  <small>
                    {project.review.mode === "ai"
                      ? "AI interpretation"
                      : "Local planning checklist"}{" "}
                    · {new Date(project.review.at).toLocaleDateString()}
                  </small>
                  <ReactMarkdown>{project.review.text}</ReactMarkdown>
                  {project.review.connections.map((c, i) => (
                    <p className="architect-connection" key={i}>
                      Note{" "}
                      {project.notes
                        .find((n) => n.id === c.noteId)
                        ?.text.slice(0, 70)}{" "}
                      ↔{" "}
                      {
                        courses.find((course) => course.id === c.courseId)
                          ?.title
                      }
                      : {c.explanation}
                    </p>
                  ))}
                </>
              )}
            </div>
            <div className="architect-messages" aria-live="polite">
              {project.messages.map((m) => (
                <article className={`architect-message ${m.role}`} key={m.id}>
                  <small>
                    {m.role === "user"
                      ? "You"
                      : m.mode === "ai"
                        ? "Architect · AI guidance"
                        : "Architect · local checklist"}
                  </small>
                  <ReactMarkdown>{m.text}</ReactMarkdown>
                </article>
              ))}
            </div>
            <form
              className="architect-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  await api("architect-chat", { id: project.id, question });
                  setQuestion("");
                });
              }}
            >
              <label htmlFor={`architect-question-${compact}`}>
                Think it through with the Architect
              </label>
              <textarea
                id={`architect-question-${compact}`}
                value={question}
                maxLength={4000}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="What should my first version do? How should these pieces fit?"
              />
              <button
                aria-label="Ask the Architect"
                disabled={busy || !question.trim()}
              >
                <ArrowUp size={16} />
              </button>
            </form>
            <small className="hint">
              {data?.aiReady
                ? "Sends this project's notes and linked course goals when AI guides are enabled."
                : "Connect AI for tailored guidance. A local planning checklist is available now."}{" "}
              Decisions stay yours.
            </small>
            {!!project.messages.length && (
              <button
                className="text-action"
                disabled={busy}
                onClick={() =>
                  void act(() => api("architect-clear", { id: project.id }))
                }
              >
                Clear Architect conversation
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="notebook-empty">
          <Lightbulb size={28} />
          <h3>Give a thought somewhere to grow.</h3>
          <p>
            An idea for a tool, an improvement at work, an open-source
            contribution. Start small and connect it to what you're learning.
          </p>
          <button className="button primary" onClick={() => showForm()}>
            Capture my first idea
          </button>
        </div>
      )}
    </section>
  );
}
