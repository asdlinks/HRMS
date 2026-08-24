import { useMemo, type ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { buildTheme } from '../theme';

// Deliberately NOT theme/ThemeModeProvider.tsx — that provider calls
// useAuth() internally to read a tenant's branding colors, which would
// require mounting the HRMS AuthContext just to render a themed page. A
// platform admin has no company profile/branding to read, so this is a
// fixed light theme with no persistence or tenant-color overrides.
export default function PlatformAdminTheme({ children }: { children: ReactNode }) {
    const theme = useMemo(() => buildTheme('light'), []);
    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            {children}
        </ThemeProvider>
    );
}
