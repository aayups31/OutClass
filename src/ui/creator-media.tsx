import React, { useEffect, useState, useRef } from "react";
import { Film, Plus, Play, Download, CheckCircle2, X } from "lucide-react";
import type { Creative } from "../expansion-contract";
import { MediaTranscriptPanel } from "./media-transcripts";
import type {
  MediaAsset,
  RenderJob,
  VideoTimeline,
  TimelineDraft,
} from "../server/creator-production";
type API = <T>(route: string, body?: unknown) => Promise<T>;
export function CreatorMedia({
  api,
  creative,
  dirty,
  onTimelineDirty,
}: {
  api: API;
  creative?: Creative;
  dirty: boolean;
  onTimelineDirty: (dirty: boolean) => void;
}) {
  const [data, setData] = useState<{
      assets: MediaAsset[];
      jobs: RenderJob[];
      drafts: TimelineDraft[];
    }>({ assets: [], jobs: [], drafts: [] }),
    [file, setFile] = useState<File>(),
    [rights, setRights] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [assetId, setAsset] = useState(""),
    [format, setFormat] = useState<VideoTimeline["format"]>("landscape"),
    [scenes, setScenes] = useState<VideoTimeline["scenes"]>([
      { start: 0, end: 5, caption: "" },
    ]),
    [preview, setPreview] = useState(""),
    [previewJob, setPreviewJob] = useState<RenderJob>();
  const [timelineRevision, setTimelineRevision] = useState(0),
    [timelineDirty, setTimelineDirty] = useState(false);
  const [sourcePreview, setSourcePreview] = useState("");
  const sourcePlayer = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    setSourcePreview("");
  }, [assetId]);
  const mark = () => {
    setTimelineDirty(true);
    onTimelineDirty(true);
  };
  const updateScenes = (value: VideoTimeline["scenes"]) => {
    setScenes(value);
    mark();
  };
  const updateAsset = (value: string) => {
    setAsset(value);
    mark();
  };
  const updateFormat = (value: VideoTimeline["format"]) => {
    setFormat(value);
    mark();
  };
  useEffect(() => {
    let active = true;
    setTimelineRevision(0);
    setTimelineDirty(false);
    onTimelineDirty(false);
    setAsset("");
    setScenes([{ start: 0, end: 5, caption: "" }]);
    setFormat("landscape");
    if (creative)
      api<typeof data>("expansion/media/state")
        .then((r) => {
          if (!active) return;
          const draft = r.drafts?.find((d) => d.creativeId === creative.id);
          if (draft) {
            setAsset(draft.timeline.assetId);
            setScenes(draft.timeline.scenes);
            setFormat(draft.timeline.format);
            setTimelineRevision(draft.revision);
          }
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [api, creative?.id, onTimelineDirty]);
  const asset = data.assets.find((a) => a.id === assetId);
  const refresh = async () => {
    const result = await api<typeof data>("expansion/media/state");
    setData(result);
    return result;
  };
  useEffect(() => {
    let active = true;
    const get = () =>
      api<typeof data>("expansion/media/state")
        .then((r) => {
          if (active) setData(r);
        })
        .catch((err) => {
          if (active) setError(err.message);
        });
    void get();
    const timer = setInterval(get, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api]);
  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Production failed.");
    } finally {
      setBusy(false);
    }
  }
  const total = scenes.reduce((n, s) => n + s.end - s.start, 0);
  return (
    <section className="creator-media-panel">
      <div className="product-panel-heading">
        <h2>
          <Film size={18} /> Video Studio
        </h2>
        <span>Local rendering · No cloud media charges</span>
      </div>
      <p>
        Import your own footage, choose the teaching moments, compose captions,
        and review a real export.
      </p>
      {error && (
        <p role="alert" className="product-message error">
          {error}
        </p>
      )}
      <div className="product-input-row">
        <label>
          Source video · up to 80 MB
          <input
            type="file"
            accept="video/mp4,video/webm,.mov"
            onChange={(e) => setFile(e.target.files?.[0])}
          />
        </label>
        <div>
          <label className="product-checkbox">
            <input
              type="checkbox"
              checked={rights}
              onChange={(e) => setRights(e.target.checked)}
            />
            I have permission to edit and use this footage.
          </label>
          <button
            className="button"
            disabled={busy || !rights || !file}
            onClick={() =>
              void act(async () => {
                if (file!.size > 80 * 1024 * 1024)
                  throw Error("Choose a video under 80 MB.");
                const result = await api<MediaAsset>(
                  `expansion/media/import?name=${encodeURIComponent(file!.name)}&rights=confirmed`,
                  file,
                );
                updateAsset(result.id);
                updateScenes([
                  { start: 0, end: Math.min(5, result.duration), caption: "" },
                ]);
              })
            }
          >
            Import & inspect video
          </button>
        </div>
      </div>
      <label>
        Source library
        <select
          aria-label="Source library"
          value={assetId}
          onChange={(e) => {
            updateAsset(e.target.value);
            const value = data.assets.find((a) => a.id === e.target.value);
            if (value)
              updateScenes([
                { start: 0, end: Math.min(5, value.duration), caption: "" },
              ]);
          }}
        >
          <option value="">Choose footage</option>
          {data.assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.duration.toFixed(1)}s · {a.width}×{a.height}
            </option>
          ))}
        </select>
      </label>
      {assetId && (
        <MediaTranscriptPanel
          key={assetId}
          api={api}
          assetId={assetId}
          onRange={(cue) => {
            const current =
              scenes.length === 1 && !scenes[0].caption ? [] : scenes;
            if (current.length >= 8) {
              setError(
                "This timeline already has eight scenes. Remove one before adding another.",
              );
              return;
            }
            updateScenes([
              ...current,
              {
                start: cue.start,
                end: cue.end,
                caption: cue.text.slice(0, 150),
              },
            ]);
            if (sourcePlayer.current)
              sourcePlayer.current.currentTime = cue.start;
          }}
        />
      )}
      <button
        className="button"
        disabled={busy || !assetId}
        onClick={() =>
          void act(async () => {
            const result = await api<{ url: string }>(
              `expansion/media/${assetId}/access`,
              { kind: "source" },
            );
            setSourcePreview(result.url);
          })
        }
      >
        <Play size={14} /> Preview source footage
      </button>
      {sourcePreview && (
        <div className="creator-source-player">
          <video
            ref={sourcePlayer}
            controls
            playsInline
            preload="metadata"
            src={sourcePreview}
            aria-label="Source footage preview"
          />
          <p>
            Scrub the source, then mark each scene’s start and end below. The
            original footage stays unchanged.
          </p>
        </div>
      )}
      <label>
        Output composition
        <select
          aria-label="Output composition"
          value={format}
          onChange={(e) =>
            updateFormat(e.target.value as VideoTimeline["format"])
          }
        >
          <option value="landscape">Landscape · 1280×720</option>
          <option value="portrait">
            Portrait · 720×1280 with safe framing
          </option>
        </select>
      </label>
      <div className="creator-storyboard">
        {scenes.map((scene, i) => (
          <article key={i}>
            <div className="product-panel-heading">
              <h3>Scene {i + 1}</h3>
              <button
                aria-label={`Remove scene ${i + 1}`}
                disabled={scenes.length === 1 || busy}
                onClick={() => updateScenes(scenes.filter((_, n) => n !== i))}
              >
                <X size={14} />
              </button>
            </div>
            {sourcePreview && (
              <div className="product-actions">
                <button
                  className="button small"
                  onClick={() => {
                    const time = sourcePlayer.current?.currentTime || 0;
                    if (!asset || time >= scene.end) {
                      setError("Choose a source time before this scene’s end.");
                      return;
                    }
                    updateScenes(
                      scenes.map((s, n) =>
                        n === i ? { ...s, start: Number(time.toFixed(3)) } : s,
                      ),
                    );
                  }}
                >
                  Mark start from video
                </button>
                <button
                  className="button small"
                  onClick={() => {
                    const time = sourcePlayer.current?.currentTime || 0;
                    if (time <= scene.start) {
                      setError(
                        "Choose a source time after this scene’s start.",
                      );
                      return;
                    }
                    updateScenes(
                      scenes.map((s, n) =>
                        n === i ? { ...s, end: Number(time.toFixed(3)) } : s,
                      ),
                    );
                  }}
                >
                  Mark end from video
                </button>
              </div>
            )}
            <div className="product-input-row">
              <label>
                Start seconds
                <input
                  aria-label={`Start seconds ${i + 1}`}
                  type="number"
                  step=".1"
                  min="0"
                  max={asset?.duration}
                  value={scene.start}
                  onChange={(e) =>
                    updateScenes(
                      scenes.map((s, n) =>
                        n === i ? { ...s, start: Number(e.target.value) } : s,
                      ),
                    )
                  }
                />
              </label>
              <label>
                End seconds
                <input
                  aria-label={`End seconds ${i + 1}`}
                  type="number"
                  step=".1"
                  min="0"
                  max={asset?.duration}
                  value={scene.end}
                  onChange={(e) =>
                    updateScenes(
                      scenes.map((s, n) =>
                        n === i ? { ...s, end: Number(e.target.value) } : s,
                      ),
                    )
                  }
                />
              </label>
            </div>
            <label>
              Caption
              <input
                aria-label={`Caption ${i + 1}`}
                value={scene.caption}
                maxLength={150}
                placeholder="A source-grounded teaching point"
                onChange={(e) =>
                  updateScenes(
                    scenes.map((s, n) =>
                      n === i ? { ...s, caption: e.target.value } : s,
                    ),
                  )
                }
              />
            </label>
          </article>
        ))}
      </div>
      <div className="creator-timeline" aria-label="Timeline duration">
        {scenes.map((s, i) => (
          <span key={i} style={{ flex: Math.max(0.1, s.end - s.start) }}>
            {i + 1} · {Math.max(0, s.end - s.start).toFixed(1)}s
          </span>
        ))}
      </div>
      <div className="product-actions">
        <button
          className="button"
          disabled={!creative || !asset || dirty || busy}
          onClick={() =>
            void act(async () => {
              const draft = await api<TimelineDraft>(
                "expansion/media/timeline",
                {
                  creativeId: creative!.id,
                  expectedRevision: creative!.revision,
                  expectedTimelineRevision: timelineRevision,
                  assetId,
                  format,
                  scenes,
                },
              );
              setTimelineRevision(draft.revision);
              setTimelineDirty(false);
              onTimelineDirty(false);
            })
          }
        >
          Save editable timeline
        </button>
        <span>
          {timelineDirty
            ? "Unsaved timeline"
            : timelineRevision
              ? "Saved timeline v" + timelineRevision
              : "New timeline"}
        </span>
        <button
          className="button"
          disabled={scenes.length >= 8 || !asset}
          onClick={() =>
            updateScenes([
              ...scenes,
              { start: 0, end: Math.min(5, asset!.duration), caption: "" },
            ])
          }
        >
          <Plus size={14} />
          Add scene
        </button>
        <button
          className="button primary"
          disabled={busy || dirty || !creative?.approval || !asset}
          onClick={() => {
            if (
              confirm(
                `Render this ${total.toFixed(1)}-second timeline locally with FFmpeg? Review the exact ranges and captions first. This does not publish anything.`,
              )
            )
              void act(() =>
                api("expansion/media/render", {
                  creativeId: creative!.id,
                  expectedRevision: creative!.revision,
                  assetId,
                  format,
                  scenes,
                  approveRender: true,
                }),
              );
          }}
        >
          <Play size={14} />
          Render reviewed timeline
        </button>
      </div>
      {!creative?.approval && (
        <p className="product-limit">
          Save and approve the creative copy above before rendering.
        </p>
      )}
      <h3>Production queue</h3>
      {!data.jobs.length && <p>No renders yet.</p>}
      {[...data.jobs].reverse().map((job) => (
        <div className="creator-render-job" key={job.id}>
          <div>
            <strong>
              {job.timeline.format} · {job.state}
            </strong>
            <p>{job.stage}</p>
            {job.error && <p>{job.error}</p>}
            {job.output && (
              <small>
                Verified {job.output.width}×{job.output.height} ·{" "}
                {job.output.duration.toFixed(1)}s ·{" "}
                {(job.output.bytes / 1024).toFixed(0)} KB ·{" "}
                {job.output.audio ? "Audio retained" : "Silent source"}
              </small>
            )}
          </div>
          <div className="product-actions">
            {["queued", "processing"].includes(job.state) ? (
              <button
                className="button"
                onClick={() =>
                  void act(() => api(`expansion/media/${job.id}/cancel`, {}))
                }
              >
                Cancel render
              </button>
            ) : job.state === "ready" ? (
              <>
                <button
                  className="button"
                  onClick={() =>
                    void act(async () => {
                      const result = await api<{ url: string }>(
                        `expansion/media/${job.id}/access`,
                        { kind: "export" },
                      );
                      setPreview(result.url);
                      setPreviewJob(job);
                    })
                  }
                >
                  Review export
                </button>
                {["export", "captions", "manifest"].map((kind) => (
                  <button
                    className="button small"
                    key={kind}
                    onClick={() =>
                      void act(async () => {
                        const result = await api<{ url: string }>(
                          `expansion/media/${job.id}/access`,
                          { kind },
                        );
                        const a = document.createElement("a");
                        a.href = result.url;
                        a.download = `outclass-${job.id}.${kind === "export" ? "mp4" : kind === "captions" ? "srt" : "json"}`;
                        a.click();
                      })
                    }
                  >
                    <Download size={13} />
                    {kind}
                  </button>
                ))}
                {job.approval && (
                  <span>
                    <CheckCircle2 size={14} />
                    Approved exact export
                  </span>
                )}
              </>
            ) : null}
          </div>
        </div>
      ))}
      {preview && (
        <div className="creator-review">
          <video
            controls
            playsInline
            src={preview}
            aria-label="Rendered creative preview"
          />
          <button
            className="button primary"
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  "Approve this exact rendered version for distribution after reviewing the video and captions?",
                )
              )
                void act(() =>
                  api(`expansion/media/${previewJob!.id}/approve`, {
                    approveReviewed: true,
                  }),
                );
            }}
          >
            Approve reviewed export
          </button>
        </div>
      )}
    </section>
  );
}
