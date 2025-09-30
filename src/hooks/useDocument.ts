
'use client';

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase';

/**
 * Hook genérico para buscar e ouvir um único documento do Firestore em tempo real.
 * @template T - O tipo do documento esperado.
 * @param {string | null} path - O caminho completo para o documento no Firestore (ex: 'users/userId/settings/automation').
 * @returns {{ document: T | null, loading: boolean, error: Error | null }} O documento, estado de carregamento e erro.
 */
export function useDocument<T>(path: string | null) {
  const [document, setDocument] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!path) {
      setDocument(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const firestore = getFirebaseFirestore();
    const docRef = doc(firestore, path);

    const unsubscribe = onSnapshot(docRef, 
      (docSnap) => {
        if (docSnap.exists()) {
          setDocument({ id: docSnap.id, ...docSnap.data() } as T);
        } else {
          setDocument(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error(`Erro ao buscar documento em ${path}:`, err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [path]);

  return { document, loading, error };
}
