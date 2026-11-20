import type { WorkspaceReplica } from './workspace-replica';
import { ReplicaLabel } from './replica-settings';
import { initialWorkspace, type WorkspaceData } from './workspace-storage';
import { localDate, planTopics } from './plan-topics';
import type { StudySource } from './study-source';
import { LectureStudio } from './lecture-studio';
import { SourceQuiz } from './source-quiz';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ChatPanel } from './chat-panel';
import { EmptyWorkspace } from './empty-workspace';
import { Dashboard } from './dashboard';
import {
  practiceItems,
  readView,
  viewNames,
  type ChatState,
  type DialogName,
  type View,
} from './demo-data';
import { HomeView, SetsView, CalendarView } from './home-calendar';
import { Icon } from './icons';
import { Mascot } from './illustrations';
import { QuestionBanks } from './question-banks';
import { openPractice, savePractice } from './study-history';
import { LibraryView } from './library-views';
import { IconButton } from './primitives';
import { StudyPlan } from './study-plan';
import { StudyTimer } from './study-timer';
import { UploadDialog } from './upload-dialog';
import { WorkspaceDialog } from './workspace-dialogs';
import './workspace.css';

const LearningView = lazy(() =>
  import('./learning-views').then((module) => ({ default: module.LearningView })),
);
const emptyChat: ChatState = { messages: [], draft: '', guided: false };

export function StudyWorkspace({
  initial = initialWorkspace,
  save,
  replica,
  accountName,
  accountActions,
}: {
  accountName?: string | undefined;
  accountActions?: ReactNode;
  replica?: WorkspaceReplica;
  initial?: WorkspaceData;
  save?: (data: WorkspaceData) => Promise<void>;
}) {
  const [view, setView] = useState<View>(readView);
  const [sets, setSets] = useState(initial.sets);
  const [practiceVersion, setPracticeVersion] = useState({ quiz: 0, test: 0 });
  const [setId, setSetId] = useState(
    initial.sets.find((set) => set.id === initial.setId)?.id ?? initial.sets[0]?.id ?? 0,
  );
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 760);
  const [chatOpen, setChatOpen] = useState(true);
  const [chats, setChats] = useState(initial.chats);
  const [topicTarget, setTopicTarget] = useState<{ view: View; source: string; title: string }>();
  const [menu, setMenu] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [toast, setToast] = useState('');
  const [events, setEvents] = useState(initial.events);
  const [folders, setFolders] = useState(initial.folders);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const [plans, setPlans] = useState(initial.plans);
  const [reviewed, setReviewed] = useState(initial.reviewed);
  const [saveError, setSaveError] = useState('');
  const saves = useRef(Promise.resolve());
  const pending = useRef<WorkspaceData | null>(null);

  const [theme, setTheme] = useState(initial.theme);
  const [profileName, setProfileName] = useState(initial.profileName);
  const displayName = accountName?.trim() || profileName;
  const [companionName, setCompanionName] = useState(initial.companionName);
  const [eventDate, setEventDate] = useState(() => localDate());
  const [selectedMaterial, setSelectedMaterial] = useState(
    () => initial.sets.find((set) => set.id === initial.setId)?.materials[0] ?? '',
  );
  const [visitedTools, setVisitedTools] = useState<View[]>(() => [readView()]);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  );
  const scroll = useRef<HTMLElement>(null);
  const selectedSet = sets.find((item) => item.id === setId) ?? sets[0];
  const sources = useMemo(() => selectedSet?.sources ?? [], [selectedSet?.sources]);
  const topics = useMemo(() => planTopics(sources), [sources]);
  const covered = reviewed[setId] ?? [];
  useEffect(() => {
    document.title = selectedSet
      ? (view === 'dashboard' ? selectedSet.name : viewNames[view] + ' · ' + selectedSet.name) +
        ' | StudyPal'
      : 'Your workspace | StudyPal';
  }, [view, selectedSet]);
  useEffect(() => {
    if (!save) return;
    pending.current = {
      sets,
      setId,
      chats,
      folders,
      events,
      plans,
      reviewed,
      profileName,
      companionName,
      theme,
    };
    saves.current = saves.current.then(async () => {
      const next = pending.current;
      if (!next) return;
      pending.current = null;
      try {
        await save(next);
        setSaveError('');
      } catch (error) {
        setSaveError(
          error instanceof Error ? error.message : 'Changes could not be saved on this device.',
        );
      }
    });
  }, [
    save,
    sets,
    setId,
    chats,
    folders,
    events,
    plans,
    reviewed,
    profileName,
    companionName,
    theme,
  ]);
  const notify = useCallback((text: string) => setToast(text), []);
  useEffect(() => {
    const warn = () =>
      notify(
        'Offline app files could not be installed. Reconnect and reload before going offline.',
      );
    window.addEventListener('studypal:offline-unavailable', warn);
    return () => window.removeEventListener('studypal:offline-unavailable', warn);
  }, [notify]);
  const navigate = useCallback((next: View) => {
    setTopicTarget(undefined);
    setView(next);
    if (window.innerWidth <= 760) setSidebarOpen(false);
    setVisitedTools((current) => (current.includes(next) ? current : [...current, next]));
    window.location.assign(`#${next}`);
    setMenu(null);
    scroll.current?.scrollTo?.(0, 0);
  }, []);
  const openDialog = useCallback((name: DialogName) => {
    setDialog(name);
    if (name === 'upload') setUploadTarget(null);
    setEventDate(localDate());
    setMenu(null);
  }, []);
  useEffect(() => {
    const update = () => setView(readView());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const pointer = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest('[data-popover]')) setMenu(null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    document.addEventListener('pointerdown', pointer);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', pointer);
      document.removeEventListener('keydown', key);
    };
  }, []);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media?.matches ?? false);
    media?.addEventListener('change', update);
    return () => media?.removeEventListener('change', update);
  }, []);
  function createSet(name: string, description = '') {
    const id = sets.reduce((next, set) => Math.max(next, set.id + 1), Date.now());
    setSets((current) => [...current, { id, name, description, materials: [] }]);
    setSetId(id);
    setSelectedMaterial('');
    navigate('dashboard');
  }
  if (!selectedSet)
    return (
      <EmptyWorkspace
        accountName={displayName}
        accountActions={accountActions}
        replica={replica}
        error={saveError}
        onCreate={createSet}
      />
    );
  const studySet = selectedSet;
  const showChat =
    chatOpen &&
    !['home', 'sets', 'tutor', 'calendar', 'apps', 'arcade', 'chat', 'qbank'].includes(view);
  const toggleMenu = (name: string) => setMenu(menu === name ? null : name);
  function selectSet(id: number) {
    setSetId(id);
    setSelectedMaterial(sets.find((item) => item.id === id)?.materials[0] ?? '');
    navigate('dashboard');
  }
  function cloneSet() {
    const id = Date.now();
    setSets((current) => [
      ...current,
      {
        ...structuredClone(studySet),
        id,
        name: studySet.name + ' (copy)',
        practice: {},
        practiceHistory: [],
      },
    ]);
    setFolders((current) => ({ ...current, [id]: structuredClone(current[setId] ?? []) }));
    setPlans((current) => ({ ...current, [id]: structuredClone(current[setId] ?? []) }));
    setSetId(id);
    setSelectedMaterial(studySet.materials[0] ?? '');
    navigate('dashboard');
  }
  function openTopic(view: View, topic: { source: string; title: string }) {
    if (view === 'read') {
      openMaterial(topic.source);
      return;
    }
    navigate(view);
    setTopicTarget({ view, source: topic.source, title: topic.title });
    if (view === 'tutor' || view === 'chat')
      updateChat((current) => ({
        ...current,
        guided: true,
        draft: 'Help me understand ' + topic.title + ' in ' + topic.source + '.',
      }));
  }
  function changeSource(name: string, changes: Partial<StudySource>) {
    setSets((current) =>
      current.map((set) =>
        set.id === setId
          ? {
              ...set,
              sources: (set.sources ?? []).map((source) =>
                source.name === name ? { ...source, ...changes } : source,
              ),
            }
          : set,
      ),
    );
  }
  function openMaterial(name: string) {
    setSelectedMaterial(name);
    navigate('document');
  }
  function updateChat(update: (current: ChatState) => ChatState) {
    setChats((current) => ({ ...current, [setId]: update(current[setId] ?? emptyChat) }));
  }
  function uploadToFolder(folder: string | null) {
    setUploadTarget(folder);
    setDialog('upload');
    setMenu(null);
  }
  function addSources(names: string[], newSources: StudySource[]) {
    setSets((current) =>
      current.map((set) =>
        set.id === setId
          ? {
              ...set,
              materials: [...new Set([...set.materials, ...names])],
              sources: [
                ...(set.sources ?? []).filter(
                  (source) => !newSources.some((next) => next.name === source.name),
                ),
                ...newSources,
              ],
            }
          : set,
      ),
    );
  }
  function saveDialog(values: Record<string, string>) {
    const name = values.name?.trim();
    if (dialog === 'settings' && name)
      setSets((current) =>
        current.map((item) =>
          item.id === setId
            ? {
                ...item,
                name,
                description: values.description ?? '',
                recommendations: values.recommendations === 'on',
              }
            : item,
        ),
      );
    if (dialog === 'new-set' && name) createSet(name, values.description);
    if ((dialog === 'exam' || dialog === 'session') && name) {
      setEvents((current) => [
        ...current,
        {
          id: Date.now(),
          name,
          date: values.date || localDate(),
          time: values.time ?? '16:00',
          kind: dialog === 'exam' ? 'Exam' : 'Study session',
        },
      ]);
      notify('Added to your calendar');
    }
    if (dialog === 'folder' && name) {
      if (folders[setId]?.some((folder) => folder.name === name)) {
        notify('A folder with this name already exists.');
        return;
      }
      setFolders((current) => ({
        ...current,
        [setId]: [...(current[setId] ?? []), { name, materials: [] }],
      }));
      notify('Folder created');
    }
    if (dialog === 'new-plan' && name) {
      if ((plans[setId] ?? []).some((plan) => plan.name === name)) {
        notify('Choose another plan name.');
        return;
      }
      setPlans((current) => ({
        ...current,
        [setId]: [
          ...(current[setId] ?? []),
          {
            name,
            date: values.date || localDate(),
            start: localDate(),
            mode: values.mode || 'Standard',
          },
        ],
      }));
      navigate('plan');
    }
    if (dialog === 'profile' && name) {
      setProfileName(name);
      notify('Profile updated');
    }
    if (dialog === 'upgrade') {
      notify('Local study tools are included.');
    }
    if (dialog === 'character' && values.companion) setCompanionName(values.companion);
    setDialog(null);
  }
  const navItems: { view: View; label: string; icon: string }[] = [
    { view: 'dashboard', label: 'Dashboard', icon: 'home' },
    { view: 'plan', label: 'Study Plan', icon: 'map' },
    { view: 'chat', label: 'Chat', icon: 'chat' },
    { view: 'tutor', label: 'Tutor Me', icon: 'tutor' },
    { view: 'record', label: 'Record Lecture', icon: 'mic' },
  ];
  return (
    <div
      className={`study-workspace ${theme === 'dark' || (theme === 'system' && systemDark) ? 'dark-theme' : ''} ${sidebarOpen ? '' : 'sidebar-collapsed'} ${showChat ? 'with-chat' : ''}`}
    >
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          scroll.current?.focus();
        }}
      >
        Skip to content
      </a>
      {saveError && (
        <div role="alert" className="storage-warning">
          {saveError}
        </div>
      )}
      <nav className="icon-rail" aria-label="Main navigation">
        <button
          className="rail-brand"
          title="StudyPal Home"
          aria-label="Home"
          onClick={() => navigate('home')}
        >
          <Mascot />
        </button>
        <div className="rail-main">
          <IconButton icon="search" label="Search" onClick={() => openDialog('search')} />
          <IconButton icon="folder" label="My Sets" onClick={() => navigate('sets')} />
          <IconButton icon="calendar" label="Calendar" onClick={() => navigate('calendar')} />
          <IconButton icon="layers" label="Question Banks" onClick={() => navigate('qbank')} />
          {!sidebarOpen && (
            <IconButton icon="panel" label="Expand sidebar" onClick={() => setSidebarOpen(true)} />
          )}
        </div>
        <div className="rail-bottom">
          <IconButton icon="book" label="Tutorials" onClick={() => openDialog('tutorials')} />
          <IconButton icon="help" label="Feedback and Help" onClick={() => openDialog('help')} />
          <div data-popover>
            <button
              className="profile-avatar"
              aria-label={displayName ? displayName + ' — account menu' : 'Account menu'}
              onClick={() => toggleMenu('account')}
            >
              {(displayName || 'Account')
                .split(' ')
                .map((x) => x.charAt(0))
                .slice(0, 2)
                .join('')}
            </button>
            {menu === 'account' && (
              <div className="account-menu dark-menu">
                {accountActions}
                {(
                  [
                    { label: 'Your Profile', icon: 'tutor', name: 'profile' },
                    { label: 'Settings', icon: 'settings', name: 'settings' },
                    { label: 'Tutorials', icon: 'book', name: 'tutorials' },
                    { label: 'Give Us Feedback', icon: 'chat', name: 'feedback' },
                    { label: 'Local workspace', icon: 'bolt', name: 'upgrade' },
                    { label: 'Support', icon: 'help', name: 'help' },
                  ] satisfies { label: string; icon: string; name: DialogName }[]
                )
                  .filter((item) => item.name !== 'profile' || !accountActions)
                  .map((item) => (
                    <button key={item.label} onClick={() => openDialog(item.name)}>
                      <Icon name={item.icon} />
                      {item.label}
                    </button>
                  ))}
                <div className="theme-switch">
                  <span>Theme</span>
                  {['dark', 'light', 'system'].map((value, index) => (
                    <button
                      key={value}
                      aria-label={`${value} theme`}
                      aria-pressed={theme === value}
                      onClick={() => setTheme(value)}
                    >
                      <Icon name={['moon', 'sun', 'monitor'][index] ?? 'sun'} />
                    </button>
                  ))}
                </div>
                <small>StudyPal · On this device</small>
              </div>
            )}
          </div>
        </div>
      </nav>
      {sidebarOpen && (
        <aside className="study-sidebar">
          <div className="sidebar-top" data-popover>
            <button
              className="set-switcher"
              onClick={() => toggleMenu('sets')}
              aria-expanded={menu === 'sets'}
            >
              <span>{studySet.name}</span>
              <Icon name="chevron-down" size={15} />
            </button>
            <IconButton icon="map" label="Show study plan" onClick={() => navigate('plan')} />
            <IconButton
              icon="panel"
              label="Collapse sidebar"
              onClick={() => setSidebarOpen(false)}
            />
            {menu === 'sets' && (
              <div className="sets-menu dark-menu">
                {sets.map((item) => (
                  <button key={item.id} onClick={() => selectSet(item.id)}>
                    <Icon name="folder" />
                    {item.name}
                    {setId === item.id && <Icon name="check" />}
                  </button>
                ))}
                <button onClick={() => openDialog('new-set')}>
                  <Icon name="plus" />
                  Create study set
                </button>
              </div>
            )}
          </div>
          <nav className="set-navigation" aria-label="Study set navigation">
            {navItems.map((item) => (
              <button
                className={view === item.view ? 'active' : ''}
                key={item.view}
                onClick={() => navigate(item.view)}
                aria-current={view === item.view ? 'page' : undefined}
              >
                <Icon name={item.icon} />
                {item.label}
              </button>
            ))}
            <div className="practice-container" data-popover>
              <button
                className={
                  menu === 'practice' || practiceItems.some((x) => x.view === view) ? 'active' : ''
                }
                onClick={() => toggleMenu('practice')}
                aria-expanded={menu === 'practice'}
              >
                <Icon name="quiz" />
                Practice & Activities
                <Icon name="chevron-right" className="nav-chevron" size={15} />
              </button>
              {menu === 'practice' && (
                <div className="practice-menu dark-menu">
                  {practiceItems.map((item) => (
                    <button key={item.view} onClick={() => navigate(item.view)}>
                      <Icon name={item.icon} />
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="sidebar-upload" onClick={() => openDialog('upload')}>
              <Icon name="plus" />
              Upload
            </button>
          </nav>
          <div className="sidebar-materials-title">
            <button onClick={() => navigate('materials')}>Materials</button>
            <button onClick={() => navigate('materials')}>View All</button>
            <IconButton icon="more" label="Material options" onClick={() => openDialog('folder')} />
          </div>
          <div className="sidebar-files">
            {studySet.materials.map((name) => (
              <button title={name} key={name} onClick={() => openMaterial(name)}>
                <Icon name="file" />
                <span>{name}</span>
              </button>
            ))}
          </div>
        </aside>
      )}
      <div className="workspace-main">
        <header className="workspace-header">
          <div className="breadcrumbs">
            <button onClick={() => navigate('dashboard')}>{studySet.name}</button>
            {view !== 'dashboard' && (
              <>
                <Icon name="chevron-right" size={16} />
                <span>{viewNames[view]}</span>
              </>
            )}
          </div>
          <div className="header-actions">
            <button className="sp-button upgrade-button" onClick={() => openDialog('upgrade')}>
              <Icon name="bolt" />
              {replica ? <ReplicaLabel replica={replica} /> : 'Local workspace'}
            </button>
            <button className="sp-button share-button" onClick={() => openDialog('share')}>
              <Icon name="share" />
              Share
            </button>
            <div className="creation-menu-container" data-popover>
              <IconButton
                icon="inbox"
                label="Workspace summary"
                className="header-icon"
                onClick={() => toggleMenu('progress')}
              />
              {menu === 'progress' && (
                <div className="creation-menu">
                  <h3>Workspace summary</h3>
                  <Icon name="check-circle" size={32} />
                  <p>
                    {studySet.materials.length} materials ·{' '}
                    {topics.filter((t) => covered.includes(t.id)).length} topics reviewed
                  </p>
                  <small>{(plans[setId] ?? []).length} saved study plans</small>
                </div>
              )}
            </div>
            <StudyTimer />
            {!chatOpen && (
              <IconButton icon="chat" label="Open chat" onClick={() => setChatOpen(true)} />
            )}
          </div>
        </header>
        <main
          className={`workspace-scroll view-${view}`}
          id="main-content"
          tabIndex={-1}
          ref={scroll}
        >
          {view === 'dashboard' && (
            <Dashboard
              onTopic={openTopic}
              studySet={studySet}
              onClone={cloneSet}
              onMode={(mode) =>
                setSets((current) =>
                  current.map((set) => (set.id === setId ? { ...set, mode } : set)),
                )
              }
              topics={topics}
              covered={covered}
              onNavigate={navigate}
              onDialog={openDialog}
              onNotify={notify}
              onOpenMaterial={openMaterial}
            />
          )}
          {view === 'plan' && (
            <StudyPlan
              onClone={cloneSet}
              studySet={studySet}
              onTopic={openTopic}
              onDialog={openDialog}
              key={setId + ':' + (plans[setId]?.length ?? 0)}
              plans={plans[setId] ?? []}
              topics={topics}
              covered={covered}
              onRead={openMaterial}
              onReview={(id) =>
                setReviewed((current) => {
                  const list = current[setId] ?? [];
                  return {
                    ...current,
                    [setId]: list.includes(id) ? list.filter((item) => item !== id) : [...list, id],
                  };
                })
              }
            />
          )}
          {view === 'home' && (
            <HomeView
              profileName={displayName}
              companionName={companionName}
              onRead={openMaterial}
              studySet={studySet}
              sets={sets}
              events={events}
              onNavigate={navigate}
              onDialog={openDialog}
              onSelectSet={selectSet}
            />
          )}
          {view === 'sets' && (
            <SetsView sets={sets} onSelectSet={selectSet} onDialog={openDialog} />
          )}
          {view === 'calendar' && (
            <CalendarView
              events={events}
              onAddEvent={(kind, date) => {
                setEventDate(date);
                setDialog(kind);
              }}
            />
          )}
          <div hidden={!['materials', 'document', 'read', 'highlights'].includes(view)}>
            <LibraryView
              key={setId}
              view={
                ['materials', 'document', 'read', 'highlights'].includes(view)
                  ? (view as 'materials' | 'document' | 'read' | 'highlights')
                  : 'materials'
              }
              selectedMaterial={selectedMaterial}
              onSelectMaterial={setSelectedMaterial}
              onMaterialsChange={(materials, nextSources) =>
                setSets((current) =>
                  current.map((item) =>
                    item.id === setId
                      ? { ...item, materials, sources: nextSources ?? item.sources ?? [] }
                      : item,
                  ),
                )
              }
              studySet={studySet}
              onNavigate={navigate}
              onDialog={openDialog}
              onNotify={notify}
              folders={folders[setId] ?? []}
              onFoldersChange={(nextFolders) =>
                setFolders((current) => ({ ...current, [setId]: nextFolders }))
              }
              onUpload={uploadToFolder}
            />
          </div>
          {(view === 'chat' || view === 'tutor') && (
            <ChatPanel
              key={setId}
              sources={
                topicTarget?.view === view
                  ? sources.filter((s) => s.name === topicTarget.source)
                  : sources
              }
              state={chats[setId] ?? emptyChat}
              onStateChange={updateChat}
              companionName={companionName}
              full
              tutor={view === 'tutor'}
              onCollapse={() => setChatOpen(false)}
              onDialog={openDialog}
              onNavigate={navigate}
              onNotify={notify}
            />
          )}
          {view === 'qbank' && (
            <QuestionBanks
              sets={sets}
              onCreate={(id) => {
                setSetId(id);
                navigate('quiz');
                setTopicTarget({ view: 'quiz', source: '', title: '' });
              }}
              onOpen={(id, mode, entryId, retry) => {
                setPracticeVersion((current) => ({ ...current, [mode]: current[mode] + 1 }));
                setSets((current) =>
                  current.map((set) =>
                    set.id === id ? openPractice(set, mode, entryId, retry) : set,
                  ),
                );
                setSetId(id);
                navigate(mode);
              }}
            />
          )}
          {view === 'record' && (
            <LectureStudio
              key={setId}
              setId={setId}
              onTranscript={(source) => addSources([source.name], [source])}
            />
          )}
          {(['quiz', 'test'] as const)
            .filter((tool) => tool === view || visitedTools.includes(tool))
            .map((tool) => (
              <div key={setId + tool} hidden={view !== tool}>
                <SourceQuiz
                  key={
                    practiceVersion[tool] +
                    (topicTarget?.view === tool ? topicTarget.title + topicTarget.source : tool)
                  }
                  preset={topicTarget?.view === tool ? topicTarget : undefined}
                  mode={tool}
                  sources={sources}
                  attempt={studySet.practice?.[tool]}
                  onSave={(attempt, replacing) =>
                    setSets((current) =>
                      current.map((set) =>
                        set.id === setId ? savePractice(set, tool, attempt, replacing) : set,
                      ),
                    )
                  }
                />
              </div>
            ))}
          {(['flashcards', 'audio', 'essay', 'explainers', 'arcade', 'apps'] as const)
            .filter((tool) => tool === view)
            .map((tool) => (
              <Suspense key={setId + tool} fallback={<p>Opening study tools…</p>}>
                <LearningView
                  view={tool}
                  sources={sources}
                  initialMaterial={topicTarget?.source}
                  onSourceChange={changeSource}
                  onNavigate={navigate}
                />
              </Suspense>
            ))}
        </main>
      </div>
      {showChat && (
        <ChatPanel
          key={setId}
          sources={sources}
          state={chats[setId] ?? emptyChat}
          onStateChange={updateChat}
          companionName={companionName}
          onCollapse={() => setChatOpen(false)}
          onDialog={openDialog}
          onNavigate={navigate}
          onNotify={notify}
        />
      )}
      {dialog === 'upload' && (
        <UploadDialog
          existingNames={studySet.materials}
          setName={studySet.name}
          onClose={() => setDialog(null)}
          onAdd={(names, newSources) => {
            addSources(names, newSources ?? []);
            if (uploadTarget) {
              setFolders((current) => ({
                ...current,
                [setId]: (current[setId] ?? []).map((folder) =>
                  folder.name === uploadTarget
                    ? { ...folder, materials: [...new Set([...folder.materials, ...names])] }
                    : folder,
                ),
              }));
            }
            notify(
              `${names.length} material${names.length === 1 ? '' : 's'} added to your study set`,
            );
          }}
          onRecord={() => {
            setDialog(null);
            navigate('record');
          }}
        />
      )}
      {dialog && dialog !== 'upload' && (
        <WorkspaceDialog
          key={dialog}
          replica={replica}
          onOpenMaterial={openMaterial}
          name={dialog}
          profileName={displayName}
          companionName={companionName}
          nextExam={
            events
              .filter((event) => event.kind === 'Exam' && event.date >= localDate())
              .map((event) => event.date)
              .sort()[0]
          }
          defaultDate={eventDate}
          studySet={studySet}
          onClose={() => setDialog(null)}
          onSave={saveDialog}
          onNavigate={navigate}
          onNotify={notify}
        />
      )}
      {toast && (
        <div className="workspace-toast" role="status">
          <Icon name="check-circle" />
          {toast}
          <IconButton icon="close" label="Dismiss notification" onClick={() => setToast('')} />
        </div>
      )}
    </div>
  );
}
