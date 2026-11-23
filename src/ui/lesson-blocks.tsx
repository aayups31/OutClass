import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { LessonBlock } from "../lesson-blocks";
import { lessonBlocks } from "../lesson-blocks";
import type { AcademyResource } from "../academy-resource-contract";
function CaptionedMedia({
  block,
  resource,
  api,
}: {
  block: Extract<LessonBlock, { kind: "media" }>;
  resource?: AcademyResource;
  api: <T>(route: string, body?: unknown) => Promise<T>;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true,
      objectUrl = "";
    setUrl("");
    setError("");
    if (!resource) return;
    api<Blob>(`academy-resources/${resource.id}`)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (live) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [api, resource?.id]);
  const [track, setTrack] = useState("");
  useEffect(() => {
    if (!block.captions) {
      setTrack("");
      return;
    }
    const url = URL.createObjectURL(
      new Blob([block.captions], { type: "text/vtt" }),
    );
    setTrack(url);
    return () => URL.revokeObjectURL(url);
  }, [block.captions]);
  return (
    <figure>
      {resource?.kind === "video" && url ? (
        <video controls preload="metadata" src={url} aria-label={block.caption}>
          {track && (
            <track
              kind="captions"
              srcLang="en"
              label="English"
              src={track}
              default
            />
          )}
        </video>
      ) : url ? (
        <a href={url} download={resource?.name}>
          {resource?.name}
        </a>
      ) : (
        <p role={error ? "alert" : "status"}>
          {error || "Loading lesson media…"}
        </p>
      )}
      <figcaption>{block.caption}</figcaption>
      <details>
        <summary>Read transcript and description</summary>
        <p style={{ whiteSpace: "pre-wrap" }}>{block.transcript}</p>
      </details>
    </figure>
  );
}
export function LessonBlocks({
  blocks,
  resources,
  api,
}: {
  blocks: LessonBlock[];
  resources: AcademyResource[];
  api: <T>(route: string, body?: unknown) => Promise<T>;
}) {
  return (
    <section className="lesson-teaching" aria-label="Lesson teaching material">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "text":
            return (
              <ReactMarkdown
                key={index}
                skipHtml
                components={{ img: ({ alt }) => <span>{alt}</span> }}
              >
                {block.body}
              </ReactMarkdown>
            );
          case "code":
            return (
              <figure key={index}>
                <pre>
                  <code>{block.code}</code>
                </pre>
                <figcaption>
                  {block.language} · {block.explanation}
                </figcaption>
              </figure>
            );
          case "equation":
            return (
              <figure key={index}>
                <pre aria-label={block.explanation}>{block.notation}</pre>
                <figcaption>{block.explanation}</figcaption>
              </figure>
            );
          case "table":
            return (
              <div key={index} style={{ overflowX: "auto" }}>
                <table>
                  <caption>{block.caption}</caption>
                  <thead>
                    <tr>
                      {block.headers.map((header, i) => (
                        <th scope="col" key={i}>
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "diagram":
            return (
              <figure key={index}>
                <ol className="lesson-diagram">
                  {block.nodes.map((node, i) => (
                    <li key={i}>
                      <strong>{node.label}</strong>
                      <p>{node.detail}</p>
                    </li>
                  ))}
                </ol>
                <figcaption>{block.caption}</figcaption>
                <p>{block.description}</p>
              </figure>
            );
          case "media":
            return (
              <CaptionedMedia
                key={index}
                block={block}
                resource={resources.find(
                  (resource) => resource.id === block.resourceId,
                )}
                api={api}
              />
            );
        }
      })}
    </section>
  );
}
export function LessonBlocksEditor({
  value,
  onChange,
  onDirty,
}: {
  value: LessonBlock[];
  onChange: (value: LessonBlock[]) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const serialized = JSON.stringify(value, null, 2);
  const [raw, setRaw] = useState(serialized),
    [error, setError] = useState("");
  useEffect(() => setRaw(serialized), [serialized]);
  useEffect(() => {
    onDirty(raw !== serialized);
    return () => onDirty(false);
  }, [onDirty, raw, serialized]);
  return (
    <details>
      <summary>
        Structured figures, tables, equations and captioned media
      </summary>
      <p>
        Each media block needs a resource ID, caption and transcript. Tables
        need column headings; diagrams need a text description.
      </p>
      <textarea
        aria-label="Structured teaching blocks"
        rows={12}
        value={raw}
        onChange={(event) => {
          setRaw(event.target.value);
          setError("Unapplied block edits");
        }}
      />
      <button
        className="button"
        onClick={() => {
          try {
            onChange(lessonBlocks.parse(JSON.parse(raw)));
            setError("");
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Apply teaching blocks
      </button>
      {error && <p role="status">{error}</p>}
    </details>
  );
}
