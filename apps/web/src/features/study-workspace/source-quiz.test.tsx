import { localAccess, WorkspaceAccessContext } from '@/lib/workspace-access';
import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SourceQuiz } from './source-quiz';
import type { QuizAttempt } from './local-inference';

const water = { name: 'Botany', text: 'Xylem carries water from roots to leaves.' };
const optics = { name: 'Optics', text: 'Refraction is the bending of light at an interface.' };
const saved: QuizAttempt = {
  questions: [
    {
      question: 'Which tissue carries water?',
      choices: ['Xylem', 'Phloem', 'Cortex', 'Epidermis'],
      answer: 0,
      explanation: 'Xylem transports water.',
      evidence: { name: water.name, quote: water.text },
    },
  ],
  answers: {},
  step: 0,
  checked: false,
};
function View({ mode = 'quiz', initial }: { mode?: 'quiz' | 'test'; initial?: QuizAttempt }) {
  const [attempt, setAttempt] = useState(initial);
  return (
    <WorkspaceAccessContext.Provider value={localAccess}>
      <SourceQuiz mode={mode} sources={[water, optics]} attempt={attempt} onSave={setAttempt} />
    </WorkspaceAccessContext.Provider>
  );
}
afterEach(() => vi.restoreAllMocks());

it('shows source evidence only after submitting a saved test, without model access', () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  render(<View mode="test" initial={saved} />);
  const session = screen.getByRole('region', { name: 'Practice test' });
  fireEvent.click(within(session).getByRole('radio', { name: 'Phloem' }));
  expect(session).not.toHaveTextContent(water.text);
  fireEvent.click(within(session).getByRole('button', { name: 'See results' }));
  const results = screen.getByRole('region', { name: 'Practice results' });
  expect(results).toHaveTextContent('0 of 1 correct');
  expect(results).toHaveTextContent(water.text);
  expect(fetch).not.toHaveBeenCalled();
});
it('restricts the model request to the selected document, and recovers from service failure', async () => {
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(null, { status: 503 }));
  render(<View />);
  fireEvent.change(screen.getByLabelText('Source material'), { target: { value: optics.name } });
  fireEvent.click(screen.getByRole('button', { name: 'Generate quiz' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('local model is unavailable');
  const body = fetch.mock.calls[0]?.[1]?.body;
  expect(body).toEqual(expect.stringContaining(optics.text));
  expect(body).not.toEqual(expect.stringContaining(water.text));
  expect(screen.getByRole('button', { name: 'Generate quiz' })).toBeEnabled();
});
