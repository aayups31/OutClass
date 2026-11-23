import React, { useEffect, useState } from "react";
import type { CourseUpgrades } from "../server/course-upgrades";
type API = <T>(route: string, body?: unknown) => Promise<T>;
type View = ReturnType<CourseUpgrades["view"]>;
type Preview = Awaited<ReturnType<CourseUpgrades["preview"]>>;
export function CourseUpgradeView({
  api,
  courseId,
  blocked,
  onUpgraded,
  onBusy,
}: {
  api: API;
  courseId: string;
  blocked: boolean;
  onUpgraded: (courseId: string) => Promise<void>;
  onBusy: (busy: boolean) => void;
}) {
  const [view, setView] = useState<View>(),
    [preview, setPreview] = useState<Preview>(),
    [paths, setPaths] = useState<string[]>([]),
    [prepared, setPrepared] = useState<{ id: string }>(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    onBusy(busy);
    return () => onBusy(false);
  }, [busy, onBusy]);
  useEffect(() => {
    let live = true;
    if (!/^academy:/.test(courseId)) return;
    api<View>(`course-upgrades?courseId=${encodeURIComponent(courseId)}`)
      .then((value) => {
        if (live) setView(value);
      })
      .catch((error) => {
        if (live) setMessage(error.message);
      });
    return () => {
      live = false;
    };
  }, [api, courseId]);
  async function action(task: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await task();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!view || (!view.available.length && !view.recent.length)) return null;
  return (
    <details className="learn-assignment">
      <summary>Course versions and preserved work</summary>
      <p>
        This workspace remains on revision {view.revision}. New versions open in
        a separate workspace. Existing files and evidence stay with their
        original release.
      </p>
      {blocked && (
        <p>
          Save current editor and review changes, and stop running programs
          before upgrading.
        </p>
      )}
      {view.available.map((release) => (
        <button
          className="button small"
          key={release.id}
          disabled={busy || blocked}
          onClick={() =>
            void action(async () => {
              setPreview(
                await api<Preview>("course-upgrades/preview", {
                  courseId,
                  toReleaseId: release.id,
                }),
              );
              setPaths([]);
              setPrepared(undefined);
            })
          }
        >
          Compare revision {release.revision}
        </button>
      ))}
      {preview && (
        <>
          <ul>
            {preview.mapping
              .filter((item) => item.status !== "unchanged")
              .map((item) => (
                <li key={item.from}>
                  {item.title}: {item.status}
                  {item.assessmentChanged ? " · assessment changed" : ""}
                </li>
              ))}
          </ul>
          <p>
            Choose saved files to copy. Conflicting files are preserved in a
            previous-release folder for manual merging. Assessment and progress
            records are not transferred.
          </p>
          {preview.skipped > 0 && (
            <p>
              The workspace listing excluded {preview.skipped} entries; this is
              a selected-file snapshot, not a full workspace backup.
            </p>
          )}
          <fieldset disabled={busy || blocked}>
            {preview.files.map((file) => (
              <label className="product-checkbox" key={file.path}>
                <input
                  type="checkbox"
                  disabled={
                    !file.target ||
                    (!paths.includes(file.path) && paths.length >= 40)
                  }
                  checked={paths.includes(file.path)}
                  onChange={(event) =>
                    setPaths((values) =>
                      event.target.checked
                        ? [...values, file.path]
                        : values.filter((path) => path !== file.path),
                    )
                  }
                />
                {file.path}
                {!file.target ? " · no unambiguous lesson mapping" : ""}
              </label>
            ))}
            <button
              className="button"
              disabled={!paths.length}
              onClick={() =>
                void action(async () =>
                  setPrepared(
                    await api("course-upgrades/prepare", {
                      courseId,
                      toReleaseId: preview.toReleaseId,
                      previewHash: preview.hash,
                      paths: preview.files
                        .filter((file) => paths.includes(file.path))
                        .map(({ path, version }) => ({ path, version })),
                      approve: true,
                    }),
                  ),
                )
              }
            >
              Prepare selected work snapshot
            </button>
          </fieldset>
        </>
      )}
      {prepared && (
        <button
          className="button primary"
          disabled={busy || blocked}
          onClick={() =>
            void action(async () => {
              const result = await api<{ courseId: string }>(
                `course-upgrades/${prepared.id}/apply`,
                { approve: true },
              );
              await onUpgraded(result.courseId);
            })
          }
        >
          Open the new release with preserved copies
        </button>
      )}
      {view.recent.map((job) => (
        <details key={job.id}>
          <summary>
            {job.state === "complete"
              ? "Preserved work from an earlier release"
              : "Resume a prepared upgrade"}
          </summary>
          {job.results.map((result) => (
            <p key={result.path}>
              {result.path}: {result.status} · {result.target}
            </p>
          ))}
          {job.state !== "complete" && (
            <button
              className="button"
              disabled={busy || blocked}
              onClick={() =>
                void action(async () => {
                  const result = await api<{ courseId: string }>(
                    `course-upgrades/${job.id}/apply`,
                    { approve: true },
                  );
                  await onUpgraded(result.courseId);
                })
              }
            >
              Resume this upgrade snapshot
            </button>
          )}
        </details>
      ))}
      <p role="status">{message}</p>
    </details>
  );
}
