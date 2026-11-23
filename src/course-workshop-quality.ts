import type {
  CourseBrief,
  CoursePlan,
  CourseLessonAnswer,
} from "./course-workshop-contract.js";
export type CourseFinding = {
  id: string;
  level: "blocker" | "review";
  detail: string;
  lessonId?: string;
};
export function validatePlan(
  brief: CourseBrief,
  plan: CoursePlan,
): CourseFinding[] {
  const findings: CourseFinding[] = [];
  const add = (id: string, detail: string, lessonId?: string) =>
    findings.push({
      id,
      level: "blocker",
      detail,
      ...(lessonId ? { lessonId } : {}),
    });
  const outcomes = new Set(plan.outcomes.map((outcome) => outcome.id));
  if (outcomes.size !== plan.outcomes.length)
    add("outcome-ids", "Outcome IDs must be unique.");
  if (plan.lessons.length !== brief.lessonCount)
    add("lesson-count", "The plan must match the approved lesson count.");
  if (
    new Set(plan.lessons.map((lesson) => lesson.id)).size !==
    plan.lessons.length
  )
    add("lesson-ids", "Lesson IDs must be unique.");
  const previous = new Set<string>(),
    known = new Set(brief.startingSkills.map((skill) => skill.toLowerCase()));
  for (const lesson of plan.lessons) {
    if (lesson.prerequisiteIds.some((id) => !previous.has(id)))
      add(
        `${lesson.id}:order`,
        "Prerequisites must refer to earlier lessons.",
        lesson.id,
      );
    if (lesson.outcomeIds.some((id) => !outcomes.has(id)))
      add(
        `${lesson.id}:outcomes`,
        "Use declared course outcome IDs.",
        lesson.id,
      );
    const untaught = lesson.uses.filter(
      (skill) => !known.has(skill.toLowerCase()),
    );
    if (untaught.length)
      add(
        `${lesson.id}:skills`,
        `Introduce these skills before use: ${untaught.join(", ")}.`,
        lesson.id,
      );
    lesson.teaches.forEach((skill) => known.add(skill.toLowerCase()));
    previous.add(lesson.id);
  }
  for (const outcome of outcomes)
    if (!plan.lessons.some((lesson) => lesson.outcomeIds.includes(outcome)))
      add(`coverage:${outcome}`, "Every outcome must be taught by a lesson.");
  const minutes = plan.lessons.reduce((sum, lesson) => sum + lesson.minutes, 0);
  if (minutes > brief.hours * 60)
    add("workload", "Lesson time exceeds the approved total hours.");
  return findings;
}
export function validateWrittenLesson(
  plan: CoursePlan,
  index: number,
  answer: CourseLessonAnswer,
  sourceIds: string[],
  sources: { id: string; text: string }[] = [],
): CourseFinding[] {
  const findings: CourseFinding[] = [],
    lesson = plan.lessons[index];
  const add = (id: string, detail: string) =>
    findings.push({
      id: `${lesson.id}:${id}`,
      level: "blocker",
      detail,
      lessonId: lesson.id,
    });
  if (answer.lessonId !== lesson.id)
    add("identity", "The response belongs to a different lesson.");
  if (answer.sourceIds.some((id) => !sourceIds.includes(id)))
    add("citation", "Every citation must identify a supplied source.");
  if (sourceIds.length && !answer.sourceIds.length)
    add(
      "missing-citation",
      "Attribute the supplied evidence used by this lesson.",
    );
  if (
    !/^[ \t]*Example input:[ \t]*\S[^\r\n]*$/im.test(answer.independentTask) ||
    !/^[ \t]*Expected result:[ \t]*\S[^\r\n]*$/im.test(answer.independentTask)
  )
    add(
      "example",
      "Supply concrete input and expected result lines in the independent task.",
    );
  if (sourceIds.length && !answer.grounding.length)
    add(
      "grounding",
      "Connect substantive source claims to literal supplied passages.",
    );
  for (const claim of answer.grounding) {
    const source = sources.find((source) => source.id === claim.sourceId);
    let passage = "";
    if (source) {
      try {
        passage = JSON.parse(source.text).passage || "";
      } catch {
        passage = source.text;
      }
    }
    if (
      !answer.sourceIds.includes(claim.sourceId) ||
      !passage.includes(claim.quote)
    )
      add(
        "unsupported-quote",
        "Every quoted grounding passage must occur literally in its cited source. Semantic support still needs editorial review.",
      );
  }
  if (answer.assignment.prerequisiteLessons.some((n) => n >= index))
    add("prerequisite", "Assignment prerequisites must be earlier lessons.");
  if (answer.assignment.hints.length < 2)
    add("hints", "Supply a progressive hint ladder.");
  for(const file of answer.assignment.starterFiles.filter(file=>/(^|\/)test[^/]*\.py$/.test(file.path))){const directories=file.path.split("/").slice(0,-1);for(let depth=1;depth<=directories.length;depth++){const initializer=directories.slice(0,depth).join("/")+"/__init__.py";if(!answer.assignment.starterFiles.some(file=>file.path===initializer))add("test-package",`Add ${initializer} so the documented standard unittest discovery command finds the nested tests.`);}}
  if(answer.assignment.acceptanceCriteria.some(text=>/instructor (solution|implementation)|faulty implementation/i.test(text)))add("private-criterion","Learner acceptance criteria must describe their own observable work, not private instructor QA artifacts.");
  if (
    !answer.assignment.starterFiles.some((file) =>
      /(^|\/)test[^/]*\.py$|\.test\.[cm]?js$/.test(file.path),
    )
  )
    add(
      "tests",
      "Include executable behavioral tests, not just a test description.",
    );
  if (
    !answer.assignment.starterFiles.some((file) =>
      /readme\.md$/i.test(file.path),
    )
  )
    add(
      "guide",
      "Supply a README with reproducible setup and run instructions.",
    );
  const ids = new Set(answer.assessments.map((item) => item.id));
  if (
    !answer.assignment.starterFiles.some(
      (file) => file.path === answer.solutionPath,
    )
  )
    add(
      "solution-path",
      "The private solution must replace an existing learner source file.",
    );
  if (ids.size !== answer.assessments.length)
    add("item-ids", "Assessment IDs must be unique.");
  if (
    new Set(answer.answerKeys.map((key) => key.itemId)).size !==
      answer.answerKeys.length ||
    answer.answerKeys.length !== answer.assessments.length
  )
    add("keys", "Supply exactly one private key per item.");
  for (const item of answer.assessments) {
    const key = answer.answerKeys.find((key) => key.itemId === item.id);
    if (!item.id.startsWith(`${lesson.id}-`))
      add(
        `item-prefix:${item.id}`,
        "Assessment IDs must be prefixed by the lesson ID.",
      );
    if (
      !key ||
      key.correctChoice >= item.choices.length ||
      key.feedback.length !== item.choices.length
    )
      add(`key:${item.id}`, "Answer and feedback must match every choice.");
    if (
      new Set(item.choices.map((choice) => choice.toLowerCase())).size !==
      item.choices.length
    )
      add(`choices:${item.id}`, "Choices must be distinct.");
    if (item.outcomeIds.some((id) => !lesson.outcomeIds.includes(id)))
      add(
        `alignment:${item.id}`,
        "Assess only this lesson's planned outcomes.",
      );
    if (
      item.remediationLessonIds.some(
        (id) =>
          !plan.lessons.slice(0, index + 1).some((lesson) => lesson.id === id),
      )
    )
      add(
        `remediation:${item.id}`,
        "Remediation must be a current or earlier lesson.",
      );
  }
  for (const outcome of lesson.outcomeIds)
    if (!answer.assessments.some((item) => item.outcomeIds.includes(outcome)))
      add(`coverage:${outcome}`, "An outcome lacks assessment evidence.");
  if (
    !answer.assessments.some((item) =>
      ["application", "transfer"].includes(item.kind),
    )
  )
    add("application", "Assess application or transfer, not only recall.");
  const paragraphs = answer.sections.map((section) =>
    section.body.trim().toLowerCase(),
  );
  if (new Set(paragraphs).size !== paragraphs.length)
    add("repetition", "Teaching sections repeat the same text.");
  if (
    answer.assignment.starterFiles.some(
      (file) => file.content.trim() === answer.instructorSolution.trim(),
    )
  )
    add(
      "solution-leak",
      "The learner starter contains the instructor solution.",
    );
  if (answer.faultyImplementation.trim() === answer.instructorSolution.trim())
    add(
      "mutation-identical",
      "The deliberately faulty implementation is identical to the private reference.",
    );
  return findings;
}
export function renderTeaching(answer: CourseLessonAnswer) {
  return [
    ...answer.sections.map(
      (section) => `## ${section.title}\n\n${section.body}`,
    ),
    ...answer.workedExamples.map(
      (example, i) =>
        `## Worked example ${i + 1}\n\n${example.problem}\n\n${example.steps.map((step, n) => `${n + 1}. ${step}`).join("\n")}\n\nResult: ${example.result}`,
    ),
    ...answer.misconceptions.map(
      (item) =>
        `## Investigate a common mistake\n\n${item.belief}\n\nCounterexample: ${item.counterexample}\n\nTry: ${item.diagnosis}`,
    ),
    `## Summary\n\n${answer.summary}`,
    ...(answer.assumptions.length
      ? [
          `## Assumptions and limits\n\n${answer.assumptions.map((text) => `- ${text}`).join("\n")}`,
        ]
      : []),
  ].join("\n\n");
}
