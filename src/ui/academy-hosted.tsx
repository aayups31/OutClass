import React, { useState } from "react";
import type { CourseRelease } from "../expansion-contract";
type API = <T>(route: string, body?: unknown) => Promise<T>;
export function HostedAcademyPanel({
  api,
  releases,
  onCode,
}: {
  api: API;
  releases: CourseRelease[];
  onCode: (id: string) => void;
}) {
  const [selected, setSelected] = useState(""),
    [grant, setGrant] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [published, setPublished] = useState<
      { id: string; title: string; status: string; enrollments: number }[]
    >([]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const publication = releases.find((release) => release.id === selected);
  const hasLocalResources = publication?.lessons.some(
    (lesson) => lesson.resources?.length,
  );
  return (
    <section className="product-catalog">
      <h2>Academy, connected</h2>
      <p>
        Publish a free course to the web catalog, or bring an enrolled course
        into Learn. Sign in under Settings first. Your code and progress stay on
        this device.
      </p>
      <fieldset disabled={busy}>
        <label>
          Local release to share
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Choose an immutable release</option>
            {releases.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title} · v{r.revision}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button primary"
          disabled={!publication || hasLocalResources}
          onClick={() => {
            const release = releases.find((r) => r.id === selected)!;
            if (
              !confirm(
                `Publish “${release.title}” v${release.revision} publicly for free? This uploads its lessons and practice briefs. Confirm that you own the rights.`,
              )
            )
              return;
            void act(async () => {
              const result = await api<{ id: string; status: string }>(
                `expansion/releases/${selected}/publish`,
                { approvePublicRelease: true },
              );
              setMessage(
                `Course ${result.status}. View it in the Academy web catalog.`,
              );
            });
          }}
        >
          Review & publish free course
        </button>
        {hasLocalResources && (
          <p>
            Use this release in local Learn. Uploaded resources need hosted file
            storage before the course can go public.
          </p>
        )}
        <button
          className="button"
          onClick={() =>
            void act(async () => {
              setPublished(await api("expansion/hosted/mine"));
            })
          }
        >
          Refresh my published courses
        </button>
        {published.map((c) => (
          <article key={c.id}>
            <h3>{c.title}</h3>
            <p>
              {c.status} · {c.enrollments} enrollments
            </p>
            {c.status === "published" && (
              <button
                className="button"
                onClick={() => {
                  if (
                    !confirm(
                      "Withdraw this course? New enrollments and launch codes will stop. Existing downloaded local work stays on learners’ devices.",
                    )
                  )
                    return;
                  void act(async () => {
                    await api(`expansion/hosted/${c.id}/withdraw`, {
                      approveWithdrawal: true,
                    });
                    setPublished(await api("expansion/hosted/mine"));
                  });
                }}
              >
                Withdraw
              </button>
            )}
          </article>
        ))}
        <label>
          One-use launch code from the Academy website
          <input
            value={grant}
            onChange={(e) => setGrant(e.target.value.trim())}
            maxLength={64}
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste your five-minute course code"
          />
        </label>
        <button
          className="button primary"
          disabled={!/^[a-f0-9]{64}$/.test(grant)}
          onClick={() =>
            void act(async () => {
              const result = await api<{ courseId: string }>(
                "expansion/hosted/redeem",
                { grant },
              );
              setGrant("");
              onCode(result.courseId);
            })
          }
        >
          Open enrolled lesson in Learn
        </button>
      </fieldset>
      <p role="status">{message}</p>
      <a
        href="https://git-learn-black.vercel.app/academy#catalog"
        target="_blank"
        rel="noopener noreferrer"
      >
        Browse the free catalog ↗
      </a>
    </section>
  );
}
