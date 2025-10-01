
import { useState, useEffect } from 'react';

// This hook is now simplified and may become obsolete depending on app structure.
// For now, it reflects that user state is managed outside of Firebase Auth.
/**
 * Hook para obter o objeto do usuário autenticado no Firebase.
 * @returns {User | null} O objeto do usuário do Firebase ou `null` se não estiver autenticado.
 */
export function useUser() {
  const [user, setUser] = useState<any | null>(null);

  useEffect(() => {
    // This hook no longer uses onAuthStateChanged.
    // The user state is now managed in the root page component.
    // It returns null, and components should get the user object via props.
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
        try {
            const parsedUser = JSON.parse(storedUser);
            setUser({ uid: parsedUser.uid, email: parsedUser.email });
        } catch (e) {
            setUser(null);
        }
    }
  }, []);

  return user;
}
