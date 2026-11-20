import { Fragment, useRef, useState } from 'react';
import { Icon } from './icons';
import { IconButton } from './primitives';
import type { HighlightColor, StudySource } from './study-source';

interface ReaderProps {
  source: StudySource;
  onUpdate: (source: StudySource) => void;
  onBack: () => void;
  onDownload: () => void;
  onPractice: () => void;
  onHighlights: () => void;
  onNotify: (text: string) => void;
}

export function SourceReader({
  source,
  onUpdate,
  onBack,
  onDownload,
  onPractice,
  onHighlights,
  onNotify,
}: ReaderProps) {
  const body = useRef<HTMLParagraphElement>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [color, setColor] = useState<HighlightColor>('yellow');
  const marks = source.highlights ?? [];
  function highlight() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !body.current)
      return onNotify('Select a passage in the document first.');
    const range = selection.getRangeAt(0);
    if (range.collapsed || !body.current.contains(range.commonAncestorContainer))
      return onNotify('Select a passage in the document first.');
    const preceding = range.cloneRange();
    preceding.selectNodeContents(body.current);
    preceding.setEnd(range.startContainer, range.startOffset);
    const start = preceding.toString().length;
    const end = start + range.toString().length;
    if (marks.some((item) => item.start < end && item.end > start))
      return onNotify('This selection overlaps an existing highlight.');
    if (marks.length >= 200) return onNotify('This document already has 200 highlights.');
    onUpdate({
      ...source,
      highlights: [...marks, { start, end, color }].sort((a, b) => a.start - b.start),
    });
    selection.removeAllRanges();
    onNotify('Highlight saved.');
  }
  return (
    <div className="reader-view">
      <div className="reader-topline">
        <button className="library-text-button" onClick={onBack}>
          <Icon name="chevron-right" className="reader-back" size={16} />
          Materials
        </button>
        <span>{source.name}</span>
      </div>
      <div className="reader-toolbar">
        <label className="library-select">
          <select
            aria-label="Document zoom"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            {[75, 100, 125, 150].map((v) => (
              <option key={v} value={v}>
                {v}%
              </option>
            ))}
          </select>
        </label>
        <div className="reader-toolbar-spacer" />
        <label className="library-select">
          <select
            aria-label="Highlight color"
            value={color}
            onChange={(e) => {
              const c = e.target.value;
              if (c === 'yellow' || c === 'purple' || c === 'mint') setColor(c);
            }}
          >
            <option value="yellow">Yellow</option>
            <option value="purple">Purple</option>
            <option value="mint">Mint</option>
          </select>
        </label>
        <button className="sp-button" onMouseDown={(e) => e.preventDefault()} onClick={highlight}>
          <Icon name="pencil" size={16} />
          Highlight
        </button>
        <IconButton
          icon="book"
          label={notesOpen ? 'Hide notes' : 'Show notes'}
          onClick={() => setNotesOpen(!notesOpen)}
        />
        <IconButton icon="download" label="Download document text" onClick={onDownload} />
      </div>
      <div className={`reader-body ${notesOpen ? 'reader-with-notes' : ''}`}>
        <div className="reader-scroll">
          <article className="reader-article">
            <h1>{source.name}</h1>
            <p
              ref={body}
              className="imported-text"
              aria-label="Document text"
              style={{ fontSize: `${zoom}%` }}
            >
              {marks.map((mark, i) => (
                <Fragment key={mark.start}>
                  {source.text.slice(marks[i - 1]?.end ?? 0, mark.start)}
                  <mark className={mark.color}>{source.text.slice(mark.start, mark.end)}</mark>
                </Fragment>
              ))}
              {source.text.slice(marks.at(-1)?.end ?? 0)}
            </p>
            <div className="reader-finish">
              <button
                className="sp-button"
                aria-pressed={Boolean(source.reviewed)}
                onClick={() => onUpdate({ ...source, reviewed: !source.reviewed })}
              >
                <Icon name="check-circle" />
                {source.reviewed ? 'Read complete' : 'Mark as read'}
              </button>
              <button className="sp-button dark" onClick={onPractice}>
                Take a practice quiz
              </button>
            </div>
          </article>
        </div>
        {notesOpen && (
          <aside className="reader-notes">
            <div>
              <h2>My notes</h2>
              <IconButton icon="close" label="Close notes" onClick={() => setNotesOpen(false)} />
            </div>
            <textarea
              aria-label="My notes"
              maxLength={20000}
              placeholder="Write a note about this material…"
              value={source.notes ?? ''}
              onChange={(e) => onUpdate({ ...source, notes: e.target.value })}
            />
            <h3>Your highlights</h3>
            {marks.map((mark) => (
              <blockquote key={mark.start} className={mark.color}>
                {source.text.slice(mark.start, mark.end)}
              </blockquote>
            ))}
            <button className="sp-button" onClick={onHighlights}>
              View all highlights
            </button>
          </aside>
        )}
      </div>
    </div>
  );
}
