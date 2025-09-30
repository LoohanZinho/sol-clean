

'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, QrCode, ServerCrash, CheckCircle } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { createWhatsAppInstance } from '@/actions/evolutionApiActions';
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

    const handleConnect = async () => {
        setIsLoading(true);
        setError(null);
        setQrCode(null);
        setIsConnected(false);
        setIsDialogOpen(true);

        try {
            const result = await createWhatsAppInstance(userEmail);
            if (result.success) {
                if (result.qrCode === 'CONNECTED') {
                    setIsConnected(true);
                } else {
                    setQrCode(result.qrCode || null);
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
            
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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
                        {isConnected && (
                             <div className="text-center text-green-500">
                                <CheckCircle className="h-12 w-12 mx-auto mb-2" />
                                <p className="font-semibold">Já Conectado!</p>
                                <p className="text-sm">Esta instância já está ativa. Atualize a página.</p>
                            </div>
                        )}
                        {qrCode && (
                            <Image
                                src={`data:image/png;base64,${qrCode}`}
                                alt="QR Code do WhatsApp"
                                width={300}
                                height={300}
                                className="rounded-lg"
                            />
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

    