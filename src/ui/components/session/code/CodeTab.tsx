import {
    lazy,
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { DiffFilePatch, ReviewSession } from "@core/types/grsp";
import { useDiff } from "@core/api/useDiff";
import type { NotesController } from "@core/api/useNotes";
import { errorMessage } from "@core/api/useSession";
import { useAppStore } from "@core/store/app-store";
import { Input } from "@ui/components/ui/input";
import { Segmented } from "@ui/components/ui/segmented";
import { useIsDark } from "@ui/hooks/useIsDark";
import { cn } from "@ui/lib/utils";
import {
    excludedNote,
    FILE_STATUS,
    filterFiles,
    neighbourFile,
    noteCountsByFile,
    splitPath,
    unshowableReason,
    type DiffStyle,
    type LineTarget,
} from "../lib/code";
import { plural } from "../lib/text";
import { SectionError, SkeletonLine } from "../shared/AnalysisSection";
import { ProgressLine } from "../shared/ProgressLine";
import type { CodeTarget } from "./CodeJumpContext";

// The diff library (and its highlighter) loads only when a diff is shown.
const DiffView = lazy(async () => {
    const [view, theme] = await Promise.all([
        import("./DiffView"),
        import("./diffTheme"),
    ]);
    await theme.prepareDiffs();
    return view;
});

const STYLES: { value: DiffStyle; label: string }[] = [
    { value: "unified", label: "Unified" },
    { value: "split", label: "Split" },
];

function isTyping(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
        target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
    );
}

function StatusMark({
    status,
    inverted = false,
}: {
    status: DiffFilePatch["status"];
    inverted?: boolean;
}) {
    const { mark, label } = FILE_STATUS[status];
    return (
        <span
            title={label}
            aria-label={label}
            className={cn(
                "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border font-mono text-[10px] leading-none",
                inverted
                    ? "border-background text-background"
                    : status === "added"
                      ? "border-foreground bg-foreground text-background"
                      : status === "deleted"
                        ? "border-dashed border-foreground"
                        : "border-foreground",
            )}
        >
            {mark}
        </span>
    );
}

function FileRow({
    file,
    current,
    noteCount,
    focusToken,
    onPick,
}: {
    file: DiffFilePatch;
    current: boolean;
    noteCount: number;
    /** Bumped when the keyboard moved here, so focus follows. */
    focusToken: number;
    onPick: () => void;
}) {
    const ref = useRef<HTMLButtonElement>(null);
    const { dir, name } = splitPath(file.path);
    useEffect(() => {
        if (!current) return;
        ref.current?.scrollIntoView({ block: "nearest" });
        if (focusToken > 0) ref.current?.focus({ preventScroll: true });
    }, [current, focusToken]);
    return (
        <button
            ref={ref}
            type="button"
            onClick={onPick}
            aria-current={current ? "true" : undefined}
            title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
            className={cn(
                "flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                current
                    ? "bg-foreground text-background"
                    : "hover:bg-[var(--g-wash)]",
            )}
        >
            <StatusMark status={file.status} inverted={current} />
            <span className="flex min-w-0 grow flex-col">
                <span className="truncate font-mono text-[12.5px] leading-[18px]">
                    {name}
                </span>
                {dir && (
                    <span
                        className={cn(
                            "truncate font-mono text-[11px] leading-[15px]",
                            current
                                ? "text-background/70"
                                : "text-muted-foreground",
                        )}
                    >
                        {dir}
                    </span>
                )}
            </span>
            {noteCount > 0 && (
                <span
                    title={plural(noteCount, "note")}
                    className="flex shrink-0 items-center gap-1 text-[11px]"
                >
                    <span
                        aria-hidden
                        className={cn(
                            "h-[6px] w-[6px] rounded-full",
                            current ? "bg-background" : "bg-foreground",
                        )}
                    />
                    {noteCount}
                </span>
            )}
            <span
                className={cn(
                    "shrink-0 font-mono text-[11px]",
                    current ? "text-background/80" : "text-muted-foreground",
                )}
            >
                {file.binary ? "bin" : `+${file.added} −${file.removed}`}
            </span>
        </button>
    );
}

function Quiet({ children }: { children: string }) {
    return (
        <div className="grsp-border-strong m-5 rounded-[10px] border border-dashed px-[18px] py-3.5 text-[13px] text-muted-foreground">
            {children}
        </div>
    );
}

interface CodeTabProps {
    session: ReviewSession;
    /** The file (and maybe line) to show; set by jumps from other tabs. */
    target: (CodeTarget & { nonce: number }) | undefined;
    onTarget: (target: CodeTarget) => void;
    notes: NotesController;
}

/**
 * The whole diff: files on the left, the selected file's diff on the right.
 * ↑ ↓ or j k move between files; clicking a line number pins a note to it.
 */
export function CodeTab({ session, target, onTarget, notes }: CodeTabProps) {
    const diff = useDiff(session.id, session.headSha);
    const diffStyle = useAppStore((s) => s.diffStyle);
    const setDiffStyle = useAppStore((s) => s.setDiffStyle);
    const dark = useIsDark();
    const [query, setQuery] = useState("");
    const [keyMoves, setKeyMoves] = useState(0);
    const [composing, setComposing] = useState<
        (LineTarget & { file: string }) | undefined
    >(undefined);

    const files = diff.data?.files ?? [];
    const visible = filterFiles(files, query);
    const wanted = files.find((f) => f.path === target?.file);
    const selected = wanted ?? visible.at(0) ?? files.at(0);
    const selectedPath = selected?.path;
    // A jump to a file that isn't part of the change (it is only read).
    const missing = target && diff.data && !wanted ? target.file : undefined;
    const counts = noteCountsByFile(notes.notes);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            if (isTyping(event.target)) return;
            const back = event.key === "ArrowUp" || event.key === "k";
            const forward = event.key === "ArrowDown" || event.key === "j";
            if (!back && !forward) return;
            const next = neighbourFile(visible, selectedPath, forward ? 1 : -1);
            if (!next) return;
            event.preventDefault();
            if (next.path !== selectedPath) {
                onTarget({ file: next.path });
                setKeyMoves((n) => n + 1);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
        // `visible` is derived from files + query on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [files, query, selectedPath, onTarget]);

    const focusLine = target?.file === selectedPath ? target?.line : undefined;
    const focusSide = target?.side ?? "new";
    const focusNonce = target?.nonce ?? 0;
    const focus = useMemo(
        () =>
            focusLine === undefined
                ? undefined
                : { line: focusLine, side: focusSide, nonce: focusNonce },
        [focusLine, focusSide, focusNonce],
    );

    const onCompose = useCallback(
        (line: LineTarget | undefined) =>
            setComposing(
                line && selectedPath
                    ? { ...line, file: selectedPath }
                    : undefined,
            ),
        [selectedPath],
    );

    if (diff.isLoading) {
        return (
            <section className="flex min-w-0 grow flex-col gap-4 px-9 pt-7">
                <ProgressLine text="Reading the diff" />
                <SkeletonLine className="w-72" />
                <SkeletonLine className="w-full max-w-[560px]" />
                <SkeletonLine className="w-full max-w-[420px]" />
            </section>
        );
    }
    if (diff.error || !diff.data) {
        return (
            <section className="min-w-0 grow px-9 pt-7">
                <SectionError
                    title="The diff couldn't be read."
                    message={diff.error ? errorMessage(diff.error) : undefined}
                    onRetry={() => void diff.refetch()}
                />
            </section>
        );
    }

    const excluded = excludedNote(diff.data.excludedFiles);
    if (files.length === 0 || !selected) {
        return (
            <section className="min-w-0 grow">
                <Quiet>
                    {excluded
                        ? `There are no files to show: ${excluded}.`
                        : "This change has no files to show."}
                </Quiet>
            </section>
        );
    }

    const reason = unshowableReason(selected);

    return (
        <div className="flex min-h-0 min-w-0 grow">
            <nav
                aria-label="Changed files"
                className="flex min-h-0 w-[300px] shrink-0 flex-col border-r"
            >
                <div className="flex flex-col gap-2 px-4 pb-2.5 pt-4">
                    <label htmlFor="grsp-file-filter" className="sr-only">
                        Filter files
                    </label>
                    <Input
                        id="grsp-file-filter"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Filter files"
                        autoComplete="off"
                        spellCheck={false}
                        className="grsp-border-strong h-9 rounded-lg bg-background px-3 text-[13px] shadow-none md:text-[13px]"
                    />
                    <span className="text-[11px] text-muted-foreground">
                        {query.trim() === ""
                            ? plural(files.length, "file")
                            : `${visible.length} of ${plural(files.length, "file")}`}
                    </span>
                </div>
                <div className="flex min-h-0 grow flex-col gap-px overflow-auto px-2 pb-3">
                    {visible.length === 0 ? (
                        <p className="m-0 px-2.5 py-2 text-[13px] text-muted-foreground">
                            No file matches “{query.trim()}”.
                        </p>
                    ) : (
                        visible.map((file) => (
                            <FileRow
                                key={file.path}
                                file={file}
                                current={file.path === selected.path}
                                noteCount={counts.get(file.path) ?? 0}
                                focusToken={keyMoves}
                                onPick={() => onTarget({ file: file.path })}
                            />
                        ))
                    )}
                </div>
                {excluded && (
                    <p className="m-0 border-t px-4 py-2.5 text-[11px] text-muted-foreground">
                        {excluded}
                    </p>
                )}
            </nav>

            <section className="flex min-h-0 min-w-0 grow flex-col">
                <div className="grsp-bg-panel flex min-h-[46px] shrink-0 items-center gap-3 border-b px-5 py-1.5">
                    <StatusMark status={selected.status} />
                    <span className="grsp-text-2 min-w-0 grow truncate font-mono text-xs">
                        {selected.oldPath &&
                            selected.oldPath !== selected.path && (
                                <span className="text-muted-foreground">
                                    {selected.oldPath} →{" "}
                                </span>
                            )}
                        {selected.path}
                    </span>
                    {!selected.binary && (
                        <span className="grsp-text-2 shrink-0 font-mono text-xs">
                            +{selected.added} −{selected.removed}
                        </span>
                    )}
                    <Segmented
                        label="Diff layout"
                        size="sm"
                        value={diffStyle}
                        onValueChange={setDiffStyle}
                        options={STYLES}
                        className="shrink-0 gap-1.5 [&_button]:h-7 [&_button]:px-2.5 [&_button]:text-xs"
                    />
                </div>
                <div className="min-h-0 grow overflow-auto">
                    {missing && (
                        <p className="m-0 border-b px-5 py-2 text-xs text-muted-foreground">
                            <span className="font-mono">{missing}</span> isn't
                            part of this change, so there is no diff for it.
                        </p>
                    )}
                    {reason ? (
                        <Quiet>{reason}</Quiet>
                    ) : (
                        <Suspense
                            fallback={
                                <div className="px-5 pt-4">
                                    <ProgressLine text="Drawing the diff" />
                                </div>
                            }
                        >
                            <DiffView
                                key={selected.path}
                                file={selected}
                                diffStyle={diffStyle}
                                dark={dark}
                                notes={notes.notes}
                                composing={
                                    composing?.file === selected.path
                                        ? composing
                                        : undefined
                                }
                                focus={focus}
                                onCompose={onCompose}
                                onAdd={(line, body) =>
                                    notes.save.mutate({
                                        body,
                                        anchor: {
                                            kind: "line",
                                            file: selected.path,
                                            line: line.line,
                                            side: line.side,
                                        },
                                    })
                                }
                                onEdit={(id, body) =>
                                    notes.save.mutate({ id, body })
                                }
                                onDelete={(id) => notes.remove.mutate(id)}
                            />
                        </Suspense>
                    )}
                </div>
            </section>
        </div>
    );
}
