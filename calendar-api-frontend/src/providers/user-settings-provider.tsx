import { createContext, useState, useEffect, useCallback, useRef } from "react";
import { Position } from "@/types/positionTypes.ts";
import { UserSafeInfo } from "@/types/userTypes";
import { CoverageMeter } from "@/types/coverageTypes";
import { Location } from "@/types/locationTypes";
import { getCoverageMeters } from "@/pages/Settings/CoverageTargets/coverageUtils";
import { useAuth } from "@clerk/clerk-react"; // Assuming you are using Clerk's useAuth hook
import {
  AreaKey,
  LevelOf,
  NO_PERMISSIONS,
  PREVIEW_PRESETS,
  Permissions,
  Requirement,
  hasLevel,
  meets as meetsRequirement,
  normalizePermissions,
} from "@/permissions/permissions";

type UserSettingsProviderProps = {
  children: React.ReactNode;
};

type UserSettingsProviderState = {
  firstName: string;
  lastName: string;
  email: string;
  slingId: string;
  /**
   * Whether the UI renders for an admin. The server's answer (`/user/info`), except while a
   * local preview is on — see `previewKey`. Admins pass every `can`.
   */
  isAdmin: boolean;
  /** What the server says, whatever a preview is doing to `isAdmin`. */
  realIsAdmin: boolean;
  /**
   * The caller's effective level in each area, computed by the server (an admin's is the
   * top level everywhere). Gate UI with `can` / `meets`, never on a user's `type`.
   */
  permissions: Permissions;
  /** At least `level` in `area`? Admins: always. The server enforces the same rule. */
  can: <A extends AreaKey>(area: A, level: LevelOf<A>) => boolean;
  /** The same for a page/control requirement: "admin" or "<area>:<level>". */
  meets: (requirement: Requirement) => boolean;
  /**
   * Local development only: an admin previewing the app as someone else (a key of
   * PREVIEW_PRESETS), or null. Purely a UI switch — the server still knows you as an
   * admin, so anything a screen asks for still succeeds; what changes is what renders.
   */
  previewKey: string | null;
  /** Stored per browser and applied by reloading, so every screen starts from the new view. */
  setPreviewKey: (key: string | null) => void;
  /** Fetch `/user/info` again — after a permission change, or when the tab comes back. */
  refreshUserInfo: () => Promise<void>;
  userInfoLoaded: boolean;
  /**
   * The agent's stored IANA timezone (e.g. "America/Sao_Paulo"), from Mongo.
   *
   * Replaced a `timeZone: number` that was fed by an off-schema field holding 0 for
   * everyone and read by nothing — the app had always used the browser's zone instead.
   * It is stored now because agendo's MCP server has no browser to ask.
   */
  timezone: string;
  setTimezone: (zone: string) => void;
  allPositions: Position[];
  allUsers: UserSafeInfo[];
  /** Office locations and who is assigned to each. Drives the schedule's location filter. */
  locations: Location[];
  positionsToSync: Position[];
  originalPositionsToSync: Position[];
  coverageMeters: CoverageMeter[];
  originalCoverageMeters: CoverageMeter[];
  defaultEventColorId: string | null;
  isGoogleAuthenticated: boolean;
  userGoogleInfo: string;
  unsavedChangesAlertOpen: boolean;
  setFirstName: (value: string) => void;
  setLastName: (value: string) => void;
  setEmail: (value: string) => void;
  setSlingId: (value: string) => void;
  setAllPositions: (value: Position[]) => void;
  /**
   * Bump a position's `lastUsedAt` to today, locally.
   *
   * The position list is fetched once on mount, so without this the picker keeps sorting
   * the list it loaded at page load — where nothing has been used yet — and the position
   * you just picked does not move to the top until a refresh. The backend stamps the same
   * value on every shift write; this mirrors it so the ordering is right immediately.
   */
  markPositionUsed: (positionId: string) => void;
  setAllUsers: (value: UserSafeInfo[]) => void;
  setPositionsToSync: (value: Position[]) => void;
  setOriginalPositionsToSync: (value: Position[]) => void;
  setCoverageMeters: (value: CoverageMeter[]) => void;
  setOriginalCoverageMeters: (value: CoverageMeter[]) => void;
  setDefaultEventColorId: (value: string | null) => void;
  setIsGoogleAuthenticated: (value: boolean) => void;
  setUserGoogleInfo: (value: string) => void;
  setUnsavedChangesAlertOpen: (value: boolean) => void;
};

export const UserSettingsContext = createContext<
  UserSettingsProviderState | undefined
>(undefined);

const PREVIEW_KEY = "agendo.previewAccess";

/** Only ever on in a dev build: production ignores whatever the key holds. */
const readPreviewKey = (): string | null => {
  if (!import.meta.env.DEV) return null;
  try {
    const key = localStorage.getItem(PREVIEW_KEY);
    return PREVIEW_PRESETS.some((preset) => preset.key === key) ? key : null;
  } catch {
    return null;
  }
};

const storePreviewKey = (key: string | null) => {
  try {
    if (key) localStorage.setItem(PREVIEW_KEY, key);
    else localStorage.removeItem(PREVIEW_KEY);
  } catch {
    // Blocked storage: the reload below then simply comes back in the old view.
  }
};

/** A tab that comes back after this long re-reads /user/info, so a grant lands without a reload. */
const USER_INFO_STALE_MS = 60_000;

export function UserSettingsProvider({ children }: UserSettingsProviderProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [slingId, setSlingId] = useState("");
  const [realIsAdmin, setRealIsAdmin] = useState(false);
  const [realPermissions, setRealPermissions] = useState<Permissions>(NO_PERMISSIONS);
  const [previewKey] = useState(readPreviewKey);
  // Only an admin can preview someone else: anyone else already sees exactly their own.
  const preview = realIsAdmin
    ? PREVIEW_PRESETS.find((preset) => preset.key === previewKey)
    : undefined;
  const isAdmin = preview ? false : realIsAdmin;
  const permissions = preview ? preview.permissions : realPermissions;
  const can = <A extends AreaKey>(area: A, level: LevelOf<A>) =>
    isAdmin || hasLevel(permissions, area, level);
  const meets = (requirement: Requirement) => meetsRequirement({ isAdmin, permissions }, requirement);
  const canEditSchedule = can("scheduling", "edit");
  const setPreviewKey = (key: string | null) => {
    storePreviewKey(key);
    // A reload rather than a state flip: data loaded for the real view (coverage meters,
    // calendar events) would otherwise stay on screen in the preview.
    window.location.reload();
  };
  const [userInfoLoaded, setUserInfoLoaded] = useState(false);
  const [timezone, setTimezone] = useState("UTC");
  const [allPositions, setAllPositions] = useState<Position[]>([]);

  /**
   * Mirror the backend's usage stamp locally, so the picker reorders without a refresh.
   *
   * Start of the UTC day, matching `positionService.touchPositionUsage` exactly — the two
   * have to agree or a position used today would sort against a different day than the one
   * stored, and the order would change under a reload.
   */
  const markPositionUsed = (positionId: string) => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const stamp = today.toISOString();
    setAllPositions((current) =>
      current.map((position) =>
        String(position._id) === String(positionId)
          ? { ...position, lastUsedAt: stamp }
          : position
      )
    );
  };
  const [allUsers, setAllUsers] = useState<UserSafeInfo[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [positionsToSync, setPositionsToSync] = useState<Position[]>([]);
  const [originalPositionsToSync, setOriginalPositionsToSync] = useState<
    Position[]
  >([]);
  const [coverageMeters, setCoverageMeters] = useState<CoverageMeter[]>([]);
  const [originalCoverageMeters, setOriginalCoverageMeters] = useState<
    CoverageMeter[]
  >([]);
  const [defaultEventColorId, setDefaultEventColorId] = useState<string | null>(
    null
  );
  const [isGoogleAuthenticated, setIsGoogleAuthenticated] = useState(false);
  const [userGoogleInfo, setUserGoogleInfo] = useState("");
  const [unsavedChangesAlertOpen, setUnsavedChangesAlertOpen] = useState(false);
  const { isSignedIn } = useAuth();
  const userInfoFetchedAt = useRef(0);

  const refreshUserInfo = useCallback(async () => {
    userInfoFetchedAt.current = Date.now();
    try {
      const response = await fetch("/api/user/info", {
        method: "GET",
        mode: "cors",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (response.ok) {
        const data = await response.json();
        setFirstName(data.firstName);
        setLastName(data.lastName);
        setEmail(data.email);
        setSlingId(data.slingId);
        setRealIsAdmin(data.isAdmin === true);
        setRealPermissions(normalizePermissions(data.permissions));
        // `timezone` is the real field; `timeZone` is the legacy camelCase key the
        // API still mirrors, kept only so a client mid-deploy is not left blank.
        setTimezone(data.timezone ?? data.timeZone ?? "UTC");
      } else {
        console.error("Failed to get user settings");
      }
    } catch (e) {
      console.error("Failed to get user settings", e);
    } finally {
      // Mark loaded even on failure so route guards stop waiting and degrade gracefully
      // (a failed load is treated as "no access", not an infinite spinner).
      setUserInfoLoaded(true);
    }
  }, []);

  useEffect(() => {
    const getPositions = async () => {
      const response = await fetch("/api/position/all", {
        method: "GET",
        mode: "cors",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (response.ok) {
        const data = await response.json();
        setAllPositions(data);
      } else {
        console.error("Failed to get positions");
      }
    };
    const getUsers = async () => {
      const response = await fetch("/api/user/all", {
        method: "GET",
        mode: "cors",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (response.ok) {
        const data = await response.json();
        setAllUsers(data);
      } else {
        console.error("Failed to get users");
      }
    };
    // Locations are not admin-gated — everyone filtering the schedule needs them.
    const getLocations = async () => {
      const response = await fetch("/api/location/all", {
        method: "GET",
        mode: "cors",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (response.ok) {
        setLocations(await response.json());
      } else {
        console.error("Failed to get locations");
      }
    };
    if (isSignedIn) {
      refreshUserInfo();
      getPositions();
      getUsers();
      getLocations();
    }
  }, [isSignedIn, refreshUserInfo]);

  // Access is read once at sign-in; a tab that comes back after a while re-reads it, so a
  // permission an admin just granted (or removed) shows without signing out.
  useEffect(() => {
    if (!isSignedIn) return;
    const onVisible = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - userInfoFetchedAt.current > USER_INFO_STALE_MS
      ) {
        refreshUserInfo();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [isSignedIn, refreshUserInfo]);

  // Coverage meters need scheduling:edit on both ends, and access only lands once
  // /api/user/info resolves — so this can't ride along with the fetches above.
  // `originalCoverageMeters` is the baseline the Settings card diffs against for
  // its dirty state and Reset, mirroring positionsToSync.
  useEffect(() => {
    if (!userInfoLoaded || !canEditSchedule) return;

    const loadCoverageMeters = async () => {
      try {
        const meters = await getCoverageMeters();
        setCoverageMeters(meters);
        setOriginalCoverageMeters(meters);
      } catch (e) {
        console.error("Failed to get coverage meters", e);
      }
    };
    loadCoverageMeters();
  }, [userInfoLoaded, canEditSchedule]);

  const value = {
    firstName,
    lastName,
    email,
    slingId,
    isAdmin,
    realIsAdmin,
    permissions,
    can,
    meets,
    previewKey: preview ? preview.key : null,
    setPreviewKey,
    refreshUserInfo,
    userInfoLoaded,
    timezone,
    setTimezone,
    allPositions,
    allUsers,
    locations,
    positionsToSync,
    originalPositionsToSync,
    coverageMeters,
    originalCoverageMeters,
    defaultEventColorId,
    isGoogleAuthenticated,
    userGoogleInfo,
    unsavedChangesAlertOpen,
    setFirstName,
    setLastName,
    setEmail,
    setSlingId,
    setAllPositions,
    markPositionUsed,
    setAllUsers,
    setPositionsToSync,
    setOriginalPositionsToSync,
    setCoverageMeters,
    setOriginalCoverageMeters,
    setDefaultEventColorId,
    setIsGoogleAuthenticated,
    setUserGoogleInfo,
    setUnsavedChangesAlertOpen,
  };

  return (
    <UserSettingsContext.Provider value={value}>
      {children}
    </UserSettingsContext.Provider>
  );
}
