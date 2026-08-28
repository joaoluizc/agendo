import { createContext, useState, useEffect } from "react";
import { Position } from "@/types/positionTypes.ts";
import { UserSafeInfo } from "@/types/userTypes";
import { CoverageMeter } from "@/types/coverageTypes";
import { Location } from "@/types/locationTypes";
import { getCoverageMeters } from "@/pages/Settings/CoverageTargets/coverageUtils";
import { useAuth } from "@clerk/clerk-react"; // Assuming you are using Clerk's useAuth hook

type UserSettingsProviderProps = {
  children: React.ReactNode;
};

type UserSettingsProviderState = {
  firstName: string;
  lastName: string;
  email: string;
  slingId: string;
  type: string;
  userInfoLoaded: boolean;
  timeZone: number;
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
  setType: (value: string) => void;
  setTimeZone: (value: number) => void;
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

export function UserSettingsProvider({ children }: UserSettingsProviderProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [slingId, setSlingId] = useState("");
  const [type, setType] = useState("");
  const [userInfoLoaded, setUserInfoLoaded] = useState(false);
  const [timeZone, setTimeZone] = useState(0);
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

  useEffect(() => {
    const getUserSettings = async () => {
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
          setType(data.type);
          setTimeZone(data.timeZone);
        } else {
          console.error("Failed to get user settings");
        }
      } catch (e) {
        console.error("Failed to get user settings", e);
      } finally {
        // Mark loaded even on failure so admin route guards stop waiting and degrade
        // gracefully (a failed load is treated as "not admin", not an infinite spinner).
        setUserInfoLoaded(true);
      }
    };
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
      getUserSettings();
      getPositions();
      getUsers();
      getLocations();
    }
  }, [isSignedIn]);

  // Coverage meters are admin-only on both ends, and `type` only lands once
  // /api/user/info resolves — so this can't ride along with the fetches above.
  // `originalCoverageMeters` is the baseline the Settings card diffs against for
  // its dirty state and Reset, mirroring positionsToSync.
  useEffect(() => {
    if (!userInfoLoaded || type !== "admin") return;

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
  }, [userInfoLoaded, type]);

  const value = {
    firstName,
    lastName,
    email,
    slingId,
    type,
    userInfoLoaded,
    timeZone,
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
    setType,
    setTimeZone,
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
