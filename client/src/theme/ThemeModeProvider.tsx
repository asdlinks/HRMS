import React, { createContext, useContext, useMemo, useState, useEffect, type ReactNode } from 'react';
import { ThemeProvider, type PaletteMode } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { buildTheme } from './index';
import { useAuth } from '../auth/AuthContext';

const STORAGE_KEY = 'hrms.theme-mode';

interface ThemeModeContextValue {
    mode: PaletteMode;
    toggleMode: () => void;
    setMode: (mode: PaletteMode) => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

function getInitialMode(): PaletteMode {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (stored === 'light' || stored === 'dark') return stored;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
    const [mode, setModeState] = useState<PaletteMode>(getInitialMode);
    const { companyProfile } = useAuth();

    useEffect(() => {
        window.localStorage.setItem(STORAGE_KEY, mode);
    }, [mode]);

    const setMode = (next: PaletteMode) => setModeState(next);
    const toggleMode = () => setModeState((prev) => (prev === 'light' ? 'dark' : 'light'));

    // Falls back to the default indigo palette whenever a tenant hasn't
    // configured branding colors — see theme/index.ts::buildTheme.
    const theme = useMemo(
        () => buildTheme(mode, { primaryColor: companyProfile?.theme_primary_color, secondaryColor: companyProfile?.theme_secondary_color }),
        [mode, companyProfile?.theme_primary_color, companyProfile?.theme_secondary_color],
    );
    const ctxValue = useMemo(() => ({ mode, toggleMode, setMode }), [mode]);

    return (
        <ThemeModeContext.Provider value={ctxValue}>
            <ThemeProvider theme={theme}>
                <CssBaseline />
                {children}
            </ThemeProvider>
        </ThemeModeContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook is colocated with its provider by design
export function useThemeMode() {
    const ctx = useContext(ThemeModeContext);
    if (!ctx) throw new Error('useThemeMode must be used within ThemeModeProvider');
    return ctx;
}
