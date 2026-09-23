import { Blocker, useBlocker } from "react-router-dom";
// import GoogleIntegration from "./GoogleIntegration/GoogleIntegration.tsx";
import ShiftsToAddToCal from "./ShiftsToAddToCal/ShiftsToAddToCal.tsx";
import { useUserSettings } from "@/providers/useUserSettings.tsx";
import { useEffect } from "react";
import ProceedWithUnsavedChanges from "@/components/modals/ProceedWithUnsavedChanges.tsx";
import GenerateAPIToken from "./GenerateAPIToken/GenerateAPIToken.tsx";
import ManageLocations from "./ManageLocations/ManageLocations.tsx";
import ManagePositions from "./ManagePositions/ManagePositions.tsx";
import CoverageTargets from "./CoverageTargets/CoverageTargets.tsx";
import ReportGroups from "./ReportGroups/ReportGroups.tsx";
// import { useIntersectionObserver } from "../../hooks/useIntersectionObserver.tsx";

/**
 * The side nav, in the order the sections render. Each `id` must match the section card's
 * own `id` — a link with no target silently does nothing, which is how "Manage Locations"
 * went dead and "Positions" never got a link at all. `adminOnly` mirrors the section's own
 * gate below, so a normal user is not offered links to cards they cannot see.
 */
const SECTIONS = [
  { id: "shifts-to-add-to-cal", label: "Synced shifts", adminOnly: false },
  { id: "generate-api-token", label: "API Token", adminOnly: true },
  { id: "manage-locations", label: "Locations", adminOnly: true },
  { id: "manage-positions", label: "Positions", adminOnly: true },
  { id: "coverage-targets", label: "Coverage targets", adminOnly: true },
  { id: "report-groups", label: "Report groups", adminOnly: true },
] as const;

export default function Settings() {
  const {
    positionsToSync,
    originalPositionsToSync,
    coverageMeters,
    originalCoverageMeters,
    setUnsavedChangesAlertOpen,
    type,
  } = useUserSettings();

  const hasUnsavedChanges = () => {
    return (
      JSON.stringify(positionsToSync) !==
        JSON.stringify(originalPositionsToSync) ||
      JSON.stringify(coverageMeters) !== JSON.stringify(originalCoverageMeters)
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
  }, [
    positionsToSync,
    originalPositionsToSync,
    coverageMeters,
    originalCoverageMeters,
  ]);

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
            {SECTIONS.filter(
              (section) => !section.adminOnly || type === "admin"
            ).map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className={"font-semibold text-primary"}
              >
                {section.label}
              </a>
            ))}
          </nav>
          <div className="grid gap-6" id="settings-wrapper">
            {/* <GoogleIntegration></GoogleIntegration> */}
            <ShiftsToAddToCal />
            {type === "admin" && (
              <div className="grid gap-6">
                <GenerateAPIToken />
                <ManageLocations />
                <ManagePositions />
                <CoverageTargets />
                <ReportGroups />
              </div>
            )}
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
