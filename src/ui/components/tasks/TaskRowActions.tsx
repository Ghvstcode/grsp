import {
    MoreHorizontal,
    ArrowUp,
    ArrowDown,
    Pencil,
    Trash2,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@ui/components/ui/dropdown-menu";

interface TaskRowActionsProps {
    onMoveUp: () => void;
    onMoveDown: () => void;
    onEdit: () => void;
    onDelete: () => void;
    canMoveUp: boolean;
    canMoveDown: boolean;
    onOpenChange?: (open: boolean) => void;
}

export function TaskRowActions({
    onMoveUp,
    onMoveDown,
    onEdit,
    onDelete,
    canMoveUp,
    canMoveDown,
    onOpenChange,
}: TaskRowActionsProps) {
    return (
        <DropdownMenu onOpenChange={onOpenChange}>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="rounded-md p-1 text-muted-foreground/50 hover:text-foreground hover:bg-accent transition-colors"
                    onClick={(e) => e.stopPropagation()}
                >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem
                    disabled={!canMoveUp}
                    onClick={(e) => {
                        e.stopPropagation();
                        onMoveUp();
                    }}
                >
                    <ArrowUp className="mr-2 h-3.5 w-3.5" />
                    Move up
                </DropdownMenuItem>
                <DropdownMenuItem
                    disabled={!canMoveDown}
                    onClick={(e) => {
                        e.stopPropagation();
                        onMoveDown();
                    }}
                >
                    <ArrowDown className="mr-2 h-3.5 w-3.5" />
                    Move down
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={(e) => {
                        e.stopPropagation();
                        onEdit();
                    }}
                >
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Delete
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
