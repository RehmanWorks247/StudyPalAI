#!/bin/sh
# Start the offline language model on loopback. The first installation needs internet access.
set -eu
host=127.0.0.1:11434
model='qwen3:4b-instruct-2507-q4_K_M'
manifest=0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0
export OLLAMA_HOST="$host" OLLAMA_NO_CLOUD=1 OLLAMA_NUM_PARALLEL=1 OLLAMA_MAX_QUEUE=4

ready() { curl -fsS --max-time 2 "http://$host/api/version" >/dev/null 2>&1; }
installed() {
  curl -fsS --max-time 3 "http://$host/api/tags" |
    node -e 'let data="";process.stdin.on("data",s=>data+=s);process.stdin.on("end",()=>{const m=JSON.parse(data).models.find(m=>m.name.toLowerCase()===process.argv[1].toLowerCase());process.exit(m?.digest===process.argv[2]?0:1)})' "$model" "$manifest"
}
ensure_model() {
  if installed; then return; fi
  echo 'Preparing the 2.5 GB local study model…'
  curl -fsS --max-time 3600 "http://$host/api/pull" -H 'Content-Type: application/json' \
    -d "{\"model\":\"$model\",\"stream\":false}" >/dev/null
  installed || { echo "The installed model does not match the tested manifest." >&2; exit 1; }
}

if [ "${1:-}" = "--check" ]; then
  ready && installed
  exit $?
fi

if ready; then
  ensure_model
  echo 'StudyPal can use the running local model.'
  exit 0
fi

if [ "$(uname -s)-$(uname -m)" = Darwin-arm64 ]; then
  base="$HOME/Library/Caches/StudyPal"
  runtime="$base/ollama-v0.40.16"
  binary="$runtime/ollama"
  if [ ! -x "$binary" ]; then
    mkdir -p "$base"
    stage=$(mktemp -d "$base/ollama-install.XXXXXX")
    trap 'rm -rf "$stage"' EXIT
    curl -fLsS --retry 2 -o "$stage/ollama.tgz" https://github.com/ollama/ollama/releases/download/v0.40.16/ollama-darwin.tgz
    (cd "$stage" && echo 'a743717494315da7cd352982b805f6b992d4b4452ca117fd5fbf86c4ee46fca0  ollama.tgz' | shasum -a 256 -c - && tar -xzf ollama.tgz && rm ollama.tgz)
    mv "$stage" "$runtime"
    trap - EXIT
  fi
  export OLLAMA_MODELS="$base/models"
else
  binary=$(command -v ollama) || { echo 'Install Ollama from ollama.com/download, then rerun this command.' >&2; exit 1; }
fi

"$binary" serve >/dev/null 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true' EXIT
trap 'exit 130' INT TERM
tries=0
until ready; do
  kill -0 "$pid" 2>/dev/null || { echo 'Ollama could not start on loopback.' >&2; exit 1; }
  tries=$((tries + 1))
  [ "$tries" -lt 90 ] || { echo 'Ollama did not become ready.' >&2; exit 1; }
  sleep 1
done
ensure_model
echo 'Local AI is ready. Keep this process running when using offline tutoring and quizzes.'
wait "$pid"
