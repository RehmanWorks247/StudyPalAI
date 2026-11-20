import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { transcribeLecture } from './lecture-transcription';

type Phase = 'idle' | 'permission' | 'recording' | 'transcribing';
export function DictateQuestion({
  onStart,
  onText,
  onError,
  disabled,
}: {
  onStart: () => void;
  onText: (text: string) => void;
  onError: (message: string) => void;
  disabled: boolean;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const cancel = useRef<AbortController | null>(null);
  const active = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function release() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const recorder = active.current;
    if (recorder?.state === 'recording') recorder.stop();
    recorder?.stream.getTracks().forEach((track) => track.stop());
    active.current = null;
  }
  useEffect(
    () => () => {
      cancel.current?.abort();
      release();
    },
    [],
  );
  async function start() {
    if (cancel.current || disabled) return;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined' ||
      typeof OfflineAudioContext === 'undefined'
    ) {
      onError('This browser does not support local voice input. Type your question instead.');
      return;
    }
    onStart();
    const controller = new AbortController();
    cancel.current = controller;
    setPhase('permission');
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (controller.signal.aborted) return;
      const recorder = new MediaRecorder(stream);
      active.current = recorder;
      const parts: Blob[] = [];
      let bytes = 0;
      recorder.ondataavailable = ({ data }) => {
        bytes += data.size;
        if (bytes <= 2 * 1024 * 1024) parts.push(data);
        else if (recorder.state === 'recording') recorder.stop();
      };
      const finished = new Promise<void>((resolve, reject) => {
        recorder.onstop = () => resolve();
        recorder.onerror = () => reject(new Error('Microphone capture failed.'));
      });
      recorder.start(500);
      setPhase('recording');
      timer.current = setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 30_000);
      await finished;
      release();
      if (controller.signal.aborted) return;
      setPhase('transcribing');
      const text = await transcribeLecture(
        new Blob(parts, { type: recorder.mimeType }),
        controller.signal,
        () => undefined,
      );
      if (!controller.signal.aborted) onText(text);
    } catch (reason) {
      if (!controller.signal.aborted)
        onError(
          reason instanceof DOMException && reason.name === 'NotAllowedError'
            ? 'Microphone access was denied. You can still type a question.'
            : 'Voice input failed. Check your microphone and prepare the offline English speech model in Record Lecture.',
        );
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      if (cancel.current === controller) {
        cancel.current = null;
        release();
        if (!controller.signal.aborted) setPhase('idle');
      }
    }
  }
  const label = {
    idle: 'Dictate question',
    permission: 'Waiting for microphone',
    recording: 'Finish dictation',
    transcribing: 'Transcribing question',
  }[phase];
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled || phase === 'permission' || phase === 'transcribing'}
      onClick={() => {
        if (active.current?.state === 'recording') active.current.stop();
        else void start();
      }}
    >
      <Icon
        name={phase === 'recording' ? 'stop' : phase === 'transcribing' ? 'timer' : 'mic'}
        size={18}
      />
      {phase !== 'idle' && <span>{label}</span>}
    </button>
  );
}
