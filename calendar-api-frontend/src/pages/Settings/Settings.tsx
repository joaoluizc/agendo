import { Blocker, useBlocker, useLocation } from "react-router-dom";
// import GoogleIntegration from "./GoogleIntegration/GoogleIntegration.tsx";
import ShiftsToAddToCal from "./ShiftsToAddToCal/ShiftsToAddToCal.tsx";
import TimezoneCard from "./Timezone/TimezoneCard";
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
 * Settings → General: the account and admin sections. The page frame and the sidebar that
 * links to each section come from SettingsLayout / SettingsNav.
 */
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

  // The sidebar's section links are `/app/settings#id`, followed from any settings page.
  // React Router doesn't scroll to a hash after navigating, so do it once the cards exist.
  // Keyed on the navigation, not just the hash, so clicking the same section again after
  // scrolling away still jumps back. Admin cards render only once `type` has loaded, hence
  // that dependency too.
  const { hash, key } = useLocation();
  useEffect(() => {
    if (!hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [hash, key, type]);

  return (
    <>
      <div className="grid gap-6" id="settings-wrapper">
        {/* <GoogleIntegration></GoogleIntegration> */}
        <ShiftsToAddToCal />
        <TimezoneCard />
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
    </>
  );
}
