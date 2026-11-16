import React, { useState, useEffect } from "react";
import "./learn-package.css";
import type { LearnPackage } from "../learn-package-contract";
import type { LearnDelivery } from "../server/learn-delivery";
type API = <T>(route: string, body?: unknown) => Promise<T>;
export const defaultLearnPackage = (): LearnPackage => ({
  minutes: 20,
  prerequisiteLessons: [],
  acceptanceCriteria: [
    "Demonstrate the expected behavior with your own example.",
  ],
  hints: [],
  reflection:
    "Explain your approach, one failure you investigated, and what changed.",
  transferChallenge: "Change one requirement and test your approach again.",
  starterFiles: [],
});
export function LearnPackageEditor({
  value,
  onChange,
  index,
  lessonTitles,
}: {
  value?: LearnPackage;
  onChange: (v: LearnPackage | undefined) => void;
  index: number;
  lessonTitles: string[];
}) {
  if (!value)
    return (
      <button
        type="button"
        className="button"
        onClick={() => onChange(defaultLearnPackage())}
      >
        Add Learn experience to lesson {index + 1}
      </button>
    );
  return (
    <section className="learn-package-editor">
      <div className="product-panel-heading">
        <h3>Learn experience</h3>
        <button
          type="button"
          className="button small"
          onClick={() => {
            if (
              confirm(
                "Remove this lesson’s unsaved Learn package? Existing releases keep their copy.",
              )
            )
              onChange(undefined);
          }}
        >
          Remove package
        </button>
      </div>
      <p>
        Design what the student will do inside Learn. Starter files require an
        explicit local run.
      </p>
      <label>
        Practice time · minutes
        <input
          type="number"
          min={5}
          max={240}
          value={value.minutes}
          aria-label={`Practice minutes ${index + 1}`}
          onChange={(e) =>
            onChange({ ...value, minutes: Number(e.target.value) })
          }
        />
      </label>
      <fieldset>
        <legend>Prerequisite lessons</legend>
        {lessonTitles.map(
          (title, i) =>
            (i < index || value.prerequisiteLessons.includes(i)) && (
              <label className="product-checkbox" key={i}>
                <input
                  type="checkbox"
                  checked={value.prerequisiteLessons.includes(i)}
                  disabled={
                    !value.prerequisiteLessons.includes(i) &&
                    value.prerequisiteLessons.length >= 12
                  }
                  onChange={(e) =>
                    onChange({
                      ...value,
                      prerequisiteLessons: e.target.checked
                        ? [...value.prerequisiteLessons, i]
                        : value.prerequisiteLessons.filter((n) => n !== i),
                    })
                  }
                />
                {i + 1}. {title || "Untitled lesson"}
              </label>
            ),
        )}
      </fieldset>
      {(
        [
          ["acceptanceCriteria", "Acceptance criteria · one per line"],
          ["hints", "Progressive hints · one per line"],
        ] as const
      ).map(([key, label]) => (
        <label key={key}>
          {label}
          <textarea
            aria-label={`${label} ${index + 1}`}
            value={value[key].join("\n")}
            maxLength={key === "hints" ? 4800 : 6000}
            onChange={(e) =>
              onChange({ ...value, [key]: e.target.value.split("\n") })
            }
          />
        </label>
      ))}
      <label>
        Reflection prompt
        <textarea
          aria-label={`Reflection prompt ${index + 1}`}
          value={value.reflection}
          maxLength={1200}
          onChange={(e) => onChange({ ...value, reflection: e.target.value })}
        />
      </label>
      <label>
        Transfer challenge
        <textarea
          aria-label={`Transfer challenge ${index + 1}`}
          value={value.transferChallenge}
          maxLength={2000}
          onChange={(e) =>
            onChange({ ...value, transferChallenge: e.target.value })
          }
        />
      </label>
      <div className="product-panel-heading">
        <h4>Starter files</h4>
        <button
          type="button"
          className="button small"
          disabled={value.starterFiles.length >= 12}
          onClick={() =>
            onChange({
              ...value,
              starterFiles: [
                ...value.starterFiles,
                {
                  path: `starter-${value.starterFiles.length + 1}.py`,
                  content: "# Write your implementation here.\n",
                },
              ],
            })
          }
        >
          Add starter file
        </button>
      </div>
      {value.starterFiles.map((file, i) => (
        <div className="learn-starter" key={i}>
          <label>
            Relative file path
            <input
              aria-label={`Starter path ${index + 1}-${i + 1}`}
              value={file.path}
              onChange={(e) =>
                onChange({
                  ...value,
                  starterFiles: value.starterFiles.map((f, n) =>
                    n === i ? { ...f, path: e.target.value } : f,
                  ),
                })
              }
            />
          </label>
          <label>
            Starter content
            <textarea
              aria-label={`Starter content ${index + 1}-${i + 1}`}
              value={file.content}
              maxLength={40000}
              rows={6}
              spellCheck={false}
              onChange={(e) =>
                onChange({
                  ...value,
                  starterFiles: value.starterFiles.map((f, n) =>
                    n === i ? { ...f, content: e.target.value } : f,
                  ),
                })
              }
            />
          </label>
          <button
            type="button"
            className="button small"
            onClick={() =>
              onChange({
                ...value,
                starterFiles: value.starterFiles.filter((_, n) => n !== i),
              })
            }
          >
            Remove starter {i + 1}
          </button>
        </div>
      ))}
    </section>
  );
}
type Assignment = NonNullable<ReturnType<LearnDelivery["snapshot"]>>;
export function LearnAssignment({
  api,
  courseId,
  lessonId,
  onDirty,
}: {
  api: API;
  courseId: string;
  lessonId: string;
  onDirty: (dirty: boolean) => void;
}) {
  const [value, setValue] = useState<Assignment | null>(null),
    [checked, setChecked] = useState<number[]>([]),
    [reflection, setReflection] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setValue(null);
    setError("");
    api<Assignment | null>(
      `learn-assignment?courseId=${encodeURIComponent(courseId)}&lessonId=${encodeURIComponent(lessonId)}`,
    )
      .then((v) => {
        if (live) {
          setValue(v);
          setChecked(v?.progress.checked || []);
          setReflection(v?.progress.reflection || "");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [api, courseId, lessonId]);
  const dirty =
    !!value &&
    (reflection !== value.progress.reflection ||
      JSON.stringify([...checked].sort()) !==
        JSON.stringify([...value.progress.checked].sort()));
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  if (!value) return error ? <p role="alert">{error}</p> : null;
  async function act(fn: () => Promise<Assignment>) {
    setBusy(true);
    setError("");
    try {
      const result = await fn();
      setValue(result);
      if (result.progress.reflection === reflection.trim())
        setReflection(result.progress.reflection);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="learn-assignment" open>
      <summary>
        Instructor’s Learn experience · {value.plan.minutes} min
      </summary>
      <h3>{value.objective}</h3>
      {value.preview && (
        <p>
          Instructor preview · a separate workspace and local review history.
        </p>
      )}
      <p className="learn-practice-brief">{value.brief}</p>
      {value.project && (
        <section className="learn-project-connection">
          <small>Your evolving project</small>
          <h4>{value.project.title}</h4>
          <p>{value.project.problem}</p>
          {value.project.milestone && (
            <>
              <strong>This increment: {value.project.milestone.title}</strong>
              <p>{value.project.milestone.brief}</p>
              <ul>
                {value.project.milestone.acceptanceCriteria.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </>
          )}
          <small>Final deliverable: {value.project.deliverable}</small>
        </section>
      )}
      {value.prerequisites.length > 0 && (
        <p>
          Recommended first:{" "}
          {value.prerequisites
            .map((p) => `${p.title}${p.reviewed ? " (self-reviewed)" : ""}`)
            .join(", ")}
        </p>
      )}
      <fieldset disabled={busy}>
        <legend>Acceptance criteria · your self-review</legend>
        {value.plan.acceptanceCriteria.map((criterion, i) => (
          <label className="product-checkbox" key={i}>
            <input
              type="checkbox"
              checked={checked.includes(i)}
              onChange={(e) =>
                setChecked(
                  e.target.checked
                    ? [...checked, i]
                    : checked.filter((n) => n !== i),
                )
              }
            />
            {criterion}
          </label>
        ))}
        <p>{value.plan.reflection}</p>
        <textarea
          aria-label="Assignment reflection"
          value={reflection}
          maxLength={4000}
          placeholder="Explain the evidence from your attempt…"
          onChange={(e) => setReflection(e.target.value)}
        />
        <div className="product-actions">
          <button
            className="button"
            onClick={() =>
              void act(() =>
                api("learn-assignment", {
                  courseId,
                  lessonId,
                  progress: {
                    expectedRevision: value.progress.revision,
                    checked,
                    reflection,
                    reviewed: false,
                  },
                }),
              )
            }
          >
            Save assignment review
          </button>
          <button
            className="button primary"
            onClick={() =>
              void act(() =>
                api("learn-assignment", {
                  courseId,
                  lessonId,
                  progress: {
                    expectedRevision: value.progress.revision,
                    checked,
                    reflection,
                    reviewed: true,
                  },
                }),
              )
            }
          >
            Complete self-review
          </button>
        </div>
      </fieldset>
      {value.progress.reviewedAt && (
        <p>
          Self-review saved. This is learner-reported progress, not verified
          mastery.
        </p>
      )}
      {value.plan.hints
        .slice(0, value.progress.revealedHints)
        .map((hint, i) => (
          <p key={i}>
            <strong>Hint {i + 1}:</strong> {hint}
          </p>
        ))}
      <button
        className="button small"
        disabled={
          busy || value.progress.revealedHints >= value.plan.hints.length
        }
        onClick={() =>
          void act(() => api("learn-assignment/hint", { courseId, lessonId }))
        }
      >
        Reveal next instructor hint
      </button>
      {value.progress.reviewedAt && value.plan.transferChallenge && (
        <aside>
          <h4>Use it differently</h4>
          <p>{value.plan.transferChallenge}</p>
        </aside>
      )}
      <small>
        Starter files: assignments/{lessonId}/ · Files and reflections stay
        local.
      </small>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
