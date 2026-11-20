# StudyPal

StudyPal is an account-based study workspace that runs on a Mac and uses local AI. The illustrated dashboard opens in the browser and works with a loopback API, PostgreSQL, and a local language model. Upload a document, record a lecture, turn passages into a dated study plan, ask the tutor questions, or practice with quizzes and flashcards.

## Run locally

Use Node from `.nvmrc` (24.16.0), pnpm 11.9.0, a running Docker engine and Chrome. From the project directory on a fresh installation:

```sh
pnpm install --frozen-lockfile
cp -n .env.example .env
```

Copy your Clerk application's **publishable key** from its dashboard. Configure StudyPal with that key, then start the services.

```sh
pbpaste | node scripts/configure-clerk.mjs
pnpm local:start
```

Open **http://127.0.0.1:4173**, sign up or sign in, and create a named study set. The provisioner derives the issuer, configures both the web and API for the same Clerk instance and allows the loopback browser origins. The web build contains the publishable key. PostgreSQL associates workspace data with the verified account. Restart the launcher after a configuration change. First setup needs internet access for dependencies and model weights, and a running Docker engine for PostgreSQL.

### Offline use and older installations

An already verified, open account tab can keep using its local documents, on-device models and browser storage during a connection loss while its session remains valid. Opening or reloading an account workspace, switching accounts and signing in require online verification. Reconnect to sync local edits. Keep Ollama running for tutoring and quiz generation. Enable English speech recognition once under **Record Lecture**, and allow Chrome to use the microphone.

For an existing single-Mac installation or offline-only use, explicitly set both `WORKSPACE_AUTH_MODE=local` and `VITE_WORKSPACE_AUTH_MODE=local` in the private root `.env`. Restart `pnpm local:start`. In this mode the installed workspace can reopen offline. To sync its original PostgreSQL owner, run `node scripts/pair-workspace.mjs --copy` and enter the key under **Connect PostgreSQL**. Keep the original installation credentials. Clerk accounts use separate database owners and browser stores. To move your study data, export a workspace JSON backup from local mode, switch back to Clerk mode, sign into the intended account and explicitly restore the backup. Download recording audio separately. Both modes preserve the existing local data when switched.

## Data and model choices

| Workflow                    | Execution and storage                                                                                                                                                                                                                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document import and reading | The browser extracts text from PDF, DOCX, PPTX, Markdown, CSV and UTF-8 text. Notes, highlights and text join the study set. An on-device English OCR model handles photographed notes and PDF pages without a text layer. The workspace saves extracted study text.                                                       |
| Dashboard and plans         | IndexedDB saves changes immediately. With an authenticated session, the API syncs study sets, source text, annotations, plans, quiz/test attempts, calendar, chat and preferences to local PostgreSQL. The database accepts up to 8 MiB per workspace snapshot.                                                            |
| Recording                   | The browser captures audio and saves it in IndexedDB. Offline English transcription uses Vosk. Published transcripts sync with study materials. Use **Back up recording** to save raw audio and notes in local PostgreSQL, and **Restore recordings** in another authenticated browser for the same owner to recover them. |
| Chat and Tutor Me           | Ollama runs Qwen3 4B Instruct on loopback and uses passages from the current study set. Dictation and installed system voices support spoken tutoring.                                                                                                                                                                     |
| Practice                    | Flashcards and recall challenges use the source directly. Local AI generates questions, explanations and written feedback. Multiple-choice scoring uses the saved answer key.                                                                                                                                              |
| Optional cloud assessment   | Only quiz/test generation and written grading offer a cloud model. Each use requires an explicit selection, an authenticated session, server-side configuration and an available budget. The local option works without credentials. See the [API runbook](apps/api/README.md).                                            |

The production web build caches app files and models used for offline work and includes an installable web app manifest. With Chrome, use the install option to launch StudyPal in its own window. After setup, local inference and PostgreSQL can run without internet. Account access follows the verification rules above. The dashboard retries sync after reconnecting. When two copies have changed, it lets you export your browser copy before choosing a version. The workspace settings also export and restore a JSON backup. Clearing site data removes recordings without a backup and unsynced edits.

## Development and verification

`pnpm dev` starts watchers with the web at http://127.0.0.1:5173. That origin has its own browser storage. For offline testing, use the built frontend on 4173.

```sh
pnpm check
pnpm test:integration
pnpm test:e2e:postgres
RUN_LOCAL_AI_E2E=1 RUN_FRONTIER_E2E=1 pnpm test:e2e:postgres
```

The PostgreSQL browser test uses the explicit single-Mac mode and starts a temporary API on 3086 and a built frontend on 4184 with a new random test owner. It needs a migrated local database and built artifacts. The full browser suite above needs built API test fixtures from `pnpm test:integration`. Its optional cloud-assessment case uses a simulated provider and the real local queue. Speech tests use a synthetic microphone recording. The live language-model test needs the model server running. The default unit tests need neither an API key nor a model.

| Command                                 | Purpose                                                      |
| --------------------------------------- | ------------------------------------------------------------ |
| `pnpm db:up` / `pnpm db:migrate`        | Start local PostgreSQL and apply reviewed migrations         |
| `pnpm build`                            | Build packages, API and web app                              |
| `pnpm api:generate` / `pnpm api:check`  | Generate and verify OpenAPI and its typed client             |
| `sh scripts/local-ai.sh`                | Prepare or start local Ollama independently                  |
| `node scripts/prepare-speech-model.mjs` | Prepare the pinned English speech archive before a web build |

See [local inference](docs/architecture/local-inference.md), [web behavior and reference art](apps/web/README.md), [server and budget configuration](apps/api/README.md), and [architecture](docs/architecture/README.md). The separate `pnpm test:e2e:clerk` check requires a running account installation at port 4173 and a Clerk development instance with test addresses enabled. Supply a short-lived `CLERK_TESTING_TOKEN` in the test process environment. Keep this testing token out of web configuration, version control and build artifacts. It creates two development accounts and exercises sign-up, email verification, sign-in, sign-out, account isolation and persistence. Public hosting and capacity verification are separate deployment work.
