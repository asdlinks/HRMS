import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { SnackbarProvider } from 'notistack';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { ThemeModeProvider } from './theme/ThemeModeProvider';
import { SearchProvider } from './layout/SearchContext';
import PlatformAdminRoot from './platform-admin/PlatformAdminRoot';
import { BASE_PATH } from './config/basePath';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

const BASENAME = BASE_PATH || '/';

// Platform Administration (Phase 9) is a logically separate portal from the
// customer HRMS: it must never mount the HRMS AuthProvider (which would fire
// an unwanted /api/auth/refresh call and expects a tenant session) or render
// inside AppShell/TopNav. Branching here, one level above AuthProvider/App,
// keeps the two portals' sessions fully independent within the same bundle.
const isPlatformAdminPath = window.location.pathname.startsWith(`${BASE_PATH}/platform-admin`);

ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
        <BrowserRouter basename={BASENAME}>
            {isPlatformAdminPath ? (
                <PlatformAdminRoot />
            ) : (
                <AuthProvider>
                    <ThemeModeProvider>
                        <SnackbarProvider maxSnack={4} anchorOrigin={{ vertical: 'top', horizontal: 'right' }} autoHideDuration={3500}>
                            <SearchProvider>
                                <App />
                            </SearchProvider>
                        </SnackbarProvider>
                    </ThemeModeProvider>
                </AuthProvider>
            )}
        </BrowserRouter>
    </React.StrictMode>,
);
