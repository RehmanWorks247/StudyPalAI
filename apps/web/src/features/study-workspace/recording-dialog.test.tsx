import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RecordingDialog } from './recording-dialog';

interface TestStream {
  getTracks: () => { stop: () => void }[];
}

const recorderInstances: TestRecorder[] = [];
class TestRecorder {
  static isTypeSupported(type: string) {
    return type === 'audio/webm;codecs=opus';
  }

  state: RecordingState = 'inactive';
  mimeType = 'audio/webm;codecs=opus';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    recorderInstances.push(this);
  }

  start() {
    this.state = 'recording';
  }

  pause() {
    this.state = 'paused';
  }

  resume() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['recorded-audio'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
const stopTrack = vi.fn();
const getUserMedia = vi.fn<() => Promise<TestStream>>();
const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:lecture-recording');
const revokeObjectURL = vi.fn<(url: string) => void>();

beforeEach(() => {
  recorderInstances.length = 0;
  stopTrack.mockReset();
  getUserMedia.mockReset();
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  vi.stubGlobal('MediaRecorder', TestRecorder);
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
  else Reflect.deleteProperty(navigator, 'mediaDevices');
});

describe('lecture recording', () => {
  it('requests microphone access on Start and supports retry after permission is denied', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    render(<RecordingDialog onClose={vi.fn()} onSaveRecording={vi.fn()} />);
    expect(getUserMedia).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Microphone access was denied');
    expect(screen.getByRole('button', { name: 'Start recording' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    expect(await screen.findByRole('button', { name: 'Finish recording' })).toBeEnabled();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it('releases a microphone that becomes available after the dialog closes', async () => {
    let resolvePermission: ((stream: TestStream) => void) | undefined;
    getUserMedia.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePermission = resolve;
        }),
    );
    const view = render(<RecordingDialog onClose={vi.fn()} onSaveRecording={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for microphone permission');
    view.unmount();
    await act(async () => {
      resolvePermission?.({ getTracks: () => [{ stop: stopTrack }] });
    });
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(recorderInstances).toHaveLength(0);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('captures audio, pauses and resumes, and transfers a saved recording to the workspace', async () => {
    const onSave = vi.fn();
    const view = render(<RecordingDialog onClose={vi.fn()} onSaveRecording={onSave} />);
    fireEvent.change(screen.getByLabelText('Lecture title'), {
      target: { value: 'Physics lecture' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('status')).toHaveTextContent('Recording paused');
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByRole('status')).toHaveTextContent('Recording your lecture');
    fireEvent.click(screen.getByRole('button', { name: 'Finish recording' }));

    expect(await screen.findByRole('button', { name: 'Save recording' })).toBeEnabled();
    expect(stopTrack).toHaveBeenCalled();
    const audio = createObjectURL.mock.calls[0]?.[0];
    expect(audio).toBeInstanceOf(Blob);
    expect(audio?.size).toBeGreaterThan(0);
    expect(audio?.type).toBe('audio/webm;codecs=opus');
    expect(screen.getByLabelText('Preview lecture recording')).toHaveAttribute(
      'src',
      'blob:lecture-recording',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save recording' }));
    expect(onSave).toHaveBeenCalledWith('Physics lecture', audio, expect.any(Number));
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:lecture-recording');
  });

  it('releases microphone tracks when a live recording is discarded', async () => {
    const onClose = vi.fn();
    const view = render(<RecordingDialog onClose={onClose} onSaveRecording={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    await screen.findByRole('button', { name: 'Finish recording' });
    fireEvent.click(screen.getByRole('button', { name: 'Close Record lecture' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard recording' }));
    expect(onClose).toHaveBeenCalledOnce();
    view.unmount();
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('revokes an unsaved preview URL when the dialog closes', async () => {
    const view = render(<RecordingDialog onClose={vi.fn()} onSaveRecording={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Finish recording' }));
    await screen.findByRole('button', { name: 'Save recording' });
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:lecture-recording');
  });
});
