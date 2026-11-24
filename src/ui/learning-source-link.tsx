import { useState, type ComponentProps } from "react";
import { learningUrl } from "../learning-source";

export function LearningSourceLink({
  href,
  children,
  ...props
}: ComponentProps<"a">) {
  const [error, setError] = useState(false);
  const link = href && learningUrl(href);
  if (!link) return null;
  return (
    <a
      {...props}
      href={link.href}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => {
        const open = window.gitLearnDesktop?.openLearningSource;
        if (!open) return;
        event.preventDefault();
        setError(false);
        void open(link.href).catch(() => setError(true));
      }}
    >
      {error ? "Could not open link" : children}
    </a>
  );
}
