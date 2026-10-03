import { FileCode2 } from "lucide-react";

interface TaskFilesInvolvedProps {
    files: string[];
}

export function TaskFilesInvolved({ files }: TaskFilesInvolvedProps) {
    if (files.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-1.5">
            {files.map((file) => (
                <span
                    key={file}
                    className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-2 py-0.5 text-[11px] font-mono text-muted-foreground"
                >
                    <FileCode2 className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate max-w-[200px]">{file}</span>
                </span>
            ))}
        </div>
    );
}
