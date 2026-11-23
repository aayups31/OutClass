import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { Store } from "../src/server/store";
import { Application } from "../src/server/application";
import { Expansion } from "../src/server/expansion";
import { AcademyStudio } from "../src/server/academy-studio";
import { AcademyResources } from "../src/server/academy-resources";
import { academyExample } from "../src/academy-example";
import { writtenLesson } from "../tests/helpers/course-workshop";

// Credentials stay in process memory. The code files are single-use OTPs supplied by the test operator.
if (!process.argv.includes("--live"))
  throw Error(
    "Use --live with --accounts <ignored JSON containing educatorEmail and learnerEmail>. This signs in real accounts, briefly publishes an original validation course and withdraws it afterward.",
  );
const argument = process.argv.indexOf("--accounts"),
  filename = process.argv[argument + 1];
if (
  argument < 0 ||
  !filename ||
  !path.resolve(filename).startsWith(path.resolve(".local") + path.sep)
)
  throw Error("Choose an accounts JSON file under ignored .local.");
const accounts = JSON.parse(await readFile(filename, "utf8")),
  service = "https://git-learn-black.vercel.app",
  root = await mkdtemp(path.join(tmpdir(), "outclass-deployed-")),
  stores: Store[] = [],
  phases: string[] = [];
async function client(name: string) {
  const store = new Store(path.join(root, name));
  stores.push(store);
  const app = new Application(store);
  await app.setup(path.join(root, `${name}-history`), false);
  app.ai.configure({
    mode: "included",
    service,
    localEndpoint: "http://127.0.0.1:11434/v1",
    localModel: "",
  });
  return app;
}
async function signIn(app: Application, email: string, role: string) {
  assert.match(email, /^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  const file = path.resolve(`.local/academy-${role}-otp.txt`);
  await rm(file, { force: true });
  await app.ai.login(email);
  console.log(`OTP_REQUIRED ${role}: put the current email code in ${file}`);
  const deadline = Date.now() + 600000;
  let code = "";
  while (Date.now() < deadline) {
    code = (await readFile(file, "utf8").catch(() => "")).trim();
    if (/^\d{6,8}$/.test(code)) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!code) throw Error(`No ${role} code received before timeout`);
  await app.ai.verify(email, code);
  await rm(file, { force: true });
  assert.ok(app.ai.ready());
  // Expire only the in-memory timestamp to exercise the real refresh endpoint.
  app.ai.session!.expires_at = 0;
  await app.ai.platform("mine");
  assert.ok(app.ai.session!.expires_at > Date.now() / 1000);
}
let author: Application | undefined, publishedId: string | undefined;
try {
  author = await client("educator");
  const learner = await client("learner");
  await signIn(author, accounts.educatorEmail, "educator");
  if (accounts.educatorEmail === accounts.learnerEmail)
    learner.ai.session = { ...author.ai.session! };
  else await signIn(learner, accounts.learnerEmail, "learner");
  phases.push(
    accounts.educatorEmail === accounts.learnerEmail
      ? "real email OTP sign-in and refresh; one allowed test account in two clean workspaces"
      : "real email OTP sign-in and session refresh for two independent accounts",
  );
  const course = academyExample(),
    fixture = writtenLesson(0),
    expansion = new Expansion(author);
  course.title = `Release validation ${randomUUID().slice(0, 8)} — temporary synthetic course`;
  course.rightsConfirmed = true;
  course.lessons[0].assessments = fixture.assessments;
  const bytes = Buffer.from(
      "# Original release verification fixture\n".repeat(10000),
    ),
    resource = {
      id: randomUUID(),
      name: "release_fixture.py",
      kind: "code" as const,
      mime: "text/plain",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  await new AcademyResources(author).restore(resource, bytes);
  course.lessons[0].resources = [resource];
  const saved = expansion.saveCourse({ ...course, expectedRevision: 0 });
  author.store.put(
    `academy:teacher:${saved.id}:${saved.revision}`,
    fixture.answerKeys,
  );
  const studio = new AcademyStudio(author, expansion),
    audit = studio.audit(saved.id);
  assert.equal(audit.findings.filter((f) => f.level === "blocker").length, 0);
  studio.review(saved.id, {
    expectedRevision: 1,
    hash: audit.hash,
    acknowledged: audit.findings
      .filter((f) => f.level === "review")
      .map((f) => f.id),
    approve: true,
  });
  const release = studio.release(saved.id, {
    expectedRevision: 1,
    reviewHash: audit.hash,
    approve: true,
  });
  const original = author.ai.platform.bind(author.ai);
  let dropped = false;
  author.ai.platform = (async (route, body) => {
    if (!dropped && /\/chunk$/.test(route) && (body as any)?.position === 1) {
      dropped = true;
      throw Error("Intentional upload interruption");
    }
    return original(route, body);
  }) as typeof author.ai.platform;
  await assert.rejects(
    () => expansion.publishHosted(release.id),
    /Intentional/,
  );
  publishedId = release.id;
  await expansion.publishHosted(release.id);
  phases.push(
    "real hosted media upload interrupted and resumed; reviewed publication",
  );
  await assert.rejects(() =>
    learner.ai.platform(`courses/${release.id}/grant`, { lessonIndex: 0 }),
  );
  await learner.ai.platform(`courses/${release.id}/enroll`, {});
  const grant = (await learner.ai.platform(`courses/${release.id}/grant`, {
    lessonIndex: 0,
  })) as { grant: string };
  const platform = learner.ai.platform.bind(learner.ai);
  let broken = false,
    redeems = 0;
  learner.ai.platform = (async (route, body) => {
    if (route === "redeem") redeems++;
    if (!broken && route.includes("/lessons/1/")) {
      broken = true;
      throw Error("Intentional download interruption");
    }
    return platform(route, body);
  }) as typeof learner.ai.platform;
  const received = new Expansion(learner);
  await assert.rejects(() => received.importHosted(grant.grant), /Intentional/);
  await received.importHosted(grant.grant);
  assert.equal(redeems, 1);
  assert.deepEqual(await new AcademyResources(learner).bytes(resource), bytes);
  assert.equal(
    learner.store.get(`academy:assessment-keys:${release.id}`),
    undefined,
  );
  phases.push(
    "enrollment, one-time launch grant, interrupted download recovery and exact media hash",
  );
  const result = (await platform(`courses/${release.id}/assess`, {
    requestId: randomUUID(),
    itemId: fixture.answerKeys[0].itemId,
    choice: fixture.answerKeys[0].correctChoice,
    expectedAttempt: 0,
  })) as { correct: boolean };
  assert.equal(result.correct, true);
  phases.push("real server-private assessment grading");
  await learner.ai.logout();
  assert.equal(learner.ai.ready(), false);
  phases.push("local sign-out clears account access");
  await mkdir(".local/release-verification", { recursive: true });
  await writeFile(
    ".local/release-verification/deployed.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        service,
        passed: true,
        phases,
        temporaryCourse: release.id,
        credentialsRecorded: false,
        independentAccounts: accounts.educatorEmail !== accounts.learnerEmail,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, phases }));
} finally {
  if (author && publishedId)
    await author.ai.platform(`courses/${publishedId}/withdraw`, {
      approveWithdrawal: true,
    });
  for (const store of stores) store.close();
  await rm(root, { recursive: true, force: true });
}
