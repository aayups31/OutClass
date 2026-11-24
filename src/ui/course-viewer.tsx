import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  GripHorizontal,
  Link2,
  PanelTop,
  X,
} from "lucide-react";
import type { Course } from "../shared";
import type { LearnDelivery } from "../server/learn-delivery";
import { courseViewUrl, lessonViewUrl } from "../course-view-url";
import { LessonBlocks } from "./lesson-blocks";
import "./course-viewer.css";

type Position = { x: number; y: number };
type Assignment = NonNullable<ReturnType<LearnDelivery["snapshot"]>>;

export function CourseViewer({
  course,
  lessonId,
  api,
  onClose,
}: {
  course: Course;
  lessonId?: string;
  api: <T>(route: string, body?: unknown) => Promise<T>;
  onClose: () => void;
}) {
  const desktop = window.gitLearnDesktop?.courseViewer;
  const lessons = course.lessons.filter((lesson) => !lesson.archived);
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      lessons.findIndex((lesson) => lesson.id === lessonId),
    ),
  );
  const [position, setPosition] = useState<Position>();
  const [nativeHover, setNativeHover] = useState(false);
  const linkKey = `outclass-course-link:${course.id}`;
  const [link, setLink] = useState(() => {
    try {
      const saved = localStorage.getItem(linkKey) || "";
      return courseViewUrl(saved) ? saved : "";
    } catch {
      return "";
    }
  });
  const [entered, setEntered] = useState("");
  const [editing, setEditing] = useState(false);
  const [showSite, setShowSite] = useState(false);
  const [error, setError] = useState("");
  const [material, setMaterial] = useState<Assignment | null>();
  const frame = useRef<HTMLElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const grab = useRef<Position | undefined>(undefined);
  const lesson = lessons[index];
  const academy = course.platform === "academy" && !!lesson && !link;
  const source = link || course.url;
  const browserUrl = courseViewUrl(source);
  const embedded =
    !academy && lessonViewUrl(source, link ? undefined : lesson?.id);
  const embeddedUrl = embedded ? new URL(embedded) : null;
  const canSwitchView =
    embeddedUrl &&
    browserUrl &&
    embeddedUrl.href !== browserUrl.href &&
    (embeddedUrl.pathname.startsWith("/embed/") ||
      embeddedUrl.hostname === "player.vimeo.com");
  const player = showSite && canSwitchView ? browserUrl?.href : embedded;
  const showNative = !!(desktop && player && !editing && !error);
  const browserHref = browserUrl?.hostname.endsWith("udemy.com")
    ? player || browserUrl.href
    : browserUrl?.href;

  const measure = () => {
    const rect = surface.current?.getBoundingClientRect();
    return rect
      ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      : { x: 0, y: 0, width: 0, height: 0 };
  };
  useEffect(() => desktop?.onHover(setNativeHover), [desktop]);
  useEffect(() => {
    if (!desktop || !player || editing) return;
    let current = true;
    setError("");
    setNativeHover(false);
    void desktop.open(player, measure()).catch((reason: Error) => {
      if (current) setError(reason.message);
    });
    return () => {
      current = false;
      void desktop.close().catch(() => {});
    };
  }, [desktop, player, editing]);
  useLayoutEffect(() => {
    const panel = frame.current;
    const area = panel?.parentElement;
    if (!panel || !area) return;
    const constrain = () => {
      setPosition((previous) => {
        if (!previous) return previous;
        const x = Math.max(
          0,
          Math.min(previous.x, area.clientWidth - panel.offsetWidth),
        );
        const y = Math.max(
          0,
          Math.min(previous.y, area.clientHeight - panel.offsetHeight),
        );
        return x === previous.x && y === previous.y ? previous : { x, y };
      });
      if (showNative) void desktop?.bounds(measure()).catch(() => {});
    };
    const observer = new ResizeObserver(constrain);
    observer.observe(panel);
    observer.observe(area);
    window.addEventListener("resize", constrain);
    constrain();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", constrain);
    };
  }, [desktop, showNative]);
  useLayoutEffect(() => {
    if (showNative) void desktop?.bounds(measure()).catch(() => {});
  }, [desktop, position, showNative]);
  useEffect(() => {
    if (!academy || !lesson) return;
    let current = true;
    setMaterial(undefined);
    setError("");
    void api<Assignment | null>(
      `learn-assignment?courseId=${encodeURIComponent(course.id)}&lessonId=${encodeURIComponent(lesson.id)}`,
    )
      .then((result) => {
        if (current) setMaterial(result);
      })
      .catch((reason: Error) => {
        if (current) setError(reason.message);
      });
    return () => {
      current = false;
    };
  }, [academy, lesson?.id, course.id, api]);

  function move(x: number, y: number) {
    const panel = frame.current;
    const area = panel?.parentElement;
    if (!panel || !area) return;
    setPosition({
      x: Math.max(0, Math.min(x, area.clientWidth - panel.offsetWidth)),
      y: Math.max(0, Math.min(y, area.clientHeight - panel.offsetHeight)),
    });
  }
  function chooseLink(value: string) {
    try {
      if (value) localStorage.setItem(linkKey, value);
      else localStorage.removeItem(linkKey);
    } catch {}
    setError("");
    setLink(value);
    setShowSite(false);
    setEditing(false);
  }

  const showLink = editing || (!academy && !player);
  return (
    <section
      className="course-viewer"
      aria-label="Follow course"
      data-native-hover={nativeHover}
      ref={frame}
      style={position && { left: position.x, top: position.y, right: "auto" }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="course-viewer-tools">
        <button
          type="button"
          className="course-viewer-grip"
          aria-label="Move course viewer with arrow keys or drag"
          title="Move viewer"
          onPointerDown={(event) => {
            if (event.button !== 0 || !frame.current) return;
            grab.current = {
              x: event.clientX - frame.current.offsetLeft,
              y: event.clientY - frame.current.offsetTop,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (grab.current)
              move(
                event.clientX - grab.current.x,
                event.clientY - grab.current.y,
              );
          }}
          onLostPointerCapture={() => {
            grab.current = undefined;
          }}
          onKeyDown={(event) => {
            const direction = {
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
              ArrowUp: [0, -1],
              ArrowDown: [0, 1],
            }[event.key];
            if (!direction || !frame.current) return;
            event.preventDefault();
            move(
              frame.current.offsetLeft + direction[0] * 24,
              frame.current.offsetTop + direction[1] * 24,
            );
          }}
        >
          <GripHorizontal size={16} />
        </button>
        <span title={lesson?.title || course.title}>
          {link ? browserUrl?.hostname : lesson?.title || course.title}
        </span>
        {!link && lessons.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous lesson"
              title="Previous lesson"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              aria-label="Next lesson"
              title="Next lesson"
              disabled={index >= lessons.length - 1}
              onClick={() => setIndex(index + 1)}
            >
              <ChevronRight size={15} />
            </button>
          </>
        )}
        <button
          type="button"
          aria-label="Change course link"
          title="Change course link"
          onClick={() => {
            setEntered(link);
            setError("");
            setEditing(!editing);
          }}
        >
          <Link2 size={14} />
        </button>
        {desktop && canSwitchView && !editing && (
          <button
            type="button"
            aria-label={showSite ? "Use video player" : "Use course site view"}
            title={showSite ? "Use video player" : "Use course site view"}
            onClick={() => {
              setError("");
              setShowSite(!showSite);
            }}
          >
            <PanelTop size={14} />
          </button>
        )}
        {browserHref && !editing && (
          <a
            href={browserHref}
            target="_blank"
            rel="noreferrer"
            aria-label="Open lesson in browser"
            title="Open lesson in browser"
          >
            <ArrowUpRight size={15} />
          </a>
        )}
        <button
          type="button"
          aria-label="Close course viewer"
          title="Close course viewer"
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </div>
      <div
        className={
          showNative ? "course-viewer-surface native" : "course-viewer-surface"
        }
        ref={surface}
      >
        {showLink ? (
          <form
            className="course-viewer-link"
            onSubmit={(event) => {
              event.preventDefault();
              if (!courseViewUrl(entered.trim())) {
                setError(
                  "Use an HTTPS lesson link from a supported course site.",
                );
                return;
              }
              chooseLink(entered.trim());
            }}
          >
            <label htmlFor="course-viewer-link">Lesson link</label>
            <input
              id="course-viewer-link"
              value={entered}
              onChange={(event) => setEntered(event.target.value)}
              placeholder="YouTube, Udemy, Vimeo…"
              autoFocus
            />
            <button type="submit">Open</button>
            {!!link && (
              <button type="button" onClick={() => chooseLink("")}>
                Use current course
              </button>
            )}
          </form>
        ) : academy && !error ? (
          material ? (
            <LessonBlocks
              api={api}
              resources={material.resources}
              blocks={[
                { kind: "text", body: material.content },
                ...material.blocks,
              ]}
            />
          ) : (
            <p role="status">
              {material === null
                ? "No material for this lesson."
                : "Opening lesson…"}
            </p>
          )
        ) : !desktop && !error ? (
          <p>
            <a href={browserHref} target="_blank" rel="noreferrer">
              Open lesson in browser <ArrowUpRight size={14} />
            </a>
          </p>
        ) : null}
        {error && <p role="alert">{error}</p>}
      </div>
    </section>
  );
}
