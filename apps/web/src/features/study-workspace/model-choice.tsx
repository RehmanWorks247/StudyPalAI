export function ModelChoice({
  cloud,
  onChange,
  busy,
  grading = false,
}: {
  cloud: boolean;
  onChange: (value: boolean) => void;
  busy: boolean;
  grading?: boolean;
}) {
  return (
    <>
      <label>
        AI model
        <select
          disabled={busy}
          value={cloud ? 'cloud' : 'local'}
          onChange={(e) => onChange(e.target.value === 'cloud')}
        >
          <option value="local">On this device · Ollama</option>
          <option value="cloud">Cloud · GPT-5.4 mini</option>
        </select>
      </label>
      {cloud && (
        <p>
          Submitting sends up to four short material excerpts, their filenames and your{' '}
          {grading ? 'written answer' : 'topic'} to OpenAI through your paired server. Your server’s
          usage budget applies.
        </p>
      )}
    </>
  );
}
