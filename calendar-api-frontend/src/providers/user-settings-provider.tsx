import { createContext, useState } from 'react';
import { PositionSync } from '@/types/positionTypes';

type UserSettingsProviderProps = {
    children: React.ReactNode;
}

type UserSettingsProviderState = {
    firstName: string;
    lastName: string;
    email: string;
    type: string;
    timeZone: number;
    positionsToSync: PositionSync[];
    isGoogleAuthenticated: boolean;
    userGoogleInfo: string;
    setFirstName: (value: string) => void;
    setLastName: (value: string) => void;
    setEmail: (value: string) => void;
    setType: (value: string) => void;
    setTimeZone: (value: number) => void;
    setPositionsToSync: (value: PositionSync[]) => void;
    setIsGoogleAuthenticated: (value: boolean) => void;
    setUserGoogleInfo: (value: string) => void;
}

export const UserSettingsContext = createContext<UserSettingsProviderState | undefined>(undefined);

export function UserSettingsProvider({ children }: UserSettingsProviderProps) {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [type, setType] = useState('');
    const [timeZone, setTimeZone] = useState(0);
    const [positionsToSync, setPositionsToSync] = useState<PositionSync[]>([]);
    const [isGoogleAuthenticated, setIsGoogleAuthenticated] = useState(false);
    const [userGoogleInfo, setUserGoogleInfo] = useState('');

    const value = {
        firstName,
        lastName,
        email,
        type,
        timeZone,
        positionsToSync,
        isGoogleAuthenticated,
        userGoogleInfo,
        setFirstName,
        setLastName,
        setEmail,
        setType,
        setTimeZone,
        setPositionsToSync,
        setIsGoogleAuthenticated,
        setUserGoogleInfo,
    }

    return (
        <UserSettingsContext.Provider value={value}>
            {children}
        </UserSettingsContext.Provider>
    )
}