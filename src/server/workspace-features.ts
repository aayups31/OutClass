import type { Express } from "express";
import { z } from "zod";
import type { Application } from "./application.js";
import { IdeaNotebook, projectIdeaSchema } from "./notebook.js";
import { accountConfirmation, accountEmail, accountRegistration, accountSignIn } from "../account-contract.js";
export function workspaceFeatures(
  web: Express,
  app: Application,
  notebook: IdeaNotebook,
) {
  web.get("/api/ai-access", (_req, res) => res.json(app.ai.status()));
  web.post("/api/account-password", async (req, res) => {
    res.json(await app.ai.signIn("password", accountSignIn.parse(req.body)));
  });
  web.post("/api/account-register", async (req, res) => {
    const { email, password } = accountRegistration.parse(req.body);
    res.json(await app.ai.register(email, password));
  });
  web.post("/api/account-confirm", async (req, res) => {
    res.json(await app.ai.signIn("confirm-registration", accountConfirmation.parse(req.body)));
  });
  web.post("/api/account-resend", async (req, res) => {
    res.json(await app.ai.resendRegistration(accountEmail.parse(req.body.email)));
  });
  web.post("/api/ai-check", async (_req, res) =>
    res.json(await app.ai.checkConnection()),
  );
  web.post("/api/ai-config", (req, res) =>
    res.json(
      app.ai.configure(
        z
          .object({
            mode: z.enum(["personal", "included", "local"]),
            service: z.string().max(2000),
            localEndpoint: z.string().max(2000),
            localModel: z.string().max(200),
          })
          .parse(req.body),
      ),
    ),
  );
  web.post("/api/ai-sign-in", async (req, res) =>
    res.json(
      await app.ai.login(z.string().email().max(254).parse(req.body.email)),
    ),
  );
  web.post("/api/ai-verify", async (req, res) => {
    const input = z
      .object({
        email: z.string().email().max(254),
        code: z.string().regex(/^\d{6,8}$/),
      })
      .parse(req.body);
    res.json(await app.ai.verify(input.email, input.code));
  });
  web.post("/api/ai-sign-out", async (_req, res) =>
    res.json(await app.ai.logout()),
  );
  web.get("/api/ai-usage", async (_req, res) => res.json(await app.ai.usage()));
  web.post("/api/ai-checkout", async (_req, res) =>
    res.json(await app.ai.checkout()),
  );
  const id = z.string().uuid();
  web.get("/api/notebook", (_req, res) => res.json(notebook.status()));
  web.get("/api/notebook-launch", (_req, res) => {
    const d = notebook.status();
    res.json({ launchPrompt: d.launchPrompt, reviewDue: d.reviewDue });
  });
  web.post("/api/notebook-preferences", (req, res) =>
    res.json(
      notebook.preferences(
        z
          .object({ launchPrompt: z.boolean(), automaticNotes: z.boolean() })
          .parse(req.body),
      ),
    ),
  );
  web.post("/api/notebook-create", (req, res) =>
    res.json(notebook.create(projectIdeaSchema.parse(req.body))),
  );
  web.post("/api/notebook-update", (req, res) =>
    res.json(
      notebook.update(id.parse(req.body.id), projectIdeaSchema.parse(req.body)),
    ),
  );
  web.post("/api/notebook-remove", (req, res) =>
    res.json(notebook.remove(id.parse(req.body.id))),
  );
  web.post("/api/notebook-note", (req, res) => {
    const input = z
      .object({
        id,
        text: z.string().trim().min(1).max(6000),
        kind: z.enum(["idea", "decision", "reflection"]).default("idea"),
        noteId: id.optional(),
      })
      .parse(req.body);
    res.json(notebook.note(input.id, input));
  });
  web.post("/api/notebook-note-remove", (req, res) =>
    res.json(
      notebook.removeNote(id.parse(req.body.id), id.parse(req.body.noteId)),
    ),
  );
  web.post("/api/architect-chat", async (req, res) => {
    const input = z
      .object({ id, question: z.string().trim().min(1).max(4000) })
      .parse(req.body);
    res.json(await notebook.ask(input.id, input.question));
  });
  web.post("/api/architect-review", async (req, res) =>
    res.json(
      await notebook.ask(
        id.parse(req.body.id),
        "Review the dated notes, explain useful connections to the linked courses and suggest one small next experiment. Identify untested assumptions; distinguish suggestions from original learner thoughts.",
        true,
      ),
    ),
  );
  web.post("/api/architect-clear", (req, res) =>
    res.json(notebook.clearChat(id.parse(req.body.id))),
  );
}
