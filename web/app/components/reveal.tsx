"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function Reveal({
    children,
    className = "",
    delay = 0,
}: {
    children: ReactNode;
    className?: string;
    delay?: number;
}) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setTimeout(() => {
                        el.classList.add("revealed");
                    }, delay);
                    observer.unobserve(el);
                }
            },
            { threshold: 0.1, rootMargin: "0px 0px -40px 0px" },
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, [delay]);

    return (
        <div ref={ref} className={`reveal-on-scroll ${className}`}>
            {children}
        </div>
    );
}
