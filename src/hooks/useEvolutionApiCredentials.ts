
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
 * Hook para buscar as credenciais da Evolution API de um usuário.
 * @param {string | null} userId - O ID do usuário.
 * @returns {{ credentials: EvolutionApiCredentials | null, loading: boolean, error: Error | null }} As credenciais, estado de carregamento e erro.
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
                // Garante que a URL não tenha uma barra no final.
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
        console.error("Erro ao buscar credenciais da Evolution API:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  return { credentials, loading, error };
}
