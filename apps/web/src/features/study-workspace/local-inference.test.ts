import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  answerQuestion,
  generateQuestions,
  parseQuestions,
  selectPassages,
} from './local-inference';

const source = { name: 'Botany.md', text: 'Xylem transports water from roots to leaves.' };
const question = {
  question: 'Which tissue carries water?',
  distractors: ['Phloem', 'Epidermis', 'Cortex'],
  correct: 'Xylem',
  quote: source.text,
  explanation: 'Water moves through xylem.',
};
function mockResponse(value: unknown, reason = 'stop') {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        done: true,
        done_reason: reason,
        message: { content: JSON.stringify(value) },
      }),
    ),
  );
}
afterEach(() => vi.restoreAllMocks());
describe('local inference', () => {
  it('selects matching passages from beyond the beginning of a document', () => {
    const material = { ...source, text: 'Introduction. '.repeat(600) + source.text };
    expect(selectPassages([material], 'xylem')[0]?.text).toContain(source.text);
  });
  it('only sends selected evidence to loopback and reports the verified source', async () => {
    const fetch = mockResponse({
      supported: true,
      answer: 'Water travels through xylem.',
      quote: source.text,
    });
    const result = await answerQuestion(
      [source],
      'What does xylem do?',
      [],
      false,
      new AbortController().signal,
    );
    expect(result).toContain(source.name);
    expect(result).toContain(source.text);
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/api/chat',
      expect.objectContaining({ credentials: 'omit', redirect: 'error' }),
    );
  });
  it('preserves the answer key when inserting the quoted correct option among distractors', () => {
    const [item] = parseQuestions({ questions: [question] }, [source], 1);
    expect(item?.choices[item.answer]).toBe('Xylem');
  });
  it('rejects an invented source quote and structurally invalid questions', () => {
    for (const invalid of [
      { ...question, quote: 'Invented sentence.' },
      { ...question, distractors: ['a', 'B', 'b'] },
      { ...question, correct: 'invented term' },
      { ...question, distractors: ['Xylem', 'Phloem', 'Cortex'] },
    ]) {
      expect(() => parseQuestions({ questions: [invalid] }, [source], 1)).toThrow(
        /source and answer checks/,
      );
    }
    expect(() => parseQuestions({ questions: [question, question] }, [source], 2)).toThrow();
  });
  it('rejects incomplete generation before trying to grade quiz answers', async () => {
    mockResponse({ questions: [question] }, 'length');
    await expect(
      generateQuestions([source], 1, 'water', new AbortController().signal),
    ).rejects.toThrow('incomplete');
  });
  it('makes one local correction when the generated choices fail validation', async () => {
    const fetch = mockResponse({ questions: [question] }).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          done: true,
          message: { content: JSON.stringify({ questions: [{ ...question, correct: 'Wrong' }] }) },
        }),
      ),
    );
    const result = await generateQuestions([source], 1, 'water', new AbortController().signal);
    expect(result[0]?.evidence.quote).toBe(source.text);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('never contacts the model without source text', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    await expect(
      answerQuestion([], 'Help', [], true, new AbortController().signal),
    ).rejects.toThrow('Add a document');
    expect(fetch).not.toHaveBeenCalled();
  });
});
