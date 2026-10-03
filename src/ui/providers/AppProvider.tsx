import React from "react";
import { AppContext } from "@ui/context/AppContext";

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    return <AppContext.Provider value={{}}>{children}</AppContext.Provider>;
};
