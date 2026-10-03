import { useState, useEffect, useRef } from "react";
import { Textarea } from "@ui/components/ui/textarea";

interface TaskNotesProps {
    notes: string | undefined;
    onSave: (notes: string) => void;
}

export function TaskNotes({ notes, onSave }: TaskNotesProps) {
    const [draft, setDraft] = useState(notes ?? "");
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    // Sync draft when notes prop changes (e.g. from refetch)
    useEffect(() => {
        setDraft(notes ?? "");
    }, [notes]);

    function handleChange(value: string) {
        setDraft(value);

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            onSave(value);
        }, 500);
    }

    return (
        <div>
            <h3 className="text-sm font-medium text-foreground mb-2">Notes</h3>
            <Textarea
                placeholder="Add notes about this task..."
                value={draft}
                onChange={(e) => handleChange(e.target.value)}
                rows={5}
                className="resize-none text-sm"
            />
        </div>
    );
}
