import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './icons';

export function IconButton({
  icon,
  label,
  onClick,
  className = '',
}: {
  icon: string;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}

export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    if (dialog && typeof dialog.showModal === 'function') dialog.showModal();
    else dialog?.setAttribute('open', '');
    return () => {
      dialog?.close?.();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`sp-modal ${wide ? 'wide' : ''}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        closeRef.current();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-content">
        <div className="modal-heading">
          <h2>{title}</h2>
          <IconButton icon="close" label={`Close ${title}`} onClick={onClose} />
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="search-input">
      <Icon name="search" />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function DocumentPreview({ name, text }: { name: string; text: string }) {
  return (
    <div className="document-preview" aria-hidden="true">
      <div className="paper-kicker">STUDY MATERIAL</div>
      <strong>{name}</strong>
      {text
        .slice(0, 900)
        .split(/\n+/)
        .filter(Boolean)
        .slice(0, 6)
        .map((line, i) => (
          <p key={i}>{line}</p>
        ))}
    </div>
  );
}
