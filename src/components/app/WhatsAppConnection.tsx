'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, QrCode, ServerCrash, CheckCircle, RefreshCw } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { createWhatsAppInstance, checkInstanceConnectionState, fetchAndSaveInstanceApiKey } from '@/actions/evolutionApiActions';
import Image from 'next/image';

interface WhatsAppConnectionProps {
    userId: string;
    userEmail: string;
}

export const WhatsAppConnection = ({ userId, userEmail }: WhatsAppConnectionProps) => {
    const [isLoading, setIsLoading] = useState(false);
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
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
        setQrCode(null);
        try {
            await fetchAndSaveInstanceApiKey(userId, userEmail);
            setIsConnected(true);
        } catch (e: any) {
            setError(e.message || 'Falha ao salvar as credenciais da instância.');
        } finally {
            setIsFinalizing(false);
        }
    };


    const startPolling = () => {
        stopPolling(); 
        setIsCheckingStatus(true);
        pollingIntervalRef.current = setInterval(async () => {
            try {
                const result = await checkInstanceConnectionState(userEmail);
                if (result.state === 'open') {
                    await handleSuccessfulConnection();
                } else if (result.state === 'close') {
                     // If it disconnects while waiting, try to get a new QR code.
                    handleConnect();
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
        setIsLoading(true);
        setError(null);
        setQrCode(null);
        setIsConnected(false);
        setIsDialogOpen(true);
        stopPolling();

        try {
            const result = await createWhatsAppInstance(userEmail, userId);
            if (result.success) {
                if (result.state === 'open') {
                    await handleSuccessfulConnection();
                } else if (result.qrCode) {
                    setQrCode(result.qrCode);
                    startPolling();
                } else {
                    setError('Não foi possível obter o QR code da API.');
                }
            } else {
                setError(result.error || 'Ocorreu um erro desconhecido.');
            }
        } catch (e: any) {
            setError(e.message || 'Falha ao conectar com o servidor.');
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-background p-8 text-center">
            <div className="p-4 bg-primary/10 rounded-full mb-6">
                <FaWhatsapp className="h-16 w-16 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold">Conecte seu WhatsApp</h2>
            <p className="max-w-md mt-2 text-muted-foreground">Clique no botão abaixo para gerar um QR Code e sincronizar suas conversas com o painel.</p>
            <Button onClick={handleConnect} className="mt-6" size="lg" disabled={isLoading}>
                {isLoading ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                    <FaWhatsapp className="mr-2 h-5 w-5" />
                )}
                Conectar ao WhatsApp
            </Button>
            
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
                if (!open) {
                    stopPolling();
                    setIsDialogOpen(false);
                }
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Conectar WhatsApp</DialogTitle>
                        <DialogDescription>
                            Abra o WhatsApp no seu celular, vá em Aparelhos Conectados e leia o QR Code abaixo.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex items-center justify-center p-4 min-h-[300px]">
                        {isLoading && <Loader2 className="h-12 w-12 animate-spin text-primary" />}
                        {error && (
                            <div className="text-center text-red-500">
                                <ServerCrash className="h-12 w-12 mx-auto mb-2" />
                                <p className="font-semibold">Falha na Conexão</p>
                                <p className="text-sm">{error}</p>
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
                        {qrCode && !isConnected && !isFinalizing && (
                            <div className="text-center space-y-4">
                                <Image
                                    src={`${qrCode}`}
                                    alt="QR Code do WhatsApp"
                                    width={300}
                                    height={300}
                                    className="rounded-lg"
                                />
                                {isCheckingStatus && (
                                     <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground animate-pulse">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        <span>Aguardando confirmação da conexão...</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};