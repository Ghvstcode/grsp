import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Task } from "@core/types/task";

interface TaskOverviewProps {
    task: Task;
}

export function TaskOverview({ task }: TaskOverviewProps) {
    if (!task.description) {
        return (
            <p className="text-sm italic text-muted-foreground/40">
                No description provided
            </p>
        );
    }

    return (
        <div className="prose prose-sm max-w-none text-foreground/80 prose-headings:text-foreground prose-headings:font-semibold prose-p:text-foreground/80 prose-strong:text-foreground prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-blockquote:text-muted-foreground prose-blockquote:border-border prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-foreground prose-code:text-[0.85em] prose-code:before:content-none prose-code:after:content-none prose-pre:bg-muted prose-pre:text-foreground prose-pre:border prose-pre:border-border prose-li:text-foreground/80 prose-th:text-foreground prose-hr:border-border">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {task.description}
            </ReactMarkdown>
        </div>
    );
}
