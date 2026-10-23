# OutClass

Previously GitLearn. Break free from tutorial hell. OutClass the lesson.

A local learning workspace that turns Udemy lessons into your own code, practical attempts, sourced guidance, and reviewed work.

The **0.8.0 preview** connects Learn, Academy, Creator Studio and GTM through task-based specialists. Academy produces reviewable practical assignments; Creative Director produces scripts and source-linked timelines; Growth prepares channel campaigns; Analytics proposes experiments from recorded evidence. Reviewed handoffs connect their work. OffCourse guides learners through their own attempts, tests, reflections and changed requirements in a compact editor with the teacher on the right. See [features and setup](docs/releases/0.8.0.md), [agent architecture](docs/agent-work.md) and [verification](docs/release-validation.md).

[Next release priorities](docs/next-release.md): validate real Udemy use, improve relevant during-course practice, verify transfer with changed requirements, and guide a small project into responsible contribution work.

The [connected products](docs/connected-products.md) include instructor-owned course drafts/releases and Learn delivery, local footage editing/rendering, timed transcript search, native-style social composers, an approved-publication queue and provider observations. Social APIs need configured developer applications and eligible accounts; preview layouts approximate the provider's final rendering. Supabase and Stripe included AI remain connected for owner testing: Resend uses its test sender and Stripe remains in test mode. Public email and live sales are not activated. Public course commerce, instructor payouts and cloud media workers remain outside this preview.

## Development

Use Node 24 or later, run `npm ci` then `npm run dev`. Open the local app, complete its existing learning-folder setup, and select **Academy**, **Creator Studio**, or **GTM** in the sidebar. Direct workspace URLs are `/?view=academy`, `/?view=creator`, and `/?view=gtm` on your local companion. Course releases and creative approvals are local to that device. No AI key or external account is required for this authoring slice, and it incurs no inference, rendering, advertising or payment-provider charges.

## Start

**Windows desktop preview:** download the installer from [GitHub Releases](https://github.com/aayups31/OutClass/releases), open OutClass, and follow its first-run setup. Choose one parent learning folder; OutClass creates practice and history folders for each course automatically. JavaScript's runtime is bundled. Git for Windows is required for checkpoints; Python is optional for Python lessons. VS Code and GitHub remain optional.

The [public website and setup guide](https://git-learn-black.vercel.app/) are live on Vercel. The actual editor, courses, RAG assistant, and setup live in the Windows desktop app. See [desktop architecture and packaging](docs/desktop-release.md) and [Chrome store release](docs/chrome-web-store.md). The last verified store status (October 11) for OutClass 0.4.2 was pending review. Use the current preview ZIP with Load unpacked for current preview features until an updated store package is approved.

On this Windows machine, double-click **Start OutClass.cmd**. It starts the companion in the background and opens the app at [http://127.0.0.1:47831](http://127.0.0.1:47831).

The [product page and complete setup guide](http://127.0.0.1:47831/welcome/) explain the local workflow, Chrome installation, folders, checkpoint review, and GitHub backup. Open **Product & guide** from any workspace view. `npm run preview:site` previews the separate public site at http://127.0.0.1:47832. Public hosting is configured separately from the local app.

For development, with Node.js 24+ and Git installed:

```powershell
npm install
npm run build
npm start
```

Use `npm run dev` for the interface and server with development transforms. Double-click **Stop OutClass.cmd** to stop a launcher-started companion, or stop a foreground server with Ctrl+C. The launcher keeps its process ID and redacted startup logs in `.local/`.

## Your first Udemy session

1. Follow desktop setup and choose a **parent learning folder**. OutClass creates history and practice folders inside it. In the developer browser version, choose an empty learning-history folder in **Setup**. GitHub and AI are optional and off by default.
2. Add your Udemy lesson manually, or connect the Chrome extension below.
3. Select **Mirror course** to create accessible lesson structure and separate coding workspaces. Discovery is partial; more lessons can be added as you go. Refresh preserves stable lesson paths and your notes.
4. Select **Start lesson**. Choose **One project for the whole course** to keep building the same files across lessons. OutClass creates it under `projects/`, or you can attach an existing project. Separate lesson folders and one-session existing folders remain available.
5. Open **Code & learn**. Select or create a file, write code, and **Run** JavaScript, erasable TypeScript, Python, C or C++ locally. Python needs an installed interpreter; C/C++ need GCC/G++ or Clang on PATH. JavaScript/TypeScript use OutClass’s Node runtime. React/Next.js JSX/TSX use their project dev server in Project console. **Preview** supports a single HTML file with inline CSS and JavaScript. Ctrl/Cmd+S saves; Ctrl/Cmd+Enter runs. VS Code remains optional. Notes save as you type.
6. Select **Checkpoint** in the editor (or **Finish & review** in Overview), inspect the exact files and message, then **Save checkpoint**.

Code you change after preview stays in your source folder; the commit uses the version you reviewed. OutClass never changes the Git index or remotes in your existing source workspace.

The learning-history repository is managed by the companion. Avoid editing or staging files directly in it. Write code in your course project or lesson folder; OutClass copies reviewed snapshots into history. Automatic course projects live in a sibling `projects/` directory; separate lesson workspaces use `workspaces/`. Existing folders and checkpoints are preserved when upgrading.

**Continue building** in Overview restores the course, lesson, coding folder, saved file position, and last session note after a restart or checkpoint. The recap uses actual saved activity. If a folder moved, choose its current location to reattach it without moving files or changing its Git history. A missing last file falls back to available files.

After a failed run, select **Give me a hint** or **Explain this error**. The assistant receives the recorded saved entry file and bounded actual output, with current code attached when selected. Changed code is marked stale; rerun to check a proposed fix. **Hint first** helps you reason before asking for an explanation. Run history stays local unless explicitly attached to an enabled AI request. Settings includes **Device readiness** for JavaScript, Python, Git, folders, AI, and browser pairing.

## Build before the course ends

After a successful saved run or checkpoint, OutClass can suggest a related task while you are still taking the course. It explains the timing using recorded activity, recognizes section transitions, and lets you defer the suggestion. Python files lead to Python practice; unsupported languages receive no invented automatic exercise.

**Learn by doing** includes curated JavaScript, TypeScript, Python, C and C++ briefs covering validation, collections, and a small activity-report project. You write the implementation. **Check my work** runs real behavior checks against saved code. Progressive hints and optional course-aware teaching help you reason; neither changes files or runs commands for you. Each attempt records saved source, checks, help use, and your reflection. These are specific learning records, not a mastery score.

**Reviews** offer fresh-file retries on a 1/3/7/14-day schedule, with an opt-out and no background notifications. **Search my learning** explicitly searches your recorded attempts and reflections across courses. Export downloads the local learning record as JSON. Current retries repeat the curated brief; generated transfer variants remain planned.

In the editor's **Project console**, explicitly run package installation, tests, development servers, or line-input programs and stop them when finished. Create a React/Vite or Python starter without overwriting course files; fill in the project yourself. React projects require installed Node/npm. Python projects can use a local virtual environment. Commands run with your computer's permissions and do not inherit the companion's credential environment. The console is not a full PTY, debugger, or language server.

**Live work** finds checked public GitHub issues in your chosen stack and explains keyword matches to recorded practice. Reading, reproduction, documentation, and tests can begin during a course; a beginner label does not certify difficulty. Inspect the issue and contributor instructions, select a local brief, then explicitly clone into a separate `contributions/` folder and branch. The assistant guides requirements, baseline checks, reproduction, your changes, and review. Track notes, actual command results, source revisions, and public discussion; prepare a local PR draft from changes against the starting revision. Publication, forks, commits in the contribution repository, and maintainer messages stay under your control. This contribution workspace never copies an upstream repository into your learning archive.

## Connect Chrome once

1. Run `npm run build` if `dist/extension` is missing.
2. Open `chrome://extensions`, enable **Developer mode**, and select **Load unpacked**.
3. Choose this project's `dist/extension` directory and pin **OutClass**.
4. In the app's **Setup**, select **Get connection code**. Enter it in the extension popup.
5. Open or reload your Udemy course page.

The extension automatically observes accessible course and lesson titles/links. It queues context updates while the companion is offline. **Import visible transcript** explicitly imports text from an open Udemy transcript panel into the selected course’s local index. It does not download videos or read browser credentials. If Udemy does not expose a transcript, paste/import it in OutClass’s **Sources**. Transcript imports require a running companion; metadata updates have a durable offline queue. Only the granted extension can submit course context/material; editor, repository, and AI actions stay in the local app. Reload the unpacked extension and the Udemy tab after rebuilding.

## Coding and course-aware help

The left sidebar selects courses, the center edits real files in the active lesson folder, and the right panel holds a course-specific conversation and sources. Saves check whether another editor changed the file and preserve those external edits. Running uses saved code, a bounded output buffer, and a ten-second limit. Python prefers an existing `.venv` or `venv` in the selected folder, falling back to the installed `python` command. **Stop** terminates the tracked program and its child processes. Programs run with your computer’s permissions; the runner excludes the companion’s API credential environment. HTML previews use a restricted frame and do not load external assets or companion APIs. This is a focused learning editor, not a full shell or package manager.

1. In **Sources**, paste text or import TXT, MD, SRT, or VTT transcripts/resources. Imports stay local and become keyword-searchable immediately.
2. Explicitly **Enable learning assistant** with a configured API key. This is independent of AI commit messages.
3. Select **Refresh index** to embed uncached passages with `text-embedding-3-small`. Automatic refreshes only update local keyword search; they do not send source batches to OpenAI.
4. **Code help** combines retrieved course passages, local notes/code, and optionally the selected file or code selection. **Ask the course** retrieves only imported transcript/resource passages and reports missing context when it cannot find relevant material.
5. Click an answer’s source to see the actual retrieved excerpt and line numbers. Course conversations and cited passage snapshots persist locally.

Retrieval combines SQLite FTS5 with locally stored 384-dimensional embeddings and course-scoped ranking. Generation uses a bounded context and structured citation output. Default chat model is `gpt-4o-mini`; `OPENAI_CHAT_MODEL` overrides it, otherwise `OPENAI_MODEL` applies. Each course supports 120 sources and 2,000 passages, with 240,000 characters per import. A semantic refresh handles up to 320 pending passages; repeat it for a larger collection. Current code/notes and reviewed checkpoints are indexed for code help, never treated as evidence of the instructor’s lecture.

## Optional OpenAI

In the installed app, add your own key during setup or in Settings. It is encrypted with your Windows account and passed privately to the companion. The developer companion can read `.env` from the project root; both `OPENAI_API_KEY` and the `OPEN_AI_API` alias work, with `OPENAI_API_KEY` taking precedence. Packaged apps never read the developer `.env`. No key goes into the extension, frontend, course metadata, Git, or logs.

Enable **AI-assisted commit messages** in Setup to send a small secret-scanned diff, course context, and your note to OpenAI. The default is `gpt-4o-mini`; set `OPENAI_MODEL` to override. Requests use foreground Responses, Structured Outputs, `store: false`, and a short timeout. API failures fall back to a useful deterministic message.

Assistant questions, retrieved excerpts, selected code, explicitly attached run evidence, and semantic-indexing excerpts go to OpenAI only after the assistant is enabled. Its generation also uses Responses, Structured Outputs, `store: false`, and bounded requests. Chat and the retrieval index stay in the companion’s SQLite database. `store: false` is not a zero-retention promise; consult [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data). Keep the assistant, AI commit messages, and GitHub disabled for fully local operation. Original notes are preserved verbatim.

## Optional GitHub

Choose one learning-history folder and optionally connect **one private GitHub repository** to it. Mirroring each course creates its own course/section/lesson folders inside the archive. New coding workspaces live alongside the archive; existing coding folders stay where they are. A sync pushes saved history across all courses together. You do not create a repository per course.

1. Install [GitHub CLI](https://cli.github.com/) if missing. On Windows: `winget install --id GitHub.cli --exact --source winget`. The companion also detects the standard Windows installation without needing a PATH refresh.
2. In **Settings → One repository. Every course.**, select **Sign in to GitHub**. Complete the CLI browser sign-in and return to OutClass.
3. Select **Check connection** to verify the signed-in account. Repository actions become available after verification and local workspace setup.
4. Enter a name such as `learning` and select **Create private repo**, or connect the HTTPS URL of an existing **empty private** repository. OutClass verifies its visibility and configures Git to use your GitHub CLI authentication. No token is entered in the app.
5. Save a checkpoint, then select **Sync now** in **Checkpoints**. Connecting a repository alone does not upload files.

OutClass creates a repository only when you click that action. Sync is manual, scans outgoing history, never force-pushes, and pauses on divergent remote history. If a push fails, the local commit stays safe. GitHub setup and sync require internet access; you can continue saving locally while disconnected.

## Verification

```powershell
npm run check
npm test
npx playwright install chromium
npm run test:e2e
```

Tests use temporary folders and sanitized Udemy fixtures, including a real unpacked-extension pairing/capture/transcript-import/replay check. Editor checks run real saved JavaScript and Python. RAG tests mock OpenAI responses and embeddings to verify course isolation, citation validation, fallback, and semantic retrieval. They do not use your paid course account or make OpenAI/GitHub writes.

Stop the running companion before `npm run test:e2e`; the browser suite starts its own isolated instance on the same local port.

## Preview boundaries

### Connected product source preview

The latest source adds instructor-authored Academy Learn packages, separate instructor preview, reviewed agent handoffs, GTM-owned promotional posts/graphics/video previews, a local approved-publication queue and timestamped platform evidence. See [connected product roles and verified scope](docs/connected-products.md) and [social developer-app setup](docs/social-publishing.md).

GTM's **Create your post** composer provides platform-style X, LinkedIn and Instagram previews plus a playable YouTube feed/watch preview. Save channel-specific drafts, attach exact reviewed photos/videos, order photos, add alt text, and edit YouTube upload settings. Generated course graphics can open directly in the composer. The adapters attach selected media; feed layout remains an approximation until the provider renders the published post. See the social publishing guide for supported formats and pending live account validation.


From the running source app, use Academy to author and release a lesson, add its Learn experience, and preview it. In GTM, **Promotion studio** creates channel drafts from an authorized release; **Campaigns & insights** handles distribution and evidence. Source-based drafting uses no model call; AI drafting asks for approval and uses one bounded call. Preparing assets does not publish them. Scheduled posts run only while the app is open and connected, under the exact content/account consent recorded for the job.

These additions are packaged in the 0.8.0 preview. Real social publishing still requires eligible developer apps and live account validation. Academy payments/payouts and an always-on hosted scheduler are not included in this source milestone.

This is an unsigned Windows x64/Chrome preview with a downloadable installer. The desktop app bundles its JavaScript runtime; Git is required for checkpoints, and Python is needed for Python execution. Running from source requires Node 24+. It uses authenticated loopback HTTP, an embedded CodeMirror editor, optional VS Code integration, and Node's built-in SQLite. Core local Learn features do not require a hosted account; included AI and the Academy web catalog use the hosted account service. The source desktop app has an integrated terminal; Project console also supports explicit dependency installation, local dev servers and bounded line input. Full debugger and language-server integration remain outside the current editor.

Real authenticated Udemy layouts vary and need live validation on your course. The complete workflow is covered by fixtures plus manual fallback. Ignore rules, hard exclusions, and credential patterns reduce leakage risk; they cannot detect every sensitive value. Inspect previews and select only learner-owned source folders.

Portable artifacts live in your chosen Git repository. Session state, grants, pairing credentials, and checkpoint journal live in `%LOCALAPPDATA%/GitForLearning/`, outside the OneDrive project. `GITLEARN_DATA_DIR` overrides this for isolated testing. Never sync the live SQLite database through OneDrive.

See [current build and architecture](docs/current-build.md), the [longer-term architecture](docs/architecture.md), [implementation plan](docs/implementation-plan.md), [frontend design](docs/frontend-design.md), and [original product specification](GIT_FOR_LEARNING_PRODUCT_SPEC.md).

## Next: from tutorials to independent work

The [active product roadmap](docs/learning-to-contribution-roadmap.md) defines contextual debugging, persistent course projects, practice tasks, evidence-backed learning memory, short reviews, and guided open source contributions. The [learning and contribution architecture](docs/learning-architecture.md) specifies local data, retrieval scopes, runtime boundaries, matching, and verification. The 0.5 preview connects personal directions, practice breaks, progressive teaching, transfer challenges, evolving projects, evidence memory and guided contributions. The 0.6 preview adds language-specific project environments, TypeScript and native execution, and Python package installation. Coding-agent integration is deliberately deferred.

## Active learning in 0.5

Use **Learn by doing → My direction** to set a goal and session budget, keep an independent project, attach evidence to milestones, and export a readable learning ledger. Completed tasks unlock changed-requirement challenges. The assistant enforces saved-code/run freshness; local scripts accept bounded line input. Fresh Udemy observations attach video positions to reviewed checkpoints. [Implementation scope and boundaries](docs/active-learning-release.md).

## Languages and project environments in 0.6

**Code & learn → Project console → Create project** offers React, React with TypeScript, Next.js with TypeScript, Node.js, standalone TypeScript, Python, C and C++. Each starter supplies prepare, dependency, check/build and start commands. React/Next.js open on loopback ports 5173/3000. JSX and TSX need the project dev server; TypeScript saved-file execution strips erasable types and requires a separate project check for type safety. The standalone project’s Start command uses tsx for transformations, including enums.

Python projects can select NumPy/pandas, FastAPI, Flask, scikit-learn, PyTorch or an empty requirements file for other libraries. Create the project environment, then install packages explicitly. Saved-file runs and generated commands select the nearest `.venv`. Any compatible package can be added; native/GPU/OS requirements are not supplied by OutClass.

Short C11/C++17 programs compile with GCC/G++ or Clang, then run with the existing input/output/time limits. Multi-file CMake and MSVC workflows use Project console and your installed toolchain. TypeScript and C/C++ practice tasks preserve actual execution evidence and changed-requirement checks. See [0.6 release scope and instructions](docs/releases/0.6.0.md).
