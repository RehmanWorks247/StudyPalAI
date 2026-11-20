import type { Model } from 'vosk-browser';

const modelPath = '/speech-models/vosk-model-small-en-us-0.15.tar.gz';

async function loadSpeechModel(signal: AbortSignal): Promise<Model> {
  const { Model } = await import('vosk-browser');
  signal.throwIfAborted();
  const model = new Model(new URL(modelPath, window.location.origin).href, -2);
  try {
    await new Promise<void>((resolve, reject) => {
      const abort = () => reject(new Error('Speech model setup was interrupted.'));
      signal.addEventListener('abort', abort, { once: true });
      model.on('load', (event) => {
        signal.removeEventListener('abort', abort);
        if (event.event === 'load' && event.result) resolve();
        else reject(new Error('The speech model could not be opened.'));
      });
      model.on('error', () => {
        signal.removeEventListener('abort', abort);
        reject(
          new Error(
            'Could not load the English speech model. Check your connection or free storage and retry.',
          ),
        );
      });
    });
    return model;
  } catch (error) {
    model.terminate();
    throw error;
  }
}

export async function prepareSpeechModel(cancel: AbortSignal) {
  const signal = AbortSignal.any([cancel, AbortSignal.timeout(180_000)]);
  const model = await loadSpeechModel(signal);
  model.terminate();
}

export async function transcribeLecture(
  audio: Blob,
  cancel: AbortSignal,
  onProgress: (percent: number) => void,
): Promise<string> {
  const signal = AbortSignal.any([cancel, AbortSignal.timeout(45 * 60_000)]);
  signal.throwIfAborted();
  const sampleRate = 16_000;
  const buffer = await new OfflineAudioContext(1, 1, sampleRate).decodeAudioData(
    await audio.arrayBuffer(),
  );
  signal.throwIfAborted();
  const model = await loadSpeechModel(AbortSignal.any([signal, AbortSignal.timeout(180_000)]));
  try {
    signal.throwIfAborted();
    const recognizer = new model.KaldiRecognizer(sampleRate);
    const samples = buffer.getChannelData(0);
    return await new Promise<string>((resolve, reject) => {
      let offset = 0;
      let flushing = false;
      const words: string[] = [];
      const abort = () => reject(new Error('Transcription was interrupted.'));
      signal.addEventListener('abort', abort, { once: true });
      const finish = () => signal.removeEventListener('abort', abort);
      const step = () => {
        if (signal.aborted) return;
        try {
          if (offset >= samples.length) {
            flushing = true;
            recognizer.retrieveFinalResult();
          } else {
            const end = Math.min(offset + sampleRate, samples.length);
            recognizer.acceptWaveformFloat(samples.subarray(offset, end), sampleRate);
            offset = end;
          }
        } catch {
          finish();
          reject(new Error('This browser could not process the audio.'));
        }
      };
      recognizer.on('error', () => {
        finish();
        reject(new Error('The local recognizer could not transcribe this recording.'));
      });
      recognizer.on('result', (message) => {
        if (message.event !== 'result') return;
        if (message.result.text) words.push(message.result.text);
        if (flushing) {
          finish();
          const text = words.join(' ').trim();
          if (!text)
            reject(
              new Error(
                'No intelligible speech was detected. Try a clearer recording or enter notes.',
              ),
            );
          else if (text.length > 100_000)
            reject(new Error('Transcript exceeds the 100,000 character limit.'));
          else resolve(text);
        } else {
          onProgress(Math.floor((100 * offset) / samples.length));
          step();
        }
      });
      recognizer.on('partialresult', () => {
        onProgress(Math.floor((100 * offset) / samples.length));
        step();
      });
      step();
    });
  } finally {
    model.terminate();
  }
}
