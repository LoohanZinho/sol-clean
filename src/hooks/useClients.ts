
import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase';
import type { Conversation } from '@/lib/types';

/**
 * Hook to fetch and listen to all conversations for a user, treating them as 'clients'.
 * @param {string | null} userId - The ID of the user.
 * @returns {{ clients: Conversation[], loading: boolean, error: Error | null }} An object with the list of clients, loading state, and any errors.
 */
export function useClients(userId: string | null) {
  const [clients, setClients] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) {
      setClients([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const firestore = getFirebaseFirestore();
    const conversationsRef = collection(firestore, 'users', userId, 'conversations');
    const q = query(conversationsRef, orderBy('name', 'asc')); // Order by name alphabetically

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const clientList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Conversation));
        setClients(clientList);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  return { clients, loading, error };
}

