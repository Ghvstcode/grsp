import { AppContext } from "@ui/context/AppContext";
import { useContext } from "react";

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error(
            "useAppContext must be used within an AppContextProvider",
        );
    }
    return context;
};
