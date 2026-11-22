import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  academyReference,
  referenceCredits,
  type AcademyReference,
} from "../src/academy-reference-contract";
import {
  academySourceCatalog,
  findReferenceCourses,
} from "../src/academy-source-catalog";
import { referenceEvidence } from "../src/server/academy-references";
import { importAcademy, auditAcademy } from "../src/server/academy-studio";
import { academyExample } from "../src/academy-example";
import { Store } from "../src/server/store";
import { Application } from "../src/server/application";
import { Expansion, validateCourse } from "../src/server/expansion";
import { LearnDelivery } from "../src/server/learn-delivery";

function source(patch: Partial<AcademyReference> = {}): AcademyReference {
  return {
    id: randomUUID(),
    title: "Grouping records",
    publisher: "Fixture teaching team",
    authors: "Fixture author",
    url: "https://example.org/teaching",
    license: "Permission granted",
    licenseUrl: "",
    permissionNote:
      "Original test fixture written for this course and authorized for agent use.",
    excerpt:
      "A dictionary retains one total per person. Trace repeated names before choosing an update.",
    approved: true,
    ...patch,
  };
}

it("keeps discovery metadata separate from an asserted license or fetched content", () => {
  expect(academySourceCatalog).toHaveLength(19);
  expect(new Set(academySourceCatalog.map((course) => course.url)).size).toBe(
    19,
  );
  expect(
    findReferenceCourses("MIT python").map((course) => course.code),
  ).toContain("6.0001");
  expect(
    findReferenceCourses("Stanford python").every(
      (course) => course.institution === "Stanford",
    ),
  ).toBe(true);
  expect(findReferenceCourses("Carnegie databases")[0].code).toBe("15-445/645");
  expect(
    academySourceCatalog.every(
      (course) =>
        !Object.hasOwn(course, "excerpt") && course.url.startsWith("https://"),
    ),
  ).toBe(true);
});

it("requires complete attribution and a permission note for an approved excerpt", () => {
  expect(academyReference.safeParse(source()).success).toBe(true);
  for (const patch of [
    { title: "" },
    { authors: "" },
    { license: "" },
    { license: "Permission not yet reviewed" },
    { url: "javascript:alert(1)" },
    { url: "https://name:secret@example.org" },
    { excerpt: "" },
    { permissionNote: "yes" },
  ])
    expect(academyReference.safeParse(source(patch)).success).toBe(false);
  expect(
    academyReference.safeParse(
      source({ approved: false, excerpt: "", authors: "", url: "" }),
    ).success,
  ).toBe(true);
});

it("retrieves bounded literal readings and excludes link-only or unapproved material", () => {
  const relevant = source({
    title: "Python dictionary grouping",
    excerpt:
      "Background notes. ".repeat(300) +
      "\n\nA repeated name should retain its accumulated dictionary total.",
  });
  const refs = [
    source({ approved: false, excerpt: "Never send this draft source" }),
    source({ approved: false, excerpt: "" }),
    source({ title: "Graph paths", excerpt: "A graph can connect cities." }),
    relevant,
    source({
      title: "Python records",
      excerpt: "Records group people with Python.",
    }),
    source({ title: "Python totals", excerpt: "Totals retain minutes." }),
  ];
  const selected = referenceEvidence(
    refs,
    "Python dictionary grouping records",
  );
  expect(selected).toHaveLength(3);
  expect(selected[0].id).toBe(`reading:${relevant.id}`);
  expect(JSON.stringify(selected)).not.toContain(
    "Never send this draft source",
  );
  const reading = JSON.parse(selected[0].text);
  expect(reading.excerpt.length).toBeLessThanOrEqual(1800);
  expect(reading.excerpt).toContain("accumulated dictionary total");
  expect(reading.excerptComplete).toBe(false);
  expect(reading.sourceUrl).toBe(relevant.url);
  expect(reading.provenance).toContain("URL not fetched");
  expect(referenceEvidence([relevant, relevant], "Python")).toHaveLength(1);
});

it("retains provenance in exports but resets reference approval on a new import", () => {
  const course = academyExample();
  const reference = source();
  course.lessons[0].references = [reference];
  const imported = importAcademy({
    name: "course.json",
    text: JSON.stringify({ format: "outclass-academy", version: 1, course }),
  });
  expect(imported.course.lessons[0].references![0]).toEqual({
    ...reference,
    approved: false,
  });
  expect(imported.course.rightsConfirmed).toBe(false);
  expect(referenceCredits([reference])).toContain(reference.authors);
  expect(referenceCredits([{ ...reference, approved: false }])).toBe("");
  expect(
    referenceCredits([
      source({ title: "[Misleading](https://wrong.example)" }),
    ]),
  ).toContain("\\[Misleading\\]");
});

it("blocks unreviewed release text and delivers immutable acknowledgments to the learner", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "outclass-reference-"));
  const store = new Store(path.join(folder, "data"));
  const app = new Application(store),
    expansion = new Expansion(app);
  try {
    await app.setup(path.join(folder, "history"), false);
    const reference = source(),
      course = { ...academyExample(), rightsConfirmed: true };
    course.lessons[0].references = [{ ...reference, approved: false }];
    expect(validateCourse(course).valid).toBe(false);
    expect(
      auditAcademy({
        ...course,
        id: "fixture",
        revision: 1,
        updatedAt: "now",
      }).findings.some(
        (finding) =>
          finding.id === "0:reference-permission" &&
          finding.level === "blocker",
      ),
    ).toBe(true);
    const draft = expansion.saveCourse({ ...course, expectedRevision: 0 });
    expect(() =>
      expansion.release(draft.id, { expectedRevision: 1, approve: true }),
    ).toThrow(/permission/);
    course.lessons[0].references = [reference];
    const saved = expansion.saveCourse({
      ...course,
      id: draft.id,
      expectedRevision: 1,
    });
    const release = expansion.release(saved.id, {
      expectedRevision: 2,
      approve: true,
    });
    expansion.enroll(release.id);
    const launched = await expansion.launch(release.id, 0);
    const delivery = new LearnDelivery(app).snapshot(
      launched.courseId,
      "lesson-0",
    )!;
    expect(delivery.references[0].authors).toBe(reference.authors);
    expect(delivery.references[0]).not.toHaveProperty("excerpt");
    const creditFile = path.join(
      store.state().session!.workspace,
      "assignments/lesson-0/SOURCES.md",
    );
    expect(await readFile(creditFile, "utf8")).toContain(reference.url);
    course.lessons[0].learn!.starterFiles.push({
      path: "SOURCES.md",
      content: "Replace attribution",
    });
    expect(validateCourse(course).issues.join(" ")).toContain("reserved");
  } finally {
    store.close();
    await rm(folder, { recursive: true, force: true });
  }
});
