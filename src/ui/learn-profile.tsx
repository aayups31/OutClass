import { useEffect, useState } from "react";
import { ArrowRight, Check, UserRound } from "lucide-react";
import type { Status } from "../shared";
import type { Exercise } from "../server/practice";
import type { LearnProgress } from "../server/learn-progress";
import type { AIUsage } from "../ai-contract";
import { DesktopAccount } from "./desktop-account";
import "./learn-profile.css";

const languages: Record<Exercise["language"], { name: string; mark: string }> =
  {
    javascript: { name: "JavaScript", mark: "JS" },
    typescript: { name: "TypeScript", mark: "TS" },
    python: { name: "Python", mark: "Py" },
    c: { name: "C", mark: "C" },
    cpp: { name: "C++", mark: "C++" },
  };

export function LearnProfile({
  account,
  api,
  onRefresh,
  onPractice,
}: {
  account: Status["account"];
  api: <T>(route: string, body?: unknown) => Promise<T>;
  onRefresh: () => Promise<unknown>;
  onPractice: () => void;
}) {
  type AccountProgress = ReturnType<LearnProgress["status"]>;
  const [progress, setProgress] = useState<AccountProgress>();
  const [usage, setUsage] = useState<AIUsage>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [usageUnavailable, setUsageUnavailable] = useState(false);
  const skills = progress?.progress.skills;
  const courseProgress = progress?.progress.courses;
  const percent = usage?.limit
    ? Math.min(
        100,
        Math.max(0, Math.round((usage.remaining / usage.limit) * 100)),
      )
    : 0;
  const reset =
    usage && /^\d{4}-\d{2}$/.test(usage.period)
      ? new Date(
          Date.UTC(
            Number(usage.period.slice(0, 4)),
            Number(usage.period.slice(5)),
            1,
          ),
        )
      : undefined;

  useEffect(() => {
    setProgress(undefined);
    setUsage(undefined);
    setUsageUnavailable(false);
    setError("");
    if (!account?.email) return;
    let active = true;
    api<AIUsage>("ai-usage")
      .then((result) => {
        if (active) setUsage(result);
      })
      .catch(() => {
        if (active) setUsageUnavailable(true);
      });
    api<AccountProgress>("account-progress")
      .then(async (status) => {
        if (!active) return;
        setProgress(status);
        if (status.enabled) {
          const fresh = await api<AccountProgress>("account-progress", {});
          if (active) setProgress(fresh);
        }
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      });
    return () => {
      active = false;
    };
  }, [account?.email, api]);

  async function changeSync(enabled?: boolean) {
    setBusy(true);
    setError("");
    try {
      setProgress(await api<AccountProgress>("account-progress", { enabled }));
    } catch (reason) {
      setError((reason as Error).message);
      await api<AccountProgress>("account-progress")
        .then(setProgress)
        .catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="learn-profile" aria-label="Learning profile">
      <header>
        <span className="learn-profile-identity" aria-hidden="true">
          {account?.email ? (
            account.email[0].toUpperCase()
          ) : (
            <UserRound size={25} />
          )}
        </span>
        <div>
          <h1>Learning profile</h1>
          {account?.email && <p>{account.email}</p>}
        </div>
      </header>
      {!account?.email ? (
        <DesktopAccount api={api} onRefresh={onRefresh} offerSync />
      ) : (
        <>
          <section
            className="learn-profile-synced"
            aria-label="Account progress"
          >
            <div>
              <h2>Course progress</h2>
              {courseProgress?.length ? (
                <ul>
                  {courseProgress.map((course) => (
                    <li key={course.id}>
                      <strong>{course.title}</strong>
                      <span>
                        {[
                          course.lesson,
                          course.completed
                            ? `${course.completed} completed`
                            : "",
                          course.checkpoints
                            ? `${course.checkpoints} saved`
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  {progress
                    ? "Your courses will appear here as you learn."
                    : "Loading progress…"}
                </p>
              )}
              <div className="learn-profile-sync">
                <label>
                  <input
                    type="checkbox"
                    checked={progress?.enabled || false}
                    disabled={busy || !progress}
                    onChange={(event) => void changeSync(event.target.checked)}
                  />{" "}
                  Sync on this device
                </label>
                {progress?.enabled && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void changeSync()}
                  >
                    Sync now
                  </button>
                )}
              </div>
              {error ? (
                <p className="account-field-error" role="alert">
                  {error}
                </p>
              ) : (
                progress?.syncedAt && (
                  <p className="hint">
                    Last synced {new Date(progress.syncedAt).toLocaleString()}
                  </p>
                )
              )}
            </div>
            <div className="learn-profile-allowance">
              <h2>Included AI</h2>
              {usage ? (
                <>
                  <div
                    className="learn-profile-meter"
                    style={
                      { "--remaining": `${percent}%` } as React.CSSProperties
                    }
                    role="meter"
                    aria-label="AI allowance remaining"
                    aria-valuenow={percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span>
                      <strong>{percent}%</strong>left
                    </span>
                  </div>
                  <strong>
                    {usage.remaining} of {usage.limit} answers left
                  </strong>
                  {reset && (
                    <span>
                      Resets{" "}
                      {reset.toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  )}
                </>
              ) : (
                <p>
                  {usageUnavailable
                    ? "Allowance unavailable"
                    : "Loading allowance…"}
                </p>
              )}
            </div>
          </section>
          <section
            className="learn-profile-skills"
            aria-label="Verified practice skills"
          >
            <h2>Practice achievements</h2>
            {!skills ? (
              <p role="status">Loading skills…</p>
            ) : !skills.length ? (
              <div className="learn-profile-empty">
                <p>Pass a practical check to earn your first skill.</p>
                <button className="text-button" onClick={onPractice}>
                  Find a practical <ArrowRight size={15} />
                </button>
              </div>
            ) : (
              (
                Object.entries(languages) as [
                  Exercise["language"],
                  { name: string; mark: string },
                ][]
              ).map(([id, language]) => {
                const names = [
                  ...new Set(
                    skills
                      .filter((skill) => skill.language === id)
                      .map((skill) => skill.skill),
                  ),
                ];
                if (!names.length) return null;
                return (
                  <div className="learn-profile-language" key={id}>
                    <span
                      className="language-mark"
                      data-language={id}
                      aria-hidden="true"
                    >
                      {language.mark}
                    </span>
                    <div>
                      <h3>{language.name}</h3>
                      <ul>
                        {names.map((name) => (
                          <li key={name}>
                            <Check size={13} aria-hidden="true" />
                            {name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })
            )}
          </section>
        </>
      )}
    </section>
  );
}
