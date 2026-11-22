import type { AcademyReference } from "../academy-reference-contract.js";
import { lessonEvidence } from "../academy-design.js";

export function referenceEvidence(
  references: AcademyReference[] = [],
  query: string,
) {
  const terms = [
    ...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []),
  ].filter(
    (term) =>
      !["the", "and", "with", "from", "this", "that", "for"].includes(term),
  );
  return [
    ...new Map(
      references.map((reference) => [reference.id, reference]),
    ).values(),
  ]
    .filter((reference) => reference.approved && reference.excerpt.trim())
    .map((reference, order) => {
      const text = `${reference.title} ${reference.excerpt}`.toLowerCase();
      return {
        reference,
        order,
        score: terms.reduce(
          (score, term) => score + (text.includes(term) ? 1 : 0),
          0,
        ),
      };
    })
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, 3)
    .map(({ reference }) => {
      const evidence = lessonEvidence(reference.excerpt, query, 1800);
      return {
        id: `reading:${reference.id}`,
        title: `${reference.publisher} · ${reference.title}`,
        text: JSON.stringify({
          sourceUrl: reference.url,
          authors: reference.authors,
          license: reference.license,
          licenseUrl: reference.licenseUrl,
          permissionNote: reference.permissionNote,
          provenance:
            "instructor-supplied excerpt; URL not fetched by this task",
          excerpt: evidence.text,
          excerptComplete: evidence.complete,
        }),
      };
    });
}
