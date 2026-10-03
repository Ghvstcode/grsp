import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export interface DirEntry {
    name: string;
    path: string; // relative to repo root
    isDir: boolean;
    size: number;
    extension: string;
}

interface FileContent {
    content: string | null;
    error: string | null;
}

export function useDirectoryListing(
    repoPath: string | undefined,
    relativePath: string,
    enabled = true,
) {
    return useQuery({
        queryKey: ["directory", repoPath, relativePath],
        queryFn: () =>
            invoke<DirEntry[]>("list_directory", {
                repoPath,
                relativePath,
            }),
        enabled: !!repoPath && enabled,
        staleTime: 30_000,
    });
}

export function useFileContent(
    repoPath: string | undefined,
    relativePath: string | undefined,
) {
    return useQuery({
        queryKey: ["file-content", repoPath, relativePath],
        queryFn: () =>
            invoke<FileContent>("read_file_content", {
                repoPath,
                relativePath,
            }),
        enabled: !!repoPath && !!relativePath,
        staleTime: 60_000,
    });
}
