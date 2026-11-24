import React, { useState } from "react";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import type { AcademyReference } from "../academy-reference-contract";
import {
  academySourceCatalog,
  findReferenceCourses,
  relevantReferenceCourses,
  type ReferenceCourse,
} from "../academy-source-catalog";

const emptyReference = (): AcademyReference => ({
  id: crypto.randomUUID(),
  title: "",
  publisher: "",
  authors: "",
  url: "",
  license: "",
  licenseUrl: "",
  permissionNote: "",
  excerpt: "",
  approved: false,
});
export function AcademyReferences({
  value = [],
  onChange,
  lessonTopic = "",
}: {
  value?: AcademyReference[];
  onChange: (references: AcademyReference[]) => void;
  lessonTopic?: string;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string>();
  const [showCatalog, setShowCatalog] = useState(false);
  const recommended = relevantReferenceCourses(lessonTopic, 5);
  const found =
    !query.trim() && recommended.length
      ? recommended
      : findReferenceCourses(query);
  function add(course?: ReferenceCourse) {
    if (value.length >= 12) return;
    const reference = {
      ...emptyReference(),
      ...(course
        ? {
            title: `${course.code}: ${course.title}`,
            publisher: course.institution,
            url: course.url,
            license: "Permission not yet reviewed",
            licenseUrl: course.licenseUrl,
          }
        : {}),
    };
    onChange([...value, reference]);
    setEditing(reference.id);
  }
  function update(id: string, patch: Partial<AcademyReference>) {
    onChange(
      value.map((reference) =>
        reference.id === id
          ? {
              ...reference,
              ...patch,
              // Any edited evidence or attribution must be approved again.
              approved: patch.approved ?? false,
            }
          : reference,
      ),
    );
  }
  return (
    <section className="academy-references" aria-label="Lesson references">
      <div className="academy-material-heading">
        <h3>Readings & source evidence</h3>
        <button
          className="button small"
          onClick={() => setShowCatalog(!showCatalog)}
          aria-expanded={showCatalog}
        >
          Find university sources
        </button>
      </div>
      <p className="academy-fineprint">
        Atlas and Forge can use the excerpts you approve.
      </p>
      {showCatalog && (
        <div className="academy-reference-discovery">
          <label>
            Search {academySourceCatalog.length} official university course
            pages
            <input
              aria-label="Search university sources"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Python, algorithms, MIT, databases…"
            />
          </label>
          <ul className="academy-reference-results">
            {found.slice(0, 5).map((course) => (
              <li key={course.id}>
                <div>
                  <strong>
                    {course.institution} · {course.code}
                  </strong>
                  <br />
                  <a href={course.url} target="_blank" rel="noreferrer">
                    {course.title} <ExternalLink size={12} />
                  </a>
                  <p>{course.focus}</p>
                  <small>
                    {course.level} · Link checked {course.checkedOn}
                  </small>
                  <p className="academy-fineprint">{course.licenseNote}</p>
                </div>
                <button
                  className="button small"
                  disabled={
                    value.length >= 12 ||
                    value.some((reference) => reference.url === course.url)
                  }
                  onClick={() => add(course)}
                >
                  Attach reference
                </button>
              </li>
            ))}
          </ul>
          {!found.length && (
            <p>No matching course. Add a specific source below.</p>
          )}
          {found.length > 5 && (
            <small>
              {found.length} matches. Refine the search to see another topic or
              institution.
            </small>
          )}
        </div>
      )}
      {value.map((reference, index) => (
        <details
          key={reference.id}
          open={editing === reference.id}
          onToggle={(event) => {
            if (event.currentTarget.open) setEditing(reference.id);
            else setEditing((id) => (id === reference.id ? undefined : id));
          }}
        >
          <summary>
            {reference.title || `New reference ${index + 1}`} ·{" "}
            {reference.approved
              ? "approved excerpt"
              : reference.excerpt
                ? "needs review"
                : "link only"}
          </summary>
          <fieldset>
            <legend>Source {index + 1}</legend>
            <label>
              Reference title
              <input
                aria-label={`Reference title ${index + 1}`}
                maxLength={200}
                value={reference.title}
                onChange={(event) =>
                  update(reference.id, { title: event.target.value })
                }
              />
            </label>
            <label>
              Publisher or institution
              <input
                aria-label={`Reference publisher ${index + 1}`}
                maxLength={200}
                value={reference.publisher}
                onChange={(event) =>
                  update(reference.id, { publisher: event.target.value })
                }
              />
            </label>
            <label>
              Author or teaching team
              <input
                aria-label={`Reference author ${index + 1}`}
                maxLength={300}
                value={reference.authors}
                onChange={(event) =>
                  update(reference.id, { authors: event.target.value })
                }
              />
            </label>
            <label>
              Original source URL
              <input
                aria-label={`Reference URL ${index + 1}`}
                type="url"
                maxLength={2000}
                value={reference.url}
                onChange={(event) =>
                  update(reference.id, { url: event.target.value })
                }
              />
            </label>
            <label>
              License or written permission
              <input
                aria-label={`Reference license ${index + 1}`}
                maxLength={200}
                value={reference.license}
                onChange={(event) =>
                  update(reference.id, { license: event.target.value })
                }
                placeholder="Record the actual license or permission grant"
              />
            </label>
            <label>
              License or permission URL
              <input
                aria-label={`Reference license URL ${index + 1}`}
                type="url"
                maxLength={2000}
                value={reference.licenseUrl}
                onChange={(event) =>
                  update(reference.id, { licenseUrl: event.target.value })
                }
              />
            </label>
            <label>
              Permission for this use
              <textarea
                aria-label={`Reference permission ${index + 1}`}
                maxLength={1000}
                rows={2}
                value={reference.permissionNote}
                onChange={(event) =>
                  update(reference.id, { permissionNote: event.target.value })
                }
                placeholder="Why this excerpt may be used in your course and agent workflow, including any distribution or commercial restrictions."
              />
            </label>
            <label>
              Relevant source excerpt ·{" "}
              {reference.excerpt.length.toLocaleString()} / 12,000
              <textarea
                aria-label={`Reference excerpt ${index + 1}`}
                maxLength={12000}
                rows={6}
                value={reference.excerpt}
                onChange={(event) =>
                  update(reference.id, { excerpt: event.target.value })
                }
                placeholder="Paste a focused section you have permission to use. Preserve its meaning and attribution."
              />
            </label>
            <label className="product-checkbox">
              <input
                type="checkbox"
                aria-label={`Approve reference excerpt ${index + 1}`}
                checked={reference.approved}
                disabled={
                  !reference.title.trim() ||
                  !reference.publisher.trim() ||
                  !reference.authors.trim() ||
                  !reference.url.trim() ||
                  !reference.license.trim() ||
                  reference.license === "Permission not yet reviewed" ||
                  reference.permissionNote.trim().length < 20 ||
                  !reference.excerpt.trim()
                }
                onChange={(event) =>
                  update(reference.id, { approved: event.target.checked })
                }
              />
              I reviewed the source, attribution and permission for this use.
              Send this excerpt to the configured AI provider.
            </label>
            <p className="academy-fineprint">
              Public access alone does not establish reuse permission. Atlas and
              Forge receive up to three selected excerpts per task; they do not
              read every linked page. Editing any source field clears approval.
            </p>
            <button
              className="text-button"
              onClick={() =>
                onChange(value.filter((item) => item.id !== reference.id))
              }
            >
              <Trash2 size={12} /> Remove reference
            </button>
          </fieldset>
        </details>
      ))}
      <button
        className="button small"
        disabled={value.length >= 12}
        onClick={() => add()}
      >
        <Plus size={13} /> Add source reference
      </button>
    </section>
  );
}
