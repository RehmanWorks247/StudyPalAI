import { useState, type FormEvent } from 'react';

import { type DialogName, type StudyFolder, type StudySet, type View } from './demo-data';
import { Icon } from './icons';
import { SourceReader } from './source-reader';
import type { StudySource } from './study-source';
import { DocumentPreview, IconButton, Modal, SearchInput } from './primitives';
import './library-views.css';

interface LibraryViewProps {
  view: 'materials' | 'document' | 'read' | 'highlights';
  studySet: StudySet;
  onNavigate: (view: View) => void;
  onDialog: (name: DialogName) => void;
  onNotify: (text: string) => void;
  folders: StudyFolder[];
  onFoldersChange: (folders: StudyFolder[]) => void;
  onUpload: (folder: string | null) => void;
  selectedMaterial: string;
  onSelectMaterial: (name: string) => void;
  onMaterialsChange: (names: string[], sources?: StudySource[]) => void;
}

function materialType(name: string) {
  if (/\.(mp3|wav|m4a|ogg)$/i.test(name)) return 'Audio';
  if (/\.(mp4|mov|webm)$/i.test(name) || name.startsWith('Video from')) return 'Video';
  if (/\.(png|jpg|jpeg|webp)$/i.test(name)) return 'Images';
  if (/\.(txt|md|markdown|csv)$/i.test(name)) return 'Text';
  if (name.startsWith('Material from')) return 'Websites';
  return 'Documents';
}

export function LibraryView({
  view,
  studySet,
  onNavigate,
  onDialog,
  onNotify,
  folders,
  onFoldersChange,
  onUpload,
  selectedMaterial,
  onSelectMaterial,
  onMaterialsChange,
}: LibraryViewProps) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('All Types');
  const [sort, setSort] = useState('Recent');
  const [listView, setListView] = useState(false);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [removed, setRemoved] = useState<
    { name: string; index: number; folders: string[]; source: StudySource | undefined }[]
  >([]);
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [renameError, setRenameError] = useState('');
  const [highlightFilter, setHighlightFilter] = useState('All colors');
  const selectedSource = studySet.sources?.find((source) => source.name === selectedMaterial);
  const activeFolderData = folders.find((folder) => folder.name === activeFolder);

  const materials = studySet.materials
    .map((name, index) => ({ original: name, name, index }))
    .filter(
      ({ name }) =>
        (!activeFolder || activeFolderData?.materials.includes(name)) &&
        name.toLowerCase().includes(search.toLowerCase()) &&
        (type === 'All Types' || materialType(name) === type),
    )
    .sort((a, b) =>
      sort === 'Name A–Z'
        ? a.name.localeCompare(b.name)
        : sort === 'Oldest'
          ? a.index - b.index
          : b.index - a.index,
    );

  function openMaterial(name: string) {
    onSelectMaterial(name);
    setMenu(null);
    onNavigate('document');
  }

  function downloadMaterial(name: string) {
    const source = studySet.sources?.find((entry) => entry.name === name);
    if (!source) {
      onNotify('Document text is unavailable. Import the file again.');
      return;
    }
    const text = source.text;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name.replace(/\.[^.]+$/, '')}.txt`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMenu(null);
    onNotify('Document text downloaded.');
  }

  function updateSource(next: StudySource) {
    onMaterialsChange(
      studySet.materials,
      studySet.sources?.map((source) => (source.name === next.name ? next : source)),
    );
  }

  function renameMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renaming) return;
    const nextName = draftName.trim();
    if (!nextName) {
      setRenameError('Enter a material name.');
      return;
    }
    if (nextName !== renaming && studySet.materials.includes(nextName)) {
      setRenameError('A material with this name already exists.');
      return;
    }
    onMaterialsChange(
      studySet.materials.map((name) => (name === renaming ? nextName : name)),
      studySet.sources?.map((source) =>
        source.name === renaming ? { ...source, name: nextName } : source,
      ),
    );
    onFoldersChange(
      folders.map((folder) => ({
        ...folder,
        materials: folder.materials.map((name) => (name === renaming ? nextName : name)),
      })),
    );
    if (selectedMaterial === renaming) onSelectMaterial(nextName);
    setRenaming(null);
    setRenameError('');
    onNotify('Material renamed.');
  }

  function removeMaterial(name: string) {
    const index = studySet.materials.indexOf(name);
    if (index < 0) return;
    const remaining = studySet.materials.filter((material) => material !== name);
    setRemoved((previous) => [
      ...previous,
      {
        name,
        index,
        source: studySet.sources?.find((source) => source.name === name),
        folders: folders
          .filter((folder) => folder.materials.includes(name))
          .map((folder) => folder.name),
      },
    ]);
    onMaterialsChange(
      remaining,
      studySet.sources?.filter((source) => source.name !== name),
    );
    onFoldersChange(
      folders.map((folder) => ({
        ...folder,
        materials: folder.materials.filter((material) => material !== name),
      })),
    );
    if (selectedMaterial === name) onSelectMaterial(remaining[0] ?? '');
    setMenu(null);
    onNotify('Material removed. Use Undo to restore it.');
  }

  function undoRemoval() {
    const lastRemoved = removed.at(-1);
    if (!lastRemoved) return;
    const restoredMaterials = [...studySet.materials];
    if (!restoredMaterials.includes(lastRemoved.name)) {
      restoredMaterials.splice(
        Math.min(lastRemoved.index, restoredMaterials.length),
        0,
        lastRemoved.name,
      );
      onMaterialsChange(restoredMaterials, [
        ...(studySet.sources ?? []),
        ...(lastRemoved.source ? [lastRemoved.source] : []),
      ]);
    }
    if (!selectedMaterial) onSelectMaterial(lastRemoved.name);
    onFoldersChange(
      folders.map((folder) =>
        lastRemoved.folders.includes(folder.name)
          ? { ...folder, materials: [...new Set([...folder.materials, lastRemoved.name])] }
          : folder,
      ),
    );
    setRemoved((previous) => previous.slice(0, -1));
    onNotify('Material restored.');
  }

  if (view === 'highlights') {
    const visibleHighlights = (studySet.sources ?? []).flatMap((source) =>
      (source.highlights ?? [])
        .filter(
          (item) =>
            highlightFilter === 'All colors' || item.color === highlightFilter.toLowerCase(),
        )
        .map((item) => ({ ...item, source })),
    );
    return (
      <div className="library-view">
        <div className="library-heading">
          <div className="library-title">
            <span className="library-heading-icon library-yellow">
              <Icon name="pencil" size={30} />
            </span>
            <h1>Highlights</h1>
          </div>
        </div>
        <p className="library-description">All your important ideas, together in one place.</p>
        <div className="library-toolbar">
          <span>{studySet.name}</span>
          <label className="library-select">
            <select
              aria-label="Filter highlight colors"
              value={highlightFilter}
              onChange={(event) => setHighlightFilter(event.target.value)}
            >
              {['All colors', 'Yellow', 'Purple', 'Mint'].map((color) => (
                <option key={color}>{color}</option>
              ))}
            </select>
            <Icon name="chevron-down" size={15} />
          </label>
          <button className="sp-button" onClick={() => onNavigate('read')}>
            <Icon name="book" />
            Read your materials
          </button>
        </div>
        {visibleHighlights.length ? (
          <div className="library-highlight-grid">
            {visibleHighlights.map((highlight) => (
              <article
                className={`library-highlight ${highlight.color}`}
                key={`${highlight.source.name}-${highlight.start}`}
              >
                <div>
                  <Icon name="book" size={16} />
                  <span>{highlight.source.name}</span>
                  <IconButton
                    icon="trash"
                    label="Remove highlight"
                    onClick={() =>
                      updateSource({
                        ...highlight.source,
                        highlights:
                          highlight.source.highlights?.filter((h) => h.start !== highlight.start) ??
                          [],
                      })
                    }
                  />
                </div>
                <blockquote>
                  {highlight.source.text.slice(highlight.start, highlight.end)}
                </blockquote>
                <button
                  className="library-text-button"
                  onClick={() => {
                    onSelectMaterial(highlight.source.name);
                    onNavigate('read');
                  }}
                >
                  View source <Icon name="chevron-right" size={16} />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="library-empty">
            <span className="library-empty-illustration">
              <Icon name="pencil" size={42} />
            </span>
            <h2>Your big ideas belong here</h2>
            <p>
              Select text in a material or study tool, then save a highlight.
              <br />
              Your highlights will be ready whenever you need them.
            </p>
            <button className="sp-button" onClick={() => onNavigate('read')}>
              Start reading
            </button>
          </div>
        )}
      </div>
    );
  }

  if (view === 'document' || view === 'read') {
    if (!selectedSource)
      return (
        <div className="library-empty">
          <h2>Choose a material to read</h2>
          <button className="sp-button" onClick={() => onNavigate('materials')}>
            Open materials
          </button>
        </div>
      );
    return (
      <SourceReader
        key={selectedSource.name}
        source={selectedSource}
        onUpdate={updateSource}
        onBack={() => onNavigate('materials')}
        onHighlights={() => onNavigate('highlights')}
        onPractice={() => onNavigate('quiz')}
        onDownload={() => downloadMaterial(selectedSource.name)}
        onNotify={onNotify}
      />
    );
  }

  return (
    <div className="library-view">
      <div className="library-heading">
        <div className="library-title">
          <span className="library-heading-icon">
            <Icon name={activeFolder ? 'folder' : 'file'} size={30} />
          </span>
          <h1>{activeFolder ?? 'Materials'}</h1>
        </div>
        <div className="library-heading-actions">
          <button className="sp-button" onClick={() => onDialog('folder')}>
            <Icon name="plus" size={17} />
            Folder
          </button>
          <button className="sp-button dark" onClick={() => onUpload(activeFolder)}>
            <Icon name="plus" size={17} />
            Upload Material
          </button>
        </div>
      </div>
      <div className="library-toolbar">
        {activeFolder ? (
          <button className="library-text-button" onClick={() => setActiveFolder(null)}>
            <Icon name="chevron-right" className="reader-back" size={16} />
            All materials
          </button>
        ) : (
          <label className="library-select">
            <select aria-label="Filter study set" defaultValue={studySet.name}>
              <option>{studySet.name}</option>
            </select>
            <Icon name="chevron-down" size={15} />
          </label>
        )}
        <label className="library-select">
          <select
            aria-label="Material type"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            {['All Types', 'Documents', 'Audio', 'Video', 'Images', 'Text', 'Websites'].map(
              (item) => (
                <option key={item}>{item}</option>
              ),
            )}
          </select>
          <Icon name="chevron-down" size={15} />
        </label>
        <label className="library-select">
          <select
            aria-label="Sort materials"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            {['Recent', 'Oldest', 'Name A–Z'].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <Icon name="chevron-down" size={15} />
        </label>
        <div className="library-toolbar-spacer" />
        <div className="library-layout-toggle" aria-label="Material layout">
          <button
            aria-label="Grid view"
            aria-pressed={!listView}
            onClick={() => setListView(false)}
          >
            <Icon name="app" size={18} />
          </button>
          <button aria-label="List view" aria-pressed={listView} onClick={() => setListView(true)}>
            <Icon name="quiz" size={18} />
          </button>
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search materials" />
      </div>
      {removed.length > 0 && (
        <div className="library-undo">
          <span>
            {removed.length} {removed.length === 1 ? 'material' : 'materials'} removed from this
            set.
          </span>
          <button className="library-text-button" onClick={undoRemoval}>
            Undo
          </button>
        </div>
      )}
      {activeFolder && !activeFolderData?.materials.length ? (
        <div className="library-empty">
          <Icon name="folder" size={48} />
          <h2>This folder is ready for your ideas</h2>
          <p>Add a material to get your next study session started.</p>
          <button className="sp-button dark" onClick={() => onUpload(activeFolder)}>
            Add Material
          </button>
        </div>
      ) : (
        <div className={`library-material-grid ${listView ? 'library-list' : ''}`}>
          {!search && type === 'All Types' && (
            <>
              <button className="library-create-card" onClick={() => onUpload(activeFolder)}>
                <Icon name="upload" size={44} />
                <span>Add Material</span>
              </button>
              {!activeFolder && (
                <>
                  <button
                    className="library-create-card library-folder-create"
                    onClick={() => onDialog('folder')}
                  >
                    <Icon name="folder" size={44} />
                    <span>Create Folder</span>
                  </button>
                  {folders.map((folder) => (
                    <button
                      className="library-folder-card"
                      key={folder.name}
                      onClick={() => setActiveFolder(folder.name)}
                    >
                      <Icon name="folder" size={55} />
                      <strong>{folder.name}</strong>
                      <span>
                        {folder.materials.length}{' '}
                        {folder.materials.length === 1 ? 'material' : 'materials'}
                      </span>
                    </button>
                  ))}
                </>
              )}
            </>
          )}
          {materials.map(({ name, original }) => (
            <article className="library-material-card" key={original}>
              <button
                className="library-preview-button"
                aria-label={`Open ${name}`}
                onClick={() => openMaterial(original)}
              >
                {studySet.sources?.some((entry) => entry.name === original) ? (
                  <span className="imported-preview">
                    {studySet.sources.find((entry) => entry.name === original)?.text.slice(0, 280)}
                  </span>
                ) : (
                  <DocumentPreview name={name} text="" />
                )}
              </button>
              <div className="library-card-footer">
                <button className="library-material-name" onClick={() => openMaterial(original)}>
                  <Icon
                    name={
                      materialType(name) === 'Audio'
                        ? 'volume'
                        : materialType(name) === 'Video'
                          ? 'video'
                          : 'file'
                    }
                    size={19}
                  />
                  <span title={name}>{name}</span>
                </button>
                <IconButton
                  icon="more"
                  label={`Options for ${name}`}
                  onClick={() => setMenu(menu === original ? null : original)}
                />
                {menu === original && (
                  <div
                    className="library-material-menu"
                    role="menu"
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setMenu(null);
                    }}
                  >
                    <button
                      role="menuitem"
                      onClick={() => {
                        setRenaming(original);
                        setDraftName(name);
                        setRenameError('');
                        setMenu(null);
                      }}
                    >
                      <Icon name="pencil" size={16} />
                      Rename
                    </button>
                    <button role="menuitem" onClick={() => downloadMaterial(name)}>
                      <Icon name="download" size={16} />
                      Download text
                    </button>
                    <button role="menuitem" onClick={() => removeMaterial(original)}>
                      <Icon name="trash" size={16} />
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {materials.length === 0 && (search || type !== 'All Types') && (
        <div className="library-empty">
          <Icon name="search" size={36} />
          <h2>No materials found</h2>
          <p>Try another search or choose a different material type.</p>
          <button
            className="sp-button"
            onClick={() => {
              setSearch('');
              setType('All Types');
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      {renaming && (
        <Modal title="Rename material" onClose={() => setRenaming(null)}>
          <form className="library-rename-form" onSubmit={renameMaterial}>
            <label>
              Material name
              <input
                value={draftName}
                onChange={(event) => {
                  setDraftName(event.target.value);
                  setRenameError('');
                }}
                aria-invalid={Boolean(renameError)}
                aria-describedby={renameError ? 'material-rename-error' : undefined}
                maxLength={160}
                required
                autoFocus
              />
            </label>
            {renameError && (
              <p id="material-rename-error" role="alert">
                {renameError}
              </p>
            )}
            <div>
              <button type="button" className="sp-button" onClick={() => setRenaming(null)}>
                Cancel
              </button>
              <button className="sp-button dark" type="submit">
                Save changes
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
