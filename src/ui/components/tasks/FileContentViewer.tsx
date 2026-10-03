import { useMemo } from "react";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";
import { useFileContent } from "@core/api/useFileTree";

interface FileContentViewerProps {
    repoPath: string;
    relativePath: string;
}

const LANG_MAP: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    rs: "rust",
    py: "python",
    go: "go",
    java: "java",
    kt: "kotlin",
    rb: "ruby",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "ini",
    sql: "sql",
    sh: "bash",
    zsh: "bash",
    md: "markdown",
    css: "css",
    scss: "scss",
    html: "xml",
    svelte: "xml",
    vue: "xml",
    xml: "xml",
    dockerfile: "dockerfile",
    makefile: "makefile",
};

function getLanguage(path: string): string | undefined {
    const filename = path.split("/").pop()?.toLowerCase() ?? "";
    // Check full filename first (e.g. Dockerfile, Makefile)
    if (LANG_MAP[filename]) return LANG_MAP[filename];
    const ext = filename.split(".").pop() ?? "";
    return LANG_MAP[ext];
}

export function FileContentViewer({
    repoPath,
    relativePath,
}: FileContentViewerProps) {
    const { data, isLoading, error } = useFileContent(repoPath, relativePath);

    const highlightedHtml = useMemo(() => {
        if (!data?.content) return null;
        const lang = getLanguage(relativePath);
        if (lang) {
            try {
                return hljs.highlight(data.content, { language: lang }).value;
            } catch {
                return null;
            }
        }
        return null;
    }, [data?.content, relativePath]);

    if (isLoading) {
        return (
            <div className="flex h-32 items-center justify-center">
                <p className="text-xs text-muted-foreground/40">
                    Loading file...
                </p>
            </div>
        );
    }

    if (error || data?.error) {
        return (
            <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground/70">
                    {data?.error ?? "Failed to load file"}
                </p>
            </div>
        );
    }

    if (!data?.content) {
        return (
            <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground/70">
                    No content to display
                </p>
            </div>
        );
    }

    const lines = data.content.split("\n");
    const lineNumWidth = String(lines.length).length;

    return (
        <div className="rounded-lg border border-border overflow-hidden">
            <div className="flex items-center px-3 py-2 bg-muted/50 border-b border-border">
                <span className="text-xs font-mono text-muted-foreground truncate">
                    {relativePath}
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground/50 shrink-0">
                    {lines.length} lines
                </span>
            </div>
            <div className="overflow-x-auto">
                <pre className="text-xs leading-5">
                    <code>
                        {highlightedHtml
                            ? /* Render with line numbers alongside highlighted HTML */
                              highlightedHtml.split("\n").map((line, i) => (
                                  <div
                                      key={i}
                                      className="flex hover:bg-muted/20"
                                  >
                                      <span
                                          className="select-none text-right text-muted-foreground/25 font-mono shrink-0 pr-4 pl-3"
                                          style={{
                                              minWidth: `${lineNumWidth + 3}ch`,
                                          }}
                                      >
                                          {i + 1}
                                      </span>
                                      <span
                                          className="flex-1 pr-4 font-mono whitespace-pre"
                                          dangerouslySetInnerHTML={{
                                              __html: line || " ",
                                          }}
                                      />
                                  </div>
                              ))
                            : /* Plain text fallback */
                              lines.map((line, i) => (
                                  <div
                                      key={i}
                                      className="flex hover:bg-muted/20"
                                  >
                                      <span
                                          className="select-none text-right text-muted-foreground/25 font-mono shrink-0 pr-4 pl-3"
                                          style={{
                                              minWidth: `${lineNumWidth + 3}ch`,
                                          }}
                                      >
                                          {i + 1}
                                      </span>
                                      <span className="flex-1 pr-4 font-mono whitespace-pre text-foreground/80">
                                          {line || " "}
                                      </span>
                                  </div>
                              ))}
                    </code>
                </pre>
            </div>
        </div>
    );
}
