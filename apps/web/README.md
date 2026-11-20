# StudyPal web

The default route opens Clerk sign-in or the verified account’s illustrated study dashboard. Each account has its own IndexedDB stores for the workspace and recordings. Changes sync to the owner’s PostgreSQL workspace when connected. The local model and document parsers operate on the selected materials. The `/local` alias opens the same account workspace. New accounts start with no study sets or materials. Create a named set, then upload notes or record a lecture. Existing workspace backups can be imported through workspace settings.

Use the [root quick start](../../README.md) for the production build on port 4173, model setup, and Clerk setup. In development, Vite uses `127.0.0.1:5173` and proxies `/api` to the configured API port. Service worker caching is enabled only in the production build. Keep the same browser origin to retain local recordings and offline edits. An active verified tab can work offline until the earlier of its provider-session expiry or its server binding expiry. The binding lasts up to 30 minutes and renews while connected. A fresh account tab or reload needs online verification. The explicit single-Mac pairing mode can reopen offline after preparation.

## Account screens

StudyPal renders its own compact sign-in, sign-up and verification forms. Clerk's SDK performs authentication. The development instance supports email/password, email codes, Google and password recovery by email. Google opens its own consent screen and returns through StudyPal's same-origin callback. Opening an account workspace still requires verification by the API. [Clerk's custom OAuth flow](https://clerk.com/docs/guides/development/custom-flows/authentication/oauth-connections)

Password recovery sends a code, verifies it and lets the learner choose a new password. A password sign-in from a new device can also require an emailed code. Verification methods are determined by the Clerk instance and the account. [Password recovery](https://clerk.com/docs/guides/development/custom-flows/authentication/forgot-password) · [Device Trust](https://clerk.com/docs/guides/development/custom-flows/authentication/device-trust)

## Import and storage limits

A batch supports up to 20 files. PDFs, DOCX and PPTX can be up to 12 MiB each. Plain-text files can be up to 512 KiB. Extracted text is limited to 200,000 characters per material. Scanned PDF pages and images use offline English OCR. Uploads with duplicate names and unreadable content show an error. Source text, annotations, selected quiz answers, chat history and study plans survive browser reloads. Export a study set as Markdown from Share. The recorder supports download and optional backup to the authenticated owner’s local database.

## Reference assets

The Google sign-in control uses the Google G from the approved light-theme web button artwork, served from StudyPal’s own bundle. [Google Identity branding guidelines](https://developers.google.com/identity/branding-guidelines)

The dashboard includes StudyFetch’s publicly served [Sparky avatar](https://www.studyfetch.com/brand/mascot/sparke-avatar.svg), [upload illustration](https://www.studyfetch.com/brand/illustrations/upload-materials.svg), [chat illustration](https://www.studyfetch.com/brand/modality-icons/chat.svg), and [quiz illustration](https://www.studyfetch.com/brand/modality-icons/quizfetch.svg) in `public/reference-art`. Chat and quiz retain their original artwork with the background rectangle removed so the surrounding cards provide the background. These are StudyFetch reference assets, not original StudyPal branding. Inter and Bitter are served locally from `public/fonts` with their accompanying SIL Open Font License texts.

## Tests

`pnpm --filter @studypal/web test` runs DOM and unit tests. From the repository root, `pnpm test:e2e:postgres` runs the built web workspace in Chrome against an isolated owner in a local PostgreSQL database. Prepare the offline speech archive before building. See [local inference](../../docs/architecture/local-inference.md) for the optional live model tests.

### Offline document recognition

Import PDF, Word, PowerPoint, UTF-8 text, Markdown, CSV, PNG and JPEG using **Upload**. PDF pages with selectable text use their existing text layer. Image-only pages and photos use Tesseract.js 7.0.0, the non-SIMD LSTM WebAssembly core, and the English best-integer model. The build bundles all three from pinned packages, and the production service worker caches them during initial setup. A SHA-256 check verifies the English model before recognition. No OCR provider or model download is needed at runtime. Clear, upright printed English works best. Users can close the upload dialog to cancel processing.

Structured documents and photos are limited to 12 MB per file. Photos can have up to 16 megapixels. Rendering or resizing for recognition uses up to four megapixels per page. PDFs can have up to 200 pages and 12 pages requiring OCR. Text imports support up to 200,000 characters per material. The reader saves the extracted text, annotations and notes.

[Tesseract.js](https://github.com/naptha/tesseract.js) · [English training data](https://github.com/naptha/tessdata)
