import { useEffect, useState } from "react";
import { ArrowRight, Check, UserRound } from "lucide-react";
import type { Status } from "../shared";
import type { Exercise, Practice } from "../server/practice";
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
  onSettings,
  onPractice,
}: {
  account: Status["account"];
  api: <T>(route: string) => Promise<T>;
  onSettings: () => void;
  onPractice: () => void;
}) {
  const [skills, setSkills] =
    useState<ReturnType<Practice["dashboard"]>["skills"]>();
  const [error, setError] = useState("");
  useEffect(() => {
    setSkills(undefined);
    setError("");
    if (!account?.email) return;
    let active = true;
    api<ReturnType<Practice["dashboard"]>>("practice")
      .then((dashboard) => {
        if (active) setSkills(dashboard.skills);
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      });
    return () => {
      active = false;
    };
  }, [account?.email, api]);

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
        <button className="button primary" onClick={onSettings}>
          Connect an OutClass account <ArrowRight size={15} />
        </button>
      ) : (
        <section
          className="learn-profile-skills"
          aria-label="Verified practice skills"
        >
          <h2>Skills in this workspace</h2>
          {error ? (
            <p role="alert">{error}</p>
          ) : !skills ? (
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
      )}
    </section>
  );
}
