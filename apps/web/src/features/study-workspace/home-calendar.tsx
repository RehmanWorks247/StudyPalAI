import { useState } from 'react';

import type { DialogName, StudyEvent, StudySet, View } from './demo-data';
import { Icon } from './icons';
import { Mascot, ToolIllustration } from './illustrations';
import { DocumentPreview, IconButton, SearchInput } from './primitives';
import './home-calendar.css';

type NavigationProps = {
  onNavigate: (view: View) => void;
  onDialog: (dialog: DialogName) => void;
};

type HomeViewProps = NavigationProps & {
  profileName: string;
  companionName: string;
  onRead: (name: string) => void;
  studySet: StudySet;
  sets: StudySet[];
  events: StudyEvent[];
  onSelectSet: (id: number) => void;
};

const quickActions: { label: string; icon: string; view?: View; dialog?: DialogName }[] = [
  { label: 'Upload materials', icon: 'upload', dialog: 'upload' },
  { label: 'Create a quiz', icon: 'quiz', view: 'quiz' },
  { label: 'Chat with Sparky', icon: 'chat', view: 'chat' },
  { label: 'Tutor Me', icon: 'tutor', view: 'tutor' },
  { label: 'Record a lecture', icon: 'mic', view: 'record' },
  { label: 'Explore Mini Apps', icon: 'app', view: 'apps' },
];

const miniApps: { label: string; icon: string; view: View }[] = [
  { label: 'Essay Grader', icon: 'pencil', view: 'essay' },
  { label: 'Audio Recap', icon: 'headphones', view: 'audio' },
  { label: 'Flashcards', icon: 'flashcards', view: 'flashcards' },
  { label: 'Explainers', icon: 'video', view: 'explainers' },
];

function SetCard({ studySet, onSelect }: { studySet: StudySet; onSelect: () => void }) {
  const reviewed = (studySet.sources ?? []).filter((s) => s.reviewed).length;
  const progress = Math.round((100 * reviewed) / Math.max(1, studySet.materials.length));
  return (
    <button type="button" className="home-set-card" onClick={onSelect}>
      <div className="home-set-art">
        <ToolIllustration kind="set" />
      </div>
      <div className="home-set-info">
        <strong>{studySet.name}</strong>
        <span>
          {studySet.materials.length} {studySet.materials.length === 1 ? 'material' : 'materials'}
        </span>
        <div className="home-set-progress">
          <span style={{ width: progress + '%' }} />
        </div>
        <span className="home-set-mastery">
          {reviewed} reviewed <Icon name="chevron-right" size={15} />
        </span>
      </div>
    </button>
  );
}

function HomeEvents({
  events,
  onDialog,
}: {
  events: StudyEvent[];
  onDialog: NavigationProps['onDialog'];
}) {
  const [tab, setTab] = useState('Today');
  const visibleEvents = events.filter((event) =>
    tab === 'Exams' ? /exam/i.test(event.kind) : event.date === dateKey(new Date()),
  );

  return (
    <section className="home-upcoming">
      <div className="home-section-heading">
        <h2>Upcoming</h2>
        <Icon name="calendar" size={19} />
      </div>
      <p className="home-today-date">
        {new Date().toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })}
      </p>
      <div className="home-tabs" aria-label="Upcoming events">
        {['Today', 'Exams'].map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={tab === item}
            className={tab === item ? 'active' : ''}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>
      {visibleEvents.length ? (
        <div className="home-event-list">
          {visibleEvents.map((event) => (
            <div className="home-event" key={event.id}>
              <span className="home-event-dot" />
              <div>
                <strong>{event.name}</strong>
                <span>
                  {event.date} · {event.time}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="home-event-empty">
          <Icon name="calendar" size={26} />
          <strong>No {tab === 'Exams' ? 'exams' : 'events'} yet</strong>
          <p>
            {tab === 'Exams'
              ? 'Add an exam to start planning ahead.'
              : 'Make a little time for a big idea.'}
          </p>
        </div>
      )}
      <button
        type="button"
        className="sp-button home-outline-button"
        onClick={() => onDialog(tab === 'Exams' ? 'exam' : 'session')}
      >
        <Icon name="plus" size={16} />
        Add {tab === 'Exams' ? 'exam' : 'study session'}
      </button>
    </section>
  );
}

export function HomeView({
  studySet,
  profileName,
  companionName,
  onRead,
  sets,
  events,
  onNavigate,
  onDialog,
  onSelectSet,
}: HomeViewProps) {
  const latest = studySet.sources?.at(-1);
  return (
    <div className="home-view">
      <div className="home-greeting">
        <Mascot className="home-greeting-mascot" />
        <div className="home-greeting-bubble">
          <h1>{profileName ? 'Hey, ' + profileName.split(' ')[0] + '.' : 'Your workspace'}</h1>
          <p>
            I’m {companionName}, your personal tutor, here to help you learn anything you can
            imagine.
          </p>
        </div>
      </div>

      <div className="home-columns">
        <div className="home-main-column">
          <section>
            <div className="home-section-heading">
              <h2>Recent Materials</h2>
              <button
                type="button"
                className="home-text-button"
                onClick={() => onNavigate('materials')}
              >
                View all <Icon name="chevron-right" size={15} />
              </button>
            </div>
            <div className="home-material-grid">
              {latest && (
                <button
                  type="button"
                  className="home-material-card"
                  onClick={() => onRead(latest.name)}
                >
                  <div className="home-paper-crop">
                    <DocumentPreview name={latest.name} text={latest.text} />
                  </div>
                  <div className="home-material-caption">
                    <span className="home-pdf-label">
                      {latest.name.split('.').at(-1)?.toUpperCase()}
                    </span>
                    <strong>{latest.name}</strong>
                    <span>Added recently</span>
                  </div>
                </button>
              )}
              <div className="home-material-prompt">
                <div className="home-prompt-icon">
                  <Icon name="sparkles" size={22} />
                </div>
                <h3>Fuel your study sessions</h3>
                <p>Upload your notes, slides, or textbooks and let Sparky take it from there.</p>
                <button type="button" className="sp-button" onClick={() => onDialog('upload')}>
                  <Icon name="plus" size={16} />
                  Add materials
                </button>
              </div>
              <button
                type="button"
                className="home-all-materials"
                onClick={() => onNavigate('materials')}
              >
                <span>
                  <Icon name="folder" size={21} />
                  View all materials
                </span>
                <Icon name="chevron-right" size={17} />
              </button>
            </div>
          </section>

          <section>
            <div className="home-section-heading">
              <h2>Your Study Sets</h2>
              <button type="button" className="home-text-button" onClick={() => onNavigate('sets')}>
                View all <Icon name="chevron-right" size={15} />
              </button>
            </div>
            <div className="home-set-grid">
              {sets.slice(0, 2).map((set) => (
                <SetCard key={set.id} studySet={set} onSelect={() => onSelectSet(set.id)} />
              ))}
              <button type="button" className="home-create-set" onClick={() => onDialog('new-set')}>
                <span>
                  <Icon name="plus" size={23} />
                </span>
                <strong>Create another study set</strong>
                <p>A fresh space for your next subject.</p>
              </button>
            </div>
          </section>

          <section>
            <div className="home-section-heading">
              <h2>Study activities</h2>
            </div>
            <div className="home-activity-grid">
              <button
                type="button"
                className="home-activity home-activity-cyan"
                onClick={() => onNavigate('quiz')}
              >
                <div>
                  <span>QUIZFETCH</span>
                  <h3>
                    Put your knowledge
                    <br />
                    to the test
                  </h3>
                  <p>Practice a little. Learn a lot.</p>
                </div>
                <ToolIllustration kind="quiz" />
              </button>
              <button
                type="button"
                className="home-activity home-activity-yellow"
                onClick={() => onNavigate('read')}
              >
                <div>
                  <span>READ</span>
                  <h3>
                    Pick up where
                    <br />
                    you left off
                  </h3>
                  <p>Your next “aha” is waiting.</p>
                </div>
                <ToolIllustration kind="read" />
              </button>
            </div>
          </section>

          <section>
            <div className="home-section-heading">
              <h2>Quick actions</h2>
            </div>
            <div className="home-quick-actions">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() =>
                    action.view ? onNavigate(action.view) : onDialog(action.dialog ?? 'upload')
                  }
                >
                  <Icon name={action.icon} size={21} />
                  <span>{action.label}</span>
                  <Icon name="chevron-right" size={14} />
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="home-section-heading">
              <h2>Mini Apps</h2>
              <button type="button" className="home-text-button" onClick={() => onNavigate('apps')}>
                Explore all <Icon name="chevron-right" size={15} />
              </button>
            </div>
            <div className="home-mini-apps">
              {miniApps.map((app) => (
                <button type="button" key={app.label} onClick={() => onNavigate(app.view)}>
                  <span>
                    <Icon name={app.icon} size={23} />
                  </span>
                  <strong>{app.label}</strong>
                </button>
              ))}
            </div>
          </section>
        </div>

        <aside className="home-side-column">
          <section className="home-premium">
            <div className="home-premium-top">
              <Icon name="sparkles" size={25} />
              <span>ON THIS MAC</span>
            </div>
            <h2>Local workspace</h2>
            <p>Manage the connection between this browser and local PostgreSQL.</p>
            <button type="button" className="sp-button" onClick={() => onDialog('upgrade')}>
              Workspace settings <Icon name="bolt" size={16} />
            </button>
          </section>
          <HomeEvents events={events} onDialog={onDialog} />
          <section className="home-announcements">
            <span className="home-small-label">WHAT’S NEW</span>
            <h3>
              Your study space,
              <br />
              all in one place.
            </h3>
            <p>
              Meet your new home for learning. Every tool, every material, every little
              breakthrough.
            </p>
            <button
              type="button"
              className="home-text-button"
              onClick={() => onDialog('tutorials')}
            >
              Take a quick tour <Icon name="chevron-right" size={15} />
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}

export function SetsView({
  sets,
  onSelectSet,
  onDialog,
}: {
  sets: StudySet[];
  onSelectSet: (id: number) => void;
  onDialog: NavigationProps['onDialog'];
}) {
  const [search, setSearch] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const filteredSets = sets.filter((set) =>
    set.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="sets-view">
      <div className="sets-page-heading">
        <div>
          <span className="home-small-label">YOUR SPACE TO LEARN</span>
          <h1>My Study Sets</h1>
          <p>All your subjects. A little more organized.</p>
        </div>
        <button type="button" className="sp-button" onClick={() => onDialog('new-set')}>
          <Icon name="plus" size={18} />
          New Study Set
        </button>
      </div>
      <div className="sets-toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder="Search your study sets" />
        <div className="sets-layout-controls">
          <button
            type="button"
            aria-label="Grid view"
            aria-pressed={layout === 'grid'}
            className={layout === 'grid' ? 'active' : ''}
            onClick={() => setLayout('grid')}
          >
            <Icon name="app" size={18} />
          </button>
          <button
            type="button"
            aria-label="List view"
            aria-pressed={layout === 'list'}
            className={layout === 'list' ? 'active' : ''}
            onClick={() => setLayout('list')}
          >
            <Icon name="filter" size={20} />
          </button>
        </div>
      </div>
      <p className="sets-count">
        {filteredSets.length} {filteredSets.length === 1 ? 'study set' : 'study sets'}
      </p>
      <div className={`sets-collection ${layout === 'list' ? 'is-list' : ''}`}>
        {filteredSets.map((set) => (
          <SetCard key={set.id} studySet={set} onSelect={() => onSelectSet(set.id)} />
        ))}
        {!search && (
          <button type="button" className="home-create-set" onClick={() => onDialog('new-set')}>
            <span>
              <Icon name="plus" size={26} />
            </span>
            <strong>Create a study set</strong>
            <p>Bring your materials together.</p>
          </button>
        )}
      </div>
      {filteredSets.length === 0 && search && (
        <div className="sets-empty">
          <Icon name="search" size={32} />
          <h2>No study sets found</h2>
          <p>Try a different name or create a new study set.</p>
          <button type="button" className="sp-button" onClick={() => setSearch('')}>
            Clear search
          </button>
        </div>
      )}
    </div>
  );
}

const today = new Date();
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function CalendarView({
  events,
  onAddEvent,
}: {
  events: StudyEvent[];
  onAddEvent: (kind: 'exam' | 'session', date: string) => void;
}) {
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(dateKey(today));
  const firstWeekday = month.getDay();
  const dayCount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const gridLength = Math.ceil((firstWeekday + dayCount) / 7) * 7;
  const days = Array.from(
    { length: gridLength },
    (_, index) => new Date(month.getFullYear(), month.getMonth(), index - firstWeekday + 1),
  );
  const selectedEvents = events.filter((event) => event.date === selectedDate);
  const selected = new Date(`${selectedDate}T12:00:00`);
  const changeMonth = (offset: number) =>
    setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1));

  return (
    <div className="calendar-view">
      <div className="sets-page-heading">
        <div>
          <span className="home-small-label">MAKE ROOM FOR LEARNING</span>
          <h1>Calendar</h1>
          <p>A clear plan for what comes next.</p>
        </div>
        <div className="calendar-heading-actions">
          <button
            type="button"
            className="sp-button home-outline-button"
            onClick={() => onAddEvent('exam', selectedDate)}
          >
            <Icon name="calendar" size={17} />
            Add exam
          </button>
          <button
            type="button"
            className="sp-button"
            onClick={() => onAddEvent('session', selectedDate)}
          >
            <Icon name="plus" size={17} />
            Add study session
          </button>
        </div>
      </div>
      <div className="calendar-layout">
        <section className="calendar-main" aria-label="Month calendar">
          <div className="calendar-toolbar">
            <div className="calendar-month-picker">
              <h2>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
              <div>
                <IconButton
                  icon="chevron-right"
                  label="Previous month"
                  className="calendar-previous"
                  onClick={() => changeMonth(-1)}
                />
                <IconButton
                  icon="chevron-right"
                  label="Next month"
                  onClick={() => changeMonth(1)}
                />
              </div>
            </div>
            <button
              type="button"
              className="calendar-today-button"
              onClick={() => {
                setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                setSelectedDate(dateKey(today));
              }}
            >
              Today
            </button>
          </div>
          <div className="calendar-weekdays">
            {weekdays.map((day) => (
              <span key={day}>
                <span className="calendar-weekday-long">{day.slice(0, 3)}</span>
                <span className="calendar-weekday-short">{day.slice(0, 1)}</span>
              </span>
            ))}
          </div>
          <div className="calendar-grid">
            {days.map((date) => {
              const key = dateKey(date);
              const dayEvents = events.filter((event) => event.date === key);
              return (
                <button
                  type="button"
                  key={key}
                  aria-label={`${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}${dayEvents.length ? `, ${dayEvents.length} events` : ''}`}
                  aria-pressed={selectedDate === key}
                  className={`calendar-day ${date.getMonth() !== month.getMonth() ? 'outside-month' : ''} ${selectedDate === key ? 'selected' : ''} ${key === dateKey(today) ? 'is-today' : ''}`}
                  onClick={() => setSelectedDate(key)}
                >
                  <span className="calendar-day-number">{date.getDate()}</span>
                  <span className="calendar-day-events">
                    {dayEvents.slice(0, 2).map((event) => (
                      <span
                        key={event.id}
                        className={`calendar-event-chip ${/exam/i.test(event.kind) ? 'is-exam' : ''}`}
                      >
                        <i />
                        {event.name}
                      </span>
                    ))}
                    {dayEvents.length > 2 && (
                      <span className="calendar-more-events">+{dayEvents.length - 2} more</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="calendar-legend">
            <span>
              <i />
              Study sessions
            </span>
            <span>
              <i className="exam-dot" />
              Exams
            </span>
          </div>
        </section>
        <aside className="calendar-day-panel">
          <span className="home-small-label">
            {selected.toLocaleDateString('en-US', { weekday: 'long' })}
          </span>
          <h2>{selected.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</h2>
          <p className="calendar-panel-subtitle">
            {selectedDate === dateKey(today)
              ? 'A little progress starts today.'
              : 'Make time for your next breakthrough.'}
          </p>
          <div className="calendar-panel-rule" />
          {selectedEvents.length ? (
            <div className="calendar-agenda">
              {selectedEvents.map((event) => (
                <div
                  key={event.id}
                  className={`calendar-agenda-event ${/exam/i.test(event.kind) ? 'is-exam' : ''}`}
                >
                  <span className="calendar-agenda-icon">
                    <Icon name={/exam/i.test(event.kind) ? 'quiz' : 'book'} size={18} />
                  </span>
                  <div>
                    <span>{event.time}</span>
                    <h3>{event.name}</h3>
                    <p>{event.kind}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="calendar-empty-day">
              <span>
                <Icon name="calendar" size={30} />
              </span>
              <h3>Your day is wide open</h3>
              <p>Add a study session and give your goals a little time.</p>
            </div>
          )}
          <button
            type="button"
            className="sp-button"
            onClick={() => onAddEvent('session', selectedDate)}
          >
            <Icon name="plus" size={16} />
            Add study session
          </button>
        </aside>
      </div>
    </div>
  );
}
