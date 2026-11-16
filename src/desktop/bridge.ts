export interface DesktopEnvironment {
  version: string;
  defaultLearningFolder: string;
  gitAvailable: boolean;
  keyManaged: boolean;
  hasSavedKey: boolean;
}
export interface DesktopBridge {
  edition: OutClassEdition;
  environment(): Promise<DesktopEnvironment>;
  chooseFolder(): Promise<string | null>;
  setApiKey(key: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  openExtensionFolder(): Promise<void>;
  terminals: {
    list(): Promise<TerminalInfo[]>;
    create(sessionId: string): Promise<TerminalInfo>;
    snapshot(id: string): Promise<{ output: string; sequence: number }>;
    input(id: string, data: string): Promise<void>;
    resize(id: string, cols: number, rows: number): Promise<void>;
    close(id: string): Promise<void>;
    subscribe(listener: (event: TerminalEvent) => void): () => void;
  };
}
export interface TerminalInfo {
  id: string;
  sessionId: string;
  title: string;
  cwd: string;
  shell: string;
  running: boolean;
}
export type TerminalEvent =
  | { id: string; type: "data"; data: string; sequence: number }
  | { id: string; type: "exit"; exitCode: number };
declare global {
  interface Window {
    gitLearnDesktop?: DesktopBridge;
  }
}
import type { OutClassEdition } from "../outclass-edition";
