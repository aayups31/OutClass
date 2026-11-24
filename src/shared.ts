import { z } from "zod";
export const lessonSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  section: z.string().max(300).default("Lessons"),
  sectionId: z.string().max(200).optional(),
  order: z.number().int().min(0).default(0),
  completed: z.boolean().optional(),
  url: z.string().url().max(2000).optional(),
});
export const observationSchema = z.object({
  eventId: z.string().min(1).max(200),
  courseId: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  url: z.string().url().max(2000),
  currentLessonId: z.string().max(200).optional(),
  lessons: z.array(lessonSchema).max(500).default([]),
  videoSeconds: z.number().finite().min(0).max(86400).optional(),
  preserveTitle: z.boolean().optional(),
});
export type Observation = z.infer<typeof observationSchema>;
export type Lesson = z.infer<typeof lessonSchema> & {
  path: string;
  archived?: boolean;
};
export interface Course {
  id: string;
  platform?: "udemy" | "web" | "academy";
  title: string;
  url: string;
  path: string;
  lessons: Lesson[];
  currentLessonId?: string;
  mirrored: boolean;
  observedAt: string;
  videoSeconds?: number;
  workspaceMode?: "lesson" | "project";
  project?: { id: string; root: string };
}
export interface Session {
  id: string;
  courseId: string;
  lessonId: string;
  lessonTitle: string;
  courseTitle: string;
  section: string;
  destination: string;
  workspace: string;
  startedAt: string;
  status: "active" | "paused";
  note: string;
  projectId?: string;
  contributionId?: string;
}
export interface ResumeAnchor {
  courseId: string;
  lessonId: string;
  workspace: string;
  projectId?: string;
  contributionId?: string;
  file?: string;
  cursor?: number;
  note: string;
  updatedAt: string;
  lastAction: "started" | "paused" | "saved" | "checkpoint" | "ended";
}
export interface ContinueItem extends ResumeAnchor {
  folderAvailable: boolean;
  fileAvailable: boolean;
}
export interface RunEvidence {
  id: string;
  sessionId: string;
  courseId: string;
  lessonId: string;
  workspace: string;
  path: string;
  fileVersion: string;
  source: string;
  sourceTruncated: boolean;
  output: string;
  outputTruncated: boolean;
  exitCode: number | null;
  timedOut: boolean;
  stopped: boolean;
  startedAt: string;
  finishedAt: string;
  changedDuringRun: boolean;
  workspaceVersions?: Record<string, string>;
  regression?: { baselineId: string; lessonId: string; changedFiles: string[] };
}
export interface RunContext extends RunEvidence {
  stale: boolean;
}
export interface Diagnostics {
  nodeVersion: string;
  webToolchainAvailable: boolean;
  pythonAvailable: boolean;
  pythonRuntime: string;
  cCompiler?: string;
  cppCompiler?: string;
  npmAvailable?: boolean;
  gitAvailable: boolean;
  historyWritable: boolean;
  workspaceWritable: boolean | null;
  hasApiKey: boolean;
  hasAI?: boolean;
  assistantEnabled: boolean;
  extensionConnected: boolean;
}
export interface Checkpoint {
  id: string;
  sessionId: string;
  courseId: string;
  courseTitle: string;
  lessonTitle: string;
  timestamp: string;
  message: string;
  sha: string;
  files: string[];
  sync: "local" | "pending" | "synced";
  lessonId?: string;
  video?: { url: string; seconds: number; capturedAt: string };
  reflection?: string;
}
export interface Settings {
  configured: boolean;
  repoPath: string;
  aiEnabled: boolean;
  remote: string;
  assistantEnabled?: boolean;
}
export interface AppState {
  settings: Settings;
  courses: Course[];
  session: Session | null;
  checkpoints: Checkpoint[];
}
export interface Finding {
  path: string;
  kind: string;
}
export interface FrozenFile {
  path: string;
  content: string | null;
}
export interface Preview {
  id: string;
  sessionId: string;
  expectedHead: string;
  expectedBranch: string;
  treeId: string;
  fingerprint: string;
  files: FrozenFile[];
  changes: { path: string; status: string }[];
  diff: string;
  message: string;
  aiUsed: boolean;
  aiNotice?: string;
  createdAt: string;
  video?: Checkpoint["video"];
  reflection?: string;
}
export type PublicPreview = Omit<
  Preview,
  "files" | "treeId" | "expectedBranch"
>;
export interface Status extends AppState {
  account?: { email: string } | null;
  hasAI?: boolean;
  hasApiKey: boolean;
  gitAvailable: boolean;
  ghAvailable: boolean;
  extensionConnected: boolean;
  sourceFiles: number;
  continueItems: ContinueItem[];
}
