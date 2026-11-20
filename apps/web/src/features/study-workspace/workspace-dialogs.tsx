import { downloadText } from './workspace-format';
import type { WorkspaceReplica } from './workspace-replica';
import { ReplicaSettings } from './replica-settings';
import { localDate } from './plan-topics';
import { useState } from 'react';
import { Modal, SearchInput } from './primitives';
import { Icon } from './icons';
import { Mascot, ToolIllustration } from './illustrations';
import { viewNames, type DialogName, type StudySet, type View } from './demo-data';

interface DialogProps {
  onOpenMaterial: (name: string) => void;
  replica?: WorkspaceReplica | undefined;
  name: Exclude<DialogName, 'upload' | null>;
  studySet: StudySet;
  profileName?: string;
  companionName?: string;
  defaultDate?: string;
  nextExam?: string | undefined;
  onClose: () => void;
  onSave: (values: Record<string, string>) => void;
  onNavigate: (view: View) => void;
  onNotify: (text: string) => void;
}
export function WorkspaceDialog({
  name,
  replica,
  onOpenMaterial,
  studySet,
  profileName = '',
  companionName = 'Sparky',
  defaultDate = localDate(),
  nextExam,
  onClose,
  onSave,
  onNavigate,
  onNotify,
}: DialogProps) {
  const [query, setQuery] = useState('');
  const [targetDate] = useState(() => nextExam ?? localDate(new Date(Date.now() + 7 * 86400000)));
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState(companionName);

  const titles: Record<DialogProps['name'], string> = {
    settings: 'Study set settings',
    'new-set': 'Create a study set',
    share: 'Share Study Set',
    upgrade: 'Local workspace',
    exam: 'Add exam',
    session: 'Add study session',
    'new-plan': 'Create a study plan',
    folder: 'Create folder',
    help: 'How can we help?',
    tutorials: 'Welcome to your study space',
    feedback: 'Give us feedback',
    profile: 'Your Profile',
    plugins: 'Plugins',
    character: 'Choose your study companion',
    search: 'Search your study space',
  };
  function submit(form: HTMLFormElement) {
    const values: Record<string, string> = {};
    new FormData(form).forEach((value, key) => {
      if (typeof value === 'string') values[key] = value;
    });
    onSave(values);
  }
  return (
    <Modal title={titles[name]} onClose={onClose} wide={name === 'upgrade'}>
      {['settings', 'new-set', 'exam', 'session', 'new-plan', 'folder', 'profile'].includes(
        name,
      ) && (
        <form
          className="dialog-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit(e.currentTarget);
          }}
        >
          {(name === 'settings' || name === 'new-set') && (
            <div className="dialog-set-art">
              <ToolIllustration kind="set" />
            </div>
          )}
          <label>
            {name === 'profile'
              ? 'Display name'
              : name === 'settings' || name === 'new-set'
                ? 'Study set name'
                : name === 'folder'
                  ? 'Folder name'
                  : name === 'new-plan'
                    ? 'Plan name'
                    : name === 'exam'
                      ? 'Exam name'
                      : 'Session name'}
            <input
              autoFocus
              required
              maxLength={100}
              name="name"
              defaultValue={
                name === 'settings' ? studySet.name : name === 'profile' ? profileName : ''
              }
              placeholder={
                name === 'new-set'
                  ? 'e.g. Biology 101'
                  : name === 'folder'
                    ? 'e.g. Lecture notes'
                    : name === 'new-plan'
                      ? 'e.g. Final exam revision'
                      : 'Give it a name'
              }
            />
          </label>
          {(name === 'exam' || name === 'session') && (
            <div className="form-row">
              <label>
                Date
                <input type="date" name="date" defaultValue={defaultDate} required />
              </label>
              <label>
                Time
                <input type="time" name="time" defaultValue="16:00" required />
              </label>
            </div>
          )}
          {name === 'new-plan' && (
            <>
              <label>
                Study mode
                <select name="mode" defaultValue={studySet.mode ?? 'Standard'}>
                  <option>Comprehensive</option>
                  <option>Standard</option>
                  <option>Cram</option>
                </select>
              </label>
              <label>
                Target date
                <input
                  type="date"
                  name="date"
                  min={localDate()}
                  defaultValue={targetDate}
                  required
                />
              </label>
            </>
          )}
          {(name === 'settings' || name === 'new-set') && (
            <label>
              Description
              <textarea
                name="description"
                defaultValue={name === 'settings' ? studySet.description : ''}
                placeholder="What are you learning?"
                rows={3}
              />
            </label>
          )}
          {name === 'settings' && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="recommendations"
                defaultChecked={studySet.recommendations !== false}
              />
              Show personalized study recommendations
            </label>
          )}
          {name === 'profile' && (
            <p className="dialog-note">Your profile is saved in this browser.</p>
          )}
          <div className="dialog-footer">
            <button type="button" className="sp-button white" onClick={onClose}>
              Cancel
            </button>
            <button className="sp-button dark" type="submit">
              {name === 'settings' || name === 'profile'
                ? 'Save changes'
                : name === 'exam' || name === 'session'
                  ? 'Add to calendar'
                  : 'Create'}
            </button>
          </div>
        </form>
      )}
      {name === 'search' && (
        <div className="dialog-search">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search materials and tools…"
          />
          <div>
            {studySet.materials
              .filter((file) => file.toLowerCase().includes(query.toLowerCase()))
              .map((file) => (
                <button
                  key={file}
                  onClick={() => {
                    onOpenMaterial(file);
                    onClose();
                  }}
                >
                  <Icon name="file" />
                  {file}
                </button>
              ))}
            {(Object.entries(viewNames) as [View, string][])
              .filter(([, label]) => label.toLowerCase().includes(query.toLowerCase()))
              .map(([view, label]) => (
                <button
                  key={view}
                  onClick={() => {
                    onNavigate(view);
                    onClose();
                  }}
                >
                  <Icon name={view === 'materials' ? 'file' : 'search'} />
                  {label}
                  <Icon name="chevron-right" />
                </button>
              ))}
          </div>
        </div>
      )}
      {name === 'share' && (
        <div className="share-dialog">
          <p>Download a readable copy of the materials in {studySet.name} to share.</p>
          <button
            className="sp-button dark"
            disabled={!studySet.sources?.length}
            onClick={() => {
              const content = (studySet.sources ?? [])
                .map(
                  (source) =>
                    '## ' +
                    source.name +
                    '\n\n' +
                    source.text +
                    (source.notes ? '\n\nNotes\n' + source.notes : ''),
                )
                .join('\n\n');
              downloadText(
                studySet.name + '.md',
                '# ' + studySet.name + '\n\n' + content,
                'text/markdown',
              );
            }}
          >
            Download study set
          </button>
        </div>
      )}
      {name === 'upgrade' && replica && <ReplicaSettings replica={replica} />}
      {name === 'upgrade' && !replica && (
        <div className="dialog-form">
          <p>
            Documents, recordings and study progress stay in this browser on this device. Local AI
            uses the model installed on your computer.
          </p>
          <button className="sp-button dark" onClick={onClose}>
            Done
          </button>
        </div>
      )}
      {name === 'character' && (
        <>
          <div className="character-options">
            {['Sparky', 'Luna', 'Scout'].map((character) => (
              <button
                className={selected === character ? 'selected' : ''}
                key={character}
                onClick={() => setSelected(character)}
              >
                <Mascot />
                <b>{character}</b>
                <span>
                  {character === 'Sparky'
                    ? 'Friendly & encouraging'
                    : character === 'Luna'
                      ? 'Calm & thoughtful'
                      : 'Curious & playful'}
                </span>
              </button>
            ))}
          </div>
          <div className="dialog-footer">
            <button
              className="sp-button dark"
              onClick={() => {
                onSave({ companion: selected });
              }}
            >
              Choose {selected}
            </button>
          </div>
        </>
      )}
      {name === 'plugins' && (
        <div className="plugin-list">
          {(
            [
              ['quiz', 'Practice quiz'],
              ['essay', 'Writing feedback'],
              ['explainers', 'Explain a topic'],
            ] as const
          ).map(([view, label]) => (
            <button
              key={view}
              onClick={() => {
                onNavigate(view);
                onClose();
              }}
            >
              <Icon name="book" />
              {label}
              <Icon name="chevron-right" />
            </button>
          ))}
        </div>
      )}
      {name === 'tutorials' && (
        <div className="tutorial-dialog">
          <ToolIllustration kind={step === 0 ? 'upload' : step === 1 ? 'chat' : 'quiz'} />
          <h3>
            {
              [
                'Everything starts with your materials',
                'Learn with a little help',
                'Make it stick',
              ][step]
            }
          </h3>
          <p>
            {
              [
                'Upload notes, slides, or a lecture. Your study set brings everything together.',
                'Follow your study plan, ask Sparky a question, or start a tutoring session.',
                'Create flashcards and quizzes, listen to audio recaps, and track your progress.',
              ][step]
            }
          </p>
          <div className="dialog-footer">
            <span>{step + 1} of 3</span>
            <button
              className="sp-button dark"
              onClick={() => (step < 2 ? setStep(step + 1) : onClose())}
            >
              {step < 2 ? 'Next' : 'Let’s get started'}
            </button>
          </div>
        </div>
      )}
      {name === 'help' && (
        <div className="help-dialog">
          <p>Find your next step.</p>
          {[
            [
              'How do I add materials?',
              'Use Upload in the sidebar. Choose a local file or paste your notes. Text is extracted on this Mac.',
            ],
            [
              'Can I record a lecture?',
              'Start a lecture to record from your microphone. Save it to replay or transcribe it on this device.',
            ],
            [
              'Will my changes be saved?',
              'Pair local PostgreSQL to sync your study sets, plans and chats. Back up or download recordings before clearing browser data.',
            ],
          ].map(([title, text]) => (
            <details key={title}>
              <summary>{title}</summary>
              <p>{text}</p>
            </details>
          ))}
        </div>
      )}
      {name === 'feedback' && (
        <form
          className="dialog-form"
          onSubmit={(e) => {
            e.preventDefault();
            downloadText(
              'studypal-feedback.txt',
              String(new FormData(e.currentTarget).get('feedback') ?? ''),
            );
            onNotify('Feedback exported.');
            onClose();
          }}
        >
          <p>What could make studying feel easier?</p>
          <label>
            Your feedback
            <textarea required name="feedback" rows={5} placeholder="Share your thoughts..." />
          </label>
          <button className="sp-button dark" type="submit">
            Download feedback
          </button>
        </form>
      )}
    </Modal>
  );
}
