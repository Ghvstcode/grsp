import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@ui/components/ui/button";
import { Textarea } from "@ui/components/ui/textarea";
import { cn } from "@ui/lib/utils";

interface NoteEditorProps {
    initial?: string;
    placeholder?: string;
    submitLabel?: string;
    /** Resolves once the note is stored; the draft clears on success. */
    onSave: (body: string) => void;
    /** Shows Cancel (and makes Escape cancel) when set. */
    onCancel?: () => void;
    autoFocus?: boolean;
    rows?: number;
    /** Accessible name for the text area. */
    label: string;
    className?: string;
}

/** A small Markdown text box: ⌘↵ saves, Escape cancels. */
export function NoteEditor({
    initial = "",
    placeholder = "Write a note. Markdown works.",
    submitLabel = "Save note",
    onSave,
    onCancel,
    autoFocus = false,
    rows = 3,
    label,
    className,
}: NoteEditorProps) {
    const [draft, setDraft] = useState(initial);
    const field = useRef<HTMLTextAreaElement>(null);

    // Inside a diff the box is slotted into the library's shadow root a
    // moment after it mounts, and the click that opened it is still in
    // flight, so `autoFocus` alone doesn't stick.
    useEffect(() => {
        if (!autoFocus) return;
        const frame = requestAnimationFrame(() => {
            const node = field.current;
            if (!node) return;
            node.focus({ preventScroll: true });
            node.setSelectionRange(node.value.length, node.value.length);
        });
        return () => cancelAnimationFrame(frame);
    }, [autoFocus]);
    const body = draft.trim();
    const canSave = body !== "" && body !== initial.trim();

    const submit = () => {
        if (!canSave) return;
        onSave(body);
        setDraft("");
    };
    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit();
        } else if (event.key === "Escape" && onCancel) {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
        }
    };

    return (
        <div className={cn("flex min-w-0 flex-col gap-2", className)}>
            <Textarea
                ref={field}
                aria-label={label}
                value={draft}
                rows={rows}
                placeholder={placeholder}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
                className="grsp-border-strong min-h-0 resize-y rounded-lg bg-background px-3 py-2.5 font-sans text-[13px] leading-normal shadow-none md:text-[13px]"
            />
            <div className="flex items-center gap-3">
                <Button
                    type="button"
                    disabled={!canSave}
                    onClick={submit}
                    className="h-8 rounded-lg bg-foreground px-3 text-xs text-background shadow-none hover:bg-foreground/90"
                >
                    {submitLabel}
                </Button>
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="text-xs font-medium underline underline-offset-[3px]"
                    >
                        Cancel
                    </button>
                )}
                <span className="ml-auto font-sans text-[11px] text-muted-foreground">
                    ⌘↵ to save
                </span>
            </div>
        </div>
    );
}
