
'use client';

import React, { useState, useEffect, FormEvent } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle, AlertTriangle, KeyRound, Eye, EyeOff, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAiProviderSettings, saveAiProviderSettings } from '@/actions/aiProviderActions';
import type { AiProviderSettings } from '@/lib/types';

export const SettingsAiProvider = ({ userId }: { userId: string }) => {
    const [apiKey, setApiKey] = useState('');
    const [showApiKey, setShowApiKey] = useState(false);
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    
    useEffect(() => {
        const fetchSettings = async () => {
            if (!userId) return;
            setLoading(true);
            try {
                const settings = await getAiProviderSettings(userId);
                if (settings) {
                    setApiKey(settings.apiKey || '');
                }
            } catch (error) {
                console.error("Error fetching AI provider settings:", error);
                setNotification({ type: 'error', message: 'Erro ao carregar configurações.' });
            } finally {
                setLoading(false);
            }
        };

        fetchSettings();
    }, [userId]);

    const handleSaveChanges = async (e: FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setNotification(null);
        try {
            await saveAiProviderSettings({ userId, apiKey });
            setNotification({ type: 'success', message: 'Configurações do provedor de IA salvas com sucesso!' });
        } catch (error) {
            console.error("Error saving AI provider settings:", error);
            setNotification({ type: 'error', message: 'Erro ao salvar as configurações.' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold">Provedor de IA</h2>
                <p className="text-muted-foreground mt-1">
                   Configure sua chave de API para as operações.
                </p>
            </div>
            <form onSubmit={handleSaveChanges}>
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-3">
                            <div className="p-2 bg-purple-500/10 rounded-lg">
                                <Cpu className="h-5 w-5 text-purple-400" />
                            </div>
                            Configuração do Google AI (Gemini)
                        </CardTitle>
                        <CardDescription>
                            Insira sua própria chave de API do Google AI Studio para gerenciar o uso e os custos.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-8">
                        {notification && (
                            <div className={cn("p-4 rounded-md flex items-center gap-3", {
                                'bg-green-500/10 border border-green-500/20 text-green-400': notification.type === 'success',
                                'bg-red-500/10 border border-red-500/20 text-red-400': notification.type === 'error'
                            })}>
                                {notification.type === 'success' ? <CheckCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                                <p className="font-medium">{notification.message}</p>
                            </div>
                        )}
                    
                        <div className="space-y-2">
                            <Label htmlFor="apiKey">Sua API Key do Gemini</Label>
                                <div className="relative">
                                <Input 
                                    id="apiKey" 
                                    value={apiKey} 
                                    onChange={(e) => setApiKey(e.target.value)} 
                                    type={showApiKey ? "text" : "password"} 
                                    placeholder="Cole sua chave de API aqui"
                                />
                                <Button type="button" variant="ghost" size="icon" className="absolute top-1/2 right-2 -translate-y-1/2" onClick={() => setShowApiKey(!showApiKey)} title={showApiKey ? "Ocultar" : "Mostrar"}>
                                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Você pode obter uma chave de API no Google AI Studio.
                            </p>
                        </div>
                        
                        <div className="pt-4">
                            <Button type="submit" disabled={saving || !userId}>
                                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Salvar Chave de API
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </form>
        </div>
    );
}
