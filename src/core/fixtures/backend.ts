import type { GrspCommands } from "@core/types/grsp";

/** In-memory implementation of every grsp command over the prototype scenario. */
export function fixtureCall<K extends keyof GrspCommands>(
    name: K,
    _args: GrspCommands[K]["args"],
): Promise<GrspCommands[K]["result"]> {
    return Promise.reject(new Error(`fixture backend: ${name} not implemented`));
}

export function fixtureListen<T>(
    _event: string,
    _handler: (payload: T) => void,
): () => void {
    return () => {};
}
