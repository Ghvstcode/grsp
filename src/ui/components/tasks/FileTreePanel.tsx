import { useState } from "react";
import {
    ChevronRight,
    ChevronDown,
    File,
    FileCode2,
    FileJson,
    FileText,
    FileImage,
    Folder,
    FolderOpen,
    Cog,
    Terminal,
    Database,
} from "lucide-react";
import { useDirectoryListing, type DirEntry } from "@core/api/useFileTree";

interface FileTreePanelProps {
    repoPath: string;
    onFileSelect: (relativePath: string) => void;
    activeFile: string | undefined;
}

// ── File icon by extension ──────────────────────────────────

const CODE_EXTS = new Set([
    "ts",
    "tsx",
    "js",
    "jsx",
    "rs",
    "py",
    "go",
    "java",
    "kt",
    "rb",
    "c",
    "cpp",
    "h",
    "hpp",
    "cs",
    "swift",
    "svelte",
    "vue",
    "html",
    "css",
    "scss",
    "sass",
    "less",
    "xml",
]);

const CONFIG_EXTS = new Set([
    "toml",
    "yaml",
    "yml",
    "ini",
    "env",
    "lock",
    "editorconfig",
]);

const DATA_EXTS = new Set(["json", "jsonl", "csv", "sql", "graphql"]);

const IMAGE_EXTS = new Set([
    "png",
    "jpg",
    "jpeg",
    "gif",
    "svg",
    "ico",
    "webp",
    "bmp",
]);

const SCRIPT_EXTS = new Set(["sh", "bash", "zsh", "fish", "ps1", "bat"]);

function FileIcon({
    name,
    extension,
    className,
}: {
    name: string;
    extension: string;
    className: string;
}) {
    const ext = extension.toLowerCase();
    const lowerName = name.toLowerCase();

    // Special filenames
    if (lowerName === "dockerfile" || lowerName.startsWith("dockerfile."))
        return <Terminal className={className} />;
    if (lowerName === "makefile" || lowerName === "justfile")
        return <Terminal className={className} />;

    // By extension
    if (CODE_EXTS.has(ext)) return <FileCode2 className={className} />;
    if (DATA_EXTS.has(ext)) return <FileJson className={className} />;
    if (CONFIG_EXTS.has(ext)) return <Cog className={className} />;
    if (IMAGE_EXTS.has(ext)) return <FileImage className={className} />;
    if (SCRIPT_EXTS.has(ext)) return <Terminal className={className} />;
    if (ext === "md" || ext === "txt" || ext === "rst")
        return <FileText className={className} />;
    if (ext === "db" || ext === "sqlite" || ext === "sqlite3")
        return <Database className={className} />;

    return <File className={className} />;
}

// ── Tree node ───────────────────────────────────────────────

function TreeNode({
    entry,
    repoPath,
    depth,
    onFileSelect,
    activeFile,
}: {
    entry: DirEntry;
    repoPath: string;
    depth: number;
    onFileSelect: (path: string) => void;
    activeFile: string | undefined;
}) {
    const [expanded, setExpanded] = useState(false);
    const { data: children } = useDirectoryListing(
        repoPath,
        entry.path,
        expanded && entry.isDir,
    );

    const isActive = activeFile === entry.path;
    const indent = depth * 12 + 8;

    if (entry.isDir) {
        const FolderIcon = expanded ? FolderOpen : Folder;
        return (
            <div>
                <button
                    type="button"
                    onClick={() => setExpanded(!expanded)}
                    className="w-full text-left flex items-center gap-1.5 py-1 px-2 text-sm hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                    style={{ paddingLeft: `${indent}px` }}
                >
                    {expanded ? (
                        <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
                    ) : (
                        <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
                    )}
                    <FolderIcon className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    <span className="truncate">{entry.name}</span>
                </button>
                {expanded &&
                    children?.map((child) => (
                        <TreeNode
                            key={child.path}
                            entry={child}
                            repoPath={repoPath}
                            depth={depth + 1}
                            onFileSelect={onFileSelect}
                            activeFile={activeFile}
                        />
                    ))}
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={() => onFileSelect(entry.path)}
            className={`w-full text-left flex items-center gap-1.5 py-1 px-2 text-sm transition-colors ${
                isActive
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
            style={{ paddingLeft: `${indent}px` }}
        >
            <span className="w-3 shrink-0" />
            <FileIcon
                name={entry.name}
                extension={entry.extension}
                className="h-3.5 w-3.5 shrink-0 opacity-50"
            />
            <span className="truncate">{entry.name}</span>
        </button>
    );
}

// ── Panel ───────────────────────────────────────────────────

export function FileTreePanel({
    repoPath,
    onFileSelect,
    activeFile,
}: FileTreePanelProps) {
    const { data: rootEntries, isLoading } = useDirectoryListing(repoPath, "");

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <p className="text-xs text-muted-foreground">
                    Loading files...
                </p>
            </div>
        );
    }

    return (
        <div className="py-1">
            {rootEntries?.map((entry) => (
                <TreeNode
                    key={entry.path}
                    entry={entry}
                    repoPath={repoPath}
                    depth={0}
                    onFileSelect={onFileSelect}
                    activeFile={activeFile}
                />
            ))}
        </div>
    );
}
