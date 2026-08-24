import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface SearchContextValue {
    searchQuery: string;
    setSearchQuery: (q: string) => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

// Shared global search box lives in the Header; pages that want to react to
// it (EmployeesPage, ManagerDashboard) read it via useHeaderSearch() instead
// of receiving it as a prop threaded through the router.
export function SearchProvider({ children }: { children: ReactNode }) {
    const [searchQuery, setSearchQuery] = useState('');
    const value = useMemo(() => ({ searchQuery, setSearchQuery }), [searchQuery]);
    return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook is colocated with its provider by design
export function useHeaderSearch() {
    const ctx = useContext(SearchContext);
    if (!ctx) throw new Error('useHeaderSearch must be used within SearchProvider');
    return ctx;
}
