import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { Mascot } from './illustrations';
import { IconButton } from './primitives';
import type { ChatState, DialogName, View } from './demo-data';
import { DictateQuestion } from './dictate-question';
import { answerQuestion, inferenceError } from './local-inference';
import type { StudySource } from './study-source';
import { chatHistoryLimit, switchChat } from './study-history';
import './chat-panel.css';

interface ChatProps {
  sources: readonly StudySource[];
  tutor?: boolean;
  full?: boolean;
  companionName?: string;
  onCollapse: () => void;
  onDialog: (dialog: DialogName) => void;
  onNavigate: (view: View) => void;
  onNotify: (text: string) => void;
  state: ChatState;
  onStateChange: (update: (current: ChatState) => ChatState) => void;
}
export function ChatPanel({
  full = false,
  tutor = false,
  sources,
  companionName = 'Sparky',
  onCollapse,
  onDialog,
  onNavigate,
  onNotify,
  state,
  onStateChange,
}: ChatProps) {
  const { messages, draft, guided } = state;
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [voiceMode, setVoiceMode] = useState(false);
  const [sessionVersion, setSessionVersion] = useState(0);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
      window.speechSynthesis?.cancel();
    },
    [],
  );
  const transcript = useRef<HTMLDivElement>(null);
  useEffect(() => {
    transcript.current?.scrollTo?.({ top: transcript.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);
  function setDraft(value: string) {
    onStateChange((current) => ({ ...current, draft: value }));
  }
  function setGuided(value: boolean) {
    onStateChange((current) => ({ ...current, guided: value }));
  }
  function stop() {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setBusy(false);
  }
  function openChat(id?: string) {
    stop();
    window.speechSynthesis?.cancel();
    setSessionVersion((current) => current + 1);
    setError('');
    onStateChange((current) => switchChat(current, id));
    setHistory(false);
  }
  async function send(text: string, coach = guided || tutor, speak = false) {
    const question = text.trim().slice(0, 1800);
    if (!question || activeRequest.current) return;
    if (!sources.some((source) => source.text.trim())) {
      setError('Add a document or paste notes in this study set first.');
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true);
    setError('');
    const last = messages.at(-1);
    const retry = last?.role === 'user' && last.text === question;
    onStateChange((current) => ({
      ...current,
      draft: '',
      messages: retry
        ? current.messages
        : [
            ...current.messages.slice(-58),
            { id: (current.messages.at(-1)?.id ?? 0) + 1, role: 'user', text: question },
          ],
    }));
    try {
      const answer = await answerQuestion(
        sources,
        question,
        retry ? messages.slice(0, -1) : messages,
        coach,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (speak) readAloud(answer);
      onStateChange((current) => ({
        ...current,
        messages: [
          ...current.messages,
          { id: (current.messages.at(-1)?.id ?? 0) + 1, role: 'assistant', text: answer },
        ],
      }));
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(inferenceError(reason));
        onStateChange((current) => ({ ...current, draft: current.draft || question }));
      }
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setBusy(false);
      }
    }
  }
  function readAloud(text: string) {
    const synthesis = window.speechSynthesis;
    const voice = synthesis
      ?.getVoices()
      .find((entry) => entry.localService && entry.lang.startsWith('en'));
    if (!synthesis || !voice) {
      onNotify('Install a local English speech voice on this device for spoken feedback.');
      return;
    }
    synthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);
    speech.voice = voice;
    synthesis.speak(speech);
  }
  return (
    <aside className={`chat-panel ${full ? 'full-chat' : ''}`} aria-label="AI tutor chat">
      <div className="chat-top">
        <button
          className="text-button"
          aria-label="Chat history"
          onClick={() => setHistory(!history)}
          aria-expanded={history}
        >
          {tutor ? 'Tutor Me' : 'Chat'}
          <Icon name="chevron-down" size={15} />
        </button>
        <span />
        <IconButton icon="plus" label="New chat" onClick={() => openChat()} />
        {!full && <IconButton icon="panel" label="Collapse chat" onClick={onCollapse} />}
      </div>
      {history && (
        <div className="chat-history">
          <h3>Chat history</h3>
          <p>Current chat · {messages.length} messages</p>
          {(state.history ?? []).map((entry) => {
            const title =
              entry.conversation.messages.find((item) => item.role === 'user')?.text ||
              entry.conversation.draft;
            return (
              <button key={entry.id} onClick={() => openChat(entry.id)}>
                <b>{title.slice(0, 100)}</b>
                <small>
                  {entry.conversation.messages.length} messages ·{' '}
                  {new Date(entry.savedAt).toLocaleDateString()}
                </small>
              </button>
            );
          })}
          <small>
            New chat saves the current conversation. This set keeps the last {chatHistoryLimit}{' '}
            saved chats.
          </small>
        </div>
      )}
      <div className="chat-transcript" ref={transcript} role="log" aria-label="Chat transcript">
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <button
              className="mascot-button"
              aria-label="Change Character"
              onClick={() => onDialog('character')}
            >
              <Mascot />
            </button>
            <h2>{tutor ? 'Tutor Me' : 'Hello, I’m ' + companionName}</h2>
            <div className="suggestions">
              {[
                'What is this study set about?',
                'Create a study plan for me',
                'Generate flashcards for this set',
                ...(expanded
                  ? ['Explain a difficult idea from my notes', 'Help me prepare for my exam']
                  : []),
              ].map((text, index) => (
                <button
                  key={text}
                  onClick={() => {
                    if (text === 'Create a study plan for me') onDialog('new-plan');
                    else if (text === 'Generate flashcards for this set') onNavigate('flashcards');
                    else void send(text);
                  }}
                >
                  <span>
                    <Icon name={['sparkles', 'book', 'pencil'][index % 3] ?? 'book'} />
                  </span>
                  {text}
                </button>
              ))}
              <button className="view-more" onClick={() => setExpanded(!expanded)}>
                {expanded ? 'View Less' : 'View More'}
              </button>
            </div>
            <button className="sp-button plugins-button" onClick={() => onDialog('plugins')}>
              <Icon name="app" />
              Plugins
            </button>
            <button
              className="sp-button guided-start"
              onClick={() => {
                setGuided(true);
                void send(
                  'Coach me through one key concept in my material and ask a question.',
                  true,
                );
              }}
            >
              <Icon name="map" />
              Start a Guided Session
              <span>
                <Icon name="arrow-right" />
              </span>
            </button>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={`chat-message ${message.role}`}>
              {message.role === 'assistant' && (
                <div className="message-byline">
                  <Mascot />
                  <b>{companionName}</b>
                  <span>Local AI</span>
                </div>
              )}
              <p>{message.text}</p>
              {message.role === 'assistant' && (
                <div className="message-tools">
                  {tutor && <button onClick={() => readAloud(message.text)}>Read aloud</button>}
                  <button onClick={() => onNavigate('quiz')}>
                    Practice this
                    <Icon name="quiz" size={14} />
                  </button>
                  <button onClick={() => onNavigate('flashcards')}>
                    Flashcards
                    <Icon name="flashcards" size={14} />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
      {busy && (
        <div className="chat-status" role="status">
          Thinking on this device… <button onClick={stop}>Stop</button>
        </div>
      )}
      {error && (
        <p className="chat-status" role="alert">
          {error}
        </p>
      )}
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <div>
          <textarea
            aria-label="Ask your AI tutor anything"
            placeholder="Ask your AI tutor anything..."
            rows={2}
            maxLength={1800}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
          />
          <button
            className="send-button"
            type="submit"
            aria-label="Send message"
            disabled={!draft.trim() || busy}
          >
            <Icon name="arrow-up" size={25} />
          </button>
        </div>
        <div className="composer-actions">
          <IconButton icon="plus" label="Attach material" onClick={() => onDialog('upload')} />
          <button
            type="button"
            className={guided || tutor ? 'guided active' : 'guided'}
            aria-pressed={guided || tutor}
            disabled={tutor}
            onClick={() => setGuided(!guided)}
          >
            <Icon name="map" />
            Guided
          </button>
          <span />
          {tutor && (
            <button
              type="button"
              aria-pressed={voiceMode}
              onClick={() => {
                if (voiceMode) window.speechSynthesis?.cancel();
                else window.speechSynthesis?.getVoices();
                setVoiceMode(!voiceMode);
              }}
            >
              Voice conversation
            </button>
          )}
          <DictateQuestion
            key={sessionVersion}
            disabled={busy}
            onStart={() => {
              if (tutor) window.speechSynthesis?.cancel();
            }}
            onText={(text) => {
              if (tutor && voiceMode) {
                void send(text, true, true);
                return;
              }
              onStateChange((current) => ({
                ...current,
                draft: [current.draft, text].filter(Boolean).join(' ').slice(0, 1800),
              }));
            }}
            onError={setError}
          />
          {!tutor && (
            <button
              type="button"
              className="call-button"
              aria-label="Open tutor session"
              onClick={() => onNavigate('tutor')}
            >
              <Icon name="phone" />
              Tutor Me
            </button>
          )}
        </div>
      </form>
    </aside>
  );
}
