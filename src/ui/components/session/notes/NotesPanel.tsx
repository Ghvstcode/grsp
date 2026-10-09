import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { NoteAnchor, ReviewSession } from "@core/types/grsp";
import type { NotesController } from "@core/api/useNotes";
import { errorMessage } from "@core/api/useSession";
import { saveTextFile } from "@core/services/platform";
import {
    isNoteOutdated,
    notesFileName,
    notesMarkdown,
} from "@core/utils/notes";
import { plural } from "../lib/text";
import { NoteCard } from "./NoteCard";
import { NoteEditor } from "./NoteEditor";

interface NotesPanelProps {
    session: ReviewSession;
    /** `owner/name` or the folder name, for the export's first lines. */
    repoName: string | undefined;
    notes: NotesController;
    onClose: () => void;
    /** Go to the line or walkthrough block a note is pinned to. */
    onJump: (anchor: NoteAnchor) => void;
}

const linkButton =
    "text-xs font-medium underline underline-offset-[3px] disabled:opacity-50";

/**
 * The reader's own notes on a review, oldest first, with a box for a general
 * note. Sits on the right of every tab; on the Gist it takes the Ask panel's
 * place while open.
 */
export function NotesPanel({
    session,
    repoName,
    notes,
    onClose,
    onJump,
}: NotesPanelProps) {
    const [status, setStatus] = useState<string | undefined>(undefined);
    const list = notes.notes;
    const end = useRef<HTMLDivElement>(null);
    const count = useRef(list.length);

    // A note just written (here or on a line) scrolls into view.
    useEffect(() => {
        if (list.length > count.current) {
            end.current?.scrollIntoView({ block: "nearest" });
        }
        count.current = list.length;
    }, [list.length]);

    const markdown = () => notesMarkdown(session, list, { repoName });
    const report = (work: Promise<string | undefined>) => {
        work.then(setStatus).catch((error: unknown) => {
            setStatus(`That didn't work. ${errorMessage(error)}`);
        });
    };
    const copy = () =>
        report(navigator.clipboard.writeText(markdown()).then(() => "Copied."));
    const exportFile = () =>
        report(
            saveTextFile(notesFileName(session), markdown()).then((saved) =>
                saved ? "Exported." : undefined,
            ),
        );

    const failure = notes.save.error ?? notes.remove.error ?? notes.error;

    return (
        <aside
            aria-label="Notes"
            className="flex min-h-0 w-[400px] shrink-0 flex-col border-l bg-background"
        >
            <div className="flex flex-col gap-1 border-b px-5 pb-3.5 pt-[18px]">
                <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold">Notes</span>
                    {list.length > 0 && (
                        <span className="font-mono text-xs text-muted-foreground">
                            {list.length}
                        </span>
                    )}
                    <button
                        type="button"
                        aria-label="Close notes"
                        onClick={onClose}
                        className="ml-auto flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-[var(--g-wash)] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                        <X size={14} strokeWidth={2} />
                    </button>
                </div>
                <p className="m-0 text-xs text-muted-foreground">
                    Private. Notes stay on this Mac unless you export them.
                </p>
            </div>

            <div className="flex min-h-0 grow flex-col gap-5 overflow-auto px-5 py-[18px]">
                {notes.isLoading ? (
                    <p className="m-0 text-[13px] text-muted-foreground">
                        Reading your notes
                    </p>
                ) : list.length === 0 ? (
                    <p className="m-0 text-[13px] text-muted-foreground">
                        Nothing yet. Write a general note below, click a line
                        number in the Code tab to pin one to a line, or use “Add
                        note” on a walkthrough step.
                    </p>
                ) : (
                    list.map((note) => (
                        <NoteCard
                            key={note.id}
                            note={note}
                            outdated={isNoteOutdated(note, session)}
                            onJump={onJump}
                            onEdit={(body) =>
                                notes.save.mutate({ id: note.id, body })
                            }
                            onDelete={() => notes.remove.mutate(note.id)}
                        />
                    ))
                )}
                <div ref={end} />
            </div>

            <div className="flex flex-col gap-3 border-t px-5 pb-4 pt-3.5">
                {failure !== null && failure !== undefined && (
                    <p className="grsp-text-2 m-0 text-xs" role="alert">
                        Couldn't save that. {errorMessage(failure)}
                    </p>
                )}
                <NoteEditor
                    label="General note"
                    placeholder="A note on the whole review. Markdown works."
                    submitLabel="Add note"
                    rows={3}
                    onSave={(body) => notes.save.mutate({ body })}
                />
                <div className="flex items-center gap-4">
                    <button
                        type="button"
                        onClick={copy}
                        disabled={list.length === 0}
                        className={linkButton}
                    >
                        Copy as Markdown
                    </button>
                    <button
                        type="button"
                        onClick={exportFile}
                        disabled={list.length === 0}
                        className={linkButton}
                    >
                        Export…
                    </button>
                    <span
                        className="ml-auto truncate text-[11px] text-muted-foreground"
                        aria-live="polite"
                    >
                        {status ??
                            (list.length > 0
                                ? plural(list.length, "note")
                                : "")}
                    </span>
                </div>
            </div>
        </aside>
    );
}
