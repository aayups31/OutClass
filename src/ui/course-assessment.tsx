import React, { useEffect, useState, useRef } from "react";
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
  const [reviewLesson, setReviewLesson] = useState(lessonId);
  useEffect(() => setReviewLesson(lessonId), [lessonId, courseId]);
  const generation = useRef(0);
  const [view, setView] = useState<View>(),
    [choices, setChoices] = useState<Record<string, number>>({}),
    [feedback, setFeedback] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    generation.current++;
    setBusy("");
    setView(undefined);
    setFeedback({});
    setChoices({});
    setError("");
    if (!/^academy(?:-preview)?:/.test(courseId)) return;
    api<View>(
      `course-assessment?courseId=${encodeURIComponent(courseId)}&lessonId=${encodeURIComponent(reviewLesson)}`,
    )
      .then((value) => {
        if (live) setView(value);
      })
      .catch((error) => {
        if (live) setError(error.message);
      });
    return () => {
      live = false;
      generation.current++;
    };
  }, [api, courseId, reviewLesson]);
  async function submit(itemId: string) {
    if (!view) return;
    const requestGeneration = generation.current;
    setBusy(itemId);
    try {
      const item = view.items.find((item) => item.id === itemId)!;
      const result = await api<{
        correct: boolean;
        feedback: string;
        rationale: string;
      }>("course-assessment", {
        courseId,
        lessonId: reviewLesson,
        submission: {
          itemId,
          choice: choices[itemId],
          releaseHash: view.releaseHash,
          expectedAttempt: item.attempts,
        },
      });
      if (requestGeneration !== generation.current) return;
      setFeedback((current) => ({
        ...current,
        [itemId]: `${result.correct ? "Correct for this item." : "Try tracing the example again."} ${result.feedback} ${result.rationale}`,
      }));
      const updated = await api<View>(
        `course-assessment?courseId=${encodeURIComponent(courseId)}&lessonId=${encodeURIComponent(reviewLesson)}`,
      );
      if (requestGeneration === generation.current) setView(updated);
    } catch (error) {
      if (requestGeneration === generation.current)
        setError((error as Error).message);
    } finally {
      if (requestGeneration === generation.current) setBusy("");
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
      {reviewLesson !== lessonId && (
        <button
          className="text-button"
          onClick={() => setReviewLesson(lessonId)}
        >
          Return to this lesson's questions
        </button>
      )}
      {view.reviewQueue.length > 0 && (
        <nav aria-label="Spaced course review">
          {view.reviewQueue.map((item) => (
            <button
              className="button small"
              key={item.lessonId}
              onClick={() => setReviewLesson(item.lessonId)}
            >
              Revisit {item.title} · {item.due} due
            </button>
          ))}
        </nav>
      )}
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
          {item.remediation.map((lesson) => (
            <button
              className="text-button"
              key={lesson.lessonId}
              onClick={() => setReviewLesson(lesson.lessonId)}
            >
              Revisit {lesson.title}
            </button>
          ))}
        </fieldset>
      ))}
    </details>
  );
}
