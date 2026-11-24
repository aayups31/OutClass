import { createHash } from "node:crypto";
import type { AcademyDraft, Revision } from "./expansion-contract.js";
import type {
  AcademyAudit,
  AcademyFinding,
} from "./academy-design-contract.js";
import { COURSE_CHAR_LIMIT } from "./course-limits.js";
import { learnPackageIssues } from "./learn-package-contract.js";
import { validatePlan } from "./course-workshop-quality.js";
import { technicalInputHash } from "./course-integrity.js";
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function courseContent(c: AcademyDraft): AcademyDraft {
  return {
    title: c.title,
    audience: c.audience,
    outcome: c.outcome,
    rightsConfirmed: c.rightsConfirmed,
    lessons: c.lessons,
    ...(c.chapters?.length ? { chapters: c.chapters } : {}),
    ...(c.learningProject ? { learningProject: c.learningProject } : {}),
    ...(c.design ? { design: c.design } : {}),
  };
}
export function validateCourse(course: AcademyDraft) {
  const issues: string[] = learnPackageIssues(course.lessons);
  if (course.design) {
    issues.push(
      ...validatePlan(course.design.brief, course.design.plan).map(
        (f) => f.detail,
      ),
    );
    if (course.lessons.length !== course.design.plan.lessons.length)
      issues.push("The released lessons must match the accepted course plan.");
    course.lessons.forEach((lesson, index) => {
      const planned = course.design!.plan.lessons[index];
      if (!planned) return;
      for (const outcome of planned.outcomeIds)
        if (
          !lesson.assessments?.some((item) => item.outcomeIds.includes(outcome))
        )
          issues.push(
            `Lesson ${index + 1}: supply assessment evidence for ${outcome}.`,
          );
    });
  }
  const assessmentIds = course.lessons.flatMap((lesson) =>
    (lesson.assessments || []).map((item) => item.id),
  );
  if (new Set(assessmentIds).size !== assessmentIds.length)
    issues.push("Assessment IDs must be unique across the course.");
  if (!course.audience) issues.push("Describe who the course is for.");
  if (!course.outcome)
    issues.push("Define what the learner will build or demonstrate.");
  if (!course.rightsConfirmed)
    issues.push("Confirm your rights to the course material.");
  if (!course.lessons.length) issues.push("Add at least one lesson.");
  if (JSON.stringify(course).length > COURSE_CHAR_LIMIT)
    issues.push(
      "Keep course content under 6,000,000 characters; use media attachments for larger assets.",
    );
  course.lessons.forEach((lesson, i) => {
    if (
      lesson.technicalVerification?.verified &&
      lesson.technicalVerification.inputHash !== technicalInputHash(lesson)
    )
      issues.push(
        `Lesson ${i + 1}: code or environment changed after verification. Rerun isolated checks or remove the outdated verification receipt.`,
      );
    if (
      lesson.codeCheck &&
      !lesson.learn?.starterFiles.some(
        (file) => file.path === lesson.codeCheck!.sourcePath,
      )
    )
      issues.push(
        `Lesson ${i + 1}: the check must name an attached starter source file.`,
      );
    for (const block of lesson.blocks || [])
      if (
        block.kind === "media" &&
        !lesson.resources?.some((resource) => resource.id === block.resourceId)
      )
        issues.push(
          `Lesson ${i + 1}: attach the resource used by its media block.`,
        );
    if (
      lesson.references?.some(
        (reference) => reference.excerpt && !reference.approved,
      )
    )
      issues.push(
        `Lesson ${i + 1}: review permission for each reference excerpt or remove its text before release.`,
      );
    if (
      lesson.references?.some((reference) => reference.approved) &&
      lesson.learn?.starterFiles.some(
        (file) => file.path.toLowerCase() === "sources.md",
      )
    )
      issues.push(
        `Lesson ${i + 1}: SOURCES.md is reserved for source acknowledgments; rename that starter file.`,
      );
    for (const field of ["title", "objective", "practice", "content"] as const)
      if (!lesson[field] && (field !== "content" || !lesson.resources?.length))
        issues.push(`Lesson ${i + 1}: add ${field}.`);
  });
  return {
    valid: !issues.length,
    issues,
    technicalVerification: "not_run" as const,
    scope:
      "Structure and required content only; code examples have not been executed.",
  };
}
export function auditAcademy(course: Revision<AcademyDraft>): AcademyAudit {
  const findings: AcademyFinding[] = [];
  const add = (
    id: string,
    level: AcademyFinding["level"],
    field: string,
    title: string,
    detail: string,
    lessonIndex?: number,
  ) =>
    findings.push({
      id,
      level,
      field,
      title,
      detail,
      ...(lessonIndex === undefined ? {} : { lessonIndex }),
    });
  for (const [field, title] of [
    ["audience", "Define your learner"],
    ["outcome", "Define the result"],
  ] as const)
    if (!course[field].trim())
      add(
        field,
        "blocker",
        field,
        title,
        "Describe the starting experience and an observable result from the learner’s own work.",
      );
  if (!course.rightsConfirmed)
    add(
      "rights",
      "blocker",
      "rightsConfirmed",
      "Confirm permission",
      "Confirm that you own or have permission to use this course material.",
    );
  if (!course.lessons.length)
    add(
      "lessons",
      "blocker",
      "lessons",
      "Add a lesson",
      "Start with an existing lesson and its teaching material.",
    );
  if (JSON.stringify(courseContent(course)).length > COURSE_CHAR_LIMIT)
    add(
      "size",
      "blocker",
      "content",
      "Split the course package",
      `Keep this release under ${COURSE_CHAR_LIMIT.toLocaleString()} characters. Exported material is never silently truncated.`,
    );
  learnPackageIssues(course.lessons).forEach((detail, i) =>
    add(
      `structure:${i}`,
      "blocker",
      "learn",
      "Repair the learning path",
      detail,
    ),
  );
  const titles = new Map<string, number>();
  let assignments = 0,
    reflections = 0,
    transfers = 0,
    minutes = 0;
  course.lessons.forEach((l, i) => {
    if (
      l.references?.some(
        (reference) => reference.excerpt && !reference.approved,
      )
    )
      add(
        `${i}:reference-permission`,
        "blocker",
        "references",
        "Review reference permission",
        "Approve the excerpt and record permission for your intended use, or remove its text. A publicly readable course page does not establish reuse permission.",
        i,
      );
    if (
      l.references?.some((reference) => reference.approved) &&
      l.learn?.starterFiles.some(
        (file) => file.path.toLowerCase() === "sources.md",
      )
    )
      add(
        `${i}:reference-path`,
        "blocker",
        "references",
        "Rename the source starter file",
        "SOURCES.md is reserved for the released lesson's source acknowledgments.",
        i,
      );
    for (const field of ["title", "objective", "practice", "content"] as const)
      if (!l[field].trim() && (field !== "content" || !l.resources?.length))
        add(
          `${i}:${field}`,
          "blocker",
          field,
          `Add lesson ${field}`,
          "This field is needed for a usable lesson and its Learn experience.",
          i,
        );
    const title = l.title.trim().toLowerCase();
    if (title && titles.has(title))
      add(
        `${i}:duplicate-title`,
        "review",
        "title",
        "Distinguish this lesson",
        `It has the same title as lesson ${titles.get(title)! + 1}. Make navigation and source attribution clear.`,
        i,
      );
    titles.set(title, i);
    if (/\b(understand|know|learn about|be familiar)\b/i.test(l.objective))
      add(
        `${i}:observable`,
        "review",
        "objective",
        "Make the objective observable",
        "Describe what learners can build, explain, diagnose or demonstrate, with a result they can check.",
        i,
      );
    const p = l.learn;
    if (!p) {
      add(
        `${i}:assignment`,
        "review",
        "learn",
        "Add a Learn assignment",
        "The lesson has a practice description, but no acceptance criteria, progressive hints or review experience in Learn.",
        i,
      );
      return;
    }
    assignments++;
    minutes += p.minutes;
    if (
      !/^[ \t]*Example input:[ \t]*\S[^\r\n]*$/im.test(l.practice) ||
      !/^[ \t]*Expected result:[ \t]*\S[^\r\n]*$/im.test(l.practice)
    )
      add(
        `${i}:worked-example`,
        "review",
        "practice",
        "Give the learner a concrete example",
        "Add Example input: and Expected result: lines with small, actual values. The learner sees this brief separately from the teaching material.",
        i,
      );
    if (p.hints.length === 1)
      add(
        `${i}:hint-progression`,
        "suggestion",
        "learn",
        "Offer a second step when the learner is stuck",
        "Follow the first hint with a more specific diagnostic experiment. Avoid repeating the task or revealing the implementation.",
        i,
      );
    if (p.kind === "capstone" && !p.starterFiles.length)
      add(
        `${i}:capstone-start`,
        "review",
        "learn",
        "Make the capstone starting point clear",
        "Provide a build guide or starter files, or explain the empty-project setup in the practice brief before approving this finding.",
        i,
      );
    if (p.prerequisiteLessons.some((n) => n >= i))
      add(
        `${i}:order`,
        "blocker",
        "learn",
        "Teach prerequisites earlier",
        "Move this lesson or update its prerequisite links so learners can follow the published order.",
        i,
      );
    if (
      p.acceptanceCriteria.some((c) =>
        /^(understand|know|learn|complete|finish)\b/i.test(c.trim()),
      )
    )
      add(
        `${i}:criteria`,
        "review",
        "learn",
        "Make success testable",
        "Replace completion or understanding claims with observable behavior, an example output or an evidence requirement.",
        i,
      );
    if (!p.hints.length)
      add(
        `${i}:hints`,
        "review",
        "learn",
        "Add a progressive hint",
        "Start with a reasoning question, then a diagnostic experiment. Keep the learner’s implementation theirs.",
        i,
      );
    if (p.reflection.trim()) reflections++;
    else
      add(
        `${i}:reflection`,
        "review",
        "learn",
        "Ask for reflection evidence",
        "Ask what the learner tested, observed and changed, rather than a confidence rating.",
        i,
      );
    if (p.transferChallenge.trim()) transfers++;
    else
      add(
        `${i}:transfer`,
        "review",
        "learn",
        "Change one requirement",
        "Ask learners to use the idea differently after their first successful attempt.",
        i,
      );
    if (
      new Set(p.acceptanceCriteria.map((c) => c.trim().toLowerCase())).size !==
      p.acceptanceCriteria.length
    )
      add(
        `${i}:duplicate-criteria`,
        "review",
        "learn",
        "Remove repeated criteria",
        "Each criterion should check a distinct part of the result.",
        i,
      );
  });
  const project = course.learningProject;
  if (project) {
    for (const field of ["title", "problem", "deliverable"] as const)
      if (!project[field].trim())
        add(
          `project:${field}`,
          "blocker",
          "project",
          `Complete the project ${field}`,
          "Give the project a clear user need and final deliverable.",
        );
    const used = new Set<number>();
    project.milestones.forEach((m, i) => {
      if (!course.lessons[m.lessonIndex] || used.has(m.lessonIndex))
        add(
          `milestone:${i}:link`,
          "blocker",
          "project",
          "Repair a milestone link",
          "Choose a distinct existing lesson for every milestone.",
        );
      used.add(m.lessonIndex);
      if (
        !m.title.trim() ||
        !m.brief.trim() ||
        !m.acceptanceCriteria.some((c) => c.trim())
      )
        add(
          `milestone:${i}:brief`,
          "blocker",
          "project",
          "Complete the milestone",
          "Name the increment, describe the learner’s work and add an observable check.",
          m.lessonIndex,
        );
      if (course.lessons[m.lessonIndex] && !course.lessons[m.lessonIndex].learn)
        add(
          `milestone:${i}:assignment`,
          "blocker",
          "learn",
          "Connect the milestone to Learn",
          "Add this lesson’s Learn assignment so its milestone and checks reach the learner.",
          m.lessonIndex,
        );
    });
    course.lessons.forEach((lesson, index) => {
      if (
        lesson.learn?.starterFiles.some(
          (file) => file.path.toLowerCase() === "project_connection.md",
        )
      )
        add(
          `project:${index}:starter-path`,
          "blocker",
          "learn",
          "Rename the project starter file",
          "Academy writes the learner’s project roadmap to PROJECT_CONNECTION.md. Use another name for the starter file.",
          index,
        );
    });
    if (!project.milestones.length)
      add(
        "project:milestones",
        "review",
        "project",
        "Add the first increment",
        "Connect a small, useful project increment to a lesson where learners have enough context.",
      );
  } else if (course.lessons.length > 1)
    add(
      "project",
      "suggestion",
      "project",
      "Consider one evolving project",
      "Let learners make something useful throughout the course. A project is optional; individual exercises can be appropriate.",
    );
  const { chapters: _chapters, ...content } = courseContent(course),
    courseHash = digest(content);
  return {
    hash: digest({
      version: 1,
      courseHash,
      revision: course.revision,
      findings,
    }),
    courseHash,
    revision: course.revision,
    findings,
    coverage: {
      lessons: course.lessons.length,
      assignments,
      reflections,
      transfers,
      minutes,
      milestones: project?.milestones.length || 0,
    },
  };
}
