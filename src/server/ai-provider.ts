import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import type { Application } from "./application.js";
import { assertClean, UserError } from "./safety.js";
import type { AIUsage } from "../ai-contract.js";
export type AIConfig = {
  mode: "personal" | "included" | "local";
  service: string;
  localEndpoint: string;
  localModel: string;
};
export type AccountSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  email: string;
};
const defaults: AIConfig = {
  mode: "personal",
  service: process.env.OUTCLASS_AI_SERVICE || "",
  localEndpoint: "http://127.0.0.1:11434/v1",
  localModel: "",
};
export function endpoint(value: string, local = false) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UserError("Enter a valid AI service URL.");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (local && !loopback) ||
    (!local &&
      url.protocol !== "https:" &&
      !(loopback && url.protocol === "http:")) ||
    (local && !["http:", "https:"].includes(url.protocol))
  )
    throw new UserError(
      local
        ? "Local models must use a localhost endpoint without credentials."
        : "Included AI requires an HTTPS service URL without credentials.",
    );
  return url.href.replace(/\/$/, "");
}
export class AIProvider {
  session?: AccountSession;
  persist?: (session: AccountSession | null) => Promise<void>;
  private refreshPromise?: Promise<void>;
  private authRevision = 0;
  private vaultWrite: Promise<void> = Promise.resolve();
  constructor(private app: Application) {}
  config(): AIConfig {
    return {
      ...defaults,
      service: process.env.OUTCLASS_AI_SERVICE || defaults.service,
      ...this.app.store.get<AIConfig>("ai:config"),
    };
  }
  ready() {
    const c = this.config();
    return c.mode === "personal"
      ? !!this.app.apiKey
      : c.mode === "local"
        ? !!c.localModel
        : !!(c.service && this.session);
  }
  status() {
    const c = this.config();
    return {
      ...c,
      ready: this.ready(),
      account: this.session ? { email: this.session.email } : null,
      securePersistence: !!this.persist,
    };
  }
  configure(input: AIConfig) {
    input.localModel = input.localModel.trim();
    input.service = input.service ? endpoint(input.service) : "";
    input.localEndpoint = endpoint(input.localEndpoint, true);
    assertClean(input.localModel, "model name");
    if (input.service !== this.config().service && this.session)
      throw new UserError("Sign out before changing the included AI service.");
    if (
      input.service !== this.config().service ||
      input.mode !== this.config().mode
    )
      this.authRevision++;
    this.app.store.put("ai:config", input);
    return this.status();
  }
  private async request(route: string, body?: unknown, authenticated = false) {
    const c = this.config();
    const revision = this.authRevision;
    if (!c.service)
      throw new UserError(
        "Included AI has not been connected to a hosted service yet. Use a personal key or local model meanwhile.",
      );
    if (authenticated) await this.refresh();
    if (authenticated && (!this.session || revision !== this.authRevision))
      throw new UserError(
        "Your account changed. Sign in again to use included AI.",
        401,
      );
    try {
      const response = await fetch(`${endpoint(c.service)}/v1/${route}`, {
        method: body === undefined ? "GET" : "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          ...(authenticated && this.session
            ? { Authorization: `Bearer ${this.session.access_token}` }
            : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(35000),
      });
      const result = await response.json();
      if (authenticated && revision !== this.authRevision)
        throw new UserError(
          "You signed out before this request finished.",
          401,
        );
      if (!response.ok)
        throw new UserError(
          typeof result.error === "string"
            ? result.error.slice(0, 300)
            : "The AI service could not complete this request.",
          response.status,
        );
      return result;
    } catch (error) {
      if (error instanceof UserError) throw error;
      throw new UserError(
        "The included AI service could not be reached. Check your connection and retry; your local work is safe.",
        503,
      );
    }
  }
  platform(route: string, body?: unknown) {
    if (
      !/^(catalog|mine|publish|redeem|courses\/[a-f0-9-]{36}\/(enroll|grant|withdraw))$/.test(
        route,
      )
    )
      throw new UserError("Unknown Academy operation.");
    return this.request(`academy/${route}`, body, route !== "catalog");
  }
  async login(email: string) {
    await this.request("auth/email", { email });
    return { sent: true };
  }
  async verify(email: string, code: string) {
    const revision = ++this.authRevision;
    const session = await this.request("auth/verify", { email, code });
    await this.saveSession(session, revision);
    return this.status();
  }
  private async writeVault(input: AccountSession | null, revision: number) {
    const write = this.vaultWrite
      .catch(() => {})
      .then(async () => {
        if (revision === this.authRevision && this.persist)
          await this.persist(input);
      });
    this.vaultWrite = write;
    await write;
  }
  private async saveSession(input: unknown, revision: number) {
    const parsed = z
      .object({
        access_token: z.string().min(1).max(12000),
        refresh_token: z.string().min(1).max(12000),
        expires_at: z.number().int(),
        email: z.string().email(),
      })
      .parse(input);
    if (revision !== this.authRevision)
      throw new UserError(
        "Your account changed while signing in. Try again.",
        401,
      );
    await this.writeVault(parsed, revision);
    if (revision !== this.authRevision)
      throw new UserError("You signed out before sign-in finished.", 401);
    this.session = parsed;
  }
  async logout() {
    const revision = ++this.authRevision;
    this.session = undefined;
    await this.writeVault(null, revision);
    return this.status();
  }
  private async refresh() {
    if (!this.session) throw new UserError("Sign in to use included AI.", 401);
    if (this.session.expires_at > Date.now() / 1000 + 60) return;
    if (!this.refreshPromise) {
      const revision = this.authRevision;
      this.refreshPromise = this.request("auth/refresh", {
        refreshToken: this.session.refresh_token,
      })
        .then((s) => this.saveSession(s, revision))
        .catch(async (error) => {
          if (
            revision === this.authRevision &&
            error instanceof UserError &&
            [400, 401].includes(error.status)
          ) {
            await this.logout();
            throw new UserError(
              "Your account session expired. Sign in again to continue.",
              401,
            );
          }
          throw error;
        })
        .finally(() => {
          this.refreshPromise = undefined;
        });
    }
    await this.refreshPromise;
  }
  async usage(): Promise<AIUsage> {
    return this.request("usage", undefined, true);
  }
  async checkout() {
    return this.request("checkout", {}, true) as Promise<{ url: string }>;
  }
  async checkConnection() {
    const c = this.config();
    if (!this.ready()) throw new UserError("Save a ready AI connection first.");
    if (c.mode === "included") {
      const usage = await this.usage();
      return {
        ok: true,
        message:
          usage.remaining > 0
            ? "Signed in. Included AI has available allowance."
            : "Signed in. Your included allowance is used up; your local work stays available.",
      };
    }
    try {
      const client = new OpenAI({
        apiKey: c.mode === "local" ? "local-model" : this.app.apiKey,
        ...(c.mode === "local"
          ? { baseURL: endpoint(c.localEndpoint, true) }
          : {}),
        timeout: 8000,
        maxRetries: 0,
      });
      const model =
        c.mode === "local"
          ? c.localModel
          : process.env.OPENAI_CHAT_MODEL ||
            process.env.OPENAI_MODEL ||
            "gpt-4o-mini";
      if (c.mode === "local") {
        const models = await client.models.list();
        if (!models.data.some((m) => m.id === model))
          throw new UserError(
            "The local server is reachable, but that exact model is not available. Check its installed model name.",
            503,
          );
      } else await client.models.retrieve(model);
      return {
        ok: true,
        message:
          "The service and selected model are reachable. This check did not generate an AI answer; answer availability also depends on the provider's limits.",
      };
    } catch (error) {
      if (error instanceof UserError) throw error;
      throw new UserError(
        c.mode === "local"
          ? "Could not reach the local model. Start its server and check the endpoint and exact model name."
          : "Could not verify your personal AI connection. Check the key, model access and network in Settings.",
        503,
      );
    }
  }
  async structured<T extends z.ZodType>(options: {
    task:
      | "teacher"
      | "architect"
      | "checkpoint"
      | "academy"
      | "creative"
      | "growth"
      | "analytics"
      | "promotion"
      | "work";
    schema: T;
    name: string;
    instructions: string;
    context: string;
    history?: { role: "user" | "assistant"; content: string }[];
  }): Promise<z.infer<T>> {
    const { task, schema, name, instructions, context, history = [] } = options;
    assertClean(context + JSON.stringify(history), "AI context");
    const c = this.config();
    if (!this.ready())
      throw new UserError("Choose an AI connection in Settings first.");
    try {
      let output: unknown;
      if (c.mode === "included") {
        const response = await this.request(
          "answer",
          { task, context, history },
          true,
        );
        output = response.answer;
      } else if (c.mode === "local") {
        const client = new OpenAI({
          apiKey: "local-model",
          baseURL: endpoint(c.localEndpoint, true),
          timeout: 60000,
          maxRetries: 0,
        });
        const response = await client.chat.completions.create({
          model: c.localModel,
          max_tokens: task === "work" ? 3500 : 1800,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `${instructions}\nReturn JSON matching this schema: ${JSON.stringify(z.toJSONSchema(schema))}`,
            },
            ...history,
            { role: "user", content: context },
          ],
        });
        output = JSON.parse(response.choices[0]?.message.content || "{}");
      } else {
        const client = new OpenAI({
          apiKey: this.app.apiKey,
          timeout: 25000,
          maxRetries: 0,
        });
        const response = await client.responses.parse({
          model:
            process.env.OPENAI_CHAT_MODEL ||
            process.env.OPENAI_MODEL ||
            "gpt-4o-mini",
          store: false,
          max_output_tokens:
            task === "checkpoint" ? 250 : task === "work" ? 3500 : 1800,
          instructions,
          input: [...history, { role: "user", content: context }],
          text: { format: zodTextFormat(schema, name) },
        });
        output = response.output_parsed;
      }
      const parsed = schema.parse(output);
      assertClean(JSON.stringify(parsed), "AI response");
      return parsed;
    } catch (error) {
      if (error instanceof UserError) throw error;
      const status = (error as { status?: number })?.status;
      if (status === 401 || status === 403)
        throw new UserError(
          "The selected AI connection needs attention. Check your account or personal key in Settings.",
          401,
        );
      if (status === 429)
        throw new UserError(
          "This AI connection has reached its rate or usage limit. Check its allowance in Settings, then retry.",
          429,
        );
      throw new UserError(
        c.mode === "local"
          ? "The local model did not return a usable answer. Check that its server and exact model are running, then retry."
          : "The AI connection did not return a usable answer. Retry in a moment; your code and notes are safe.",
        503,
      );
    }
  }
}
