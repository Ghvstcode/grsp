import { Fragment } from "react";

const TOKEN = /(`[^`]+`|\*[^*\s][^*]*\*)/g;

/**
 * Agent prose with the two inline marks it uses: `code` (Geist Mono) and
 * *emphasis*. Anything else renders as plain text.
 */
export function InlineText({ text }: { text: string }) {
    const parts = text.split(TOKEN);
    return (
        <>
            {parts.map((part, index) => {
                if (part.length > 2 && part.startsWith("`")) {
                    return (
                        <span key={index} className="font-mono text-[0.93em]">
                            {part.slice(1, -1)}
                        </span>
                    );
                }
                if (part.length > 2 && part.startsWith("*")) {
                    return <em key={index}>{part.slice(1, -1)}</em>;
                }
                return <Fragment key={index}>{part}</Fragment>;
            })}
        </>
    );
}
