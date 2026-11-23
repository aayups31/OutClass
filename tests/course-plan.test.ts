import { it,expect } from "vitest";
import {zodTextFormat} from "openai/helpers/zod";
import { courseBrief,coursePlan,courseLessonAnswer } from "../src/course-workshop-contract";
import { validatePlan,validateWrittenLesson,renderTeaching } from "../src/course-workshop-quality";
import { workshopBrief,workshopPlan,writtenLesson } from "./helpers/course-workshop";
it("exposes provider-compatible structured output contracts",()=>{expect(()=>zodTextFormat(coursePlan,"course_plan")).not.toThrow();expect(()=>zodTextFormat(courseLessonAnswer,"course_lesson")).not.toThrow();});
it("checks course-wide skill order, outcome alignment and time budget",()=>{
  expect(courseBrief.parse(workshopBrief)).toEqual(workshopBrief);expect(coursePlan.parse(workshopPlan)).toEqual(workshopPlan);
  expect(validatePlan(workshopBrief,workshopPlan)).toEqual([]);
  const altered=structuredClone(workshopPlan);altered.lessons[0].uses=["a skill taught later"];altered.lessons[0].prerequisiteIds=["report"];altered.lessons[0].minutes=240;
  expect(validatePlan(workshopBrief,altered).map(row=>row.id)).toEqual(expect.arrayContaining(["total:skills","total:order","workload"]));
});
it("separates worked teaching from private assessment answers and rejects invented evidence",()=>{
  const lesson=courseLessonAnswer.parse(writtenLesson(0));expect(validateWrittenLesson(workshopPlan,0,lesson,[])).toEqual([]);
  const teaching=renderTeaching(lesson);expect(teaching).toContain("Worked example");expect(teaching).not.toContain(lesson.instructorSolution);expect(teaching).not.toContain("correctChoice");
  lesson.sourceIds=["invented:university"];expect(validateWrittenLesson(workshopPlan,0,lesson,[]).some(row=>row.id.endsWith("citation"))).toBe(true);
});
