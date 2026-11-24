import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Circle,
  Clock3,
  Code2,
  Download,
  Flag,
  Github,
  Lightbulb,
  Play,
  RefreshCw,
  Square,
  Terminal,
} from "lucide-react";
import type { Status } from "../shared";
import type { Exercise, PracticeTask, Practice } from "../server/practice";
import type { Candidate, Contribution } from "../server/live-work";
import type { CommandRecord } from "../server/project-runtime";
import "./practical.css";
import { PersonalPath } from "./learning-path";
import {
  projectKinds,
  projectLabels,
  pythonProfiles,
  pythonProfileLabels,
  type ProjectKind,
  type PythonProfile,
  practiceLanguage,
} from "../project-types";
import type { Diagnostics } from "../shared";
type Api = <T>(route: string, body?: unknown) => Promise<T>;
type Dashboard = ReturnType<Practice["dashboard"]>;
function useAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return {
    busy,
    error,
    run: async (fn: () => Promise<void>) => {
      setBusy(true);
      setError("");
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Try again.");
      } finally {
        setBusy(false);
      }
    },
  };
}
export function PracticePrompt({
  api,
  courseId,
  changed,
  onOpen,
  onLive,
  onStart,
  quietAfterTask,
  onOpportunity,
}: {
  api: Api;
  courseId?: string;
  changed?: unknown;
  onOpen: () => void;
  onLive?: () => void;
  onStart?: (exerciseId: string) => Promise<void>;
  quietAfterTask?: boolean;
  onOpportunity?: (available: boolean) => void;
}) {
  const [data, setData] = useState<Dashboard>();
  const action = useAction();
  useEffect(() => {
    let live = true;
    api<Dashboard>(
      `practice${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ""}`,
    )
      .then((r) => {
        if (live) setData(r);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [courseId, changed]);
  const suggestion = data?.opportunities[0],
    exercise = data?.exercises.find((e) => e.id === suggestion?.exerciseId);
  const liveSuggestion = data?.liveOpportunities[0];
  const hasActiveTask = !!data?.tasks.some((t) => t.status === "active");
  const quiet = !!(
    quietAfterTask && data?.tasks.some((t) => t.status === "completed")
  );
  const available =
    !hasActiveTask &&
    !quiet &&
    !!((suggestion && exercise) || (liveSuggestion && onLive));
  useEffect(() => {
    onOpportunity?.(available);
  }, [available, onOpportunity]);
  if (hasActiveTask || quiet) return null;
  if ((!suggestion || !exercise) && liveSuggestion && onLive)
    return (
      <section className="practice-prompt">
        <Github size={18} />
        <div>
          <small>A useful moment for real work</small>
          <h3>Explore your first contribution.</h3>
          <p>{liveSuggestion.reason}</p>
        </div>
        <div className="prompt-actions">
          <button className="button primary" onClick={onLive}>
            Explore live work <ArrowRight size={14} />
          </button>
          <button
            className="text-button"
            onClick={() =>
              void api("practice-defer", {
                key: liveSuggestion.key,
                days: 1,
              }).then(() => setData(undefined))
            }
          >
            Later
          </button>
        </div>
      </section>
    );
  if (!suggestion || !exercise) return null;
  return (
    <section
      className="practice-prompt"
      aria-label="Practical learning opportunity"
    >
      <Lightbulb size={18} />
      <div>
        <small>A useful moment to build</small>
        <h3>{exercise.title}</h3>
        <p>{suggestion.reason}</p>
        <span>
          {exercise.minutes} minutes · {exercise.kind} ·{" "}
          {suggestion.courseTitle}
        </span>
      </div>
      <div className="prompt-actions">
        <button
          className="button primary"
          disabled={action.busy}
          onClick={() =>
            onStart ? void action.run(() => onStart(exercise.id)) : onOpen()
          }
        >
          {onStart ? "Try it here" : "Explore task"} <ArrowRight size={14} />
        </button>
        {liveSuggestion && onLive && (
          <button className="text-button" onClick={onLive}>
            Or explore live work
          </button>
        )}
        <button
          className="text-button"
          disabled={action.busy}
          onClick={() =>
            void action.run(async () => {
              await api("practice-defer", { key: suggestion.key, days: 1 });
              setData(undefined);
            })
          }
        >
          Later
        </button>
      </div>
      {action.error && <p role="alert">{action.error}</p>}
    </section>
  );
}
export function LearningHub({
  state,
  api,
  onCode,
  onRefresh,
  initialTab = "practice",
  target,
}: {
  state: Status;
  api: Api;
  onCode: (id: string) => void;
  onRefresh: () => Promise<unknown>;
  initialTab?: string;
  target?: { courseId?: string; id?: string };
}) {
  const [data, setData] = useState<Dashboard>(),
    [courseId, setCourseId] = useState(
      target?.courseId || state.session?.courseId || state.courses[0]?.id || "",
    ),
    [tab, setTab] = useState(initialTab),
    [selected, setSelected] = useState<PracticeTask>(),
    [reflection, setReflection] = useState("");
  const [languageFilter, setLanguageFilter] = useState("course");
  const [ideaOffset, setIdeaOffset] = useState(0);
  const action = useAction();
  const [memoryQuery, setMemoryQuery] = useState(""),
    [memory, setMemory] = useState<ReturnType<Practice["search"]>>([]);
  const load = async () => setData(await api<Dashboard>("practice"));
  useEffect(() => {
    void load().catch(() => {});
  }, [state.checkpoints.length]);
  useEffect(() => {
    setReflection(selected?.reflection || "");
  }, [selected?.id]);
  useEffect(() => {
    const task = data?.tasks.find((item) => item.id === target?.id);
    if (task && initialTab !== "reviews") setSelected(task);
  }, [data, initialTab, target?.id]);
  const spec = data?.exercises.find((e) => e.id === selected?.exerciseId);
  const start = (id: string, reviewOf?: string, transferOf?: string) =>
    action.run(async () => {
      const task = await api<PracticeTask>("practice-start", {
        courseId,
        exerciseId: id,
        reviewOf,
        transferOf,
      });
      await onRefresh();
      setSelected(task);
      await load();
      onCode(courseId);
    });
  const tasks = data?.tasks.filter((t) => t.courseId === courseId) || [];
  const selectedLanguage =
    languageFilter === "course"
      ? practiceLanguage(
          state.courses.find((c) => c.id === courseId)?.title || "",
        )
      : languageFilter === "all"
        ? undefined
        : languageFilter;
  const completed = new Set(
    tasks
      .filter((task) => task.status === "completed")
      .map((task) => task.exerciseId),
  );
  const catalog =
    data?.exercises
      .filter(
        (e) =>
          !e.transferFrom &&
          !e.retired &&
          (languageFilter === "course" ||
            !selectedLanguage ||
            e.language === selectedLanguage) &&
          (data.verifiedPracticals[e.language] || 0) >=
            (e.requiresPracticals || 0) &&
          e.kind === (tab === "projects" ? "project" : "practice"),
      )
      .sort(
        (a, b) =>
          Number(b.id === target?.id) - Number(a.id === target?.id) ||
          Number(b.language === selectedLanguage) -
            Number(a.language === selectedLanguage) ||
          Number(completed.has(a.id)) - Number(completed.has(b.id)) ||
          (b.requiresPracticals || 0) - (a.requiresPracticals || 0),
      ) || [];
  const offset = catalog.length ? ideaOffset % catalog.length : 0;
  const ideas = [...catalog.slice(offset), ...catalog.slice(0, offset)].slice(
    0,
    3,
  );
  const opportunity = data?.opportunities.find((o) => o.courseId === courseId);
  return (
    <div className="learning-hub">
      <div className="page-heading">
        <h1>Learn by doing.</h1>
      </div>
      <div className="learning-controls">
        <select
          aria-label="Practical learning course"
          value={courseId}
          onChange={(e) => {
            setCourseId(e.target.value);
            setSelected(undefined);
            setIdeaOffset(0);
          }}
        >
          {state.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <select
          aria-label="Practice language"
          value={languageFilter}
          onChange={(e) => {
            setLanguageFilter(e.target.value);
            setIdeaOffset(0);
          }}
        >
          <option value="course">For this course</option>
          <option value="all">All languages</option>
          {["javascript", "typescript", "python", "c", "cpp"].map(
            (language) => (
              <option key={language} value={language}>
                {
                  {
                    javascript: "JavaScript",
                    typescript: "TypeScript",
                    python: "Python",
                    c: "C",
                    cpp: "C++",
                  }[language]
                }
              </option>
            ),
          )}
        </select>
        <button
          className="text-button"
          onClick={() =>
            action.run(async () => {
              const exported = await api("learning-export");
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(exported, null, 2)], {
                  type: "application/json",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "gitlearn-learning.json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            })
          }
        >
          <Download size={14} />
          Export learning
        </button>
      </div>
      {action.error && (
        <div className="alert error" role="alert">
          {action.error}
        </div>
      )}
      <div
        className="learning-tabs"
        role="tablist"
        aria-label="Practical learning views"
      >
        {["path", "practice", "projects", "reviews"].map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => {
              setTab(t);
              setSelected(undefined);
              setIdeaOffset(0);
            }}
          >
            {t === "path" ? "My direction" : t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab !== "reviews" && opportunity && (
        <div className="learning-reason">
          <Lightbulb size={16} />
          <p>
            {opportunity.reason} These are curated transfer tasks; the course
            remains available throughout.
          </p>
        </div>
      )}
      {tab === "path" ? (
        <PersonalPath
          courseId={courseId}
          api={api}
          onCode={() => onCode(courseId)}
          onRefresh={onRefresh}
          active={state.session?.courseId === courseId}
        />
      ) : !state.courses.length ? (
        <div className="learning-empty">
          <BookOpen size={26} />
          <h2>Bring a course, then make it yours.</h2>
          <p>Add your first course from My courses.</p>
        </div>
      ) : tab === "reviews" ? (
        <>
          <label className="review-preference">
            <input
              type="checkbox"
              checked={data?.reviewEnabled ?? true}
              onChange={(e) =>
                action.run(async () => {
                  await api("practice-reviews", { enabled: e.target.checked });
                  await load();
                })
              }
            />
            Show short review suggestions
          </label>
          <p className="learning-caption">
            Revisit a fresh attempt without the old solution. Results describe
            the checked behavior; outside assistance and broader proficiency are
            not measured.
          </p>
          <form
            className="issue-input"
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(async () => {
                const r = await api<{
                  results: ReturnType<Practice["search"]>;
                }>(`learning-search?q=${encodeURIComponent(memoryQuery)}`);
                setMemory(r.results);
              });
            }}
          >
            <input
              aria-label="Search my learning"
              value={memoryQuery}
              onChange={(e) => setMemoryQuery(e.target.value)}
              placeholder="Search your past attempts, explanations, and skills across courses"
            />
            <button>Search my learning</button>
          </form>
          {memory.map((item) => (
            <details className="memory-result" key={item.taskId}>
              <summary>
                {item.title} · {item.courseTitle}
              </summary>
              <p>{item.reflection || "No reflection recorded."}</p>
              {item.attempt && (
                <>
                  <small>
                    {new Date(item.attempt.at).toLocaleString()} ·{" "}
                    {item.attempt.passed
                      ? "Recorded checks passed"
                      : "Needs more work"}{" "}
                    · entry hash {item.attempt.fileVersion.slice(0, 12)}
                  </small>
                  <pre>
                    {item.attempt.source ||
                      "Saved source is unavailable for this older attempt."}
                  </pre>
                  {item.attempt.sourceTruncated && (
                    <small>Source excerpt truncated.</small>
                  )}
                </>
              )}
            </details>
          ))}
          {data?.reviewEnabled &&
            data.reviews
              .filter((r) => r.courseId === courseId)
              .sort((a, b) => Number(b.taskId === target?.id) - Number(a.taskId === target?.id) || a.dueAt.localeCompare(b.dueAt))
              .map((review) => {
                const task = data.tasks.find((t) => t.id === review.taskId)!;
                return (
                  <div className="learning-row" key={review.taskId}>
                    <Clock3 size={18} />
                    <div>
                      <h3>{review.title}</h3>
                      <p>
                        {Date.parse(review.dueAt) <= Date.now()
                          ? "Ready for a short review"
                          : `Next review ${new Date(review.dueAt).toLocaleDateString()}`}{" "}
                        · recorded attempt {review.evidenceId.slice(0, 8)}
                      </p>
                    </div>
                    <button
                      className="text-button"
                      disabled={action.busy}
                      onClick={() => start(task.exerciseId, task.id)}
                    >
                      Try again <ArrowRight size={14} />
                    </button>
                  </div>
                );
              })}
          {!data?.reviews.some((r) => r.courseId === courseId) && (
            <div className="learning-empty">
              <Clock3 size={25} />
              <h2>Memory grows from work.</h2>
              <p>
                Complete a practical task to create your first review and skill
                record.
              </p>
            </div>
          )}
          {data && !data.reviewEnabled && (
            <p className="learning-caption">
              Review suggestions are paused. Your learning records remain
              available.
            </p>
          )}
          {data?.skills
            .filter((s) => s.courseId === courseId)
            .map((skill) => (
              <div className="skill-record" key={skill.taskId}>
                <Check size={15} />
                <div>
                  <strong>{skill.skill}</strong>
                  <p>
                    {skill.assistance} · evidence {skill.evidence.slice(0, 8)}
                  </p>
                </div>
              </div>
            ))}
        </>
      ) : (
        <div className="learning-grid">
          <section className="learning-list">
            {!!tasks.length && (
              <>
                <div className="learning-section-label">Your attempts</div>
                {tasks.map((task) => (
                  <button
                    className={`learning-row task-row ${selected?.id === task.id ? "selected" : ""}`}
                    key={task.id}
                    onClick={() => setSelected(task)}
                  >
                    {task.status === "completed" ? (
                      <Check size={17} />
                    ) : (
                      <Circle size={17} />
                    )}
                    <div>
                      <h3>
                        {
                          data?.exercises.find((e) => e.id === task.exerciseId)
                            ?.title
                        }
                      </h3>
                      <p>
                        {task.status} · {task.attempts.length} recorded checks ·{" "}
                        {task.hints} help requests
                      </p>
                    </div>
                    <ChevronRight size={14} />
                  </button>
                ))}
              </>
            )}
            <div className="learning-section-label learning-ideas-heading">
              <span>{tab === "projects" ? "Projects" : "Practice ideas"}</span>
              {catalog.length > 3 && (
                <button
                  className="text-button"
                  onClick={() => setIdeaOffset((current) => current + 3)}
                >
                  <RefreshCw size={13} /> More ideas
                </button>
              )}
            </div>
            {!ideas.length && data && (
              <p className="learning-caption">
                {tab === "projects"
                  ? "Pass two different practicals in a language to unlock its advanced project."
                  : "No practicals match this language."}
              </p>
            )}
            {ideas.map((exercise) => (
              <div className="learning-row" key={exercise.id}>
                <Flag size={17} />
                <div>
                  <h3>{exercise.title}</h3>
                  <p>
                    {exercise.language} · {exercise.minutes} minutes ·{" "}
                    {exercise.requiresPracticals ? "Advanced · " : ""}
                    {exercise.skill}
                  </p>
                </div>
                <button
                  className="text-button"
                  disabled={action.busy}
                  onClick={() => start(exercise.id)}
                >
                  Start <ArrowRight size={14} />
                </button>
              </div>
            ))}
          </section>
          <aside className="learning-detail">
            {selected && spec ? (
              <>
                <small>
                  {spec.kind} · {spec.language}
                </small>
                <h2>{spec.title}</h2>
                <p>{spec.brief}</p>
                {selected.status === "completed" &&
                  !selected.transferOf &&
                  data?.exercises.some((e) => e.transferFrom === spec.id) && (
                    <div className="path-next">
                      <h3>Can you use it differently?</h3>
                      <p>
                        Try a fresh file with a changed requirement. Your
                        earlier solution remains saved.
                      </p>
                      <button
                        className="button primary"
                        disabled={action.busy}
                        onClick={() =>
                          start(
                            data.exercises.find(
                              (e) => e.transferFrom === spec.id,
                            )!.id,
                            undefined,
                            selected.id,
                          )
                        }
                      >
                        Try the changed requirement <ArrowRight size={14} />
                      </button>
                    </div>
                  )}
                <div className="learning-section-label">
                  Acceptance criteria
                </div>
                <ul>
                  {spec.requirements.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                {selected.attempts[0] && (
                  <>
                    <div className="learning-section-label">
                      Latest saved attempt
                    </div>
                    {selected.attempts[0].checks.map((c) => (
                      <div
                        className={`behavior-check ${c.passed ? "passed" : ""}`}
                        key={c.label}
                      >
                        {c.passed ? <Check size={13} /> : <Circle size={13} />}
                        <span>{c.label}</span>
                      </div>
                    ))}
                    {selected.attempts[0].stale && (
                      <p>
                        The entry file changed during checks. Run them again.
                      </p>
                    )}
                  </>
                )}
                <label>
                  Explain your approach
                  <textarea
                    value={reflection}
                    onChange={(e) => setReflection(e.target.value)}
                    placeholder="What did you choose, and what would you change next?"
                    maxLength={4000}
                  />
                </label>
                <button
                  className="button"
                  disabled={action.busy}
                  onClick={() =>
                    action.run(async () => {
                      const task = await api<PracticeTask>("practice-update", {
                        taskId: selected.id,
                        action: "reflection",
                        reflection,
                      });
                      setSelected(task);
                      await load();
                    })
                  }
                >
                  Save reflection
                </button>
                {selected.status !== "completed" && (
                  <button
                    className="text-button"
                    disabled={action.busy}
                    onClick={() =>
                      action.run(async () => {
                        setSelected(
                          await api("practice-update", {
                            taskId: selected.id,
                            action:
                              selected.status === "active" ? "pause" : "resume",
                          }),
                        );
                        await load();
                      })
                    }
                  >
                    {selected.status === "active"
                      ? "Pause this task"
                      : "Resume this task"}
                  </button>
                )}
                <button
                  className="button primary"
                  onClick={() =>
                    action.run(async () => {
                      if (!state.session) await api("continue", { courseId });
                      await onRefresh();
                      onCode(courseId);
                    })
                  }
                >
                  Open code & teacher <ArrowRight size={14} />
                </button>
              </>
            ) : (
              <>
                <div className="learning-detail-mark">
                  <Flag size={28} />
                </div>
                <h2>Build a skill</h2>
                <p>
                  Pass two different practicals in one language to unlock its
                  advanced project.
                </p>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
export function TaskGuide({
  api,
  sessionId,
  courseId,
  workspace,
  beforeCheck,
  onAsk,
  changed,
  onChanged,
  onOpenFile,
  onPath,
  onWorking,
  blocked,
}: {
  api: Api;
  sessionId: string;
  courseId: string;
  workspace: string;
  beforeCheck: () => Promise<void>;
  onAsk: (q: string) => void;
  changed?: unknown;
  onChanged?: (path?: string) => Promise<void>;
  onOpenFile?: (path: string) => void;
  onPath?: () => void;
  onWorking?: (working: boolean) => void;
  blocked?: boolean;
}) {
  const [data, setData] = useState<Dashboard>(),
    [hint, setHint] = useState(""),
    [reflection, setReflection] = useState(""),
    [expanded, setExpanded] = useState(true),
    [notice, setNotice] = useState("");
  const action = useAction();
  useEffect(() => {
    onWorking?.(action.busy);
    return () => onWorking?.(false);
  }, [action.busy, onWorking]);
  const load = async () =>
    setData(await api(`practice?courseId=${encodeURIComponent(courseId)}`));
  useEffect(() => {
    void load().catch(() => {});
    setHint("");
  }, [sessionId, changed]);
  const task =
    data?.tasks.find(
      (t) => t.workspace === workspace && t.status === "active",
    ) ||
    data?.tasks.find(
      (t) => t.workspace === workspace && t.status === "completed",
    );
  const spec = data?.exercises.find((e) => e.id === task?.exerciseId);
  useEffect(() => {
    setReflection(task?.reflection || "");
    setNotice("");
    setHint("");
  }, [task?.id]);
  if (!task || !spec || !data) return null;
  return (
    <details
      className="task-guide"
      open={expanded}
      onToggle={(e) => setExpanded(e.currentTarget.open)}
    >
      <summary>
        <Flag size={13} />
        <span>{spec.title}</span>
        <small>
          {task.status === "completed"
            ? "Checks passed"
            : `${spec.minutes} min · practical task`}
        </small>
      </summary>
      <div className="task-guide-content">
        <ol className="learning-loop" aria-label="Your practice steps">
          {["Try", "Check", "Reflect", "Transfer"].map((step, i) => {
            const current =
              task.status !== "completed"
                ? task.attempts.length
                  ? 1
                  : 0
                : !task.reflection
                  ? 2
                  : 3;
            return (
              <li
                key={step}
                aria-current={i === current ? "step" : undefined}
                className={i < current ? "done" : ""}
              >
                <span>{i < current ? <Check size={11} /> : i + 1}</span>
                {step}
              </li>
            );
          })}
        </ol>
        {task.status === "active" && (
          <>
            <p>{spec.brief}</p>
            <ul>
              {spec.requirements.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </>
        )}
        <div className="task-guide-actions">
          {onOpenFile && (
            <button onClick={() => onOpenFile(task.path)}>
              <Code2 size={13} /> Open task file
            </button>
          )}
          {task.status === "active" && (
            <>
              <button
                disabled={action.busy || blocked || task.status !== "active"}
                onClick={() =>
                  action.run(async () => {
                    await beforeCheck();
                    await api("practice-check", { taskId: task.id, sessionId });
                    await load();
                    await onChanged?.();
                  })
                }
              >
                <Check size={13} />
                Check my work
              </button>
              <button
                disabled={action.busy || task.status !== "active"}
                onClick={() =>
                  action.run(async () => {
                    const r = await api<{ hint: string }>("practice-hint", {
                      taskId: task.id,
                    });
                    setHint(r.hint);
                    await load();
                  })
                }
              >
                <Lightbulb size={13} />
                Next hint
              </button>
            </>
          )}
          <button
            onClick={() =>
              onAsk(
                `Help me reason about ${spec.title}. Ask me one diagnostic question based on my current approach. Do not write the solution.`,
              )
            }
          >
            Ask my teacher <ArrowRight size={13} />
          </button>
        </div>
        {hint && (
          <p className="guided-hint" role="status">
            {hint}
          </p>
        )}
        {action.error && <p role="alert">{action.error}</p>}
        {task.attempts[0] && (
          <details
            className="task-check-evidence"
            open={task.status === "active" || undefined}
          >
            <summary>
              {task.status === "completed"
                ? "View recorded checks"
                : "Latest recorded checks"}
            </summary>
            <div className="inline-checks">
              {task.attempts[0].checks.map((c) => (
                <span key={c.label} className={c.passed ? "passed" : ""}>
                  {c.passed ? <Check size={12} /> : <Circle size={12} />}{" "}
                  {c.label}
                </span>
              ))}
              {task.attempts[0].output && <pre>{task.attempts[0].output}</pre>}
            </div>
          </details>
        )}
        {task.status === "completed" && (
          <div className="task-completion">
            <h4>
              <Check size={14} /> Your recorded checks passed.
            </h4>
            <p>
              Explain one decision you made and what a different input would
              change. Passing these cases is a starting point for independent
              work.
            </p>
            <label>
              Task reflection
              <textarea
                aria-label="Task reflection"
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                maxLength={4000}
                placeholder="Why does your approach work? What would you test next?"
              />
            </label>
            <div className="task-guide-actions">
              <button
                disabled={action.busy || !reflection.trim()}
                onClick={() =>
                  void action.run(async () => {
                    await api("practice-update", {
                      taskId: task.id,
                      action: "reflection",
                      reflection,
                    });
                    await load();
                    setNotice("Reflection saved in your learning history.");
                    await onChanged?.();
                  })
                }
              >
                Save task reflection
              </button>
              {data.exercises.find((e) => e.transferFrom === spec.id) &&
                !data.tasks.some((t) => t.transferOf === task.id) && (
                  <button
                    className="primary"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(async () => {
                        const next = await api<PracticeTask>("practice-start", {
                          courseId,
                          exerciseId: data.exercises.find(
                            (e) => e.transferFrom === spec.id,
                          )!.id,
                          transferOf: task.id,
                        });
                        await load();
                        await onChanged?.(next.path);
                      })
                    }
                  >
                    Try a changed requirement <ArrowRight size={13} />
                  </button>
                )}
              {onPath && (
                <button onClick={onPath}>
                  Apply it to my project <ArrowRight size={13} />
                </button>
              )}
            </div>
            {notice && <p role="status">{notice}</p>}
          </div>
        )}
      </div>
    </details>
  );
}
export function ProjectConsole({
  embedded = false,
  api,
  sessionId,
  onRunning,
  onFilesChanged,
  beforeCommand,
  onAsk,
}: {
  embedded?: boolean;
  api: Api;
  sessionId: string;
  onRunning: (running: boolean) => void;
  onFilesChanged: () => Promise<unknown>;
  beforeCommand?: () => Promise<void>;
  onAsk?: (question: string) => void;
}) {
  const [expanded, setOpen] = useState(false),
    [commands, setCommands] = useState<CommandRecord[]>([]),
    [command, setCommand] = useState("node --test"),
    [input, setInput] = useState(""),
    [port, setPort] = useState("5173");
  const open = embedded || expanded;
  const [kind, setKind] = useState<ProjectKind>("react-ts"),
    [profile, setProfile] = useState<PythonProfile>("minimal"),
    [diagnostics, setDiagnostics] = useState<Diagnostics>();
  const action = useAction();
  const [scaffold, setScaffold] = useState<{
    directory: string;
    install: string;
    start: string;
    check: string;
    dependencies: string;
    note: string;
    port?: number;
  }>();
  const load = async () => {
    const r = await api<{ commands: CommandRecord[] }>(
      `project-commands?sessionId=${sessionId}`,
    );
    setCommands(r.commands);
    onRunning(r.commands.some((c) => c.state === "running"));
  };
  useEffect(() => {
    void api<Diagnostics>("diagnostics")
      .then(setDiagnostics)
      .catch(() => {});
  }, [sessionId]);
  useEffect(() => {
    let live = true;
    const poll = () => {
      if (live) void load().catch(() => {});
    };
    poll();
    const timer = setInterval(poll, open ? 800 : 3000);
    return () => {
      live = false;
      clearInterval(timer);
      onRunning(false);
    };
  }, [sessionId, open]);
  const latest = commands[0],
    running = commands.find((c) => c.state === "running");
  return (
    <details
      className={`project-console ${embedded ? "embedded" : ""}`}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <Terminal size={13} />
        Project console{" "}
        <small>
          {running
            ? "Running"
            : latest?.state || "Commands, input & app preview"}
        </small>
      </summary>
      <div className="project-console-content">
        <p>
          Commands run locally in your project folder. Review the command before
          running it. Programs can accept line input; full-screen terminal
          programs need an external terminal.
        </p>
        <div className="command-presets">
          <select
            aria-label="Project technology"
            value={kind}
            onChange={(e) => setKind(e.target.value as ProjectKind)}
          >
            {projectKinds.map((k) => (
              <option key={k} value={k}>
                {projectLabels[k]}
              </option>
            ))}
          </select>
          {kind === "python" && (
            <select
              aria-label="Python packages"
              value={profile}
              onChange={(e) => setProfile(e.target.value as PythonProfile)}
            >
              {pythonProfiles.map((p) => (
                <option key={p} value={p}>
                  {pythonProfileLabels[p]}
                </option>
              ))}
            </select>
          )}
          <button
            disabled={action.busy || !!running}
            onClick={() =>
              action.run(async () => {
                const result = await api<{
                  directory: string;
                  install: string;
                  start: string;
                  check: string;
                  dependencies: string;
                  note: string;
                  port?: number;
                }>("project-scaffold", { sessionId, kind, profile });
                setScaffold(result);
                setCommand(result.install);
                if (result.port) setPort(String(result.port));
                await onFilesChanged();
              })
            }
          >
            Create project
          </button>
          {["node --test", "python -m venv .venv"].map((c) => (
            <button key={c} onClick={() => setCommand(c)}>
              {c}
            </button>
          ))}
          <button onClick={() => setCommand("npm install")}>
            Install npm dependencies
          </button>
          <button onClick={() => setCommand("npm run dev -- --host 127.0.0.1")}>
            Start dev server
          </button>
        </div>
        {diagnostics && (
          <p className="toolchain-status">
            Node {diagnostics.nodeVersion} · Python{" "}
            {diagnostics.pythonAvailable ? "available" : "needs installation"} ·
            npm {diagnostics.npmAvailable ? "available" : "needs installation"}{" "}
            · C {diagnostics.cCompiler || "needs GCC/Clang"} · C++{" "}
            {diagnostics.cppCompiler || "needs G++/Clang++"}
            <button
              onClick={() =>
                action.run(async () =>
                  setDiagnostics(await api<Diagnostics>("diagnostics")),
                )
              }
            >
              Recheck tools
            </button>
          </p>
        )}
        {scaffold && (
          <p role="status">
            Created {scaffold.directory}.{" "}
            <button onClick={() => setCommand(scaffold.install)}>
              Prepare environment
            </button>{" "}
            ·{" "}
            {scaffold.dependencies && (
              <>
                <button onClick={() => setCommand(scaffold.dependencies)}>
                  Install packages
                </button>{" "}
                ·{" "}
              </>
            )}
            <button onClick={() => setCommand(scaffold.check)}>
              Check/build project
            </button>{" "}
            ·{" "}
            <button onClick={() => setCommand(scaffold.start)}>
              Start project
            </button>
            . {scaffold.note}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              await beforeCommand?.();
              await api("project-command", { sessionId, command });
              await load();
            });
          }}
        >
          <input
            aria-label="Project command"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            maxLength={2000}
          />
          <button disabled={action.busy || !!running}>
            <Play size={13} />
            Run command
          </button>
          {running && (
            <button
              type="button"
              onClick={() =>
                action.run(async () => {
                  await api("project-stop", { id: running.id });
                  await load();
                })
              }
            >
              <Square size={13} />
              Stop command
            </button>
          )}
        </form>
        {latest && (
          <>
            <div className="command-status">
              <code>{latest.command}</code>
              <span>
                {latest.state}
                {latest.exitCode !== null ? ` · exit ${latest.exitCode}` : ""}
                {latest.truncated ? " · recent output only" : ""}
              </span>
            </div>
            <pre className="command-output" aria-label="Project command output">
              {latest.output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "") ||
                "Waiting for output…"}
            </pre>
            {onAsk && latest.state !== "running" && latest.exitCode !== 0 && (
              <button
                className="command-teacher"
                onClick={() =>
                  onAsk(
                    "Help me understand the latest recorded project command. Give me one diagnostic question and a small experiment; leave the changes to me.",
                  )
                }
              >
                Understand this result with OffCourse <ArrowRight size={13} />
              </button>
            )}
            {latest.regression && (
              <div className="alert error" role="alert">
                <strong>Regression Alert</strong>
                <p>
                  This command passed in an earlier lesson and now fails.
                  Inspect the diff and rerun the earlier checks before adding
                  more features.
                </p>
                <small>
                  Changed files:{" "}
                  {latest.regression.changedFiles.join(", ") ||
                    "No tracked source change detected"}{" "}
                  · baseline {latest.regression.baselineId.slice(0, 8)}
                </small>
              </div>
            )}
          </>
        )}
        {running && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(async () => {
                await api("project-input", { id: running.id, text: input });
                setInput("");
              });
            }}
          >
            <input
              aria-label="Program input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Send a line to the running program"
            />
            <button>Send input</button>
          </form>
        )}
        <div className="app-preview-control">
          <label>
            Local app port
            <input
              aria-label="Local application port"
              type="number"
              min={1024}
              max={65535}
              value={port}
              onChange={(e) => setPort(e.target.value)}
            />
          </label>
          {Number(port) >= 1024 && Number(port) <= 65535 && (
            <a
              href={`http://127.0.0.1:${Number(port)}/`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open local app <ArrowUpRight size={13} />
            </a>
          )}
        </div>
        {action.error && <p role="alert">{action.error}</p>}
      </div>
    </details>
  );
}
export function LiveWorkHub({
  state,
  api,
  onCode,
  onRefresh,
}: {
  state: Status;
  api: Api;
  onCode: (id: string) => void;
  onRefresh: () => Promise<unknown>;
}) {
  const [data, setData] = useState<{
      contributions: Contribution[];
      shortlist: Candidate[];
      lastSearch?: { at: string; rationale: string };
    }>(),
    [language, setLanguage] = useState("JavaScript"),
    [courseId, setCourseId] = useState(
      state.session?.courseId || state.courses[0]?.id || "",
    ),
    [url, setUrl] = useState(""),
    [selected, setSelected] = useState<Contribution>(),
    [notes, setNotes] = useState(""),
    [stages, setStages] = useState<string[]>([]),
    [draft, setDraft] = useState<{ text: string; diff: string }>();
  const action = useAction();
  const load = async () => setData(await api("live-work"));
  useEffect(() => {
    void load().catch(() => {});
  }, []);
  useEffect(() => {
    setNotes(selected?.notes || "");
    setStages(selected?.stages || []);
    setDraft(undefined);
  }, [selected?.id]);
  const select = (value: string) =>
    action.run(async () => {
      setSelected(await api("live-select", { courseId, url: value }));
      await load();
    });
  return (
    <div className="learning-hub live-work-hub">
      <div className="page-heading">
        <div className="eyebrow">Learn in the real world</div>
        <h1>Your first useful contribution.</h1>
        <p>
          Understand a real issue. Make your own change. Learn through review.
        </p>
      </div>
      <div className="learning-controls">
        <select
          aria-label="Contribution learning course"
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
        >
          {state.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <select
          aria-label="Contribution language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          {["JavaScript", "Python", "TypeScript", "C", "C++"].map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
        <button
          className="button"
          disabled={action.busy}
          onClick={() =>
            action.run(async () => {
              setData(await api("live-search", { language, courseId }));
            })
          }
        >
          <RefreshCw size={14} />
          Find opportunities
        </button>
      </div>
      {action.error && (
        <div className="alert error" role="alert">
          {action.error}
        </div>
      )}
      <form
        className="issue-input"
        onSubmit={(e) => {
          e.preventDefault();
          void select(url);
        }}
      >
        <input
          aria-label="GitHub issue URL"
          placeholder="Or bring a github.com/owner/repo/issues/123 URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button disabled={action.busy || !courseId}>
          Inspect issue <ArrowRight size={14} />
        </button>
      </form>
      {data?.lastSearch && (
        <div className="learning-reason">
          <Github size={18} />
          <div>
            <p>{data.lastSearch.rationale}</p>
            <small>
              Checked {new Date(data.lastSearch.at).toLocaleString()} · public
              GitHub metadata · suitability needs your review
            </small>
          </div>
        </div>
      )}
      <div className="learning-grid">
        <section className="learning-list">
          <div className="learning-section-label">Your contribution desk</div>
          {data?.contributions.map((record) => (
            <button
              className="learning-row task-row"
              key={record.id}
              onClick={() => setSelected(record)}
            >
              <Github size={18} />
              <div>
                <h3>{record.candidate.title}</h3>
                <p>
                  {record.candidate.repo} ·{" "}
                  {record.root ? "Workspace ready" : "Brief saved"}
                </p>
              </div>
              <ChevronRight size={14} />
            </button>
          ))}
          <div className="learning-section-label">
            Explore checked opportunities
          </div>
          {data?.shortlist.map((c) => (
            <div className="opportunity-row" key={c.url}>
              <small>
                {c.repo} · {c.language} · {c.license}
              </small>
              <h3>
                <a href={c.url} target="_blank" rel="noreferrer">
                  {c.title} <ArrowUpRight size={13} />
                </a>
              </h3>
              <p>{c.signals.join(" · ")}</p>
              {c.fit && (
                <>
                  <p>{c.fit.reason}</p>
                  {!!c.fit.evidence.length && (
                    <small>
                      Related attempts:{" "}
                      {c.fit.evidence.map((e) => e.skill).join(", ")}
                    </small>
                  )}
                </>
              )}
              <button
                className="text-button"
                disabled={action.busy || !courseId}
                onClick={() => select(c.url)}
              >
                Inspect & plan <ArrowRight size={13} />
              </button>
            </div>
          ))}
          {!data?.shortlist.length && (
            <div className="learning-empty">
              <Github size={25} />
              <h2>Start with understanding.</h2>
              <p>
                Find checked issues or bring one yourself. Documentation,
                reproduction, and tests can be useful practical work early in a
                course.
              </p>
            </div>
          )}
        </section>
        <aside className="learning-detail">
          {selected ? (
            <>
              <small>
                {selected.candidate.repo} · issue #{selected.candidate.number}
              </small>
              <h2>{selected.candidate.title}</h2>
              <small>
                {selected.candidate.closed
                  ? "Closed"
                  : selected.candidate.archived
                    ? "Repository archived"
                    : "Open when checked"}{" "}
                · {new Date(selected.candidate.checkedAt).toLocaleString()}
              </small>
              <button
                className="text-button"
                disabled={action.busy}
                onClick={() =>
                  action.run(async () => {
                    setSelected(await api("live-refresh", { id: selected.id }));
                    await load();
                  })
                }
              >
                Recheck issue & discussion <RefreshCw size={12} />
              </button>
              <p className="issue-body">{selected.candidate.body}</p>
              <a href={selected.candidate.url} target="_blank" rel="noreferrer">
                Read the full issue <ArrowUpRight size={13} />
              </a>
              <div className="learning-section-label">Contributor sources</div>
              {selected.candidate.sources.map((s) => (
                <details className="contributor-source" key={s.url}>
                  <summary>{s.title}</summary>
                  <pre>{s.text}</pre>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    Upstream source · {s.revision.slice(0, 8)}
                  </a>
                </details>
              ))}
              <ul>
                {selected.candidate.cautions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <div className="learning-section-label">
                Your contribution path
              </div>
              {!!selected.candidate.discussion?.length && (
                <details className="contributor-source">
                  <summary>
                    Discussion excerpts from the checked first 100 comments
                  </summary>
                  {selected.candidate.discussion.map((comment) => (
                    <div key={comment.url}>
                      <a href={comment.url} target="_blank" rel="noreferrer">
                        {comment.author} ·{" "}
                        {new Date(comment.at).toLocaleDateString()}
                      </a>
                      <p>{comment.text}</p>
                    </div>
                  ))}
                </details>
              )}
              {[
                ["read", "Read requirements & contribution rules"],
                ["baseline", "Set up and run baseline checks"],
                ["reproduce", "Reproduce or understand the issue"],
                ["implement", "Write your own change"],
                ["test", "Run relevant checks"],
                ["review", "Review your diff & limitations"],
              ].map(([key, label]) => (
                <label className="contribution-step" key={key}>
                  <input
                    type="checkbox"
                    checked={stages.includes(key)}
                    onChange={(e) =>
                      setStages(
                        e.target.checked
                          ? [...stages, key]
                          : stages.filter((s) => s !== key),
                      )
                    }
                  />
                  {label}
                </label>
              ))}
              <small>
                Checklist progress is your report. Command results remain
                separate evidence.
              </small>
              <label>
                My plan, findings & review notes
                <textarea
                  maxLength={8000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="What should change? What is uncertain? What did baseline tests show?"
                />
              </label>
              <button
                className="button"
                disabled={action.busy}
                onClick={() =>
                  action.run(async () => {
                    setSelected(
                      await api("live-update", {
                        id: selected.id,
                        notes,
                        stages,
                      }),
                    );
                    await load();
                  })
                }
              >
                Save my plan
              </button>
              {!selected.root && (
                <p className="clone-review">
                  Clone https://github.com/{selected.candidate.repo}.git into a
                  new contributions folder, then create branch gitlearn/issue-
                  {selected.candidate.number}. Setup scripts run only when you
                  choose a command.
                </p>
              )}
              <button
                className="button primary"
                disabled={action.busy}
                onClick={() =>
                  action.run(async () => {
                    await api(selected.root ? "live-open" : "live-clone", {
                      id: selected.id,
                    });
                    await onRefresh();
                    await load();
                    onCode(selected.courseId);
                  })
                }
              >
                {selected.root
                  ? "Continue contribution"
                  : "Clone & open workspace"}
                <ArrowRight size={14} />
              </button>
              {selected.root && (
                <button
                  className="text-button"
                  disabled={action.busy}
                  onClick={() =>
                    action.run(async () => {
                      await api("live-update", {
                        id: selected.id,
                        notes,
                        stages,
                      });
                      setDraft(await api("live-draft", { id: selected.id }));
                    })
                  }
                >
                  Review diff & prepare PR draft <ChevronRight size={14} />
                </button>
              )}
              {draft && (
                <details open className="contribution-draft">
                  <summary>Local PR draft</summary>
                  <pre>{draft.text}</pre>
                  <button
                    className="button"
                    onClick={() =>
                      action.run(async () => {
                        await navigator.clipboard.writeText(draft.text);
                      })
                    }
                  >
                    Copy draft
                  </button>
                  <details>
                    <summary>Inspect current diff</summary>
                    <pre>{draft.diff || "No uncommitted diff."}</pre>
                  </details>
                </details>
              )}
            </>
          ) : (
            <>
              <div className="learning-detail-mark">
                <Github size={30} />
              </div>
              <h2>A teacher beside your work.</h2>
              <p>
                Inspect an issue and its contributor rules. OutClass guides your
                reasoning, setup, reproduction, testing, and review while you
                own the implementation.
              </p>
              <p>
                Finding an issue creates no fork, comment, push, or pull
                request. A contribution starts in its own local folder.
              </p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
