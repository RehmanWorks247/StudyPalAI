import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StudyWorkspace } from '@/features/study-workspace/workspace';
import { initialWorkspace } from '@/features/study-workspace/workspace-storage';
import { WorkspaceAccessContext, localAccess } from '@/lib/workspace-access';
import { ErrorBoundary } from './error-boundary';

function renderCourse() {
  const name = 'Lab fundamentals.txt';
  const text =
    'Error is the difference between a measured value and a reference value. Repeat measurements and calculate their mean to reduce their effect. Calibrate the instrument before taking another measurement.';
  return render(
    <WorkspaceAccessContext.Provider value={localAccess}>
      <StudyWorkspace
        initial={{
          ...initialWorkspace,
          profileName: 'Pat',
          sets: [{ id: 4, name: 'Physics lab', materials: [name], sources: [{ name, text }] }],
          setId: 4,
        }}
      />
    </WorkspaceAccessContext.Provider>,
  );
}
function pasteNotes(dialog: HTMLElement) {
  const form = within(dialog);
  fireEvent.click(form.getByRole('button', { name: 'Paste Text' }));
  fireEvent.change(form.getByRole('textbox', { name: /Material title/ }), {
    target: { value: 'Lab observations' },
  });
  fireEvent.change(form.getByRole('textbox', { name: 'Your text' }), {
    target: { value: 'Percentage uncertainty measures relative measurement uncertainty.' },
  });
  fireEvent.click(form.getByRole('button', { name: 'Add to selection' }));
}
describe('study workspace', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('welcomes the signed-in learner and saves only a set the learner creates', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(
      <WorkspaceAccessContext.Provider value={localAccess}>
        <StudyWorkspace accountName="River Park" save={save} />
      </WorkspaceAccessContext.Provider>,
    );
    expect(screen.getByText('Welcome, River Park.')).toBeVisible();
    await vi.waitFor(() =>
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ sets: [], setId: 0 })),
    );
    expect(screen.queryByRole('button', { name: 'Upload' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Study set name' }), {
      target: { value: 'My ocean notes' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create study set' }));
    expect(screen.getByRole('heading', { level: 1, name: 'My ocean notes' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeVisible();
    await vi.waitFor(() =>
      expect(save.mock.lastCall?.[0].sets).toEqual([
        { id: expect.any(Number), name: 'My ocean notes', description: '', materials: [] },
      ]),
    );
    expect(save.mock.lastCall?.[0].setId).toBeGreaterThan(0);
  });
  it('renders the study dashboard and tools without fetching from the backend', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');

    renderCourse();

    expect(screen.getByRole('heading', { level: 1, name: 'Physics lab' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(screen.getByRole('button', { name: 'Record Lecture' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tutor Me' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'View Full Study Plan' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create a Flashcard Set' })).toBeVisible();
    expect(screen.getByRole('complementary', { name: 'AI tutor chat' })).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('adds pasted notes and opens the document from the library', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    renderCourse();

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    const upload = screen.getByRole('dialog', { name: 'Add materials' });
    pasteNotes(upload);
    expect(within(upload).getByText('Lab observations.txt')).toBeVisible();
    fireEvent.click(within(upload).getByRole('button', { name: 'Add materials' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Materials' }));
    expect(screen.getByRole('heading', { name: 'Materials', level: 1 })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Open Lab observations.txt' }));

    const reader = within(screen.getByRole('main'));
    expect(reader.getByRole('heading', { name: 'Lab observations.txt' })).toBeVisible();
    expect(reader.getByLabelText('Document text')).toHaveTextContent('Percentage uncertainty');
    expect(reader.getByRole('button', { name: 'Download document text' })).toBeEnabled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('opens the practice menu, creates flashcards, and reveals an answer', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    renderCourse();

    fireEvent.click(screen.getByRole('button', { name: 'Practice & Activities' }));
    fireEvent.click(screen.getByRole('button', { name: 'Flashcards' }));
    expect(await screen.findByRole('heading', { name: 'Flashcards', level: 1 })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Create flashcards' }));
    const first = within(screen.getByRole('main')).getByRole('heading', { level: 2 }).textContent;
    expect(first).toContain('_____');
    fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }));
    expect(screen.getByRole('main').querySelector('blockquote')?.textContent).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(
      within(screen.getByRole('main')).getByRole('heading', { level: 2 }).textContent,
    ).not.toBe(first);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('renames the study set through its settings dialog', () => {
    renderCourse();

    fireEvent.click(screen.getByRole('button', { name: 'Study set settings' }));
    const settings = screen.getByRole('dialog', { name: 'Study set settings' });
    fireEvent.change(within(settings).getByRole('textbox', { name: 'Study set name' }), {
      target: { value: 'Physics Final' },
    });
    fireEvent.click(within(settings).getByRole('button', { name: 'Save changes' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Physics Final' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Study set settings' }));
    expect(screen.getByRole('textbox', { name: 'Study set name' })).toHaveValue('Physics Final');
  });

  it('keeps a saved highlight when leaving the reader and returning through the dashboard', () => {
    renderCourse();

    fireEvent.click(screen.getByRole('button', { name: /Catch up quickly/ }));
    const paragraph = screen.getByLabelText('Document text');
    const text = paragraph.textContent ?? '';
    const quote = 'Error is the difference between a measured value and a reference value.';
    const start = text.indexOf(quote);
    expect(start).toBeGreaterThan(-1);
    const range = document.createRange();
    const node = paragraph.firstChild;
    if (!node) throw new Error('Document has no text node');
    range.setStart(node, start);
    range.setEnd(node, start + quote.length);
    window.getSelection()?.addRange(range);
    fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'View all highlights' }));

    expect(screen.getByRole('heading', { name: 'Highlights', level: 1 })).toBeVisible();
    expect(screen.getByText(quote)).toBeVisible();
  });

  it('uses the selected calendar date when creating a study session', () => {
    renderCourse();

    vi.spyOn(Date, 'now').mockReturnValue(new Date(2026, 10, 20).getTime());
    vi.setSystemTime(new Date(2026, 10, 20));
    fireEvent.click(screen.getByRole('button', { name: 'Calendar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Monday, November 23, 2026' }));
    const agenda = within(screen.getByRole('main')).getByRole('complementary');
    fireEvent.click(within(agenda).getByRole('button', { name: 'Add study session' }));
    const session = screen.getByRole('dialog', { name: 'Add study session' });
    expect(within(session).getByLabelText('Date')).toHaveValue('2026-11-23');
    fireEvent.change(within(session).getByRole('textbox', { name: 'Session name' }), {
      target: { value: 'Physics review' },
    });
    fireEvent.click(within(session).getByRole('button', { name: 'Add to calendar' }));

    expect(screen.getByRole('heading', { name: 'Physics review' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Monday, November 23, 2026, 1 events' }),
    ).toHaveTextContent('Physics review');
    vi.useRealTimers();
  });

  it('opens the lecture recorder and reports unavailable browser storage honestly', async () => {
    renderCourse();
    fireEvent.click(screen.getByRole('button', { name: 'Record Lecture' }));
    expect(await screen.findByRole('heading', { name: 'Saved recordings' })).toBeVisible();
    expect(await screen.findByRole('alert')).toHaveTextContent('local recording storage');
    expect(screen.getByRole('button', { name: 'Create Live Lecture' })).toBeDisabled();
  });

  it('keeps the same conversation across full chat, the dashboard, and collapse', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            done: true,
            done_reason: 'stop',
            message: {
              content: JSON.stringify({
                supported: true,
                answer: 'Repeated measurements reduce random errors.',
                quote: 'Repeat measurements and calculate their mean to reduce their effect.',
              }),
            },
          }),
        ),
    );
    renderCourse();

    fireEvent.change(screen.getByRole('textbox', { name: 'Ask your AI tutor anything' }), {
      target: { value: 'Help me understand uncertainty' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await screen.findByText(/Repeated measurements reduce random errors/);
    const navigation = within(screen.getByRole('navigation', { name: 'Study set navigation' }));
    fireEvent.click(navigation.getByRole('button', { name: 'Chat' }));
    expect(screen.getByRole('log', { name: 'Chat transcript' })).toHaveTextContent(
      'Help me understand uncertainty',
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Ask your AI tutor anything' }), {
      target: { value: 'Give me another example' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await screen.findByRole('button', { name: 'Send message' });
    await vi.waitFor(() =>
      expect(
        within(screen.getByRole('log')).getAllByText(/Repeated measurements reduce random errors/),
      ).toHaveLength(2),
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Ask your AI tutor anything' }), {
      target: { value: 'A question for later' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guided' }));
    fireEvent.click(navigation.getByRole('button', { name: 'Dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse chat' }));
    expect(screen.queryByRole('log', { name: 'Chat transcript' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));

    const transcript = screen.getByRole('log', { name: 'Chat transcript' });
    expect(transcript).toHaveTextContent('Help me understand uncertainty');
    expect(transcript).toHaveTextContent('Give me another example');
    expect(screen.getByRole('textbox', { name: 'Ask your AI tutor anything' })).toHaveValue(
      'A question for later',
    );
    expect(screen.getByRole('button', { name: 'Guided' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    fireEvent.click(navigation.getByRole('button', { name: 'Chat' }));
    expect(screen.getByRole('log', { name: 'Chat transcript' })).not.toHaveTextContent(
      'Help me understand uncertainty',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Chat history' }));
    fireEvent.click(screen.getByRole('button', { name: /Help me understand uncertainty/ }));
    expect(screen.getByRole('log', { name: 'Chat transcript' })).toHaveTextContent(
      'Give me another example',
    );
    expect(screen.getByRole('textbox', { name: 'Ask your AI tutor anything' })).toHaveValue(
      'A question for later',
    );
    expect(screen.getByRole('button', { name: 'Guided' })).toHaveAttribute('aria-pressed', 'true');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.every(([url]) => url === 'http://127.0.0.1:11434/api/chat')).toBe(true);
  });

  it('adds pasted notes to a folder and retains the membership after navigation', () => {
    renderCourse();

    fireEvent.click(screen.getByRole('button', { name: 'Materials' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Folder' }));
    const folder = screen.getByRole('dialog', { name: 'Create folder' });
    fireEvent.change(within(folder).getByRole('textbox', { name: 'Folder name' }), {
      target: { value: 'Lecture notes' },
    });
    fireEvent.click(within(folder).getByRole('button', { name: 'Create' }));
    fireEvent.click(screen.getByRole('button', { name: /^Lecture notes/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Material' }));
    const upload = screen.getByRole('dialog', { name: 'Add materials' });
    pasteNotes(upload);
    fireEvent.click(within(upload).getByRole('button', { name: 'Add materials' }));

    expect(screen.getByRole('button', { name: 'Open Lab observations.txt' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Open Lab fundamentals.txt' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All materials' }));
    expect(screen.getByRole('button', { name: /^Lecture notes/ })).toHaveTextContent('1 material');
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Materials' }));
    fireEvent.click(screen.getByRole('button', { name: /^Lecture notes/ }));
    expect(screen.getByRole('button', { name: 'Open Lab observations.txt' })).toBeVisible();
  });

  it('applies the selected companion and reopens the updated profile name', () => {
    renderCourse();

    fireEvent.click(screen.getByRole('button', { name: 'Change Character' }));
    const character = screen.getByRole('dialog', { name: 'Choose your study companion' });
    fireEvent.click(within(character).getByRole('button', { name: /^Luna/ }));
    fireEvent.click(within(character).getByRole('button', { name: 'Choose Luna' }));
    expect(screen.getByRole('heading', { name: 'Hello, I’m Luna' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Pat — account menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Your Profile' }));
    const profile = screen.getByRole('dialog', { name: 'Your Profile' });
    fireEvent.change(within(profile).getByRole('textbox', { name: 'Display name' }), {
      target: { value: 'Alex Rivera' },
    });
    fireEvent.click(within(profile).getByRole('button', { name: 'Save changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Alex Rivera — account menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Your Profile' }));
    expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveValue('Alex Rivera');
  });

  it('dismisses upload with Escape and settings with native dialog cancellation', () => {
    renderCourse();

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Add materials' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Study set settings' }));
    fireEvent(
      screen.getByRole('dialog', { name: 'Study set settings' }),
      new Event('cancel', { bubbles: true, cancelable: true }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a recovery action without exposing internal errors', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    function BrokenView(): never {
      throw new Error('private implementation details');
    }

    render(
      <ErrorBoundary>
        <BrokenView />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeEnabled();
    expect(screen.queryByText('private implementation details')).not.toBeInTheDocument();
  });
});
