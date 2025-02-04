import { ThemeProvider } from "./theme-provider.tsx";
import { SettingsProvider } from "./settings-provider.tsx";
import { UserSettingsProvider } from "./user-settings-provider.tsx";
import { ScheduleProvider } from "./schedule-provider.tsx";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <UserSettingsProvider>
          <ScheduleProvider>
            {children}
          </ScheduleProvider>
        </UserSettingsProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
