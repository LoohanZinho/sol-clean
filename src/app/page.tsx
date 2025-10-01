
'use client';

import { useState, useEffect, FormEvent } from 'react';
import { doc, getDocs, collection, query, where } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase';
import { AppLayout } from '@/app/AppLayout';
import { LoginScreen } from '@/components/app/LoginScreen';
import { Loader2 } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';

// Simplified user object for Firestore-based login
interface SimpleUser {
    uid: string;
    email: string;
}

const loadingMessages = [
    'Verificando sessão...',
    'Quase lá...',
    'Organizando tudo para você.',
    'Carregando conversas...',
];

const LoadingScreen = () => {
    const [messageIndex, setMessageIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setMessageIndex((prevIndex) => (prevIndex + 1) % loadingMessages.length);
        }, 2500);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex flex-col min-h-screen items-center justify-center bg-background text-foreground">
            <div className="text-center flex flex-col items-center w-full max-w-xs sm:max-w-sm">
                <FaWhatsapp className="h-16 w-16 mb-8 text-primary animate-pulse" />
                <p className="text-muted-foreground h-5">
                   {loadingMessages[messageIndex]}
                </p>
            </div>
        </div>
    );
};


export default function Home() {
    const [user, setUser] = useState<SimpleUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [loginLoading, setLoginLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Attempt to load user from local storage for persistence
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
        setLoading(false);
    }, []);

    const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        
        setError(null);
        setLoginLoading(true);
        const formData = new FormData(e.currentTarget);
        const email = formData.get('email') as string;
        const password = formData.get('password') as string;

        try {
            const firestore = getFirebaseFirestore();
            const usersRef = collection(firestore, 'users');
            // Query Firestore for a user with matching email and password
            const q = query(usersRef, where("email", "==", email), where("password", "==", password));
            
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                setError('Email ou senha inválidos.');
            } else {
                // Assuming one user per email/password combo
                const userDoc = querySnapshot.docs[0];
                const userData: SimpleUser = {
                    uid: userDoc.id,
                    email: userDoc.data().email,
                };
                setUser(userData);
                localStorage.setItem('user', JSON.stringify(userData)); // Save to session
            }
        } catch (err: any) {
            console.error("Login error:", err);
            setError('Ocorreu um erro ao fazer login.');
        } finally {
            setLoginLoading(false);
        }
    };

    const handleLogout = async () => {
        setUser(null);
        localStorage.removeItem('user'); // Clear from session
    }

    if (loading) {
        return <LoadingScreen />;
    }

    // Since the FirebaseUser type is different now, we need to adapt AppLayout
    // We will cast the simple user to the expected shape for now.
    // A better solution would be to make AppLayout generic or use a common user type.
    const firebaseUserEquivalent = user ? { uid: user.uid, email: user.email } as any : null;

    return (
        <>
            {user ? (
                <AppLayout user={firebaseUserEquivalent} onLogout={handleLogout} />
            ) : (
                <LoginScreen onLogin={handleLogin} error={error} loading={loginLoading} />
            )}
        </>
    );
}
