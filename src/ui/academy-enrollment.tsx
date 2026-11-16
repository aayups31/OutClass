import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import "./academy-enrollment.css";

export function AcademyEnrollment({
  api,
  onCode,
}: {
  api: <T>(route: string, body?: unknown) => Promise<T>;
  onCode: (courseId: string) => void;
}) {
  const [grant, setGrant] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function redeem() {
    setBusy(true);
    setError("");
    try {
      const { courseId } = await api<{ courseId: string }>(
        "expansion/hosted/redeem",
        { grant },
      );
      setGrant("");
      onCode(courseId);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not open the course.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="setup-card academy-enrollment">
      <summary>Open an Academy course</summary>
      <p>
        Sign in with the account you enrolled with, then paste your launch code.
      </p>
      <label>
        Academy launch code
        <input
          value={grant}
          onChange={(event) => setGrant(event.target.value.trim())}
          maxLength={64}
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste your five-minute course code"
        />
      </label>
      <div className="academy-enrollment-actions">
        <button
          className="button primary"
          disabled={busy || !/^[a-f0-9]{64}$/.test(grant)}
          onClick={() => void redeem()}
        >
          {busy ? "Opening course…" : "Open in Learn"}
        </button>
        <a
          href="https://git-learn-black.vercel.app/academy#catalog"
          target="_blank"
          rel="noreferrer"
        >
          Browse Academy <ArrowUpRight size={13} />
        </a>
      </div>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
