import { useContext } from "react";
import { SettingsContext } from "./settings-provider.tsx";

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within an SettingsProvider");
  }
  return context;
};
