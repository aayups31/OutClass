import {createHash} from "node:crypto";
import {academyLesson, type AcademyDraft} from "../expansion-contract.js";
import type {Store} from "./store.js";
import {UserError} from "./safety.js";
function canonical(value: unknown): unknown {
  if(Array.isArray(value))return value.map(canonical);
  if(value && typeof value==="object")return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
  return value;
}
export const lessonHash = (lesson: unknown) => createHash("sha256").update(JSON.stringify(canonical(lesson))).digest("hex");
export function courseManifest<T extends AcademyDraft>(course:T) {
  return {...course, lessonHashes:course.lessons.map(lessonHash), lessons:course.lessons.map(lesson=>({title:lesson.title,objective:lesson.objective,practice:lesson.practice,chapter:lesson.chapter,content:lesson.content.slice(0,1200),assessments:lesson.assessments}))};
}
/** Content-addressed immutable lessons keep course manifests small. Old inline courses remain readable. */
export function storeCourse<T extends AcademyDraft>(store:Store, course:T) {
  course.lessons.forEach(lesson=>store.put(`academy:content:${lessonHash(lesson)}`,lesson));
  return courseManifest(course);
}
export function loadCourse<T extends AcademyDraft>(store:Store, raw:T):T {
  const {lessonHashes,...manifest}=raw as T & {lessonHashes?:string[]};
  if(!lessonHashes)return raw;
  if(lessonHashes.length!==raw.lessons.length)throw new UserError("Incomplete course manifest. Restore its portable backup.");
  const lessons=lessonHashes.map(hash=>{
    const lesson=store.get(`academy:content:${hash}`);
    if(!lesson || lessonHash(lesson)!==hash)throw new UserError("A course lesson is missing or corrupt. Restore its portable backup.");
    return academyLesson.parse(lesson);
  });
  return {...manifest,lessons} as T;
}
