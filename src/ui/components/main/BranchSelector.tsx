import { useState, useMemo } from "react";
import { GitBranch, ChevronDown, Check, Search } from "lucide-react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@ui/components/ui/popover";
import { Button } from "@ui/components/ui/button";
import { useGitBranches } from "@core/api/useRepositories";

interface BranchSelectorProps {
    repositoryId: string;
    repoPath: string;
    currentBranch: string;
    onBranchChange: (branch: string) => void;
}

export function BranchSelector({
    repoPath,
    currentBranch,
    onBranchChange,
}: BranchSelectorProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const { data: branches } = useGitBranches(repoPath);

    const filtered = useMemo(() => {
        if (!branches) return [];
        if (!search.trim()) return branches;
        const q = search.toLowerCase();
        return branches.filter((b) => b.name.toLowerCase().includes(q));
    }, [branches, search]);

    function handleSelect(branch: string) {
        onBranchChange(branch);
        setOpen(false);
        setSearch("");
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
                >
                    <GitBranch className="h-3 w-3" />
                    <span className="max-w-[140px] truncate text-xs font-medium">
                        {currentBranch}
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start" sideOffset={8}>
                {/* Search */}
                <div className="border-b border-border p-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/40" />
                        <input
                            type="text"
                            placeholder="Search branches..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full rounded-md bg-transparent py-1.5 pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
                            autoFocus
                        />
                    </div>
                </div>

                {/* Branch list */}
                <div className="max-h-60 overflow-y-auto p-1">
                    {filtered.length === 0 && (
                        <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                            No branches found
                        </p>
                    )}
                    {filtered.map((branch) => {
                        const isSelected = branch.name === currentBranch;
                        return (
                            <button
                                key={branch.name}
                                type="button"
                                onClick={() => handleSelect(branch.name)}
                                className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                                    isSelected
                                        ? "bg-accent text-accent-foreground"
                                        : "text-foreground hover:bg-accent/50"
                                }`}
                            >
                                <GitBranch className="h-3 w-3 shrink-0 text-muted-foreground" />
                                <span className="flex-1 truncate">
                                    {branch.name}
                                </span>
                                {isSelected && (
                                    <Check className="h-3 w-3 shrink-0" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </PopoverContent>
        </Popover>
    );
}
