

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, ServerCrash, CheckCircle, RefreshCw, Smartphone, QrCode } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { createWhatsAppInstance, checkInstanceConnectionState, fetchAndSaveInstanceApiKey } from '@/actions/evolutionApiActions';
import Image from 'next/image';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { useEvolutionApiCredentials } from '@/hooks/useEvolutionApiCredentials';

interface WhatsAppConnectionProps {
    userId: string;
    userEmail: string;
    isOpen?: boolean;
    onClose?: () => void;
    onConnectClick?: () => void;
}

export const WhatsAppConnection = ({ userId, userEmail, isOpen, onClose, onConnectClick }: WhatsAppConnectionProps) => {
    const [isLoading, setIsLoading] = useState(false);
    const [pairingCode, setPairingCode] = useState<string | null>(null);
    const [base64, setBase64] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isCheckingStatus, setIsCheckingStatus] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const stopPolling = () => {
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }
    };
    
    useEffect(() => {
        return () => {
            stopPolling();
        };
    }, []);

    const handleSuccessfulConnection = async () => {
        stopPolling();
        setIsCheckingStatus(false);
        setIsFinalizing(true);
        setPairingCode(null);
        setBase64(null);
        
        await fetchAndSaveInstanceApiKey(userId, userEmail);
        
        setIsConnected(true);
        setIsFinalizing(false);
    };


    const startPolling = () => {
        stopPolling(); 
        setIsCheckingStatus(true);
        pollingIntervalRef.current = setInterval(async () => {
            try {
                const result = await checkInstanceConnectionState(userEmail, userId);
                if (result.state === 'open') {
                    await handleSuccessfulConnection();
                } else if (result.state === 'close') {
                    setError("A conexão foi fechada. Por favor, tente novamente.");
                    setIsCheckingStatus(false);
                    stopPolling();
                } else if (result.state === 'ERROR') {
                    setError(result.error || 'Erro ao verificar status.');
                    setIsCheckingStatus(false);
                    stopPolling();
                }
            } catch (e: any) {
                setError(e.message || 'Falha ao verificar o estado da conexão.');
                setIsCheckingStatus(false);
                stopPolling();
            }
        }, 5000);
    };

    const handleConnect = async () => {
        if (onConnectClick) {
            onConnectClick();
        }
        setIsLoading(true);
        setError(null);
        setPairingCode(null);
        setBase64(null);
        setIsConnected(false);
        stopPolling();

        try {
            const result = await createWhatsAppInstance(userEmail, userId);
            if (result.success) {
                if (result.state === 'open') {
                    await handleSuccessfulConnection();
                } else {
                    setPairingCode(result.pairingCode || null);
                    setBase64(result.base64 || null);
                    if (result.pairingCode || result.base64) {
                        startPolling();
                    } else {
                        setError('Não foi possível obter o código de pareamento ou QR Code da API.');
                    }
                }
            } else {
                setError(result.error ? result.error : 'Ocorreu um erro desconhecido.');
            }
        } catch (e: any) {
            setError(e.message || 'Falha ao conectar com o servidor.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDialogClose = () => {
        stopPolling();
        if(onClose) onClose();
    }
    
    // This is for the main pane on desktop
    if (!isOpen && !onClose) {
        return (
            <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-background p-8">
                <Card className="max-w-sm w-full">
                    <CardHeader className="items-center text-center">
                        <div className="p-3 bg-primary/10 rounded-full mb-2">
                            <FaWhatsapp className="h-8 w-8 text-primary" />
                        </div>
                        <CardTitle>Conecte seu WhatsApp</CardTitle>
                        <CardDescription>
                            Clique no botão abaixo para gerar um código e sincronizar suas conversas.
                        </CardDescription>
                    </CardHeader>
                    <CardFooter>
                        <Button onClick={handleConnect} className="w-full" size="lg" disabled={isLoading}>
                            {isLoading ? (
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            ) : (
                                <FaWhatsapp className="mr-2 h-5 w-5" />
                            )}
                            Conectar ao WhatsApp
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }
    
    return (
        <Dialog open={isOpen} onOpenChange={handleDialogClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Conectar aparelho</DialogTitle>
                    <DialogDescription>
                        Abra o WhatsApp em seu celular e use uma das opções abaixo.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col items-center justify-center p-4 min-h-[350px]">
                    {isLoading && <Loader2 className="h-12 w-12 animate-spin text-primary" />}
                    {error && (
                        <div className="text-center text-red-500 max-w-full">
                            <ServerCrash className="h-12 w-12 mx-auto mb-2" />
                            <p className="font-semibold">Falha na Conexão</p>
                            <pre className="mt-2 text-xs text-left bg-red-500/10 p-2 rounded-md whitespace-pre-wrap break-all">{error}</pre>
                        </div>
                    )}
                    {isFinalizing && (
                        <div className="text-center text-muted-foreground animate-pulse">
                            <Loader2 className="h-12 w-12 mx-auto mb-2" />
                            <p className="font-semibold">Finalizando conexão...</p>
                            <p className="text-sm">Salvando credenciais da instância.</p>
                        </div>
                    )}
                    {isConnected && !isFinalizing && (
                         <div className="text-center text-green-500">
                            <CheckCircle className="h-12 w-12 mx-auto mb-2" />
                            <p className="font-semibold">Conectado com Sucesso!</p>
                            <p className="text-sm text-muted-foreground">Atualize a página para ver suas conversas.</p>
                            <Button onClick={() => window.location.reload()} className="mt-4">
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Atualizar Página
                            </Button>
                        </div>
                    )}
                    {!isLoading && !error && !isConnected && (base64 || pairingCode) && (
                         <Tabs defaultValue="qrcode" className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="qrcode" disabled={!base64}><QrCode className="h-4 w-4 mr-2"/>QR Code</TabsTrigger>
                                <TabsTrigger value="pairingcode" disabled={!pairingCode}><Smartphone className="h-4 w-4 mr-2"/>Código</TabsTrigger>
                            </TabsList>
                            <TabsContent value="qrcode">
                                <div className="flex flex-col items-center justify-center space-y-4 pt-4">
                                    {base64 ? (
                                        <Image src={`data:image/png;base64,${base64}`} alt="QR Code" width={250} height={250} className="rounded-lg" />
                                    ) : (
                                        <div className="w-[250px] h-[250px] bg-muted rounded-lg flex items-center justify-center">
                                            <Loader2 className="h-8 w-8 animate-spin"/>
                                        </div>
                                    )}
                                    <p className="text-sm text-muted-foreground">Escaneie este código com seu celular.</p>
                                </div>
                            </TabsContent>
                            <TabsContent value="pairingcode">
                                <div className="flex flex-col items-center justify-center space-y-4 pt-4">
                                     <p className="text-sm text-center text-muted-foreground">Vá em <span className="font-semibold">Aparelhos Conectados {'>'} Conectar com número de telefone</span> e digite o código abaixo.</p>
                                    <div className="p-4 bg-muted rounded-lg">
                                        <p className="text-4xl font-bold tracking-widest text-foreground">{pairingCode}</p>
                                    </div>
                                </div>
                            </TabsContent>
                            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground animate-pulse mt-4">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Aguardando confirmação...</span>
                            </div>
                         </Tabs>
                    )}
                </div>
                 <DialogFooter>
                    <Button variant="outline" onClick={handleDialogClose}>Fechar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
