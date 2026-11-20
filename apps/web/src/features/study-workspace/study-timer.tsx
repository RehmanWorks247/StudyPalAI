import { useWorkspaceAccess, storageKey } from '@/lib/workspace-access';
import { useEffect, useState } from 'react';
import { Icon } from './icons';

interface TimerState {
  remaining: number;
  ends: number | null;
}
const startState: TimerState = { remaining: 25 * 60, ends: null };
function savedTimer(timerKey: string): TimerState {
  try {
    const saved = JSON.parse(sessionStorage.getItem(timerKey) ?? 'null');
    if (
      saved &&
      Number.isInteger(saved.remaining) &&
      saved.remaining >= 0 &&
      saved.remaining <= 3000 &&
      (saved.ends === null || Number.isSafeInteger(saved.ends))
    )
      return saved;
  } catch {
    /* The focus timer can still run when session storage is unavailable. */
  }
  return startState;
}
function remaining(state: TimerState) {
  return state.ends === null
    ? state.remaining
    : Math.max(0, Math.ceil((state.ends - Date.now()) / 1000));
}

export function StudyTimer() {
  const timerKey = storageKey(useWorkspaceAccess(), 'studypal-focus-timer');
  const [open, setOpen] = useState(false);
  const [clock, setClock] = useState(() => savedTimer(timerKey));
  const [seconds, setSeconds] = useState(() => remaining(clock));
  const finished = seconds === 0;
  const active = clock.ends !== null && !finished;
  function update(next: TimerState) {
    setClock(next);
    setSeconds(remaining(next));
    try {
      sessionStorage.setItem(timerKey, JSON.stringify(next));
    } catch {
      /* Keep the in-memory timer running. */
    }
  }
  useEffect(() => {
    if (!active) return;
    const tick = () => setSeconds(remaining(clock));
    const timer = window.setInterval(tick, 500);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [clock, active]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [open]);
  const minutes = Math.floor(seconds / 60);
  const label = finished
    ? 'Finished'
    : active
      ? `${minutes}:${String(seconds % 60).padStart(2, '0')}`
      : `${minutes}m`;
  return (
    <div className="timer-container" data-popover>
      <button
        className="sp-button"
        aria-label={`Study timer: ${label}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name="timer" />
        {label}
      </button>
      {open && (
        <div className="timer-popover">
          <h3>{finished ? 'Session complete' : 'Time to focus'}</h3>
          <div className="timer-digits">
            {minutes}:{String(seconds % 60).padStart(2, '0')}
          </div>
          <div className="timer-presets">
            {[5, 15, 25, 50].map((value) => (
              <button
                key={value}
                onClick={() => {
                  update({ remaining: value * 60, ends: null });
                }}
              >
                {value}m
              </button>
            ))}
          </div>
          <button
            className="sp-button dark"
            onClick={() => {
              const duration = finished ? 1500 : remaining(clock);
              update({ remaining: duration, ends: active ? null : Date.now() + duration * 1000 });
            }}
          >
            <Icon name={active ? 'pause' : 'play'} />
            {finished ? 'Restart' : active ? 'Pause' : 'Start focus session'}
          </button>
          <button
            className="text-button"
            onClick={() => {
              update(startState);
            }}
          >
            Reset timer
          </button>
          <button className="text-button" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}
