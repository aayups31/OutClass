import React, { useEffect, useState } from "react";
import { BookOpen, Check, Download, Play, Save, Square } from "lucide-react";
import type { CourseJob } from "../server/course-workshop";
import type { CourseBrief } from "../course-workshop-contract";
import type { AcademyReference } from "../academy-reference-contract";
import { AcademyReferences } from "./academy-references";
type API = <T>(route: string, body?: unknown) => Promise<T>;
const initial: CourseBrief = {
  title: "",
  audience: "",
  startingSkills: ["Python functions, loops and basic dictionaries"],
  outcome: "",
  deliverable: "",
  constraints:
    "Python standard library; one local project; no external accounts",
  exclusions: "Web frameworks, paid services and deployment",
  hours: 8,
  lessonCount: 6,
  language: "python",
  runtime: "Python 3.12",
};
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function CourseWorkshopPanel({
  api,
  onDelivered,
  onDirty,
}: {
  api: API;
  onDelivered: () => Promise<void>;
  onDirty: (value: boolean) => void;
}) {
  const [brief, setBrief] = useState<CourseBrief>(initial),
    [job, setJob] = useState<CourseJob>(),
    [jobs, setJobs] = useState<
      { id: string; brief: CourseBrief; phase: string }[]
    >([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [approved, setApproved] = useState(false),
    [selected, setSelected] = useState(""),
    [tab, setTab] = useState<"course" | "research">("course"),
    [dirty, setDirty] = useState(false),
    [reviewed, setReviewed] = useState(false);
  useEffect(() => { onDirty(dirty || busy); return () => onDirty(false); }, [dirty, busy, onDirty]);
  useEffect(() => {
    let live = true;
    api<typeof jobs>("academy-workshop")
      .then((rows) => {
        if (live) setJobs(rows);
      })
      .catch((error) => {
        if (live) setError(error.message);
      });
    return () => {
      live = false;
    };
  }, [api]);
  async function act(task: () => Promise<CourseJob>) {
    setBusy(true);
    setError("");
    try {
      const value = await task();
      setJob(value);
      setDirty(false);
      setReviewed(false);
      if (value.delivery) await onDelivered();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const written = job?.lessons[selected],
    planned = job?.plan?.lessons.find((lesson) => lesson.id === selected);
  function patch<K extends keyof CourseBrief>(key: K, value: CourseBrief[K]) {
    setBrief((current) => ({ ...current, [key]: value }));
  }
  return (
    <section className="course-workshop" aria-label="Full course workshop">
      <div className="academy-material-heading">
        <div>
          <h2>
            <BookOpen size={20} /> Course workshop
          </h2>
          <p>
            Plan a complete course, write its lessons and inspect independent
            critique before creating an instructor draft.
          </p>
        </div>
      </div>
      <div className="academy-lesson-tabs">
        <button
          aria-pressed={tab === "course"}
          onClick={() => setTab("course")}
        >
          Course design
        </button>
        <button
          aria-pressed={tab === "research"}
          onClick={() => setTab("research")}
        >
          Research library
        </button>
      </div>
      {tab === "research" ? (
        <ResearchLibrary api={api} />
      ) : (
        <>
          {error && (
            <p role="alert" className="academy-message error">
              {error}
            </p>
          )}
          <label>
            Resume a workshop
            <select
              aria-label="Resume course workshop"
              disabled={busy || dirty}
              value={job?.id || ""}
              onChange={(event) => {
                if (event.target.value)
                  void act(() =>
                    api<CourseJob>(`academy-workshop/${event.target.value}`),
                  );
                else setJob(undefined);
              }}
            >
              <option value="">New course brief</option>
              {jobs.map((row) => (
                <option value={row.id} key={row.id}>
                  {row.brief.title} · {row.phase}
                </option>
              ))}
            </select>
          </label>
          {!job ? (
            <fieldset disabled={busy} className="course-brief">
              <legend>Course brief</legend>
              {(
                [
                  "title",
                  "audience",
                  "outcome",
                  "deliverable",
                  "constraints",
                  "exclusions",
                  "runtime",
                ] as const
              ).map((key) => (
                <label key={key}>
                  {
                    {
                      title: "Course title",
                      audience: "Who is this for?",
                      outcome:
                        "What will learners be able to do independently?",
                      deliverable: "What useful thing will they build?",
                      constraints: "Tools and constraints",
                      exclusions: "Outside this course",
                      runtime: "Runtime and version",
                    }[key]
                  }
                  <textarea
                    rows={key === "title" || key === "runtime" ? 1 : 2}
                    aria-label={`Workshop ${key}`}
                    value={brief[key]}
                    maxLength={
                      key === "title"
                        ? 200
                        : key === "audience"
                          ? 1000
                          : key === "runtime"
                            ? 100
                            : 1500
                    }
                    onChange={(event) => patch(key, event.target.value)}
                  />
                </label>
              ))}
              <label>
                Starting skills · one per line
                <textarea
                  value={brief.startingSkills.join("\n")}
                  onChange={(event) =>
                    patch("startingSkills", event.target.value.split("\n"))
                  }
                />
              </label>
              <label>
                Course hours
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={brief.hours}
                  onChange={(event) =>
                    patch("hours", Number(event.target.value))
                  }
                />
              </label>
              <label>
                Number of lessons
                <input
                  type="number"
                  min={3}
                  max={40}
                  value={brief.lessonCount}
                  onChange={(event) =>
                    patch("lessonCount", Number(event.target.value))
                  }
                />
              </label>
              <label>
                Project language
                <select
                  value={brief.language}
                  onChange={(event) =>
                    patch(
                      "language",
                      event.target.value as CourseBrief["language"],
                    )
                  }
                >
                  <option value="python">Python</option>
                  <option value="javascript">JavaScript</option>
                  <option value="other">
                    Other · manual technical verification
                  </option>
                </select>
              </label>
              <label className="product-checkbox">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(event) => setApproved(event.target.checked)}
                />
                I approve up to {Math.min(100, brief.lessonCount * 2 + 5)}{" "}
                provider calls, including explicit retries, using my configured
                AI connection and approved research.
              </label>
              <button
                className="button primary"
                disabled={!approved}
                onClick={() =>
                  void act(async () => {
                    const value = await api<CourseJob>("academy-workshop", {
                      brief,
                      maxCalls: Math.min(100, brief.lessonCount * 2 + 5),
                      approveProvider: true,
                    });
                    setJobs((rows) => [
                      ...rows,
                      { id: value.id, brief: value.brief, phase: value.phase },
                    ]);
                    return value;
                  })
                }
              >
                Save course brief
              </button>
            </fieldset>
          ) : (
            <>
              <h3>{job.brief.title}</h3>
              <p>{job.brief.outcome}</p>
              <p role="status">
                {busy ? "Working on this stage…" : job.phase} · {job.calls}/
                {job.maxCalls} provider calls ·{" "}
                {Object.keys(job.lessons).length}/{job.brief.lessonCount}{" "}
                lessons written
              </p>
              {job.error && <p role="alert">{job.error}</p>}
              <div className="academy-next">
                <button
                  className="button"
                  disabled={
                    busy ||
                    dirty ||
                    !!job.delivery ||
                    !!job.critique ||
                    (!!job.plan && !job.planAccepted)
                  }
                  onClick={() =>
                    void act(() =>
                      api<CourseJob>(`academy-workshop/${job.id}/next`, {
                        revision: job.revision,
                      }),
                    )
                  }
                >
                  <Play size={14} />
                  {job.phase === "interrupted"
                    ? "Resume next stage"
                    : !job.plan
                      ? "Generate course plan"
                      : "Generate next stage"}
                </button>
                {busy && (
                  <button
                    className="button"
                    onClick={() =>
                      void api(`academy-workshop/${job.id}/cancel`, {}).catch(
                        (error) => setError(error.message),
                      )
                    }
                  >
                    <Square size={14} />
                    Cancel after current request
                  </button>
                )}
                <button
                  className="text-button"
                  onClick={() =>
                    download(`instructor-workshop-${job.id}.json`, job)
                  }
                >
                  <Download size={13} />
                  Export instructor workshop · includes private solutions
                </button>
              </div>
              {job.plan && (
                <>
                  <h3>Course plan</h3>
                  <p>{job.plan.rationale}</p>
                  <ul>
                    {job.plan.outcomes.map((outcome) => (
                      <li key={outcome.id}>
                        <strong>{outcome.description}</strong>
                        <br />
                        Evidence: {outcome.evidence}
                      </li>
                    ))}
                  </ul>
                  <ol>
                    {job.plan.lessons.map((lesson) => (
                      <li key={lesson.id}>
                        <button
                          className="text-button"
                          disabled={dirty}
                          onClick={() => setSelected(lesson.id)}
                        >
                          {lesson.module} · {lesson.title}
                        </button>{" "}
                        · {lesson.minutes} min{" "}
                        <small>
                          {job.lessons[lesson.id] ? "written" : "planned"}
                        </small>
                      </li>
                    ))}
                  </ol>
                  {!job.planAccepted && (
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() =>
                        void act(() =>
                          api<CourseJob>(`academy-workshop/${job.id}/plan`, {
                            revision: job.revision,
                          }),
                        )
                      }
                    >
                      <Check size={14} />
                      Accept course plan
                    </button>
                  )}
                </>
              )}
              {written && planned && (
                <section aria-label="Workshop lesson editor">
                  <h3>{planned.title}</h3>
                  {written.sections.map((section, index) => (
                    <label key={index}>
                      {section.title}
                      <textarea
                        rows={7}
                        disabled={busy || !!job.delivery}
                        value={section.body}
                        onChange={(event) => {
                          const body = event.target.value;
                          setJob({
                            ...job,
                            lessons: {
                              ...job.lessons,
                              [selected]: {
                                ...written,
                                sections: written.sections.map((section, n) =>
                                  n === index ? { ...section, body } : section,
                                ),
                              },
                            },
                          });
                          setDirty(true);
                        }}
                      />
                    </label>
                  ))}
                  <details>
                    <summary>Worked reasoning and misconceptions</summary>
                    {written.workedExamples.map((example, index) => (
                      <div key={index}>
                        <strong>{example.problem}</strong>
                        <ol>
                          {example.steps.map((step, n) => (
                            <li key={n}>{step}</li>
                          ))}
                        </ol>
                        <p>{example.result}</p>
                      </div>
                    ))}
                    {written.misconceptions.map((item, index) => (
                      <p key={index}>
                        {item.belief}
                        <br />
                        {item.counterexample}
                        <br />
                        {item.diagnosis}
                      </p>
                    ))}
                  </details>
                  <p>{written.independentTask}</p>
                  <p>Transfer: {written.transferTask}</p>
                  <details>
                    <summary>
                      Instructor marking guide and private solutions
                    </summary>
                    <h4>Project rubric</h4>
                    <ul>
                      {written.rubric.map((row, index) => (
                        <li key={index}>
                          {row.criterion} · {row.points} points
                          <br />
                          {row.evidence}
                        </li>
                      ))}
                    </ul>
                    {written.assessments.map((item) => {
                      const key = written.answerKeys.find(
                        (key) => key.itemId === item.id,
                      )!;
                      return (
                        <div key={item.id}>
                          <strong>{item.prompt}</strong>
                          <p>
                            Correct choice: {item.choices[key.correctChoice]}
                          </p>
                          <p>{key.rationale}</p>
                          <ul>
                            {key.feedback.map((text, index) => (
                              <li key={index}>
                                {item.choices[index]} — {text}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                    <h4>Reference implementation · {written.solutionPath}</h4>
                    <pre>{written.instructorSolution}</pre>
                    <h4>Deliberately faulty implementation</h4>
                    <pre>{written.faultyImplementation}</pre>
                  </details>
                  <button
                    className="button"
                    disabled={busy || dirty || !!job.delivery}
                    onClick={() =>
                      void act(() =>
                        api<CourseJob>(`academy-workshop/${job.id}/verify`, {
                          revision: job.revision,
                          lessonId: selected,
                        }),
                      )
                    }
                  >
                    Verify starter, reference and deliberate mistake
                  </button>
                  {job.verification?.[selected] && (
                    <p role="status">
                      {job.verification[selected].verified
                        ? "The supplied tests pass the reference and reject the starter and deliberate mistake."
                        : "The supplied tests did not establish the required behavior."}{" "}
                      Image: {job.verification[selected].image}
                    </p>
                  )}
                  {!!job.history.filter((row) => row.lessonId === selected)
                    .length && (
                    <details>
                      <summary>Restore an earlier lesson revision</summary>
                      {job.history
                        .filter((row) => row.lessonId === selected)
                        .map((row, index) => (
                          <button
                            className="button small"
                            key={index}
                            disabled={busy || dirty || !!job.delivery}
                            onClick={() =>
                              void act(() =>
                                api<CourseJob>(
                                  `academy-workshop/${job.id}/lesson`,
                                  {
                                    revision: job.revision,
                                    lesson: row.lesson,
                                  },
                                ),
                              )
                            }
                          >
                            Restore saved workshop revision {row.revision}
                          </button>
                        ))}
                    </details>
                  )}
                  <button
                    className="button"
                    disabled={!dirty || busy}
                    onClick={() =>
                      void act(() =>
                        api<CourseJob>(`academy-workshop/${job.id}/lesson`, {
                          revision: job.revision,
                          lesson: written,
                        }),
                      )
                    }
                  >
                    <Save size={14} />
                    Save lesson edits
                  </button>
                  <button
                    className="text-button"
                    disabled={dirty || busy || !!job.delivery}
                    onClick={() =>
                      void act(() =>
                        api<CourseJob>(`academy-workshop/${job.id}/next`, {
                          revision: job.revision,
                          retryLessonId: selected,
                        }),
                      )
                    }
                  >
                    Regenerate this lesson · uses one provider call
                  </button>
                </section>
              )}
              {job.critique && (
                <section>
                  <h3>Independent editorial review</h3>
                  {job.critique.findings.map((finding, index) => (
                    <p key={index}>
                      <strong>
                        {finding.severity} · {finding.lessonId}
                      </strong>
                      <br />
                      {finding.claim}
                      <br />
                      Evidence: {finding.evidence}
                      <br />
                      Proposed correction: {finding.correction}
                    </p>
                  ))}
                  {!job.critique.findings.length && (
                    <p>
                      No findings were returned. This is a model review, not
                      proof of correctness.
                    </p>
                  )}
                  {job.critique.limitations.map((limit, index) => (
                    <p key={index}>{limit}</p>
                  ))}
                  <label className="product-checkbox">
                    <input
                      type="checkbox"
                      checked={reviewed}
                      onChange={(event) => setReviewed(event.target.checked)}
                    />
                    I reviewed the lessons, source evidence, private assessment
                    keys and critique.
                  </label>
                  <button
                    className="button primary"
                    disabled={!reviewed || busy || dirty || !!job.delivery}
                    onClick={() =>
                      void act(() =>
                        api<CourseJob>(`academy-workshop/${job.id}/deliver`, {
                          revision: job.revision,
                          approve: true,
                        }),
                      )
                    }
                  >
                    Create instructor draft
                  </button>
                </section>
              )}
              <details>
                <summary>Stage history</summary>
                <ol>
                  {job.events.map((event, index) => (
                    <li key={index}>
                      {new Date(event.at).toLocaleString()} · {event.message}
                    </li>
                  ))}
                </ol>
              </details>
            </>
          )}
        </>
      )}
    </section>
  );
}
function ResearchLibrary({ api }: { api: API }) {
  const [reference, setReference] = useState<AcademyReference[]>([
      {
        id: crypto.randomUUID(),
        title: "",
        publisher: "",
        authors: "",
        url: "",
        license: "",
        licenseUrl: "",
        permissionNote: "",
        excerpt: "",
        approved: false,
      },
    ]),
    [body, setBody] = useState(""),
    [format, setFormat] = useState("text"),
    [topics, setTopics] = useState(""),
    [level, setLevel] = useState("introductory"),
    [expiresOn, setExpires] = useState(""),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<
      { id: string; title: string; text: string }[]
    >([]),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  async function ingest() {
    setBusy(true);
    try {
      await api("academy-research", {
        reference: reference[0],
        topics: topics
          .split(",")
          .map((topic) => topic.trim())
          .filter(Boolean),
        level,
        format,
        body,
        expiresOn,
      });
      setStatus(
        "Indexed with attribution and source version. Its approved passages can now support course writing.",
      );
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h3>Permissioned research library</h3>
      <p>
        Import material you have permission to use. The library retains versions
        and locations; it does not treat a free course link as permission.
      </p>
      <AcademyReferences
        value={reference}
        onChange={(value) => setReference(value.slice(-1))}
      />
      <label>
        Source file · text, HTML, transcript or text PDF
        <input
          type="file"
          accept=".txt,.md,.html,.srt,.vtt,.pdf"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > 2000000) {
              setStatus("Choose a source under 2 MB.");
              return;
            }
            setReference((rows) =>
              rows.map((row) => ({ ...row, approved: false })),
            );
            if (file.name.endsWith(".pdf")) {
              const reader = new FileReader();
              reader.onload = () => {
                setBody(String(reader.result).split(",")[1]);
                setFormat("pdf");
              };
              reader.readAsDataURL(file);
            } else
              void file.text().then((text) => {
                setBody(text);
                setFormat(
                  /\.html$/.test(file.name)
                    ? "html"
                    : /\.(srt|vtt)$/.test(file.name)
                      ? "transcript"
                      : "text",
                );
              });
          }}
        />
      </label>
      <label>
        Source text
        <textarea
          rows={6}
          disabled={format === "pdf"}
          value={
            format === "pdf"
              ? "PDF selected; page text will be extracted on import."
              : body
          }
          onChange={(event) => {
            setBody(event.target.value);
            setReference((rows) =>
              rows.map((row) => ({ ...row, approved: false })),
            );
          }}
        />
      </label>
      <label>
        Topics · comma separated
        <input
          value={topics}
          onChange={(event) => setTopics(event.target.value)}
        />
      </label>
      <label>
        Level
        <select
          value={level}
          onChange={(event) => setLevel(event.target.value)}
        >
          <option>introductory</option>
          <option>intermediate</option>
          <option>advanced</option>
        </select>
      </label>
      <label>
        Permission expiry · optional
        <input
          type="date"
          value={expiresOn}
          onChange={(event) => setExpires(event.target.value)}
        />
      </label>
      <button
        className="button"
        disabled={busy || !body || !reference[0]?.approved}
        onClick={() => void ingest()}
      >
        Index approved source
      </button>
      <p role="status">{status}</p>
      <label>
        Search approved passages
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <button
        className="button"
        disabled={!query.trim()}
        onClick={() =>
          void api<typeof results>(
            `academy-research/search?q=${encodeURIComponent(query)}`,
          )
            .then(setResults)
            .catch((error) => setStatus(error.message))
        }
      >
        Search research
      </button>
      {results.map((result) => (
        <details key={result.id}>
          <summary>{result.title}</summary>
          <pre>{result.text}</pre>
        </details>
      ))}
    </section>
  );
}
