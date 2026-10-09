import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { call } from "@core/services/client";
import { metrics } from "@core/services/metrics";
import { sessionKeys } from "@core/api/useSession";
import type { Note, NoteAnchor } from "@core/types/grsp";
import { sortNotes } from "@core/utils/notes";

export interface SaveNoteInput {
    /** Set to edit the body of an existing note. */
    id?: string;
    body: string;
    /** Only read when creating; a note's anchor never changes. */
    anchor?: NoteAnchor;
}

const PENDING_PREFIX = "pending:";

/** A note shown before the core has confirmed it. */
export function isPendingNote(note: Note): boolean {
    return note.id.startsWith(PENDING_PREFIX);
}

/** The cached list with a save applied, before the core answers. */
export function applyOptimisticSave(
    notes: Note[],
    input: SaveNoteInput,
    context: { sessionId: string; headSha: string; now: string; key: string },
): Note[] {
    if (input.id !== undefined) {
        return notes.map((note) =>
            note.id === input.id
                ? { ...note, body: input.body, updatedAt: context.now }
                : note,
        );
    }
    return [
        ...notes,
        {
            id: `${PENDING_PREFIX}${context.key}`,
            sessionId: context.sessionId,
            body: input.body,
            anchor: input.anchor,
            headSha: context.headSha,
            createdAt: context.now,
            updatedAt: context.now,
        },
    ];
}

/** Swap the placeholder (or the edited note) for what the core stored. */
export function applySavedNote(
    notes: Note[],
    saved: Note,
    pendingId: string | undefined,
): Note[] {
    const without = notes.filter(
        (note) => note.id !== saved.id && note.id !== pendingId,
    );
    return sortNotes([...without, saved]);
}

/**
 * The private notes of a session, oldest first, with optimistic save and
 * delete: the list changes at once and rolls back if the core refuses.
 */
export function useNotes(sessionId: string, headSha?: string) {
    const queryClient = useQueryClient();
    const key = sessionKeys.notes(sessionId);

    const query = useQuery({
        queryKey: key,
        queryFn: () => call("note_list", { sessionId }),
        select: sortNotes,
        refetchOnWindowFocus: false,
        staleTime: Infinity,
    });

    const save = useMutation({
        mutationFn: (input: SaveNoteInput) =>
            call("note_save", {
                sessionId,
                id: input.id,
                body: input.body,
                anchor: input.id === undefined ? input.anchor : undefined,
            }),
        onMutate: async (input) => {
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueryData<Note[]>(key);
            const pendingKey = crypto.randomUUID();
            queryClient.setQueryData<Note[]>(key, (notes = []) =>
                applyOptimisticSave(notes, input, {
                    sessionId,
                    headSha: headSha ?? "",
                    now: new Date().toISOString(),
                    key: pendingKey,
                }),
            );
            return {
                previous,
                pendingId:
                    input.id === undefined
                        ? `${PENDING_PREFIX}${pendingKey}`
                        : undefined,
            };
        },
        onError: (_error, _input, context) => {
            queryClient.setQueryData(key, context?.previous);
        },
        onSuccess: (saved, _input, context) => {
            metrics.track("note_saved");
            queryClient.setQueryData<Note[]>(key, (notes = []) =>
                applySavedNote(notes, saved, context.pendingId),
            );
        },
    });

    const remove = useMutation({
        mutationFn: (noteId: string) => call("note_delete", { noteId }),
        onMutate: async (noteId) => {
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueryData<Note[]>(key);
            queryClient.setQueryData<Note[]>(key, (notes = []) =>
                notes.filter((note) => note.id !== noteId),
            );
            return { previous };
        },
        onError: (_error, _noteId, context) => {
            queryClient.setQueryData(key, context?.previous);
        },
    });

    return { ...query, notes: query.data ?? [], save, remove };
}

export type NotesController = ReturnType<typeof useNotes>;
