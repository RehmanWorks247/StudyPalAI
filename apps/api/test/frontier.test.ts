import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  frontierModel,
  reserveCost,
  runProvider,
  tokenCost,
  verifyResult,
  type FrontierInput,
} from '../src/modules/frontier/frontier-provider';

const source = {
  name: 'Revision notes',
  text: 'Acceleration is the change in velocity per unit time.',
};
const grade: FrontierInput = {
  kind: 'grade',
  prompt: 'Velocity changes per unit time.',
  count: 1,
  passages: [source],
};
const result = {
  grade: {
    score: 3,
    strength: 'Identifies the change.',
    improvement: 'Name acceleration explicitly.',
    quote: source.text,
  },
};
function answer(value: unknown, status = 'completed') {
  return Response.json({
    status,
    usage: { input_tokens: 200, output_tokens: 100 },
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
  });
}
test('Responses adapter pins standard tier, disables storage and tools, validates quotes and records usage', async () => {
  const response = await runProvider(
    grade,
    'synthetic',
    new AbortController().signal,
    async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal(options?.redirect, 'error');
      const data = JSON.parse(String(options?.body)) as {
        model: string;
        store: boolean;
        tools?: unknown;
        service_tier: string;
        text: { format: { strict: boolean; schema: { additionalProperties: boolean } } };
      };
      assert.equal(data.model, frontierModel);
      assert.equal(data.store, false);
      assert.equal(data.service_tier, 'default');
      assert.equal(data.tools, undefined);
      assert.equal(data.text.format.strict, true);
      assert.equal(data.text.format.schema.additionalProperties, false);
      assert.doesNotMatch(JSON.stringify(data.text.format.schema), /"minLength"|"maxLength"/u);
      return answer(result);
    },
  );
  assert.deepEqual(response, { result, inputTokens: 200, outputTokens: 100 });
  assert.equal(tokenCost(200, 100), 600);
  assert.ok(reserveCost(grade) > 600);
});
test('provider failure, invalid quote, invalid choice, unsupported grades and incomplete responses are rejected', async () => {
  for (const response of [
    new Response(null, { status: 429 }),
    answer(result, 'incomplete'),
    answer({ grade: { ...result.grade, quote: 'Fabricated evidence.' } }),
    answer({ grade: { ...result.grade, score: 9 } }),
    answer({ grade: { ...result.grade, strength: 'x'.repeat(801) } }),
    new Response('x'.repeat(130000)),
  ]) {
    await assert.rejects(
      runProvider(grade, 'synthetic', new AbortController().signal, async () => response),
    );
  }
  const quiz: FrontierInput = { ...grade, kind: 'quiz', prompt: '' };
  const question = {
    question: 'What changes per unit time?',
    correct: 'velocity',
    distractors: ['mass', 'force', 'volume'],
    quote: source.text,
    explanation: 'The passage names velocity.',
  };
  assert.deepEqual(verifyResult(quiz, { questions: [question] }), { questions: [question] });
  for (const patch of [
    { correct: 'frequency' },
    { distractors: ['mass', 'MASS', 'force'] },
    { quote: 'An invented source.' },
  ])
    assert.throws(() => verifyResult(quiz, { questions: [{ ...question, ...patch }] }));
  assert.throws(() => verifyResult({ ...quiz, count: 2 }, { questions: [question, question] }));
});
