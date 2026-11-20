# Local tutoring and practice

On Apple Silicon, start the text model in a terminal from the repository root:

```sh
sh scripts/local-ai.sh
```

The first run needs internet access to retrieve the macOS Ollama 0.40.16 archive
and the 2.5 GB Qwen3 4B Instruct 2507 quantized model. The launcher checks the
archive SHA-256 and model manifest digest. It keeps its own installation in
`~/Library/Caches/StudyPal`. If Ollama is already running on the default loopback
port, it reuses that process and its model directory. An existing Ollama process
must allow the StudyPal origin. Launch the web app locally to use Ollama's default
localhost origin policy. Keep the model process running while studying.

On later starts the launcher checks the local model first. Once prepared, chat,
Tutor Me, and local practice use the loopback server even without an internet
connection. Browser microphone dictation uses the English speech model prepared
under Record Lecture. Read aloud uses an installed English system voice.

Chat sends the latest question, up to four recent turns, and a maximum of four
1,100-character passages from the current set. Answers must include a quotation
found in those passages. Quiz generation uses the selected source, optional
topic, and requested count of one to five questions. Each answer key points to
an extract from a checked quotation. Quiz results show both the answer and
the original passage so students can verify reasoning. These checks validate
citations and structure; they cannot establish that every explanation or
distractor is correct.

Local generation has a two-minute deadline and supports cancellation. A quiz
that fails validation gets one correction attempt within that same deadline.
Questions, answers and test progress are saved within the study set on this
device. While performing a test, answer feedback stays hidden until submission.
When local inference is unavailable, the app gives a recovery message.

To run the live Chrome test with a separate local-mode build, prepare the
model and run the following commands from the project root:

```sh
study_test_build=$(mktemp -d)
VITE_WORKSPACE_AUTH_MODE=local pnpm --filter @studypal/web exec vite build --outDir "$study_test_build"
STUDYPAL_WEB_DIST="$study_test_build" RUN_LOCAL_AI_E2E=1 pnpm --filter @studypal/web exec playwright test local-model.spec.ts
```

The live test uploads a small synthetic source, asks a question in chat and
another in Tutor Me, then generates, grades and reloads a quiz and a test. It
also reviews a deliberately incorrect written answer and explains a topic. It
allows the browser to reach loopback only. The unit suite runs without a model.

New chat saves the current transcript, unsent draft and guided setting. The
Chat history menu reopens the last eight saved conversations in each set. Each
conversation keeps its latest 60 messages. Question Banks lists the active quiz
and test in each set, plus up to 12 older attempts. Replacing or clearing an
active attempt archives its questions, answers and score. Continue practice and
View results restore that attempt. Practice again starts an empty answer sheet
using the same questions and preserves the original score. These operations
work offline without a model request. The histories are included in workspace
snapshots and available after reload.
