import { readStudyFile } from './document-import';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

import { Icon } from './icons';
import { ToolIllustration } from './illustrations';
import {
  acceptedDocumentTypes,
  createSource,
  ImportError,
  maxSourceCharacters,
  type StudySource,
} from './study-source';
import './upload-dialog.css';

interface UploadDialogProps {
  setName: string;
  onClose: () => void;
  onAdd: (names: string[], sources?: StudySource[]) => void;
  existingNames?: string[];
  onRecord: () => void;
}

export function UploadDialog({
  setName,
  onClose,
  onAdd,
  onRecord,
  existingNames = [],
}: UploadDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const statusId = useId();
  const importing = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [selection, setSelection] = useState<{ name: string; source?: StudySource }[]>([]);
  const [pasting, setPasting] = useState(false);
  const [importValue, setImportValue] = useState('');
  const [materialTitle, setMaterialTitle] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    return () => {
      importing.current?.abort();
      if (dialog?.open && typeof dialog.close === 'function') dialog.close();
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  function addSelection(item: { name: string; source?: StudySource }) {
    if (selection.length >= 20) throw new ImportError('Add up to 20 materials at a time.');
    if ([...existingNames, ...selection.map((entry) => entry.name)].includes(item.name)) {
      throw new ImportError('A material with this name already exists. Choose another name.');
    }
    setSelection((current) => [...current, item]);
    setError('');
    setStatus('Material ready to add.');
  }

  async function importFiles(files: File[]) {
    if (!files.length || importing.current) return;
    if (selection.length + files.length > 20) {
      setError('Choose up to 20 materials at a time.');
      return;
    }
    const controller = new AbortController();
    importing.current = controller;
    setBusy(true);
    setError('');
    const failures: string[] = [];
    const used = new Set([...existingNames, ...selection.map((entry) => entry.name)]);
    try {
      for (const file of files) {
        setStatus(`Reading ${file.name}…`);
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(150000)]);
        try {
          const source = await readStudyFile(file, signal);
          signal.throwIfAborted();
          if (used.has(source.name))
            throw new ImportError('A material with this name already exists.');
          used.add(source.name);
          setSelection((current) => [...current, { name: source.name, source }]);
        } catch (failure) {
          if (controller.signal.aborted) return;
          failures.push(
            `${file.name}: ${signal.aborted ? 'Reading timed out. Try a smaller document.' : failure instanceof ImportError ? failure.message : 'Unable to read this file.'}`,
          );
        }
      }
      setStatus(failures.length === files.length ? '' : 'Documents ready to add.');
      setError(failures.join(' '));
    } finally {
      importing.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function chooseFiles(accept = acceptedDocumentTypes) {
    const input = fileInputRef.current;
    if (!input || busy) return;
    input.accept = accept;
    input.click();
  }

  function submitImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const source = createSource(`${materialTitle.trim() || 'Class notes'}.txt`, importValue);
      addSelection({ name: source.name, source });
      setPasting(false);
      setImportValue('');
      setMaterialTitle('');
    } catch (error) {
      setError(error instanceof ImportError ? error.message : 'Unable to add text.');
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
    if (event.key !== 'Tab') return;
    const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([type="hidden"]):not([hidden]), textarea, select, a[href]',
    );
    const first = controls?.[0];
    const last = controls?.[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="upload-modal"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={handleKeyDown}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="upload-content">
        <header className="upload-header">
          <h2 id={titleId}>Add materials</h2>
          <button className="upload-icon-button" aria-label="Close add materials" onClick={onClose}>
            <Icon name="close" size={22} />
          </button>
        </header>

        <label className="upload-set-picker">
          <span className="upload-set-thumbnail">
            <ToolIllustration kind="set" />
          </span>
          <select aria-label="Study set" defaultValue={setName}>
            <option value={setName}>{setName}</option>
          </select>
          <Icon name="chevron-down" size={18} />
        </label>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptedDocumentTypes}
          disabled={busy}
          hidden
          aria-label="Choose materials"
          onChange={(event) => {
            void importFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />

        {pasting ? (
          <form className="upload-import-form" onSubmit={submitImport}>
            <button type="button" className="upload-text-button" onClick={() => setPasting(false)}>
              <Icon name="chevron-right" className="upload-back-icon" /> All upload types
            </button>
            <h3>Paste text</h3>
            <label>
              Material title <span>(optional)</span>
              <input
                value={materialTitle}
                maxLength={120}
                onChange={(event) => setMaterialTitle(event.target.value)}
                placeholder="e.g. Mechanics lecture notes"
              />
            </label>
            <label>
              Your text
              <textarea
                value={importValue}
                onChange={(event) => setImportValue(event.target.value)}
                placeholder="Paste your class notes here…"
                rows={6}
                maxLength={maxSourceCharacters}
                required
              />
            </label>
            <button className="upload-primary" type="submit">
              Add to selection
            </button>
          </form>
        ) : (
          <section
            className={`upload-dropzone${dragging ? ' upload-dragging' : ''}`}
            aria-label="Upload materials"
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(event) => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget instanceof Node ? event.relatedTarget : null,
                )
              )
                setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void importFiles(Array.from(event.dataTransfer.files));
            }}
          >
            <ToolIllustration kind="upload" className="upload-art" />
            <h3>Add class materials</h3>
            <p className="upload-drop-label">
              <button className="upload-text-button" onClick={() => chooseFiles()}>
                Click to upload
              </button>{' '}
              or drag and drop files here
            </p>
            <div className="upload-type-grid">
              <button disabled={busy} onClick={() => chooseFiles('.pdf')}>
                <span className="upload-file-icon">PDF</span>PDF documents
              </button>
              <button disabled={busy} onClick={() => chooseFiles('.png,.jpg,.jpeg')}>
                <Icon name="file" />
                Scanned images
              </button>
              <button disabled={busy} onClick={() => chooseFiles('.pptx')}>
                <span className="upload-file-icon">PPT</span>PowerPoint slides
              </button>
              <button disabled={busy} onClick={() => chooseFiles('.docx')}>
                <Icon name="file" /> Word documents
              </button>
              <button disabled={busy} onClick={() => chooseFiles('.txt,.md,.markdown,.csv')}>
                <Icon name="book" /> Text &amp; Markdown
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setPasting(true);
                  setError('');
                }}
              >
                <Icon name="pencil" /> Paste Text
              </button>
            </div>
            <p className="upload-note">
              Reads documents and recognizes printed English in scanned PDF pages, PNG and JPEG
              images on this device.
            </p>
          </section>
        )}

        {error && (
          <p className="upload-error" role="alert">
            {error}
          </p>
        )}
        {selection.length > 0 && (
          <section className="upload-selection" aria-label="Selected materials">
            <h3>
              {selection.length} {selection.length === 1 ? 'material' : 'materials'} selected
            </h3>
            <ul>
              {selection.map(({ name }) => (
                <li key={name}>
                  <Icon name="file" size={18} />
                  <span>{name}</span>
                  <button
                    className="upload-icon-button"
                    aria-label={`Remove ${name}`}
                    disabled={busy}
                    onClick={() => setSelection(selection.filter((item) => item.name !== name))}
                  >
                    <Icon name="close" size={16} />
                  </button>
                </li>
              ))}
            </ul>
            <button
              className="upload-primary"
              disabled={busy}
              onClick={() => {
                onAdd(
                  selection.map((item) => item.name),
                  selection.flatMap((item) => (item.source ? [item.source] : [])),
                );
                onClose();
              }}
            >
              Add materials
            </button>
          </section>
        )}

        <div className="upload-banner upload-lecture">
          <Icon name="mic" size={24} />
          <div>
            <h3>Are you in class? Start a live lecture</h3>
            <p>Capture audio from your microphone and review it after class.</p>
          </div>
          <button
            className="upload-pill"
            onClick={() => {
              onClose();
              onRecord();
            }}
          >
            <Icon name="mic" size={18} />
            Start Recording
          </button>
        </div>
        <footer className="upload-footer">
          <p className="upload-note" id={statusId} role="status">
            {status || 'Files are processed on this device.'}
          </p>
        </footer>
      </div>
    </dialog>
  );
}
