import { useContext } from "react";
import { UserSettingsContext } from "./user-settings-provider";

export const useUserSettings = () => {
    const context = useContext(UserSettingsContext);
    if (context === undefined) {
      throw new Error('useUserSettings must be used within an UserSettingsProvider');
    }
    return context;
};