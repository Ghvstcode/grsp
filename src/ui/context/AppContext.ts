import { createContext } from "react";

// Will grow as features are added
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface AppContextType {}

export const AppContext = createContext<AppContextType | undefined>(undefined);
