import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Drawnix } from '@drawnix/drawnix';
import { PlaitElement, PlaitTheme, Viewport } from '@plait/core';
import styles from './app.module.scss';

type AppValue = {
  children: PlaitElement[];
  viewport?: Viewport;
  theme?: PlaitTheme;
};

type StoredFileMeta = {
  name: string;
  size: number;
  modified: string;
  url: string;
};

type Notice = {
  tone: 'success' | 'error' | 'info';
  message: string;
};

const API_PREFIX = '/api/files';
const createEmptyValue = (): AppValue => ({ children: [] });

const UNTITLED = 'Untitled.drawnix';

const API_ROOT =
  (typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: Record<string, string> })?.env?.[
      'VITE_API_BASE'
    ]) ??
  '';

const resolveApiUrl = (pathName: string) => {
  if (/^https?:\/\//i.test(pathName)) {
    return pathName;
  }
  const normalized = pathName.startsWith('/') ? pathName : `/${pathName}`;
  if (!API_ROOT) {
    return normalized;
  }
  const trimmedBase = API_ROOT.endsWith('/')
    ? API_ROOT.slice(0, -1)
    : API_ROOT;
  return `${trimmedBase}${normalized}`;
};

const hasBoardContent = (value: AppValue) =>
  Array.isArray(value.children) && value.children.length > 0;

const ensureDrawnixName = (input: string) => {
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.toLowerCase().endsWith('.drawnix')
    ? trimmed
    : `${trimmed}.drawnix`;
};

const formatBytes = (size: number) => {
  if (size < 1024) {
    return `${size} B`;
  }
  const kb = size / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
};

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(iso));

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveApiUrl(url), {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.error) {
        message = body.error as string;
      }
    } catch {
      // ignore parse issues
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function App() {
  const shareFile = useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    const globalName = (window as any).__DRAWNIX_PUBLIC_FILE__;
    if (typeof globalName === 'string' && globalName.trim()) {
      return globalName.trim();
    }
    if (window.location.pathname.startsWith('/public/')) {
      return decodeURIComponent(window.location.pathname.replace('/public/', ''));
    }
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('public');
    return fromQuery;
  }, []);

  if (shareFile) {
    return <PublicViewer fileName={shareFile} />;
  }

  const [value, setValue] = useState<AppValue>(createEmptyValue());
  const [tutorial, setTutorial] = useState(true);
  const [files, setFiles] = useState<StoredFileMeta[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>(UNTITLED);
  const [isDirty, setIsDirty] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<number>();

  const sortedFiles = useMemo(
    () =>
      [...files].sort(
        (a, b) =>
          new Date(b.modified).getTime() - new Date(a.modified).getTime()
      ),
    [files]
  );

  useEffect(() => {
    return () => {
      if (noticeTimer.current) {
        window.clearTimeout(noticeTimer.current);
      }
    };
  }, []);

  const pushNotice = useCallback((tone: Notice['tone'], message: string) => {
    setNotice({ tone, message });
    if (noticeTimer.current) {
      window.clearTimeout(noticeTimer.current);
    }
    noticeTimer.current = window.setTimeout(
      () => setNotice(null),
      tone === 'error' ? 6000 : 3500
    );
  }, []);

  const refreshFiles = useCallback(async () => {
    try {
      const data = await apiRequest<StoredFileMeta[]>(API_PREFIX);
      setFiles(data);
    } catch (error) {
      console.error(error);
      pushNotice('error', error instanceof Error ? error.message : 'Failed to load files');
    }
  }, [pushNotice]);

  useEffect(() => {
    refreshFiles();
  }, [refreshFiles]);

  const loadFile = useCallback(
    async (name: string) => {
      setIsLoadingFile(true);
      try {
        const data = await apiRequest<AppValue>(
          `${API_PREFIX}/${encodeURIComponent(name)}`
        );
        setValue(data);
        setTutorial(!hasBoardContent(data));
        setSelectedFile(name);
        setFileName(name);
        setIsDirty(false);
        pushNotice('info', `Loaded ${name}`);
      } catch (error) {
        console.error(error);
        pushNotice(
          'error',
          error instanceof Error ? error.message : 'Failed to load file'
        );
      } finally {
        setIsLoadingFile(false);
      }
    },
    [pushNotice]
  );

  const handleNewFile = () => {
    setSelectedFile(null);
    const uniqueUntitled = getUntitledName(files);
    setFileName(uniqueUntitled);
    const nextValue = createEmptyValue();
    setValue(nextValue);
    setTutorial(true);
    setIsDirty(false);
  };

  const handleDelete = async () => {
    if (!selectedFile) {
      return;
    }
    const confirmDelete = window.confirm(
      `Delete ${selectedFile}? This action cannot be undone.`
    );
    if (!confirmDelete) {
      return;
    }
    try {
      await apiRequest<void>(
        `${API_PREFIX}/${encodeURIComponent(selectedFile)}`,
        {
          method: 'DELETE'
        }
      );
      pushNotice('success', `Deleted ${selectedFile}`);
      setFiles((prev) => prev.filter((file) => file.name !== selectedFile));
      setSelectedFile(null);
      setValue(createEmptyValue());
      setTutorial(true);
      setFileName(getUntitledName(files));
      setIsDirty(false);
      await refreshFiles();
    } catch (error) {
      console.error(error);
      pushNotice(
        'error',
        error instanceof Error ? error.message : 'Failed to delete file'
      );
    }
  };

  const handleSave = async () => {
    const desiredName = ensureDrawnixName(fileName);
    if (!desiredName) {
      pushNotice('error', 'Enter a file name before saving.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = JSON.stringify({
        name: desiredName,
        content: value
      });
      const previousName = selectedFile;
      const meta = selectedFile
        ? await apiRequest<StoredFileMeta>(
            `${API_PREFIX}/${encodeURIComponent(selectedFile)}`,
            {
              method: 'PUT',
              body: payload
            }
          )
        : await apiRequest<StoredFileMeta>(API_PREFIX, {
            method: 'POST',
            body: payload
          });
      setSelectedFile(meta.name);
      setFileName(meta.name);
      setIsDirty(false);
      setTutorial(!hasBoardContent(value));
      setFiles((prev) => {
        const filtered = prev.filter(
          (file) => file.name !== meta.name && file.name !== previousName
        );
        return [...filtered, meta];
      });
      await refreshFiles();
      pushNotice('success', `Saved ${meta.name}`);
    } catch (error) {
      console.error(error);
      pushNotice(
        'error',
        error instanceof Error ? error.message : 'Failed to save file'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyLink = async (meta: StoredFileMeta) => {
    try {
      if ('clipboard' in navigator) {
        await navigator.clipboard.writeText(meta.url);
        pushNotice('success', 'Public link copied to clipboard.');
      } else {
        pushNotice('info', `Public link: ${meta.url}`);
      }
    } catch (error) {
      console.error(error);
      pushNotice(
        'error',
        error instanceof Error ? error.message : 'Unable to copy link'
      );
    }
  };

  const boardLoading = isLoadingFile || isSaving;
  const desiredName = ensureDrawnixName(fileName);
  const activeFileMeta = selectedFile
    ? files.find((file) => file.name === selectedFile)
    : undefined;
  const nameChanged = selectedFile
    ? desiredName !== selectedFile
    : desiredName.length > 0;
  const canSave = !boardLoading && !!desiredName && (isDirty || nameChanged);
  const boardClassName = boardLoading
    ? `${styles.boardWrapper} ${styles.boardDisabled}`
    : styles.boardWrapper;

  return (
    <div className={styles.app}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.brand}>Drawnix Storage</div>
          <p className={styles.subtitle}>
            Manage, edit, and share .drawnix boards from persistent storage.
          </p>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={handleNewFile}
          >
            + New board
          </button>
        </div>
        <div className={styles.fileList}>
          {sortedFiles.length === 0 ? (
            <div className={styles.emptyList}>
              <p>No stored boards yet.</p>
              <p>Create one to get started.</p>
            </div>
          ) : (
            sortedFiles.map((file) => (
              <button
                key={file.name}
                className={
                  file.name === selectedFile
                    ? `${styles.fileItem} ${styles.activeFile}`
                    : styles.fileItem
                }
                type="button"
                onClick={() => loadFile(file.name)}
              >
                <div className={styles.fileName}>{file.name}</div>
                <div className={styles.fileMeta}>
                  <span>{formatBytes(file.size)}</span>
                  <span>{formatDate(file.modified)}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>
      <section className={styles.editor}>
        <header className={styles.toolbar}>
          <input
            className={styles.fileNameInput}
            value={fileName}
            onChange={(event) => setFileName(event.target.value)}
            placeholder="Enter file name"
          />
          <div className={styles.toolbarActions}>
            {activeFileMeta ? (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => handleCopyLink(activeFileMeta)}
              >
                Copy link
              </button>
            ) : null}
            {activeFileMeta ? (
              <a
                className={styles.secondaryButton}
                href={activeFileMeta.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open link
              </a>
            ) : null}
            {selectedFile ? (
              <button
                type="button"
                className={styles.dangerButton}
                onClick={handleDelete}
              >
                Delete
              </button>
            ) : null}
            <button
              type="button"
              className={styles.saveButton}
              onClick={handleSave}
              disabled={!canSave}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </header>
        {notice ? (
          <div className={`${styles.notice} ${styles[notice.tone]}`}>
            {notice.message}
          </div>
        ) : null}
        <div className={boardClassName}>
          <Drawnix
            value={value.children}
            viewport={value.viewport}
            theme={value.theme}
            tutorial={tutorial}
            onChange={(updated) => {
              const newValue = updated as AppValue;
              setValue(newValue);
              setTutorial(!hasBoardContent(newValue));
              setIsDirty(true);
            }}
            afterInit={() => {
              console.log('Drawnix board ready');
            }}
          />
          {boardLoading ? (
            <div className={styles.loadingBackdrop}>
              <span>{isSaving ? 'Saving…' : 'Loading…'}</span>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function getUntitledName(files: StoredFileMeta[]) {
  const existing = new Set(files.map((file) => file.name));
  if (!existing.has(UNTITLED)) {
    return UNTITLED;
  }
  let index = 2;
  while (existing.has(`Untitled ${index}.drawnix`)) {
    index += 1;
  }
  return `Untitled ${index}.drawnix`;
}

export default App;

type PublicViewerProps = {
  fileName: string;
};

function PublicViewer({ fileName }: PublicViewerProps) {
  const [value, setValue] = useState<AppValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const data = await apiRequest<AppValue>(
          `${API_PREFIX}/${encodeURIComponent(fileName)}`
        );
        if (!cancelled) {
          setValue(data);
          setError(null);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Unable to load board content.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [fileName]);

  const boardValue = value ?? createEmptyValue();

  return (
    <div className={styles.shareContainer}>
      <header className={styles.shareHeader}>
        <div>
          <div className={styles.shareLabel}>Shared board</div>
          <div className={styles.shareTitle}>{fileName}</div>
        </div>
        <a
          className={styles.secondaryButton}
          href={`${API_PREFIX}/${encodeURIComponent(fileName)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Download JSON
        </a>
      </header>
      <div className={styles.shareBoard}>
        <Drawnix
          value={boardValue.children}
          viewport={boardValue.viewport}
          theme={boardValue.theme}
          tutorial={false}
          onChange={(updated) => {
            setValue(updated as AppValue);
          }}
          afterInit={() => {
            console.log('Share board ready');
          }}
        />
        {loading ? (
          <div className={styles.shareStatus}>Loading board…</div>
        ) : null}
        {error ? (
          <div className={styles.shareStatus}>{error}</div>
        ) : null}
      </div>
    </div>
  );
}
