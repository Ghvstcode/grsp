import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@ui/lib/utils";
import { externalLinkClick } from "../lib/openExternal";
import { cleanGithubMarkdown } from "../lib/text";

const heading = "mb-1 mt-3.5 block text-[13px] font-semibold first:mt-0";
const cell = "grsp-border-soft border-b px-2.5 py-1.5 text-left align-top";

/** GitHub text renders quietly: small headings, no colour, mono code. */
const COMPONENTS: Components = {
    h1: ({ children }) => <span className={heading}>{children}</span>,
    h2: ({ children }) => <span className={heading}>{children}</span>,
    h3: ({ children }) => <span className={heading}>{children}</span>,
    h4: ({ children }) => <span className={heading}>{children}</span>,
    h5: ({ children }) => <span className={heading}>{children}</span>,
    h6: ({ children }) => <span className={heading}>{children}</span>,
    p: ({ children }) => <p className="m-0 [&+*]:mt-2">{children}</p>,
    ul: ({ children }) => (
        <ul className="m-0 flex list-disc flex-col gap-1 pl-[18px] [&+*]:mt-2">
            {children}
        </ul>
    ),
    ol: ({ children }) => (
        <ol className="m-0 flex list-decimal flex-col gap-1 pl-[18px] [&+*]:mt-2">
            {children}
        </ol>
    ),
    blockquote: ({ children }) => (
        <blockquote className="grsp-border-strong grsp-text-2 m-0 border-l-2 pl-3 [&+*]:mt-2">
            {children}
        </blockquote>
    ),
    hr: () => <hr className="grsp-border-soft my-3 border-t" />,
    code: ({ children }) => (
        <code className="font-mono text-[0.94em]">{children}</code>
    ),
    pre: ({ children }) => (
        <pre className="grsp-bg-wash my-2 overflow-x-auto rounded-lg px-3 py-2 font-mono text-[12.5px]">
            {children}
        </pre>
    ),
    table: ({ children }) => (
        <div className="my-2 overflow-x-auto">
            <table className="border-collapse text-[12.5px]">{children}</table>
        </div>
    ),
    th: ({ children }) => (
        <th className={cn(cell, "font-semibold")}>{children}</th>
    ),
    td: ({ children }) => <td className={cell}>{children}</td>,
    a: ({ children, href }) => (
        <a
            href={href}
            target="_blank"
            rel="noreferrer"
            onClick={externalLinkClick}
            className="underline underline-offset-[3px]"
        >
            {children}
        </a>
    ),
    img: () => null,
};

/**
 * Markdown written on GitHub (PR descriptions, comments). HTML comments and
 * tags are cleaned out first, so bot comments don't show raw markup.
 */
export function Markdown({
    children,
    className,
}: {
    children: string;
    className?: string;
}) {
    return (
        <div className={cn("grsp-text-1 min-w-0 break-words", className)}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
                {cleanGithubMarkdown(children)}
            </ReactMarkdown>
        </div>
    );
}
