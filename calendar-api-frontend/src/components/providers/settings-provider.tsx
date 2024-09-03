import { createContext, useState } from 'react';
import { RowSelectionState, Updater } from '@tanstack/react-table';

type SettingsProviderProps = {
    children: React.ReactNode;
}

type SettingsProviderState = {
    rowSelection: RowSelectionState;
    setRowSelection: (updaterOrValue: Updater<RowSelectionState>) => void;
}

const initialState: SettingsProviderState = {
    rowSelection: {},
    setRowSelection: () => null,
}

export const SettingsContext = createContext<SettingsProviderState>(initialState);

export function SettingsProvider({ children }: SettingsProviderProps) {
    const [rowSelection, setRowSelectionState] = useState<RowSelectionState>({});

    // TanStack React Table uses a function to update the row selection state.
    // This will check if the updaterOrValue is a function or a value and update the state accordingly.
    const setRowSelection = (updaterOrValue: Updater<RowSelectionState>) => {
        setRowSelectionState(prev => typeof updaterOrValue === 'function' ? updaterOrValue(prev) : updaterOrValue);
    };

    const value = {
        rowSelection,
        setRowSelection,
    }

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    )
}
