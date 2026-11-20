import type { planTopics } from './plan-topics';
import { useState } from 'react';
import { Icon } from './icons';
import { ToolIllustration } from './illustrations';
import { DocumentPreview, IconButton } from './primitives';
import { type DialogName, type StudySet, type View } from './demo-data';

interface DashboardProps {
  onTopic: (view: View, topic: { source: string; title: string }) => void;
  topics: ReturnType<typeof planTopics>;
  covered: string[];
  studySet: StudySet;
  onNavigate: (view: View) => void;
  onDialog: (dialog: DialogName) => void;
  onMode: (mode: string) => void;
  onClone: () => void;
  onNotify: (text: string) => void;
  onOpenMaterial: (name: string) => void;
}
export function SetHeading({
  name,
  count = 0,
  done = 0,
  compact = false,
  onSettings,
  onClone,
}: {
  name: string;
  count?: number;
  done?: number;
  compact?: boolean;
  onSettings: () => void;
  onClone: () => void;
}) {
  return (
    <div className={`set-heading ${compact ? 'compact' : ''}`}>
      <div className="set-thumbnail">
        <ToolIllustration kind="set" />
      </div>
      <div className="set-heading-body">
        <div className="set-title">
          <h1>{name}</h1>
          <IconButton icon="settings" label="Study set settings" onClick={onSettings} />
          <IconButton icon="copy" label="Clone Set" onClick={onClone} />
        </div>
        {!compact && (
          <div className="mastery">
            <span>
              <Icon name="book" />
              {count} Topics
            </span>
            <span>
              <Icon name="check-circle" className="lilac-text" />
              {done} Covered
            </span>

            <div
              className="mastery-track"
              role="progressbar"
              aria-label="Topics reviewed"
              aria-valuenow={count ? Math.round((done / count) * 100) : 0}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i style={{ width: (count ? (done / count) * 100 : 0) + '%' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function Dashboard({
  studySet,
  onTopic,
  topics,
  covered,
  onNavigate,
  onDialog,
  onNotify,
  onMode,
  onClone,
  onOpenMaterial,
}: DashboardProps) {
  const [offset, setTopic] = useState(0);
  const [showMore, setShowMore] = useState(false);
  const [unitOpen, setUnitOpen] = useState(true);
  const mode = studySet.mode ?? 'Comprehensive';
  const highlights = (studySet.sources ?? [])
    .flatMap((source) =>
      (source.highlights ?? []).map((mark) => ({
        name: source.name,
        text: source.text.slice(mark.start, mark.end),
      })),
    )
    .slice(-3);
  const recommended = topics.filter((item) => !covered.includes(item.id));
  const candidates = recommended.length ? recommended : topics;
  const topic = candidates[offset % Math.max(1, candidates.length)];
  const tools: {
    kind: 'chat' | 'read' | 'quiz' | 'flashcards' | 'audio' | 'tutor';
    label: string;
    caption: string;
    view: View;
    icon: string;
  }[] = [
    {
      kind: 'chat',
      label: 'Guided Chat',
      caption: 'Ask about your notes',
      view: 'chat',
      icon: 'chat',
    },
    { kind: 'read', label: 'Read', caption: 'Catch up quickly', view: 'read', icon: 'book' },
    {
      kind: 'quiz',
      label: 'QuizFetch',
      caption: 'Practice questions',
      view: 'quiz',
      icon: 'quiz',
    },
    {
      kind: 'flashcards',
      label: 'Flashcards',
      caption: 'Make it stick',
      view: 'flashcards',
      icon: 'flashcards',
    },
    {
      kind: 'audio',
      label: 'Audio Recap',
      caption: 'Learn on the go',
      view: 'audio',
      icon: 'volume',
    },
    {
      kind: 'tutor',
      label: 'Tutor Me',
      caption: 'Your personal tutor',
      view: 'tutor',
      icon: 'tutor',
    },
  ];
  const actions: { label: string; icon: string; view?: View }[] = [
    { label: 'Add More Materials', icon: 'upload' },
    { label: 'Take a Quiz', icon: 'quiz', view: 'quiz' },
    { label: 'Create a Flashcard Set', icon: 'flashcards', view: 'flashcards' },
    { label: 'Ask your tutor', icon: 'chat', view: 'chat' },
    { label: 'Start a Tutoring Session', icon: 'tutor', view: 'tutor' },
    { label: 'Start Listening', icon: 'volume', view: 'audio' },
    { label: 'Start Recording', icon: 'mic', view: 'record' },
    { label: 'Launch Arcade', icon: 'gamepad', view: 'arcade' },
    { label: 'Explore Mini Apps', icon: 'app', view: 'apps' },
  ];
  return (
    <div className="dashboard">
      <div className="heading-with-mode">
        <SetHeading
          name={studySet.name}
          count={topics.length}
          done={topics.filter((item) => covered.includes(item.id)).length}
          onSettings={() => onDialog('settings')}
          onClone={onClone}
        />
        <label className="mode-control" title={`Mode: ${mode}`}>
          <Icon name="more" />
          <select aria-label="Study mode" value={mode} onChange={(e) => onMode(e.target.value)}>
            {['Cram', 'Standard', 'Comprehensive'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="dashboard-columns">
        <div className="dashboard-primary">
          {studySet.recommendations !== false && (
            <section className="recommend-section">
              <div className="section-heading">
                <h2>
                  <Icon name="map" />
                  Recommended from your Study Plan
                </h2>
                <button className="sp-button white" onClick={() => onNavigate('plan')}>
                  View Full Study Plan
                </button>
              </div>
              {topic ? (
                <button
                  className="unit-tab"
                  onClick={() => setUnitOpen(!unitOpen)}
                  aria-expanded={unitOpen}
                >
                  <b>{topic.source}</b>
                </button>
              ) : (
                <div className="recommend-panel">
                  <h3>Add material to build your study plan</h3>
                  <p>StudyPal uses your documents and lecture transcripts to suggest topics.</p>
                  <button className="sp-button dark" onClick={() => onDialog('upload')}>
                    Add materials
                  </button>
                </div>
              )}
              {unitOpen && topic && (
                <div className="recommend-panel">
                  <div className="topic-heading">
                    <div>
                      <p>
                        Topic {candidates.indexOf(topic) + 1} of {candidates.length} from{' '}
                        <b>{topic?.source ?? 'Add materials'}</b>
                      </p>
                      <h3>
                        <span className="topic-ring" />
                        {topic.title}
                      </h3>
                    </div>
                    <button className="text-button skip-topic" onClick={() => setTopic(offset + 1)}>
                      Skip topic <Icon name="skip" />
                    </button>
                  </div>
                  <div className="tool-card-grid">
                    {(mode === 'Cram'
                      ? [...tools].sort(
                          (a, b) => Number(b.kind === 'quiz') - Number(a.kind === 'quiz'),
                        )
                      : tools
                    )
                      .slice(0, showMore ? 6 : 3)
                      .map((tool) => (
                        <button
                          className={`tool-card ${tool.kind}`}
                          key={tool.kind}
                          onClick={() => onTopic(tool.view, topic)}
                        >
                          <div className="tool-caption">
                            <b>{tool.caption}</b>
                            <Icon name="help" size={13} />
                          </div>
                          <div className="tool-art">
                            <ToolIllustration kind={tool.kind} />
                          </div>
                          <div className="tool-label">
                            <Icon name={tool.icon} />
                            {tool.label}
                            {tool.kind === 'quiz' && <Icon name="more" className="tool-more" />}
                          </div>
                        </button>
                      ))}
                  </div>
                  <button
                    className="sp-button show-more"
                    onClick={() => setShowMore(!showMore)}
                    aria-expanded={showMore}
                  >
                    {showMore ? 'Show Less' : 'Show More'}
                    <Icon name="chevron-down" className={showMore ? 'rotate' : ''} />
                  </button>
                </div>
              )}
            </section>
          )}
          <section className="own-way">
            <h2>Or start learning your own way</h2>
            <div className="quick-action-grid">
              {actions.map((action) => (
                <button
                  key={action.label}
                  className={`quick-action action-${action.icon}`}
                  onClick={() => (action.view ? onNavigate(action.view) : onDialog('upload'))}
                >
                  <Icon name={action.icon} />
                  {action.label}
                </button>
              ))}
            </div>
          </section>
          <section className="recent-materials">
            <div className="section-heading">
              <h2>Recent Materials</h2>
              <button className="sp-button" onClick={() => onNavigate('materials')}>
                All Types <Icon name="chevron-down" />
              </button>
            </div>
            <div className="material-grid">
              {studySet.materials
                .slice(-3)
                .reverse()
                .map((name) => (
                  <button className="material-card" key={name} onClick={() => onOpenMaterial(name)}>
                    <DocumentPreview
                      name={name}
                      text={studySet.sources?.find((s) => s.name === name)?.text ?? ''}
                    />
                    <div>
                      <Icon name="file" />
                      <span>{name}</span>
                    </div>
                  </button>
                ))}
            </div>
            {studySet.materials.length === 0 && (
              <button className="sp-button white" onClick={() => onDialog('upload')}>
                Add your first material
              </button>
            )}
          </section>
          <section className="highlights-preview">
            <div className="section-heading">
              <h2>Recent Highlights</h2>
              <button className="text-button" onClick={() => onNavigate('highlights')}>
                View all highlights
              </button>
            </div>
            {highlights.length ? (
              highlights.map((h, i) => (
                <button className="text-button" key={i} onClick={() => onOpenMaterial(h.name)}>
                  {h.text.slice(0, 140)}
                </button>
              ))
            ) : (
              <p>
                Select text in your materials or study tools and choose a color to save your first
                highlight.
              </p>
            )}
          </section>
        </div>
        <aside className="dashboard-widgets">
          <StudyWidgets onDialog={onDialog} />
          <button
            className="widget-tip"
            onClick={() =>
              onNotify('Tip: start with a guided chat, then test yourself with a quiz.')
            }
          >
            <Icon name="sparkles" /> A little practice, a little progress.
          </button>
        </aside>
      </div>
    </div>
  );
}

export function StudyWidgets({ onDialog }: { onDialog: (name: DialogName) => void }) {
  return (
    <>
      <section className="study-widget">
        <h2>
          Syllabus <Icon name="help" size={16} />
        </h2>
        <p>Tailor your study plan to your class schedule and priorities.</p>
        <button className="sp-button white" onClick={() => onDialog('upload')}>
          <Icon name="plus" />
          Add syllabus
        </button>
      </section>
      <section className="study-widget">
        <h2>
          Exam Dates <Icon name="help" size={16} />
        </h2>
        <p>Ensure you are studying what you need to before your exams.</p>
        <button className="sp-button white" onClick={() => onDialog('exam')}>
          <Icon name="plus" />
          Add exam
        </button>
      </section>
    </>
  );
}
