
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, ExternalLink, Loader2, LogOut, AlertTriangle, Link as LinkIcon } from 'lucide-react';
import { getGoogleAuthUrl, disconnectGoogleAccount, checkGoogleAuthState } from '@/actions/google-auth-actions';
import { FaCalendar } from 'react-icons/fa';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';


export const GoogleCalendarIntegration = ({ userId }: { userId: string }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [authUrl, setAuthUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [userPicture, setUserPicture] = useState<string | null>(null);

    const checkAuthStatus = async () => {
        try {
            const authState = await checkGoogleAuthState({ userId });
            setIsAuthenticated(authState.isAuthenticated);
            setUserEmail(authState.userEmail || null);
            setUserPicture(authState.userPicture || null);
        } catch (err) {
            setError("Erro ao verificar o status da autenticação com o Google.");
        } finally {
            setLoading(false);
        }
    };
    
    useEffect(() => {
        checkAuthStatus();
        
        const handleAuthMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) {
                return;
            }
            if (event.data === 'google-auth-success') {
                checkAuthStatus();
            }
        };

        window.addEventListener('message', handleAuthMessage);

        return () => {
            window.removeEventListener('message', handleAuthMessage);
        };
    }, [userId]);


    const handleConnect = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await getGoogleAuthUrl({ userId });
            if (result.success && result.authUrl) {
                setAuthUrl(result.authUrl);
                // Open popup
                const width = 600, height = 700;
                const left = (window.innerWidth / 2) - (width / 2);
                const top = (window.innerHeight / 2) - (height / 2);
                const authPopup = window.open(result.authUrl, 'googleAuth', `width=${width},height=${height},top=${top},left=${left}`);
                
                if (!authPopup) {
                    setError("Não foi possível abrir a janela de autenticação. Verifique se seu navegador está bloqueando pop-ups.");
                }

            } else {
                setError(result.error || "Não foi possível gerar a URL de autenticação.");
            }
        } catch (err) {
            setError("Ocorreu um erro ao tentar conectar.");
        } finally {
            setLoading(false);
        }
    };
    
     const handleDisconnect = async () => {
        setLoading(true);
        setError(null);
        try {
            await disconnectGoogleAccount({ userId });
            setIsAuthenticated(false);
            setUserEmail(null);
            setUserPicture(null);
        } catch (err) {
             setError("Ocorreu um erro ao tentar desconectar a conta.");
        } finally {
            setLoading(false);
        }
    };


    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-3">
                     <div className="p-2 bg-blue-500/10 rounded-lg">
                        <FaCalendar className="h-5 w-5 text-blue-400" />
                    </div>
                    Google Calendar
                </CardTitle>
                <CardDescription>
                    Permita que a IA acesse e gerencie sua agenda para criar, consultar e deletar eventos.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {loading && !error && (
                    <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                )}
                
                {error && (
                    <div className="p-4 rounded-md mb-6 flex items-center gap-3 bg-red-500/10 border border-red-500/20 text-red-400">
                         <AlertTriangle className="h-5 w-5" />
                         <p>{error}</p>
                    </div>
                )}

                {!loading && isAuthenticated && userEmail && (
                    <div className="p-4 rounded-lg flex items-center gap-4 bg-green-500/10 border border-green-500/20 text-green-300">
                         <Avatar className="h-10 w-10">
                            <AvatarImage src={userPicture || undefined} alt="Google Profile Picture" />
                            <AvatarFallback>{userEmail.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                            <p className="font-semibold text-green-200">Conectado como:</p>
                            <p className="text-sm">{userEmail}</p>
                        </div>
                        <CheckCircle className="h-5 w-5 flex-shrink-0 text-green-400" />
                    </div>
                )}
            </CardContent>
            <CardFooter className="flex-col sm:flex-row items-center justify-between gap-4">
                 <p className="text-xs text-muted-foreground">
                    A aplicação solicitará permissão para ver, editar e apagar eventos em suas agendas.
                </p>
                {isAuthenticated ? (
                     <Button variant="destructive" onClick={handleDisconnect} disabled={loading}>
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
                        Desconectar
                    </Button>
                ) : (
                    <Button onClick={handleConnect} disabled={loading}>
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LinkIcon className="mr-2 h-4 w-4" />}
                        Conectar com Google Calendar
                    </Button>
                )}
            </CardFooter>
        </Card>
    );
};
