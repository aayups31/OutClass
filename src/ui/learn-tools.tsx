import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Code2,
  History,
  Search,
  Sparkles,
} from "lucide-react";
import Markdown from "react-markdown";
import type { Course } from "../shared";
import type { LearnTools, LibraryHit } from "../server/learn-tools";
import "./learn-tools.css";

type Api = <T>(route: string, body?: unknown) => Promise<T>;
type Draft = Awaited<ReturnType<LearnTools["draft"]>>;
type Answer = Awaited<ReturnType<LearnTools["ask"]>>;

export function LearnLibrary({
  api,
  courses,
  open,
}: {
  api: Api;
  courses: Course[];
  open: (hit: LibraryHit) => void;
}) {
  const [query, setQuery] = useState("");
  const [question, setQuestion] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [hits, setHits] = useState<LibraryHit[]>();
  const [answer, setAnswer] = useState<Answer>();
  const [searching, setSearching] = useState(false);
  const [asking, setAsking] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [answerError, setAnswerError] = useState("");
  return (
    <section className="learn-tools library-view">
      <header>
        <h1>Learning library</h1>
        <p>Find a lesson, a line of code, or a note you left yourself.</p>
      </header>
      <form
        className="library-search"
        onSubmit={async (event) => {
          event.preventDefault();
          if (query.trim().length < 2) return;
          setSearching(true);
          setSearchError("");
          try {
            setHits(
              await api<LibraryHit[]>(
                `learn-library?q=${encodeURIComponent(query.trim())}`,
              ),
            );
          } catch (error) {
            setSearchError((error as Error).message);
          } finally {
            setSearching(false);
          }
        }}
      >
        <Search size={18} aria-hidden="true" />
        <input
          aria-label="Search learning library"
          placeholder="Search your saved work"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={200}
        />
        <button
          className="button secondary"
          disabled={searching || query.trim().length < 2}
        >
          Search
        </button>
      </form>
      <div className="library-columns">
        <div aria-label="Library results" aria-busy={searching}>
          {searchError && <p role="alert">{searchError}</p>}
          {hits?.length === 0 && (
            <p role="status">No saved material matches that search.</p>
          )}
          {hits?.map((hit) => (
            <button
              className="learn-tool-row library-hit"
              onClick={() => open(hit)}
              key={hit.id}
            >
              <span>
                <small>
                  {hit.kind} · {hit.course}
                </small>
                <strong>{hit.title}</strong>
                <span>{hit.excerpt}</span>
              </span>
              <ArrowRight size={16} />
            </button>
          ))}
          {!hits && !searchError && (
            <p className="quiet-note">
              Searches saved lessons, notes, checkpoints, and indexed code.
            </p>
          )}
        </div>
        <form
          className="library-ask"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!selected.length || question.trim().length < 3) return;
            setAsking(true);
            setAnswer(undefined);
            setAnswerError("");
            try {
              setAnswer(
                await api<Answer>("learn-library-answer", {
                  courseIds: selected,
                  question: question.trim(),
                }),
              );
            } catch (error) {
              setAnswerError((error as Error).message);
            } finally {
              setAsking(false);
            }
          }}
        >
          <h2>
            <Sparkles size={17} /> Ask OffCourse
          </h2>
          <fieldset disabled={asking}>
            <legend>Choose up to five courses</legend>
            {courses.map((course) => (
              <label key={course.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(course.id)}
                  disabled={
                    selected.length === 5 && !selected.includes(course.id)
                  }
                  onChange={(event) => {
                    setSelected(
                      event.target.checked
                        ? [...selected, course.id]
                        : selected.filter((id) => id !== course.id),
                    );
                    setAnswer(undefined);
                  }}
                />
                {course.title}
              </label>
            ))}
            {!courses.length && (
              <p>Add a course to ask about saved material.</p>
            )}
          </fieldset>
          <textarea
            aria-label="Question for OffCourse"
            placeholder="What do you want to connect or clarify?"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={1000}
            rows={3}
          />
          <button
            className="button primary"
            disabled={asking || !selected.length || question.trim().length < 3}
          >
            {asking ? "Reading sources…" : "Ask OffCourse"}
          </button>
          {answerError && <p role="alert">{answerError}</p>}
          {answer && (
            <div className="library-answer">
              <Markdown
                skipHtml
                allowedElements={[
                  "p",
                  "strong",
                  "em",
                  "code",
                  "pre",
                  "ul",
                  "ol",
                  "li",
                  "blockquote",
                ]}
                unwrapDisallowed
              >
                {answer.answer}
              </Markdown>
              {answer.sources.map((source) => (
                <details key={source.number}>
                  <summary>
                    [{source.number}] {source.title} · {source.course}
                  </summary>
                  <p>{source.text}</p>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() =>
                      open({
                        id: source.id,
                        courseId: source.courseId,
                        course: source.course,
                        title: source.title,
                        kind: "Source",
                        excerpt: source.text,
                        lessonId: source.lessonId,
                        url: source.url,
                      })
                    }
                  >
                    Open source <ArrowRight size={14} />
                  </button>
                </details>
              ))}
            </div>
          )}
        </form>
      </div>
    </section>
  );
}

export function LessonPractice({
  api,
  courseId,
  lessonId,
  blocked,
  onStart,
}: {
  api: Api;
  courseId: string;
  lessonId: string;
  blocked: boolean;
  onStart: (id: string) => Promise<void>;
}) {
  const [language, setLanguage] = useState("python");
  const [draft, setDraft] = useState<Draft>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="lesson-practice">
      <summary>
        <Sparkles size={15} /> Practice this lesson
      </summary>
      <div>
        <label>
          Language{" "}
          <select
            value={language}
            disabled={busy}
            onChange={(event) => {
              setLanguage(event.target.value);
              setDraft(undefined);
            }}
          >
            <option value="python">Python</option>
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
          </select>
        </label>
        <button
          className="button secondary"
          disabled={busy || blocked}
          onClick={() =>
            void run(async () => {
              setDraft(undefined);
              setDraft(
                await api<Draft>("lesson-practice-draft", {
                  courseId,
                  lessonId,
                  language,
                }),
              );
            })
          }
        >
          {busy && !draft
            ? "Drafting…"
            : draft
              ? "Draft another"
              : "Draft a practical"}
        </button>
        {error && <p role="alert">{error}</p>}
        {draft && (
          <div className="practice-draft">
            <h3>{draft.title}</h3>
            <small>
              {draft.skill} · {draft.minutes} minutes · {draft.checks.length}{" "}
              runnable checks
            </small>
            <p>{draft.brief}</p>
            <ul>
              {draft.requirements.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <details>
              <summary>Starter and examples</summary>
              <pre>{draft.starter}</pre>
              {draft.checks.map((check) => (
                <p key={check.label}>
                  {check.label}
                  <br />
                  <code>
                    {JSON.stringify(check.input)} →{" "}
                    {JSON.stringify(check.expected)}
                  </code>
                </p>
              ))}
            </details>
            <button
              className="button primary"
              disabled={busy || blocked}
              onClick={() =>
                void run(async () => {
                  await onStart(draft.id);
                  setDraft(undefined);
                })
              }
            >
              {busy ? "Opening…" : "Start this practical"}
            </button>
          </div>
        )}
      </div>
    </details>
  );
}

export function LearnNext({
  api,
  revision,
  resume,
  openPractice,
}: {
  api: Api;
  revision: string;
  resume: React.ReactNode;
  openPractice: (tab: string, courseId?: string, target?: string) => void;
}) {
  const [next, setNext] = useState<ReturnType<LearnTools["next"]>>();
  useEffect(() => {
    let active = true;
    api<ReturnType<LearnTools["next"]>>("learn-next")
      .then((value) => {
        if (active) setNext(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [api, revision]);
  const practical = next?.practical,
    review = next?.review;
  return (
    <section className="learn-tools learn-next" aria-label="Up next">
      <h2>
        <BookOpen size={18} /> Up next
      </h2>
      {resume}
      <button
        className="learn-tool-row"
        onClick={() =>
          openPractice(
            practical?.kind === "project" ? "projects" : "practice",
            practical?.courseId,
            practical?.taskId || practical?.id,
          )
        }
      >
        <Code2 size={18} />
        <span>
          <small>Practical</small>
          <strong>{practical?.title || "Find a practical"}</strong>
        </span>
        {practical && <small>{practical.minutes} min</small>}
        <ArrowRight size={16} />
      </button>
      {review && (
        <button
          className="learn-tool-row"
          onClick={() =>
            openPractice("reviews", review.courseId, review.taskId)
          }
        >
          <History size={18} />
          <span>
            <small>Review due</small>
            <strong>{review.title}</strong>
          </span>
          <ArrowRight size={16} />
        </button>
      )}
    </section>
  );
}
