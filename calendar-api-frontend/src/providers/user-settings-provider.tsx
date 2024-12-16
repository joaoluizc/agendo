import { createContext, useState, useEffect } from "react";
import { Position } from "@/types/positionTypes.ts";
import { UserSafeInfo } from "@/types/userTypes";
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
  timeZone: number;
  allPositions: Position[];
  allUsers: UserSafeInfo[];
  positionsToSync: Position[];
  originalPositionsToSync: Position[];
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
  setAllUsers: (value: UserSafeInfo[]) => void;
  setPositionsToSync: (value: Position[]) => void;
  setOriginalPositionsToSync: (value: Position[]) => void;
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
  const [timeZone, setTimeZone] = useState(0);
  const [allPositions, setAllPositions] = useState<Position[]>([]);
  const [allUsers, setAllUsers] = useState<UserSafeInfo[]>([]);
  const [positionsToSync, setPositionsToSync] = useState<Position[]>([]);
  const [originalPositionsToSync, setOriginalPositionsToSync] = useState<
    Position[]
  >([]);
  const [isGoogleAuthenticated, setIsGoogleAuthenticated] = useState(false);
  const [userGoogleInfo, setUserGoogleInfo] = useState("");
  const [unsavedChangesAlertOpen, setUnsavedChangesAlertOpen] = useState(false);
  const { isSignedIn } = useAuth();

  useEffect(() => {
    const getUserSettings = async () => {
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
    if (isSignedIn) {
      getUserSettings();
      getPositions();
      getUsers();
    }
  }, [isSignedIn]);

  const value = {
    firstName,
    lastName,
    email,
    slingId,
    type,
    timeZone,
    allPositions,
    allUsers,
    positionsToSync,
    originalPositionsToSync,
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
    setAllUsers,
    setPositionsToSync,
    setOriginalPositionsToSync,
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
