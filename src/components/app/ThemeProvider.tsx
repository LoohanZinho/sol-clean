
'use client';

import { useDisplaySettings } from '@/hooks/useDisplaySettings';
import { useUser } from '@/hooks/useUser';
import { useEffect } from 'react';

// This component handles client-side theme application logic,
// allowing the root layout to remain a Server Component.
export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
    const user = useUser();
    const { settings } = useDisplaySettings(user?.uid || null);

    useEffect(() => {
        const root = document.documentElement;
        // Remove all theme classes first to prevent conflicts
        root.classList.remove('theme-experimental', 'theme-matrix', 'theme-light', 'theme-solarized-dark');
        root.classList.remove('dark', 'light');

        if (settings.activeTheme && settings.activeTheme !== 'default') {
            root.classList.add(`theme-${settings.activeTheme}`);
        }
        
        // Add dark/light class for base tailwind styles if needed,
        // which helps with general component compatibility.
        if(settings.activeTheme === 'light') {
            root.classList.add('light');
        } else {
            root.classList.add('dark');
        }

    }, [settings.activeTheme]);

    return <>{children}</>;
};
