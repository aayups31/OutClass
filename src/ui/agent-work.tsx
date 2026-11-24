import React, { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Play,
  Square,
  Check,
  Download,
  ChevronRight,
  Loader2,
} from "lucide-react";
import type { AgentWork } from "../server/agent-work";
import type { AgentWorkAnswer, AgentWorkRequest } from "../agent-work-contract";
import "./agent-work.css";
type API = <T>(route: string, body?: unknown) => Promise<T>;
type Context = {
  revision: number;
  lessons: { index: number; title: string }[];
  sources: { id: string; title: string }[];
  assets: {
    id: string;
    name: string;
    duration: number;
    transcriptCues?: number;
  }[];
  pinnedLesson: number | null;
};
const working = (phase?: string) =>
  ["queued", "drafting", "checking", "repairing", "applying"].includes(
    phase || "",
  );
const roles = {
  academy: "Atlas",
  creative: "Creative Director",
  growth: "Growth Strategist",
  analytics: "Analytics",
};
const goals = {
  academy:
    "Build a practical assignment with edge-case checks, progressive hints and a transfer challenge for this lesson.",
  creative:
    "Develop a concise teaching preview with a clear opening, useful demonstration and an actionable close.",
  growth:
    "Create distinct, natural posts for the selected channels, grounded in this lesson and the saved audience brief.",
  analytics:
    "Explain what the actual evidence supports, identify the gaps, and propose a bounded experiment with a measure and stopping rule.",
};
const deliveryNames = {
  academy: "Apply assignment to course",
  creative: "Save script & timeline",
  growth: "Prepare channel campaigns",
  analytics: "Save evidence brief",
};
const academyTasks = [
  ["Design an assignment", goals.academy],
  [
    "Strengthen an assignment",
    "Use the saved assignment as a baseline. In the summary identify the most consequential gap and cite the lesson. Preserve effective requirements and replace weak criteria with observable checks. Add debugging hints and an evidence-based reflection.",
  ],
  [
    "Connect to the project",
    "Design or revise the assignment so its output advances the selected lesson’s saved project increment. Explain the connection and how learners can check it. If no increment is defined, flag that gap and propose a small practice task using only the lesson.",
  ],
];
export function AgentWorkPanel({
  domain,
  entity,
  dirty,
  api,
  onApplied,
  preferredLesson,
  forgeRequest,
}: {
  domain: AgentWorkRequest["domain"];
  entity?: { id: string; revision: number };
  dirty: boolean;
  api: API;
  onApplied?: () => Promise<void>;
  preferredLesson?: number;
  forgeRequest?: { kind: "exercise" | "capstone" };
}) {
  const [context, setContext] = useState<Context>(),
    [job, setJob] = useState<AgentWork>(),
    [history, setHistory] = useState<AgentWork[]>([]);
  const [goal, setGoal] = useState(goals[domain]),
    [lesson, setLesson] = useState(0),
    [asset, setAsset] = useState("");
  const [scaffold, setScaffold] = useState<"exercise" | "capstone">();
  useEffect(() => {
    if (forgeRequest) setScaffold(forgeRequest.kind);
  }, [forgeRequest]);
  const [providers, setProviders] = useState<AgentWorkRequest["providers"]>([
    "youtube",
    "linkedin",
    "x",
    "instagram",
  ]);
  const [maxCalls, setMaxCalls] = useState<1 | 2>(2),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [shareTo, setShareTo] = useState<AgentWorkRequest["domain"]>(
    domain === "analytics"
      ? "growth"
      : domain === "academy"
        ? "creative"
        : domain === "creative"
          ? "growth"
          : "analytics",
  );
  const [shareNotice, setShareNotice] = useState("");
  const target = useRef(entity?.id);
  target.current = entity?.id;
  const selected = useRef(job?.id);
  selected.current = job?.id;
  const preferred = useRef(preferredLesson);
  preferred.current = preferredLesson;
  const historyRef = useRef(history);
  historyRef.current = history;
  useEffect(() => {
    if (preferredLesson === undefined) return;
    setLesson(preferredLesson);
    setJob(
      historyRef.current.findLast(
        (row) => row.request.lessonIndex === preferredLesson,
      ),
    );
    setError("");
    setShareNotice("");
  }, [preferredLesson]);
  useEffect(() => {
    let live = true;
    setContext(undefined);
    setJob(undefined);
    setHistory([]);
    setError("");
    setShareNotice("");
    setBusy(false);
    setGoal(goals[domain]);
    setAsset("");
    if (entity)
      void Promise.all([
        api<Context>(
          `expansion/work/context?domain=${domain}&entityId=${entity.id}`,
        ),
        api<AgentWork[]>("expansion/work"),
      ])
        .then(([c, rows]) => {
          if (!live) return;
          setContext(c);
          setLesson(c.pinnedLesson ?? preferred.current ?? 0);
          const own = rows.filter(
            (r) =>
              r.request.entityId === entity.id && r.request.domain === domain,
          );
          setHistory(own);
          setJob(
            own.findLast(
              (r) =>
                preferred.current === undefined ||
                preferred.current === r.request.lessonIndex,
            ),
          );
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [entity?.id, entity?.revision, domain, api]);
  useEffect(() => {
    if (!job || !working(job.phase)) return;
    let live = true,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api<AgentWork>(`expansion/work/${job.id}`);
        if (live && selected.current === next.id) {
          setJob(next);
          setHistory((rows) => [...rows.filter((r) => r.id !== next.id), next]);
        }
      } catch (e) {
        if (live)
          setError(
            e instanceof Error ? e.message : "Cannot refresh this task.",
          );
      }
      if (live) timer = setTimeout(poll, 1000);
    };
    timer = setTimeout(poll, 700);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [job?.id, job?.phase, api]);
  const stale = !!job && job.request.expectedRevision !== entity?.revision;
  const otherLesson =
    !!job &&
    preferredLesson !== undefined &&
    job.request.lessonIndex !== preferredLesson;
  async function start() {
    if (!entity || !context) return;
    const entityId = entity.id,
      requestId = crypto.randomUUID();
    setBusy(true);
    setError("");
    try {
      const result = await api<AgentWork>("expansion/work/start", {
        requestId,
        domain,
        entityId,
        expectedRevision: entity.revision,
        goal,
        lessonIndex: lesson,
        assetId: asset || null,
        providers: domain === "growth" ? providers : [],
        maxCalls,
        approveProvider: true,
        ...(domain === "academy" && scaffold ? { scaffold } : {}),
      });
      if (target.current === entityId) {
        if (
          preferred.current === undefined ||
          preferred.current === result.request.lessonIndex
        )
          setJob(result);
        setHistory((rows) => [...rows, result]);
      }
    } catch (e) {
      if (target.current !== entityId) return;
      setError(e instanceof Error ? e.message : "Could not start the task.");
      // Reattach after a lost start response instead of submitting another paid run.
      const rows = await api<AgentWork[]>("expansion/work").catch(() => []);
      const accepted = rows.find((r) => r.request.requestId === requestId);
      if (accepted && target.current === entityId) {
        if (
          preferred.current === undefined ||
          preferred.current === accepted.request.lessonIndex
        )
          setJob(accepted);
        setHistory(
          rows.filter(
            (r) =>
              r.request.entityId === entityId && r.request.domain === domain,
          ),
        );
        setError("");
      }
    } finally {
      if (target.current === entityId) setBusy(false);
    }
  }
  async function apply() {
    if (!job || !entity || otherLesson) return;
    const entityId = entity.id;
    setBusy(true);
    setError("");
    try {
      const next = await api<AgentWork>(`expansion/work/${job.id}/apply`, {
        reviewHash: job.reviewHash,
        approve: true,
      });
      if (target.current === entityId) {
        setJob(next);
        setHistory((rows) => [...rows.filter((r) => r.id !== next.id), next]);
        await onApplied?.();
      }
    } catch (e) {
      if (target.current === entityId)
        setError(
          e instanceof Error ? e.message : "Could not apply the result.",
        );
    } finally {
      if (target.current === entityId) setBusy(false);
    }
  }
  return (
    <section
      className="agent-work"
      aria-label={`${roles[domain]} task workspace`}
    >
      <header>
        <span className="agent-work-mark">
          <Sparkles size={17} />
        </span>
        <div>
          <h3>{roles[domain]}</h3>
        </div>
        {(history.length > 1 || (history.length === 1 && !job)) && (
          <select
            aria-label={`${roles[domain]} task history`}
            value={job?.id || ""}
            onChange={(e) =>
              setJob(history.find((r) => r.id === e.target.value))
            }
          >
            <option value="">Choose a past task</option>
            {[...history].reverse().map((r) => (
              <option key={r.id} value={r.id}>
                {domain === "academy" &&
                  `Lesson ${r.request.lessonIndex + 1} · `}
                {new Date(r.createdAt).toLocaleString()} · {r.phase}
              </option>
            ))}
          </select>
        )}
      </header>
      {!entity ? (
        <p className="agent-work-empty">
          Save a draft to start working with this specialist.
        </p>
      ) : (
        <>
          {domain === "academy" && (
            <label>
              Specialist
              <select
                aria-label="Academy specialist"
                value={scaffold || "architect"}
                disabled={busy || working(job?.phase)}
                onChange={(e) => {
                  const kind = e.target.value;
                  setScaffold(
                    kind === "exercise" || kind === "capstone"
                      ? kind
                      : undefined,
                  );
                }}
              >
                <option value="architect">Atlas · lesson design</option>
                <option value="exercise">Forge · exercise scaffold</option>
                <option value="capstone">Forge · capstone scaffold</option>
              </select>
            </label>
          )}
          {domain === "academy" && scaffold && (
            <p className="agent-work-state">
              Forge drafts a build guide and starter files with TODOs. Review
              each file before applying it to Learn.
            </p>
          )}
          {domain === "academy" && (
            <label>
              Assignment task
              <select
                aria-label="Assignment task"
                disabled={busy || working(job?.phase)}
                value={
                  academyTasks.find(([, task]) => task === goal)?.[0] || ""
                }
                onChange={(e) => {
                  const task = academyTasks.find(
                    ([name]) => name === e.target.value,
                  );
                  if (task) setGoal(task[1]);
                }}
              >
                <option value="" disabled>
                  Custom instructions
                </option>
                {academyTasks.map(([name]) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="agent-work-goal">
            Task
            <textarea
              aria-label={`${roles[domain]} task`}
              value={goal}
              maxLength={1500}
              onChange={(e) => setGoal(e.target.value)}
              disabled={busy || working(job?.phase)}
            />
          </label>
          <div className="agent-work-controls">
            <select
              aria-label={`${roles[domain]} source lesson`}
              value={lesson}
              disabled={
                !context ||
                context.pinnedLesson !== null ||
                preferredLesson !== undefined ||
                working(job?.phase) ||
                busy
              }
              onChange={(e) => setLesson(Number(e.target.value))}
            >
              {context?.lessons.map((l) => (
                <option key={l.index} value={l.index}>
                  {l.index + 1}. {l.title}
                </option>
              ))}
            </select>
            {domain === "creative" && (
              <select
                aria-label="Agent source footage"
                value={asset}
                disabled={busy || working(job?.phase)}
                onChange={(e) => setAsset(e.target.value)}
              >
                <option value="">Script only · no footage selected</option>
                {context?.assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.duration.toFixed(1)}s
                    {a.transcriptCues ? " · transcript indexed" : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
          {domain === "growth" && (
            <div
              className="agent-work-channels"
              aria-label="Agent post channels"
            >
              {(["youtube", "linkedin", "x", "instagram"] as const).map((p) => (
                <label key={p}>
                  <input
                    type="checkbox"
                    checked={providers.includes(p)}
                    disabled={busy || working(job?.phase)}
                    onChange={(e) =>
                      setProviders((old) =>
                        e.target.checked
                          ? [...old, p]
                          : old.filter((x) => x !== p),
                      )
                    }
                  />
                  {p === "x"
                    ? "X"
                    : p === "youtube"
                      ? "YouTube"
                      : p === "linkedin"
                        ? "LinkedIn"
                        : "Instagram"}
                </label>
              ))}
            </div>
          )}
          <div className="agent-work-actions">
            <button
              className="button primary"
              disabled={
                !context ||
                dirty ||
                busy ||
                working(job?.phase) ||
                goal.trim().length < 8 ||
                (domain === "growth" && !providers.length)
              }
              onClick={() => void start()}
            >
              {busy || working(job?.phase) ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <Play size={14} />
              )}
              {working(job?.phase)
                ? "Working…"
                : job?.phase === "failed" || job?.phase === "interrupted"
                  ? "Retry task"
                  : scaffold
                    ? "Run Forge"
                    : "Run agent"}
            </button>
            <span>
              Up to {maxCalls} model {maxCalls === 1 ? "call" : "calls"} · your
              AI connection
            </span>
            <details>
              <summary>Options</summary>
              <label>
                Call limit
                <select
                  aria-label="Agent call limit"
                  value={maxCalls}
                  disabled={busy || working(job?.phase)}
                  onChange={(e) => setMaxCalls(Number(e.target.value) as 1 | 2)}
                >
                  <option value={1}>1 · stop on validation failure</option>
                  <option value={2}>2 · allow one correction</option>
                </select>
              </label>
            </details>
          </div>
          {dirty && (
            <p className="agent-work-state">
              Save your current edits first. The agent works on the saved
              revision.
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="agent-work-error">
          {error}
        </p>
      )}
      {job && (
        <div className="agent-work-result">
          <div className="agent-work-status">
            <span className={`agent-work-status-dot ${job.phase}`} />
            <strong>
              {
                {
                  ready: "Ready for review",
                  applied: "Delivered",
                  failed: "Needs attention",
                  interrupted: "Interrupted",
                  canceled: "Canceled",
                  queued: "Queued",
                  drafting: "Producing",
                  checking: "Checking",
                  repairing: "Correcting",
                  applying: "Delivering",
                }[job.phase]
              }
            </strong>
            <small>
              {job.calls}/{job.request.maxCalls} provider attempts
            </small>
            {working(job.phase) && job.phase !== "applying" && (
              <button
                aria-label="Cancel agent task"
                onClick={() =>
                  void api<AgentWork>(`expansion/work/${job.id}/cancel`, {})
                    .then(setJob)
                    .catch((e) => setError(e.message))
                }
              >
                <Square size={12} />
                Cancel
              </button>
            )}
          </div>
          {job.error && (
            <p role="alert" className="agent-work-error">
              {job.error}
            </p>
          )}
          <details className="agent-work-receipt">
            <summary>
              Progress & checks
              <ChevronRight size={12} />
            </summary>
            <ol>
              {job.events.map((e, i) => (
                <li key={i}>
                  <time>{new Date(e.at).toLocaleTimeString()}</time>
                  {e.message}
                </li>
              ))}
            </ol>
          </details>
          {job.answer && (
            <>
              <p className="agent-work-summary">{job.answer.summary}</p>
              <div className="agent-work-artifacts">
                {job.answer.artifacts.map((a, i) => (
                  <Artifact key={i} artifact={a} />
                ))}
              </div>
              {domain === "academy" && <AssignmentChanges job={job} />}
              <details className="agent-work-evidence">
                <summary>Sources & limitations · {job.sources.length}</summary>
                {job.answer.limitations.map((l, i) => (
                  <p key={i}>{l}</p>
                ))}
                {job.sources.map((s) => (
                  <details key={s.id}>
                    <summary>{s.title}</summary>
                    <pre>{s.text}</pre>
                  </details>
                ))}
              </details>
              {job.phase === "ready" && (
                <div className="agent-work-delivery">
                  <button
                    className="button primary"
                    onClick={() => void apply()}
                    disabled={dirty || stale || busy || otherLesson}
                  >
                    <Check size={14} />
                    {job.request.scaffold
                      ? "Apply scaffold to course"
                      : deliveryNames[domain]}
                  </button>
                  <small>Applies this reviewed result to local drafts.</small>
                </div>
              )}
              {otherLesson && job.phase === "ready" && (
                <p className="agent-work-state">
                  Select lesson {job.request.lessonIndex + 1} in the course
                  outline to apply this assignment.
                </p>
              )}
              {stale && job.phase === "ready" && (
                <p className="agent-work-state">
                  The source revision changed. Run a new task before applying.
                </p>
              )}
              {job.delivery && (
                <ul className="agent-work-delivered">
                  {job.delivery.map((d) => (
                    <li key={d.id}>
                      <Check size={13} />
                      {d.label}
                    </li>
                  ))}
                </ul>
              )}
              {(["ready", "applied"] as string[]).includes(job.phase) && (
                <div className="agent-work-handoff">
                  <select
                    aria-label={`${roles[domain]} handoff recipient`}
                    value={shareTo}
                    onChange={(e) =>
                      setShareTo(e.target.value as AgentWorkRequest["domain"])
                    }
                  >
                    {(["academy", "creative", "growth", "analytics"] as const)
                      .filter((d) => d !== domain)
                      .map((d) => (
                        <option key={d} value={d}>
                          {roles[d]}
                        </option>
                      ))}
                  </select>
                  <button
                    className="button"
                    disabled={busy || dirty}
                    onClick={async () => {
                      const owner = entity?.id;
                      setError("");
                      setShareNotice("");
                      setBusy(true);
                      try {
                        const result = await api<AgentWork>(
                          `expansion/work/${job.id}/handoff`,
                          { to: shareTo, approve: true },
                        );
                        if (target.current !== owner) return;
                        setJob(result);
                        window.dispatchEvent(new Event("outclass:handoffs"));
                        setShareNotice(
                          "Handoff offered. Accept it in the receiving specialist’s inbox to use this context.",
                        );
                      } catch (e) {
                        if (target.current !== owner) return;
                        setError(
                          e instanceof Error
                            ? e.message
                            : "Could not offer this handoff.",
                        );
                      } finally {
                        if (target.current === owner) setBusy(false);
                      }
                    }}
                  >
                    Offer handoff
                  </button>
                </div>
              )}
              {shareNotice && (
                <p role="status" className="agent-work-state">
                  {shareNotice}
                </p>
              )}
              <button
                className="agent-work-export"
                onClick={() => download(job)}
              >
                <Download size={13} />
                Export task, deliverables & evidence
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
function AssignmentChanges({ job }: { job: AgentWork }) {
  const proposed = job.answer?.artifacts[0];
  const source = job.sources.find(
    (s) => s.id === `lesson:${job.request.lessonIndex}`,
  );
  if (
    (proposed?.kind !== "lesson_package" &&
      proposed?.kind !== "lesson_scaffold") ||
    !source
  )
    return null;
  let saved: {
    objective: string;
    practice: string;
    currentAssignment: Partial<typeof proposed> | null;
  };
  try {
    saved = JSON.parse(source.text);
  } catch {
    return null;
  }
  const before: Record<string, unknown> = {
    ...saved.currentAssignment,
    objective: saved.objective,
    practice: saved.practice,
  };
  const fields = [
    ["objective", "Objective"],
    ["practice", "Practice brief"],
    ["minutes", "Minutes"],
    ["prerequisiteLessons", "Prerequisite lessons"],
    ["acceptanceCriteria", "Acceptance criteria"],
    ["hints", "Progressive hints"],
    ["reflection", "Reflection"],
    ["transferChallenge", "Transfer challenge"],
  ] as const;
  const display = (key: (typeof fields)[number][0], value: unknown) =>
    Array.isArray(value)
      ? value
          .map((item) =>
            key === "prerequisiteLessons" ? `Lesson ${item + 1}` : item,
          )
          .join("\n") || "None"
      : String(value || "None");
  const changes = fields.filter(
    ([key]) => JSON.stringify(before[key]) !== JSON.stringify(proposed[key]),
  );
  return (
    <details className="agent-work-evidence academy-assignment-diff">
      <summary>Compare with saved lesson · {changes.length} changes</summary>
      {changes.map(([key, label]) => (
        <dl key={key}>
          <dt>{label}</dt>
          <dd>
            <small>Saved</small>
            <p>{display(key, before[key])}</p>
          </dd>
          <dd>
            <small>Proposed</small>
            <p>{display(key, proposed[key])}</p>
          </dd>
        </dl>
      ))}
    </details>
  );
}
function Artifact({
  artifact: a,
}: {
  artifact: AgentWorkAnswer["artifacts"][number];
}) {
  return (
    <details className="agent-work-artifact" open>
      <summary>
        <span>{a.kind.replaceAll("_", " ")}</span>
        <strong>{a.title}</strong>
      </summary>
      {a.kind === "lesson_package" || a.kind === "lesson_scaffold" ? (
        <div>
          <p>{a.objective}</p>
          <p className="learn-practice-brief">{a.practice}</p>
          {a.kind === "lesson_scaffold" && (
            <div className="academy-forge-files">
              <h5>
                {a.activityType === "capstone" ? "Capstone" : "Exercise"} files
              </h5>
              {a.starterFiles.map((file) => (
                <details key={file.path}>
                  <summary>{file.path}</summary>
                  <pre>{file.content}</pre>
                </details>
              ))}
            </div>
          )}
          <small>
            {a.minutes} minutes · Lesson {a.lessonIndex + 1}
          </small>
          <h5>What the learner will demonstrate</h5>
          <ul>
            {a.acceptanceCriteria.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
          <details>
            <summary>Progressive hints, reflection & transfer</summary>
            <ol>
              {a.hints.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ol>
            <p>{a.reflection}</p>
            <p>{a.transferChallenge}</p>
          </details>
        </div>
      ) : a.kind === "production_script" ? (
        <ol className="agent-work-scenes">
          {a.scenes.map((s, i) => (
            <li key={i}>
              <strong>{s.caption}</strong>
              <p>{s.narration}</p>
              <small>
                {s.start === null
                  ? "Script · footage not selected"
                  : `${s.start}s–${s.end}s · proposed source range`}
              </small>
            </li>
          ))}
        </ol>
      ) : a.kind === "channel_post" ? (
        <div className="agent-work-post">
          <small>{a.provider}</small>
          <p>{a.text}</p>
          <small>{a.caption}</small>
        </div>
      ) : (
        <div>
          <h5>Interpretations to investigate</h5>
          {a.hypotheses.map((h, i) => (
            <article key={i}>
              <p>{h.interpretation}</p>
              <dl>
                <dt>Experiment</dt>
                <dd>{h.experiment}</dd>
                <dt>Measure</dt>
                <dd>{h.measure}</dd>
                <dt>Stop / review</dt>
                <dd>{h.stopRule}</dd>
              </dl>
            </article>
          ))}
          {a.missingData.length > 0 && (
            <>
              <h5>Missing evidence</h5>
              <ul>
                {a.missingData.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </details>
  );
}
function download(job: AgentWork) {
  const href = URL.createObjectURL(
    new Blob([JSON.stringify(job, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = href;
  a.download = `outclass-task-${job.id}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
