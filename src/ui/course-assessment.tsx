import React, { useEffect, useState } from "react";
import type { CourseAssessment } from "../server/course-assessment";
type View = ReturnType<CourseAssessment["view"]>;
type API = <T>(route: string, body?: unknown) => Promise<T>;
export function CourseAssessmentView({
  api,
  courseId,
  lessonId,
}: {
  api: API;
  courseId: string;
  lessonId: string;
}) {
  const [view, setView] = useState<View>(),
    [choices, setChoices] = useState<Record<string, number>>({}),
    [feedback, setFeedback] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setView(undefined);
    setFeedback({});
    setChoices({});
    setError("");
    api<View>(
      `course-assessment?courseId=${encodeURIComponent(courseId)}&lessonId=${encodeURIComponent(lessonId)}`,
    )
      .then((value) => {
        if (live) setView(value);
      })
      .catch((error) => {
        if (live) setError(error.message);
      });
    return () => {
      live = false;
    };
  }, [api, courseId, lessonId]);
  async function submit(itemId: string) {
    if (!view) return;
    setBusy(itemId);
    try {
      const item = view.items.find((item) => item.id === itemId)!;
      const result = await api<{
        correct: boolean;
        feedback: string;
        rationale: string;
      }>("course-assessment", {
        courseId,
        lessonId,
        submission: {
          itemId,
          choice: choices[itemId],
          releaseHash: view.releaseHash,
          expectedAttempt: item.attempts,
        },
      });
      setFeedback((current) => ({
        ...current,
        [itemId]: `${result.correct ? "Correct for this item." : "Try tracing the example again."} ${result.feedback} ${result.rationale}`,
      }));
      setView(
        await api<View>(
          `course-assessment?courseId=${encodeURIComponent(courseId)}&lessonId=${encodeURIComponent(lessonId)}`,
        ),
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy("");
    }
  }
  if (!view?.items.length) return error ? <p role="alert">{error}</p> : null;
  return (
    <details className="learn-assignment" open>
      <summary>Practice questions & cumulative review</summary>
      <p>
        These checks record individual responses. They do not establish
        independent project mastery.
      </p>
      {error && <p role="alert">{error}</p>}
      {view.items.map((item) => (
        <fieldset key={item.id} disabled={!!busy}>
          <legend>{item.prompt}</legend>
          <small>
            {item.kind} ·{" "}
            {item.due
              ? "Ready to review"
              : `Review again ${new Date(item.lastResult!.dueAt).toLocaleDateString()}`}
          </small>
          {item.choices.map((choice, index) => (
            <label className="product-checkbox" key={index}>
              <input
                type="radio"
                name={item.id}
                checked={choices[item.id] === index}
                onChange={() =>
                  setChoices((current) => ({ ...current, [item.id]: index }))
                }
              />
              {choice}
            </label>
          ))}
          <button
            className="button small"
            disabled={
              choices[item.id] === undefined || !item.automaticCheckAvailable
            }
            onClick={() => void submit(item.id)}
          >
            Check response
          </button>
          {!item.automaticCheckAvailable && (
            <p>
              The private marking key is not available on this device. This item
              is not automatically graded.
            </p>
          )}
          {feedback[item.id] && <p role="status">{feedback[item.id]}</p>}
        </fieldset>
      ))}
    </details>
  );
}
