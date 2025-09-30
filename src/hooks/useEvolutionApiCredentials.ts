
'use client';

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase';

interface EvolutionApiCredentials {
    apiUrl: string;
    apiKey: string;
    instanceName: string;
}

/**
 * Hook to fetch the user-specific Evolution API credentials.
 * @param {string | null} userId - The ID of the user.
 * @returns {{ credentials: EvolutionApiCredentials | null, loading: boolean, error: Error | null }} The credentials, loading state, and error.
 */
export function useEvolutionApiCredentials(userId: string | null) {
  const [credentials, setCredentials] = useState<EvolutionApiCredentials | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setCredentials(null);
      return;
    }

    setLoading(true);
    const firestore = getFirebaseFirestore();
    const docRef = doc(firestore, 'users', userId, 'settings', 'evolutionApiCredentials');

    const unsubscribe = onSnapshot(docRef, 
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.apiUrl && data.apiKey && data.instanceName) {
            setCredentials({
                apiUrl: data.apiUrl.endsWith('/') ? data.apiUrl.slice(0, -1) : data.apiUrl,
                apiKey: data.apiKey,
                instanceName: data.instanceName,
            });
          } else {
             setCredentials(null);
          }
        } else {
          setCredentials(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching user Evolution API credentials:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  return { credentials, loading, error };
}
