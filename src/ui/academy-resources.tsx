import React, { useEffect, useRef, useState } from "react";
import {
  Download,
  FileCode,
  FileText,
  FileArchive,
  Film,
  Trash2,
} from "lucide-react";
import type { AcademyResource } from "../academy-resource-contract";
import "./academy-resources.css";

type API = <T>(route: string, body?: unknown) => Promise<T>;
const icons = {
  code: FileCode,
  pdf: FileText,
  archive: FileArchive,
  video: Film,
};
const labels = { code: "Code", pdf: "PDF", archive: "ZIP", video: "Video" };

export function AcademyResourceList({
  api,
  items,
  onRemove,
  onStarter,
}: {
  api: API;
  items: AcademyResource[];
  onRemove?: (id: string) => void;
  onStarter?: (item: AcademyResource) => void;
}) {
  const [video, setVideo] = useState<{ id: string; url: string }>();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(
    () => () => {
      if (video) URL.revokeObjectURL(video.url);
    },
    [video],
  );
  async function open(item: AcademyResource, preview: boolean) {
    setBusy(item.id);
    setError("");
    try {
      const blob = await api<Blob>(`academy-resources/${item.id}`);
      if (!active.current) return;
      const url = URL.createObjectURL(blob);
      if (preview) setVideo({ id: item.id, url });
      else {
        const link = document.createElement("a");
        link.href = url;
        link.download = item.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    } catch (err) {
      if (active.current)
        setError(
          err instanceof Error ? err.message : "Could not open this resource.",
        );
    } finally {
      if (active.current) setBusy("");
    }
  }
  return (
    <div className="academy-resource-list">
      {error && <p role="alert">{error}</p>}
      {items.map((item) => {
        const Icon = icons[item.kind];
        return (
          <article className="academy-resource-card" key={item.id}>
            <div className="academy-resource-row">
              <span className="academy-resource-icon">
                <Icon size={17} />
              </span>
              <div>
                <strong>{item.name}</strong>
                <small>
                  {labels[item.kind]} ·{" "}
                  {item.bytes >= 1048576
                    ? `${(item.bytes / 1048576).toFixed(1)} MB`
                    : `${Math.max(1, Math.ceil(item.bytes / 1024))} KB`}
                </small>
              </div>
              <div className="academy-resource-actions">
                {item.kind === "video" && (
                  <button
                    className="button small"
                    disabled={!!busy}
                    onClick={() =>
                      video?.id === item.id
                        ? setVideo(undefined)
                        : void open(item, true)
                    }
                  >
                    {video?.id === item.id ? "Close player" : "Play"}
                  </button>
                )}
                {onStarter && item.kind === "code" && (
                  <button
                    className="button small"
                    onClick={() => onStarter(item)}
                  >
                    Use in Learn starter
                  </button>
                )}
                <button
                  className="button small"
                  disabled={!!busy}
                  aria-label={`Download ${item.name}`}
                  onClick={() => void open(item, false)}
                >
                  <Download size={14} />
                </button>
                {onRemove && (
                  <button
                    className="button small"
                    aria-label={`Remove ${item.name}`}
                    onClick={() => {
                      if (video?.id === item.id) setVideo(undefined);
                      onRemove(item.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
            {video?.id === item.id && (
              <video
                controls
                playsInline
                preload="metadata"
                src={video.url}
                aria-label={item.name}
              />
            )}
          </article>
        );
      })}
    </div>
  );
}

export function LearnResources({
  api,
  courseId,
  lessonId,
}: {
  api: API;
  courseId: string;
  lessonId: string;
}) {
  const [items, setItems] = useState<AcademyResource[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setItems([]);
    setError("");
    if (!/^academy(?:-preview)?:/.test(courseId)) return;
    void api<AcademyResource[]>(
      `learn-resources?courseId=${encodeURIComponent(courseId)}&lessonId=${encodeURIComponent(lessonId)}`,
    )
      .then((result) => {
        if (live) setItems(result);
      })
      .catch((err) => {
        if (live) setError(err.message);
      });
    return () => {
      live = false;
    };
  }, [api, courseId, lessonId]);
  if (error) return <p role="alert">{error}</p>;
  return items.length ? (
    <details className="learn-resources" open>
      <summary>Lesson resources</summary>
      <AcademyResourceList
        api={api}
        items={items}
        key={`${courseId}:${lessonId}`}
      />
    </details>
  ) : null;
}
