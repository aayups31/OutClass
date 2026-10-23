import React, { useEffect, useState } from "react";
import { Search, Upload, Plus } from "lucide-react";
import type { MediaTranscript, MediaCue } from "../server/media-transcripts";
type API = <T>(route: string, body?: unknown) => Promise<T>;
export function MediaTranscriptPanel({
  api,
  assetId,
  onRange,
}: {
  api: API;
  assetId: string;
  onRange: (cue: MediaCue) => void;
}) {
  const [transcript, setTranscript] = useState<MediaTranscript | null>(null),
    [query, setQuery] = useState(""),
    [matches, setMatches] = useState<(MediaCue & { score: number })[]>([]);
  const [file, setFile] = useState<File>(),
    [rights, setRights] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setTranscript(null);
    setMatches([]);
    setError("");
    setFile(undefined);
    setRights(false);
    void api<MediaTranscript | null>(`expansion/media/transcripts/${assetId}`)
      .then((t) => {
        if (live) setTranscript(t);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [assetId, api]);
  async function importText() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (file.size > 240000) throw Error("Choose a transcript under 240 KB.");
      const t = await api<MediaTranscript>("expansion/media/transcripts", {
        assetId,
        expectedRevision: transcript?.revision || 0,
        name: file.name,
        text: await file.text(),
        rightsConfirmed: rights,
      });
      setTranscript(t);
      setMatches([]);
      setFile(undefined);
      setRights(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not import the transcript.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function search() {
    setBusy(true);
    setError("");
    try {
      setMatches(
        await api(
          `expansion/media/transcripts/${assetId}/search?q=${encodeURIComponent(query)}`,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="media-transcript-panel">
      <summary>
        <Search size={13} />
        Find moments in this footage
        <span>
          {transcript
            ? `${transcript.cues.length} timed cues`
            : "Add an SRT / VTT transcript"}
        </span>
      </summary>
      <div className="media-transcript-body">
        <details open={!transcript}>
          <summary>
            {transcript ? "Replace transcript" : "Import owned captions"}
          </summary>
          <label>
            Timed transcript
            <input
              aria-label="Owned footage transcript"
              type="file"
              accept=".srt,.vtt"
              onChange={(e) => setFile(e.target.files?.[0])}
            />
          </label>
          <label className="product-checkbox">
            <input
              type="checkbox"
              checked={rights}
              onChange={(e) => setRights(e.target.checked)}
            />
            I have permission to use this transcript with the selected footage.
          </label>
          <button
            className="button"
            disabled={busy || !file || !rights}
            onClick={() => void importText()}
          >
            <Upload size={13} />
            Index transcript locally
          </button>
        </details>
        {transcript && (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void search();
              }}
              className="media-transcript-search"
            >
              <input
                aria-label="Find a source moment"
                placeholder="e.g. grouping repeated records"
                value={query}
                maxLength={1000}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button className="button" disabled={busy}>
                <Search size={13} />
                Search
              </button>
            </form>
            <small>
              Keyword matches in your imported transcript. Review footage before
              rendering.
            </small>
            <div className="media-transcript-matches">
              {matches.map((c) => (
                <article key={c.index}>
                  <div>
                    <strong>
                      {c.start.toFixed(2)}–{c.end.toFixed(2)}s
                    </strong>
                    <p>{c.text}</p>
                  </div>
                  <button
                    className="button"
                    disabled={c.end - c.start > 90}
                    onClick={() => onRange(c)}
                  >
                    <Plus size={12} />
                    Add as scene
                  </button>
                </article>
              ))}
            </div>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  );
}
