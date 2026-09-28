import { Outlet } from "react-router-dom";
import SettingsNav from "./SettingsNav";

/**
 * The frame every settings page shares: title, the sidebar, and the page itself beside it.
 * A layout route (see main.tsx), so moving between settings pages keeps the sidebar in
 * place and the header's Settings link lit.
 */
export default function SettingsLayout() {
  return (
    <div className="flex min-h-screen w-full flex-col">
      <main className="flex min-h-[calc(100vh_-_theme(spacing.16))] flex-1 flex-col gap-4 bg-muted/40 p-4 md:gap-8 md:p-10">
        <div className="mx-auto grid w-full max-w-6xl gap-2">
          <h1 className="text-3xl font-semibold">Settings</h1>
        </div>
        <div className="mx-auto grid w-full max-w-6xl items-start gap-6 md:grid-cols-[180px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)]">
          <SettingsNav />
          <div className="min-w-0">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
