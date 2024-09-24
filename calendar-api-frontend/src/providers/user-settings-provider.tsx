import { createContext, useState } from "react";
import { Position } from "@/types/positionTypes";

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
  const [positionsToSync, setPositionsToSync] = useState<Position[]>([]);
  const [originalPositionsToSync, setOriginalPositionsToSync] = useState<
    Position[]
  >([]);
  const [isGoogleAuthenticated, setIsGoogleAuthenticated] = useState(false);
  const [userGoogleInfo, setUserGoogleInfo] = useState("");
  const [unsavedChangesAlertOpen, setUnsavedChangesAlertOpen] = useState(false);

  const value = {
    firstName,
    lastName,
    email,
    slingId,
    type,
    timeZone,
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
