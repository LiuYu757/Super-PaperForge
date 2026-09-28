'use client';

import {
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  LoaderCircleIcon,
  StarIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  SearchIcon,
  ImageIcon,
  FileCodeIcon,
  DatabaseIcon,
  ChevronsDownUpIcon,
  CopyIcon,
  DownloadIcon,
  FolderPlusIcon,
  PencilIcon,
  Trash2Icon,
  FileIcon,
  BookOpenIcon,
  FileArchiveIcon,
  ClipboardCopyIcon,
} from 'lucide-react';
import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/store/editor-store';
import { cn } from '@/lib/utils';
import { NewFileDialog } from './new-file-dialog';
import { UploadDialog } from './upload-dialog';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/clipboard';
import { useUiLocale } from '@/lib/ui-locale';
import {
  ApiClientError,
  createFileText,
  deleteFileApi,
  downloadFileBlob,
  fetchFileText,
  renamePath,
  saveBlobAs,
} from '@/lib/api-client';


interface FileEntry {
  id: string;
  path: string;
  mimeType: string | null;
  isBinary: boolean;
  sizeBytes?: number;
}

function formatFileSize(bytes?: number): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileTreeProps {
  projectId: string;
  files: FileEntry[];
  mainFile?: string;
  onRefresh: () => void;
  onMainFileChange?: (path: string) => void;
}

// ---------- file icon helper ----------

function getFileIcon(name: string, className: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'tex':
    case 'ltx':
      return <FileTextIcon className={className} />;
    case 'bib':
    case 'bst':
      return <DatabaseIcon className={className} />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
    case 'ico':
      return <ImageIcon className={className} />;
    case 'cls':
    case 'sty':
    case 'dtx':
    case 'ins':
      return <FileCodeIcon className={className} />;
    case 'pdf':
      return <BookOpenIcon className={className} />;
    case 'zip':
    case 'tar':
    case 'gz':
      return <FileArchiveIcon className={className} />;
    default:
      return <FileIcon className={className} />;
  }
}

// ---------- folder tree helpers ----------

interface TreeFolder {
  type: 'folder';
  name: string;
  fullPath: string;
  children: TreeNode[];
}

interface TreeFile {
  type: 'file';
  entry: FileEntry;
  name: string;
}

type TreeNode = TreeFolder | TreeFile;

function buildTree(files: FileEntry[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split('/');
    let nodes = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i];
      const folderPath = parts.slice(0, i + 1).join('/');
      let folder = nodes.find(
        (n): n is TreeFolder => n.type === 'folder' && n.name === folderName,
      );
      if (!folder) {
        folder = { type: 'folder', name: folderName, fullPath: folderPath, children: [] };
        nodes.push(folder);
      }
      nodes = folder.children;
    }

    nodes.push({ type: 'file', entry: file, name: parts[parts.length - 1] });
  }

  // Sort: folders first, then alphabetical
  function sortNodes(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      const nameA = a.type === 'folder' ? a.name : a.name;
      const nameB = b.type === 'folder' ? b.name : b.name;
      return nameA.localeCompare(nameB);
    });
    for (const n of nodes) {
      if (n.type === 'folder') sortNodes(n.children);
    }
  }
  sortNodes(root);

  return root;
}

function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  const q = query.toLowerCase();
  const result: TreeNode[] = [];
  for (const node of nodes) {
    if (node.type === 'file') {
      if (node.name.toLowerCase().includes(q)) {
        result.push(node);
      }
    } else {
      const filteredChildren = filterTree(node.children, query);
      if (filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren });
      }
    }
  }
  return result;
}

// ---------- indentation guide ----------

function IndentGuides({ depth }: { depth: number }) {
  if (depth === 0) return null;
  return (
    <>
      {Array.from({ length: depth }, (_, i) => (
        <span
          key={i}
          className="absolute top-0 bottom-0 w-px bg-border/50"
          style={{ left: `${i * 12 + 14}px` }}
        />
      ))}
    </>
  );
}

// ---------- file node with right-click context menu ----------

interface FileNodeProps {
  file: FileEntry;
  name: string;
  depth: number;
  projectId: string;
  mainFile?: string;
  loading: string | null;
  onClick: (file: FileEntry) => void;
  onDoubleClick: (file: FileEntry) => void;
  onRename: (file: FileEntry) => void;
  onDelete: (file: FileEntry) => void;
  onSetMain: (file: FileEntry) => void;
  onDuplicate: (file: FileEntry) => void;
  onDownload: (file: FileEntry) => void;
  activeTab: string | null;
  focusedPath: string | null;
}

function FileNode({
  file,
  name,
  depth,
  projectId,
  mainFile,
  loading,
  onClick,
  onDoubleClick,
  onRename,
  onDelete,
  onSetMain,
  onDuplicate,
  onDownload,
  activeTab,
  focusedPath,
}: FileNodeProps) {
  const { t } = useUiLocale();
  const isMain = file.path === mainFile;
  const isActive = activeTab === file.path;
  const isFocused = focusedPath === file.path;
  const isLoading = loading === file.path;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const iconCls = 'size-3.5 shrink-0';
  const isImage = /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(file.path);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            ref={triggerRef}
            data-path={file.path}
            data-type="file"
            onClick={() => onClick(file)}
            onDoubleClick={() => onDoubleClick(file)}
            disabled={file.isBinary || isLoading}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            className={cn(
              'group/filebtn relative flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs transition-colors',
              'hover:bg-accent/60 hover:text-accent-foreground',
              isActive && 'bg-accent text-accent-foreground font-medium',
              isFocused && !isActive && 'ring-1 ring-ring/40',
              file.isBinary && 'opacity-50 cursor-not-allowed',
            )}
            onContextMenu={(e) => {
              e.preventDefault();
              triggerRef.current?.click();
            }}
          />
        }
      >
        <IndentGuides depth={depth} />
        {isLoading ? (
          <LoaderCircleIcon className={cn(iconCls, 'animate-spin text-muted-foreground')} />
        ) : (
          getFileIcon(name, cn(iconCls, 'text-muted-foreground'))
        )}
        <span className="flex-1 truncate">{name}</span>
        {isImage && (
          <span className="absolute left-full top-0 z-50 ml-2 hidden rounded-md border bg-card p-1 shadow-lg group-hover/filebtn:block">
            {/* eslint-disable-next-line @next/next/no-img-element -- hover tooltip for arbitrary project files */}
            <img src={`/api/v1/projects/${projectId}/files/${file.path.split('/').map(encodeURIComponent).join('/')}`} alt={name} className="max-h-24 max-w-32 rounded object-contain" loading="lazy" />
          </span>
        )}
        {file.sizeBytes != null && (
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/50">
            {formatFileSize(file.sizeBytes)}
          </span>
        )}
        {isMain && (
          <StarIcon
            className="size-3 shrink-0 fill-amber-400 text-amber-400"
            aria-label="Main document"
          />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start">
        <DropdownMenuItem onClick={() => onRename(file)}>
          <PencilIcon className="size-3.5 mr-1.5 text-muted-foreground" />
          {t('Rename')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDuplicate(file)}>
          <CopyIcon className="size-3.5 mr-1.5 text-muted-foreground" />
          {t('Duplicate')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDownload(file)}>
          <DownloadIcon className="size-3.5 mr-1.5 text-muted-foreground" />
          {t('Download')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { void copyToClipboard(file.path, 'Path copied'); }}>
          <ClipboardCopyIcon className="size-3.5 mr-1.5 text-muted-foreground" />
          {t('Copy Path')}
        </DropdownMenuItem>
        {!file.isBinary && !isMain && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onSetMain(file)}>
              <StarIcon className="size-3.5 mr-1.5 text-muted-foreground" />
              {t('Set as Main Document')}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onDelete(file)}
          variant="destructive"
        >
          <Trash2Icon className="size-3.5 mr-1.5" />
          {t('Delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------- shared props passed through the tree ----------

interface SharedTreeProps {
  projectId: string;
  mainFile?: string;
  loading: string | null;
  onClick: (file: FileEntry) => void;
  onDoubleClick: (file: FileEntry) => void;
  onRename: (file: FileEntry) => void;
  onDelete: (file: FileEntry) => void;
  onSetMain: (file: FileEntry) => void;
  onDuplicate: (file: FileEntry) => void;
  onDownload: (file: FileEntry) => void;
  activeTab: string | null;
  expandedFolders: Set<string>;
}

// ---------- folder node ----------

interface FolderNodeProps {
  folder: TreeFolder;
  depth: number;
  expanded: boolean;
  onToggle: (path: string) => void;
  onNewFolder: (parentPath: string) => void;
  onRenameFolder: (folderPath: string) => void;
  onDeleteFolder: (folderPath: string) => void;
  focusedPath: string | null;
  shared: SharedTreeProps;
}

function FolderNode({
  folder,
  depth,
  expanded,
  onToggle,
  onNewFolder,
  onRenameFolder,
  onDeleteFolder,
  focusedPath,
  shared,
}: FolderNodeProps) {
  const { t } = useUiLocale();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isFocused = focusedPath === `folder:${folder.fullPath}`;

  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              ref={triggerRef}
              data-path={`folder:${folder.fullPath}`}
              data-type="folder"
              data-folder-path={folder.fullPath}
              onClick={() => onToggle(folder.fullPath)}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
              className={cn(
                'relative flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs text-muted-foreground transition-colors',
                'hover:bg-accent/60 hover:text-accent-foreground',
                isFocused && 'ring-1 ring-ring/40',
              )}
              onContextMenu={(e) => {
                e.preventDefault();
                triggerRef.current?.click();
              }}
            />
          }
        >
          <IndentGuides depth={depth} />
          <span className="inline-flex transition-transform duration-150">
            {expanded ? (
              <ChevronDownIcon className="size-3 shrink-0" />
            ) : (
              <ChevronRightIcon className="size-3 shrink-0" />
            )}
          </span>
          {expanded ? (
            <FolderOpenIcon className="size-3.5 shrink-0 text-amber-500" />
          ) : (
            <FolderIcon className="size-3.5 shrink-0 text-amber-500/70" />
          )}
          <span className="truncate font-medium">{folder.name}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuItem onClick={() => onNewFolder(folder.fullPath)}>
            <FolderPlusIcon className="size-3.5 mr-1.5 text-muted-foreground" />
            {t('New Folder')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onRenameFolder(folder.fullPath)}>
            <PencilIcon className="size-3.5 mr-1.5 text-muted-foreground" />
            {t('Rename')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onDeleteFolder(folder.fullPath)}
            variant="destructive"
          >
            <Trash2Icon className="size-3.5 mr-1.5" />
            {t('Delete Folder')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {expanded && (
        <div className="relative">
          {folder.children.map((node) =>
            node.type === 'folder' ? (
              <FolderNode
                key={node.fullPath}
                folder={node}
                depth={depth + 1}
                expanded={shared.expandedFolders.has(node.fullPath)}
                onToggle={onToggle}
                onNewFolder={onNewFolder}
                onRenameFolder={onRenameFolder}
                onDeleteFolder={onDeleteFolder}
                focusedPath={focusedPath}
                shared={shared}
              />
            ) : (
              <FileNode
                key={node.entry.id}
                file={node.entry}
                name={node.name}
                depth={depth + 1}
                focusedPath={focusedPath}
                projectId={shared.projectId}
                mainFile={shared.mainFile}
                loading={shared.loading}
                onClick={shared.onClick}
                onDoubleClick={shared.onDoubleClick}
                onRename={shared.onRename}
                onDelete={shared.onDelete}
                onSetMain={shared.onSetMain}
                onDuplicate={shared.onDuplicate}
                onDownload={shared.onDownload}
                activeTab={shared.activeTab}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

// ---------- helpers to gather all visible paths in order ----------

function gatherPaths(nodes: TreeNode[], expandedFolders: Set<string>): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.type === 'folder') {
      paths.push(`folder:${node.fullPath}`);
      if (expandedFolders.has(node.fullPath)) {
        paths.push(...gatherPaths(node.children, expandedFolders));
      }
    } else {
      paths.push(node.entry.path);
    }
  }
  return paths;
}

// ---------- main component ----------

export function FileTree({
  projectId,
  files,
  mainFile,
  onRefresh,
  onMainFileChange,
}: FileTreeProps) {
  const { t } = useUiLocale();
  const { openFile, setActiveTab, activeTab, closeTab, tabs } = useEditorStore();
  const [loading, setLoading] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<FileEntry | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [foldersInitialized, setFoldersInitialized] = useState(false);
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameFolderPath, setRenameFolderPath] = useState('');
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const tree = useMemo(() => buildTree(files), [files]);

  // Initialize all folders as expanded
  useEffect(() => {
    if (!foldersInitialized && files.length > 0) {
      const allFolders = new Set<string>();
      const collectFolders = (nodes: TreeNode[]) => {
        for (const n of nodes) {
          if (n.type === 'folder') {
            allFolders.add(n.fullPath);
            collectFolders(n.children);
          }
        }
      };
      collectFolders(tree);
      setExpandedFolders(allFolders);
      setFoldersInitialized(true);
    }
  }, [files, tree, foldersInitialized]);

  const filteredTree = useMemo(
    () => (searchQuery ? filterTree(tree, searchQuery) : tree),
    [tree, searchQuery],
  );

  const visiblePaths = useMemo(
    () => gatherPaths(filteredTree, expandedFolders),
    [filteredTree, expandedFolders],
  );

  const fileCount = files.length;

  function toggleFolder(path: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function collapseAll() {
    setExpandedFolders(new Set());
  }

  async function handleFileClick(file: FileEntry) {
    if (file.isBinary) return;

    const store = useEditorStore.getState();
    if (store.tabs.find((t) => t.path === file.path)) {
      setActiveTab(file.path);
      return;
    }

    setLoading(file.path);
    try {
      // Envelope-validated read (N05): a malformed response throws instead of
      // opening an editable tab with undefined content and a null baseline.
      const data = await fetchFileText(projectId, file.path);
      openFile(file.path, data.content, data.sha256, file.id);
    } catch (err) {
      console.error('Failed to open file:', err);
      toast.error(
        err instanceof ApiClientError ? err.message : 'Failed to open file',
      );
    } finally {
      setLoading(null);
    }
  }

  function handleDoubleClick(file: FileEntry) {
    // Double-click also opens (same behavior, ensures opening even if single-click was prevented)
    void handleFileClick(file);
  }

  function handleRenameStart(file: FileEntry) {
    setRenaming(file);
    setRenameValue(file.path);
  }

  const handleRenameSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!renaming) return;
      const newPath = renameValue.trim();
      if (!newPath || newPath === renaming.path) {
        setRenaming(null);
        return;
      }

      // N02/PR-A: rename is a single atomic server transaction. The old
      // "PUT new path then DELETE old path" flow is gone — its second step
      // ran even when the first failed, which could destroy the only copy.
      try {
        await renamePath(projectId, { kind: 'file', from: renaming.path, to: newPath });
        // Move the open tab along (content, dirty state and baseline are
        // preserved; the server kept the fileId).
        useEditorStore.getState().renameTab(renaming.path, newPath);
        setRenaming(null);
        onRefresh();
        toast.success('File renamed');
      } catch (err) {
        console.error('Rename failed:', err);
        toast.error(
          err instanceof ApiClientError
            ? `${err.message} — the original file was not changed`
            : 'Rename failed — the original file was not changed',
        );
        setRenaming(null);
      }
    },
    [renaming, renameValue, projectId, onRefresh],
  );

  async function handleDelete(file: FileEntry) {
    if (!confirm(`Delete "${file.path}"? This cannot be undone.`)) return;
    try {
      // Conditional delete when we hold a clean baseline for the file; a file
      // that changed on the server must not be removed blindly.
      const tab = tabs.find((t) => t.path === file.path);
      const expected =
        tab && !tab.dirty && tab.baseSha256 ? { expectedSha256: tab.baseSha256 } : undefined;
      await deleteFileApi(projectId, file.path, expected);
      closeTab(file.path);
      onRefresh();
      toast.success('File deleted');
    } catch (err) {
      console.error('Delete failed:', err);
      toast.error(
        err instanceof ApiClientError ? err.message : 'Delete failed',
      );
    }
  }

  async function handleSetMain(file: FileEntry) {
    try {
      const res = await fetch(`/api/v1/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mainFile: file.path }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message =
          typeof body?.error === 'string'
            ? body.error
            : body?.error?.message ?? 'Failed to set main file';
        throw new Error(message);
      }
      onMainFileChange?.(file.path);
      toast.success('Main document updated');
    } catch (err) {
      console.error('Set main file failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to set main file');
    }
  }

  async function handleDuplicate(file: FileEntry) {
    try {
      if (file.isBinary) {
        // Duplicating would need a byte-preserving server-side copy; faking it
        // with an empty text PUT would destroy the content. Refuse instead.
        toast.error('Duplicating binary files is not supported yet');
        return;
      }

      // Read the CURRENT server bytes (or the open tab's latest local draft).
      const tab = tabs.find((t) => t.path === file.path);
      let content: string;
      if (tab) {
        content = tab.content;
      } else {
        const data = await fetchFileText(projectId, file.path);
        content = data.content;
      }

      // Pick a free destination: "main.tex" → "main-copy.tex" → -copy2 …
      const dotIdx = file.path.lastIndexOf('.');
      const basePath = dotIdx > 0 ? file.path.slice(0, dotIdx) : file.path;
      const ext = dotIdx > 0 ? file.path.slice(dotIdx) : '';
      const taken = new Set(files.map((f) => f.path));
      let newPath = `${basePath}-copy${ext}`;
      for (let i = 2; taken.has(newPath); i++) {
        newPath = `${basePath}-copy${i}${ext}`;
      }

      // Create-only: fails loudly when the target exists after all.
      await createFileText(projectId, newPath, content);

      onRefresh();
      toast.success('File duplicated');
    } catch (err) {
      console.error('Duplicate failed:', err);
      toast.error(
        err instanceof ApiClientError ? err.message : 'Duplicate failed',
      );
    }
  }

  async function handleDownload(file: FileEntry) {
    try {
      const blob = await downloadFileBlob(projectId, file.path, file.isBinary);
      saveBlobAs(blob, file.path.split('/').pop() ?? file.path);
    } catch (err) {
      console.error('Download failed:', err);
      toast.error(
        err instanceof ApiClientError ? err.message : 'Download failed',
      );
    }
  }

  // -- Folder operations --

  async function handleNewFolder(parentPath: string | null) {
    setNewFolderParent(parentPath);
    setNewFolderName('');
  }

  async function handleNewFolderSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name) {
      setNewFolderParent(null);
      return;
    }

    const folderPath = newFolderParent ? `${newFolderParent}/${name}` : name;
    // Materialize the folder with a .gitkeep placeholder, create-only: the
    // server refuses when anything already exists at that path.
    try {
      await createFileText(projectId, `${folderPath}/.gitkeep`, '');
      setExpandedFolders((prev) => new Set(prev).add(folderPath));
      setNewFolderParent(null);
      setNewFolderName('');
      onRefresh();
      toast.success('Folder created');
    } catch (err) {
      console.error('Create folder failed:', err);
      toast.error(
        err instanceof ApiClientError ? err.message : 'Failed to create folder',
      );
      setNewFolderParent(null);
    }
  }

  function handleRenameFolderStart(folderPath: string) {
    setRenamingFolder(folderPath);
    setRenameFolderPath(folderPath);
  }

  async function handleRenameFolderSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!renamingFolder) return;
    const newPath = renameFolderPath.trim();
    if (!newPath || newPath === renamingFolder) {
      setRenamingFolder(null);
      return;
    }

    // N02/PR-A: the whole folder moves in ONE server transaction; a
    // destination conflict aborts everything, so a half-renamed folder can
    // never exist. No client-side PUT/DELETE loop anymore.
    try {
      await renamePath(projectId, { kind: 'prefix', from: renamingFolder, to: newPath });
      // Move open tabs along with their files.
      const store = useEditorStore.getState();
      for (const tab of store.tabs) {
        if (tab.path.startsWith(`${renamingFolder}/`)) {
          const dest = `${newPath}${tab.path.slice(renamingFolder.length)}`;
          store.renameTab(tab.path, dest);
        }
      }
      setRenamingFolder(null);
      onRefresh();
      toast.success('Folder renamed');
    } catch (err) {
      console.error('Rename folder failed:', err);
      toast.error(
        err instanceof ApiClientError
          ? `${err.message} — the folder was not changed`
          : 'Rename folder failed — the folder was not changed',
      );
      setRenamingFolder(null);
    }
  }

  async function handleDeleteFolder(folderPath: string) {
    const affectedFiles = files.filter((f) => f.path.startsWith(folderPath + '/'));
    if (
      !confirm(
        `Delete folder "${folderPath}" and its ${affectedFiles.length} file(s)? This cannot be undone.`,
      )
    )
      return;

    // Delete files one by one, but STOP on the first failure: reporting
    // "deleted" after half a folder vanished (or worse, after a server error
    // we ignored) is exactly the false success N05 rules out.
    let deleted = 0;
    try {
      for (const f of affectedFiles) {
        const tab = tabs.find((t) => t.path === f.path);
        const expected =
          tab && !tab.dirty && tab.baseSha256 ? { expectedSha256: tab.baseSha256 } : undefined;
        await deleteFileApi(projectId, f.path, expected);
        closeTab(f.path);
        deleted++;
      }
      onRefresh();
      toast.success(`Folder deleted (${deleted} file${deleted === 1 ? '' : 's'})`);
    } catch (err) {
      console.error('Delete folder failed:', err);
      if (deleted > 0) onRefresh();
      toast.error(
        `${deleted} of ${affectedFiles.length} files were deleted before the failure: ` +
        (err instanceof ApiClientError ? err.message : 'Delete failed'),
      );
    }
  }

  // -- Keyboard navigation --

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return;

    const paths = visiblePaths;
    if (paths.length === 0) return;

    const currentIdx = focusedPath ? paths.indexOf(focusedPath) : -1;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const nextIdx = currentIdx < paths.length - 1 ? currentIdx + 1 : 0;
        setFocusedPath(paths[nextIdx]);
        // Scroll the focused item into view
        const el = treeContainerRef.current?.querySelector(
          `[data-path="${CSS.escape(paths[nextIdx])}"]`,
        );
        el?.scrollIntoView({ block: 'nearest' });
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prevIdx = currentIdx > 0 ? currentIdx - 1 : paths.length - 1;
        setFocusedPath(paths[prevIdx]);
        const el = treeContainerRef.current?.querySelector(
          `[data-path="${CSS.escape(paths[prevIdx])}"]`,
        );
        el?.scrollIntoView({ block: 'nearest' });
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        if (focusedPath?.startsWith('folder:')) {
          const fp = focusedPath.slice(7);
          setExpandedFolders((prev) => new Set(prev).add(fp));
        }
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        if (focusedPath?.startsWith('folder:')) {
          const fp = focusedPath.slice(7);
          setExpandedFolders((prev) => {
            const next = new Set(prev);
            next.delete(fp);
            return next;
          });
        }
        break;
      }
      case 'Enter': {
        e.preventDefault();
        if (!focusedPath) break;
        if (focusedPath.startsWith('folder:')) {
          const fp = focusedPath.slice(7);
          toggleFolder(fp);
        } else {
          const file = files.find((f) => f.path === focusedPath);
          if (file) void handleFileClick(file);
        }
        break;
      }
      case '/': {
        e.preventDefault();
        searchInputRef.current?.focus();
        break;
      }
    }
  }

  const shared: SharedTreeProps = {
    projectId,
    mainFile,
    loading,
    onClick: handleFileClick,
    onDoubleClick: handleDoubleClick,
    onRename: handleRenameStart,
    onDelete: handleDelete,
    onSetMain: handleSetMain,
    onDuplicate: handleDuplicate,
    onDownload: handleDownload,
    activeTab,
    expandedFolders,
  };

  const showRenameForm = renaming !== null;
  const showRenameFolderForm = renamingFolder !== null;
  const showNewFolderForm = newFolderParent !== null;

  return (
    <div
      className="flex h-full flex-col focus:outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <span className="flex flex-1 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Files
          {fileCount > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-medium text-muted-foreground">
              {fileCount}
            </span>
          )}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-6"
          aria-label="New folder"
          onClick={() => handleNewFolder(null)}
        >
          <FolderPlusIcon className="size-3.5" />
        </Button>
        <NewFileDialog projectId={projectId} onCreated={onRefresh} />
        <UploadDialog projectId={projectId} onUploaded={onRefresh} />
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-6"
          aria-label="Collapse all folders"
          onClick={collapseAll}
        >
          <ChevronsDownUpIcon className="size-3.5" />
        </Button>
      </div>

      {/* Search filter */}
      <div className="border-b px-2 py-1.5">
        <div className="relative">
          <SearchIcon className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={t('Filter files... ( / )')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchQuery('');
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="h-6 w-full rounded-md border border-input bg-background pl-7 pr-2 text-xs outline-none placeholder:text-muted-foreground/60 focus:border-ring focus:ring-1 focus:ring-ring/30"
          />
        </div>
      </div>

      {/* Inline rename form (file) */}
      {showRenameForm && (
        <form
          onSubmit={(e) => void handleRenameSubmit(e)}
          className="flex items-center gap-1 border-b px-2 py-1"
        >
          <PencilIcon className="size-3 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setRenaming(null);
            }}
            className="flex-1 rounded border bg-background px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="submit"
            className="rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground hover:bg-primary/90"
          >
            {t('OK')}
          </button>
          <button
            type="button"
            onClick={() => setRenaming(null)}
            className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent"
          >
            {t('Cancel')}
          </button>
        </form>
      )}

      {/* Inline rename form (folder) */}
      {showRenameFolderForm && (
        <form
          onSubmit={(e) => void handleRenameFolderSubmit(e)}
          className="flex items-center gap-1 border-b px-2 py-1"
        >
          <FolderIcon className="size-3 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={renameFolderPath}
            onChange={(e) => setRenameFolderPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setRenamingFolder(null);
            }}
            className="flex-1 rounded border bg-background px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="submit"
            className="rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground hover:bg-primary/90"
          >
            {t('OK')}
          </button>
          <button
            type="button"
            onClick={() => setRenamingFolder(null)}
            className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent"
          >
            {t('Cancel')}
          </button>
        </form>
      )}

      {/* Inline new folder form */}
      {showNewFolderForm && (
        <form
          onSubmit={(e) => void handleNewFolderSubmit(e)}
          className="flex items-center gap-1 border-b px-2 py-1"
        >
          <FolderPlusIcon className="size-3 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            placeholder={newFolderParent ? `${t('Subfolder in')} ${newFolderParent}` : t('Folder name')}
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setNewFolderParent(null);
            }}
            className="flex-1 rounded border bg-background px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="submit"
            className="rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground hover:bg-primary/90"
          >
            {t('Create')}
          </button>
          <button
            type="button"
            onClick={() => setNewFolderParent(null)}
            className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent"
          >
            {t('Cancel')}
          </button>
        </form>
      )}

      <ScrollArea className="flex-1">
        <div ref={treeContainerRef} className="p-1">
          {files.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-3 py-8 text-center">
              <FolderOpenIcon className="size-8 text-muted-foreground/40" />
              <p className="text-xs font-medium text-muted-foreground">{t('No files yet')}</p>
              <p className="text-[10px] text-muted-foreground/60">
                {t('Create a new file or upload one to get started')}
              </p>
            </div>
          ) : filteredTree.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-3 py-6 text-center">
              <SearchIcon className="size-5 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">
                No files matching &ldquo;{searchQuery}&rdquo;
              </p>
            </div>
          ) : (
            filteredTree.map((node) =>
              node.type === 'folder' ? (
                <FolderNode
                  key={node.fullPath}
                  folder={node}
                  depth={0}
                  expanded={expandedFolders.has(node.fullPath)}
                  onToggle={toggleFolder}
                  onNewFolder={handleNewFolder}
                  onRenameFolder={handleRenameFolderStart}
                  onDeleteFolder={handleDeleteFolder}
                  focusedPath={focusedPath}
                  shared={shared}
                />
              ) : (
                <FileNode
                  key={node.entry.id}
                  file={node.entry}
                  name={node.name}
                  depth={0}
                  focusedPath={focusedPath}
                  projectId={shared.projectId}
                  mainFile={shared.mainFile}
                  loading={shared.loading}
                  onClick={shared.onClick}
                  onDoubleClick={shared.onDoubleClick}
                  onRename={shared.onRename}
                  onDelete={shared.onDelete}
                  onSetMain={shared.onSetMain}
                  onDuplicate={shared.onDuplicate}
                  onDownload={shared.onDownload}
                  activeTab={shared.activeTab}
                />
              ),
            )
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
