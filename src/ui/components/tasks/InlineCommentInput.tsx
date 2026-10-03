import { useState } from "react";
import { Input } from "@ui/components/ui/input";
import { useAddComment } from "@core/api/useTasks";

interface InlineCommentInputProps {
    taskId: string;
    onClose: () => void;
}

export function InlineCommentInput({
    taskId,
    onClose,
}: InlineCommentInputProps) {
    const [value, setValue] = useState("");
    const addComment = useAddComment();

    function handleSubmit() {
        const trimmed = value.trim();
        if (!trimmed) {
            onClose();
            return;
        }

        addComment.mutate(
            { taskId, comment: trimmed },
            { onSuccess: () => onClose() },
        );
    }

    return (
        <div className="pl-[52px] pr-3 pb-2">
            <Input
                placeholder="Leave a comment..."
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") handleSubmit();
                    if (e.key === "Escape") onClose();
                }}
                onBlur={() => {
                    if (!value.trim()) onClose();
                }}
                autoFocus
                className="h-8 text-xs"
            />
        </div>
    );
}
