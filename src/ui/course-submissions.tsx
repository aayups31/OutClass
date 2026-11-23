import React, { useEffect, useState, useRef } from "react";
import type { CourseSubmissions } from "../server/course-submissions";
type View = Awaited<ReturnType<CourseSubmissions["view"]>>;
type API = <T>(route: string, body?: unknown) => Promise<T>;
export function CourseSubmissionView({
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
  const generation = useRef(0);
  const [view, setView] = useState<View>(),
    [evidence, setEvidence] = useState<string[]>([]),
    [selfReviewed, setSelfReviewed] = useState(false),
    [checks, setChecks] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const owner = ++generation.current;
    let live = true;
    setView(undefined);
    setEvidence([]);
    setError("");
    setSelfReviewed(false);
    setChecks(false);
    setBusy(false);
    api<View>(
      `course-submissions?courseId=${encodeURIComponent(courseId)}&lessonId=${encodeURIComponent(lessonId)}`,
    )
      .then((value) => {
        if (live) {
          setView(value);
          setEvidence(value.rubric.map(() => ""));
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
      if (generation.current === owner) generation.current++;
    };
  }, [api, courseId, lessonId]);
  const dirty =
    busy || selfReviewed || checks || evidence.some((text) => text.trim());
  useEffect(() => {
    onDirty(!!dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  async function submit() {
    if (!view || busy) return;
    const owner = generation.current;
    setBusy(true);
    setError("");
    try {
      const result = await api<View>("course-submissions", {
        courseId,
        lessonId,
        submission: {
          requestId: crypto.randomUUID(),
          releaseHash: view.releaseHash,
          expectedCount: view.history.length,
          evidence,
          selfReviewed,
          runChecks: checks,
        },
      });
      if (owner === generation.current) {
        setView(result);
        setEvidence(result.rubric.map(() => ""));
        setSelfReviewed(false);
        setChecks(false);
      }
    } catch (e) {
      if (owner === generation.current) setError((e as Error).message);
    } finally {
      if (owner === generation.current) setBusy(false);
    }
  }
  if (!view) return error ? <p role="alert">{error}</p> : null;
  if (!view.rubric.length && !view.checkAvailable) return null;
  return (
    <details className="learn-assignment" open>
      <summary>Project evidence and revision history</summary>
      <p>
        Record the files you attempted and explain what you observed. Passing
        the released tests records those checks; an instructor still judges the
        wider rubric and independent transfer.
      </p>
      <fieldset disabled={busy}>
        {view.rubric.map((row, index) => (
          <label key={index}>
            {row.criterion} · {row.points} points<small>{row.evidence}</small>
            <textarea
              aria-label={`Evidence for ${row.criterion}`}
              value={evidence[index] || ""}
              onChange={(event) =>
                setEvidence((values) =>
                  values.map((text, n) =>
                    n === index ? event.target.value : text,
                  ),
                )
              }
            />
          </label>
        ))}
        <label className="product-checkbox">
          <input
            type="checkbox"
            checked={selfReviewed}
            onChange={(event) => setSelfReviewed(event.target.checked)}
          />
          I checked this attempt against every rubric criterion.
        </label>
        {view.checkAvailable && (
          <label className="product-checkbox">
            <input
              type="checkbox"
              checked={checks}
              onChange={(event) => setChecks(event.target.checked)}
            />
            Run the released tests against this attempt in {view.backend}.{" "}
            {view.backend === "Vercel Sandbox" &&
              "This sends the assignment code to an isolated remote machine."}
          </label>
        )}
        <button className="button" onClick={() => void submit()}>
          Save this attempt{checks ? " and run isolated checks" : ""}
        </button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {view.history.toReversed().map((record) => (
        <article key={record.id}>
          <strong>
            {record.stale
              ? "Files changed since this attempt"
              : record.state.replaceAll("_", " ")}
          </strong>
          <small> · {new Date(record.at).toLocaleString()}</small>
          <p>
            Submission {record.submissionHash.slice(0, 12)} · release{" "}
            {record.releaseHash.slice(0, 12)}
          </p>
          {record.checkError && <p role="alert">{record.checkError}</p>}
          {record.check && (
            <details>
              <summary>
                Isolated check output ·{" "}
                {record.check.runtime || record.check.image}
              </summary>
              {record.check.checks.map((check, index) => (
                <pre key={index}>
                  {check.tests} tests · exit {check.code}
                  {"\n"}
                  {check.output}
                </pre>
              ))}
            </details>
          )}
        </article>
      ))}
    </details>
  );
}
