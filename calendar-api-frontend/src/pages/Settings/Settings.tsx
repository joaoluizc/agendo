import { Blocker, useBlocker } from "react-router-dom";
// import GoogleIntegration from "./GoogleIntegration/GoogleIntegration.tsx";
import ShiftsToAddToCal from "./ShiftsToAddToCal/ShiftsToAddToCal.tsx";
import { useUserSettings } from "@/providers/useUserSettings.tsx";
import { useEffect } from "react";
import ProceedWithUnsavedChanges from "@/components/modals/ProceedWithUnsavedChanges.tsx";
import GenerateAPIToken from "./GenerateAPIToken/GenerateAPIToken.tsx";
// import { useIntersectionObserver } from "../../hooks/useIntersectionObserver.tsx";

export default function Settings() {
  const {
    positionsToSync,
    originalPositionsToSync,
    setUnsavedChangesAlertOpen,
  } = useUserSettings();

  const hasUnsavedChanges = () => {
    return (
      JSON.stringify(positionsToSync) !==
      JSON.stringify(originalPositionsToSync)
    );
  };

  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (hasUnsavedChanges()) {
      e.preventDefault();
    }
  };

  useEffect(() => {
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [positionsToSync, originalPositionsToSync]);

  const blocker: Blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (
      hasUnsavedChanges() &&
      nextLocation.pathname !== currentLocation.pathname
    ) {
      setUnsavedChangesAlertOpen(true);
      return true;
    }
    setUnsavedChangesAlertOpen(false);
    return false;
  });

  const handleStay = () => {
    setUnsavedChangesAlertOpen(false);
    if (blocker.reset) blocker.reset();
  };

  const handleLeave = () => {
    setUnsavedChangesAlertOpen(false);
    if (blocker.proceed) blocker.proceed();
  };

  return (
    <div className="flex min-h-screen w-full flex-col">
      <main className="flex min-h-[calc(100vh_-_theme(spacing.16))] flex-1 flex-col gap-4 bg-muted/40 p-4 md:gap-8 md:p-10">
        <div className="mx-auto grid w-full max-w-6xl gap-2">
          <h1 className="text-3xl font-semibold">Settings</h1>
        </div>
        <div className="mx-auto grid w-full max-w-6xl items-start gap-6 md:grid-cols-[180px_1fr] lg:grid-cols-[250px_1fr]">
          <nav className="grid gap-4 text-sm text-muted-foreground sticky top-20">
            {/* <a
              href="#google-integration"
              className={"font-semibold text-primary"}
            >
              Google Integration
            </a> */}
            <a
              href="#shifts-to-add-to-cal"
              className={"font-semibold text-primary"}
            >
              Shifts on GCalendar
            </a>
          </nav>
          <div className="grid gap-6" id="settings-wrapper">
            {/* <GoogleIntegration></GoogleIntegration> */}
            <ShiftsToAddToCal></ShiftsToAddToCal>
            <GenerateAPIToken />
          </div>
        </div>
      </main>
      {blocker.state === "blocked" ? (
        <ProceedWithUnsavedChanges
          title="Are you sure you want to leave?"
          description="You have unsaved changes. Are you sure you want to leave?"
          action="Stay"
          cancel="Leave"
          actionCallback={handleStay}
          cancelCallback={handleLeave}
          // blocker={blocker}
        />
      ) : null}
    </div>
  );
}
