import { ThemeProvider } from "./theme-provider"
import { SettingsProvider } from "./settings-provider";
import { UserSettingsProvider } from "./user-settings-provider";

export function Providers ({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider>
            <SettingsProvider>
                <UserSettingsProvider>
                    {children}
                </UserSettingsProvider>
            </SettingsProvider>
        </ThemeProvider>
    )
};