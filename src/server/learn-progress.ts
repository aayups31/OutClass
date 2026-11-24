import { createHash, randomUUID } from "node:crypto";
import {
  progressSnapshot,
  type ProgressSnapshot,
} from "../account-contract.js";
import type { ResumeAnchor } from "../shared.js";
import type { Application } from "./application.js";
import type { Practice } from "./practice.js";
import { scan, UserError } from "./safety.js";

type SavedProgress = {
  syncedAt: string;
  digest: string;
  devices: ProgressSnapshot[];
};

function summarize(devices: ProgressSnapshot[]): ProgressSnapshot {
  const courses = new Map<string, ProgressSnapshot["courses"][number]>();
  const skills = new Map<string, ProgressSnapshot["skills"][number]>();
  for (const device of devices) {
    for (const entry of device.courses) {
      const previous = courses.get(entry.id);
      if (!previous) {
        courses.set(entry.id, entry);
        continue;
      }
      courses.set(entry.id, {
        ...(entry.activityAt > previous.activityAt ? entry : previous),
        completed: Math.max(entry.completed, previous.completed),
        checkpoints: Math.max(entry.checkpoints, previous.checkpoints),
      });
    }
    for (const entry of device.skills)
      skills.set(`${entry.language}:${entry.skill}`, entry);
  }
  return {
    courses: [...courses.values()].sort((a, b) =>
      b.activityAt.localeCompare(a.activityAt),
    ),
    skills: [...skills.values()],
  };
}

export class LearnProgress {
  private pending?: { account: string; promise: Promise<void> };
  constructor(
    private app: Application,
    private practice: Practice,
  ) {}
  private account() {
    const email = this.app.ai.session?.email;
    if (email)
      return createHash("sha256")
        .update(`${this.app.ai.config().service}\n${email.toLowerCase()}`)
        .digest("hex");
  }
  private snapshot(): ProgressSnapshot {
    const state = this.app.store.state();
    const checkpoints = new Map<string, { count: number; latest: string }>();
    for (const checkpoint of state.checkpoints) {
      const previous = checkpoints.get(checkpoint.courseId);
      const date = checkpoint.timestamp;
      checkpoints.set(checkpoint.courseId, {
        count: (previous?.count || 0) + 1,
        latest: previous && previous.latest > date ? previous.latest : date,
      });
    }
    const clean = (value: string, cap: number) => {
      const safe = value.slice(0, cap).trim();
      return safe && !scan(safe, "progress.txt").length ? safe : undefined;
    };
    const courses = state.courses
      .flatMap((course) => {
        const anchor = this.app.store.get<ResumeAnchor>(`resume:${course.id}`);
        const marked = checkpoints.get(course.id);
        const lesson = course.lessons.find(
          (item) => item.id === (anchor?.lessonId || course.currentLessonId),
        );
        const activityAt = [
          anchor?.updatedAt,
          marked?.latest,
          course.observedAt,
        ]
          .filter(
            (value): value is string =>
              !!value && Number.isFinite(Date.parse(value)),
          )
          .map((value) => new Date(value).toISOString())
          .sort()
          .at(-1);
        const title = clean(course.title, 300),
          id = clean(course.id, 200);
        if (!title || !id || !activityAt) return [];
        return [
          {
            id,
            title,
            activityAt,
            lesson: lesson && clean(lesson.title, 300),
            completed: course.lessons.filter(
              (item) => !item.archived && item.completed,
            ).length,
            checkpoints: Math.min(marked?.count || 0, 10000),
          },
        ];
      })
      .sort((a, b) => b.activityAt.localeCompare(a.activityAt))
      .slice(0, 40);
    const skills = new Map<string, ProgressSnapshot["skills"][number]>();
    if (state.settings.configured)
      for (const { language, skill } of this.practice.dashboard().skills) {
        const label = clean(skill, 160);
        if (label)
          skills.set(`${language}:${label}`, { language, skill: label });
        if (skills.size === 80) break;
      }
    return progressSnapshot.parse({ courses, skills: [...skills.values()] });
  }
  status() {
    const key = this.account();
    const cached =
      key && this.app.store.get<SavedProgress>(`learn:progress:${key}`);
    return {
      enabled: !!key && this.app.store.get(`learn:sync:${key}`) === true,
      syncedAt: cached ? cached.syncedAt : null,
      progress: summarize([this.snapshot(), ...(cached ? cached.devices : [])]),
    };
  }
  configure(enabled: boolean) {
    const key = this.account();
    if (!key)
      throw new UserError("Sign in before changing sync settings.", 401);
    this.app.store.put(`learn:sync:${key}`, enabled);
    if (!enabled) this.app.store.remove(`learn:progress:${key}`);
  }
  async sync(force = false) {
    const key = this.account();
    const enabled = () =>
      key && this.app.store.get(`learn:sync:${key}`) === true;
    if (!key || !enabled()) return;
    if (this.pending?.account === key) return this.pending.promise;
    const snapshot = this.snapshot();
    const digest = createHash("sha256")
      .update(JSON.stringify(snapshot))
      .digest("hex");
    const storeKey = `learn:progress:${key}`;
    const previous = this.app.store.get<SavedProgress>(storeKey);
    if (
      !force &&
      previous?.digest === digest &&
      Date.now() - Date.parse(previous.syncedAt) < 300000
    )
      return;
    const deviceKey = "learn:device-id";
    const deviceId = this.app.store.get<string>(deviceKey) || randomUUID();
    this.app.store.put(deviceKey, deviceId);
    const upload =
      (snapshot.courses.length || snapshot.skills.length) &&
      previous?.digest !== digest;
    const promise = this.app.ai
      .learnProgress(upload ? { deviceId, snapshot } : undefined)
      .then(({ devices }) => {
        if (key === this.account() && enabled())
          this.app.store.put(storeKey, {
            syncedAt: new Date().toISOString(),
            digest,
            devices,
          });
      })
      .finally(() => {
        if (this.pending?.promise === promise) this.pending = undefined;
      });
    this.pending = { account: key, promise };
    await promise;
  }
}
