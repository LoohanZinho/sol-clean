

'use client';

import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, Bot, Smartphone, Bell, FlaskConical, Palette, CheckCircle, Sun, Moon, MessageSquareOff, CalendarDays, Trash2, Download, Timer, BrainCircuit, ShieldCheck, MessageCircleQuestion, KeyRound } from 'lucide-react';
import { BusinessOperatingHours } from './BusinessOperatingHours';
import { useDisplaySettings } from '@/hooks/useDisplaySettings';
import { Slider } from '@/components/ui/slider';
import { Label } from '../ui/label';
import { cn } from '@/lib/utils';
import type { AutomationSettings, AiConfig, FollowUpStep, AiProviderSettings } from '@/lib/types';
import { Textarea } from '../ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AnimatePresence, motion } from 'framer-motion';
import { Badge } from '../ui/badge';


const ThemeSelector = ({ userId }: { userId: string }) => {
    const { settings, updateSetting } = useDisplaySettings(userId);
    const activeTheme = settings.activeTheme || 'default';

    const themes = [
        { id: 'default', name: 'Padrão Escuro', icon: Moon, colors: ['bg-primary', 'bg-secondary', 'bg-card'] },
        { id: 'light', name: 'Claro', icon: Sun, colors: ['bg-primary', 'bg-secondary', 'bg-card'] },
        { id: 'experimental', name: 'Experimental', icon: FlaskConical, colors: ['bg-primary', 'bg-secondary', 'bg-card'] },
        { id: 'solarized-dark', name: 'Solarized Dark', icon: Palette, colors: ['bg-primary', 'bg-secondary', 'bg-card'] },
    ];
    
    return (
        <div>
            <h2 className="text-2xl font-bold">Aparência</h2>
            <p className="text-muted-foreground mt-1">Escolha um tema visual para o painel.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                {themes.map((theme) => {
                    const isSelected = activeTheme === theme.id;
                    return (
                        <Card 
                            key={theme.id}
                            className={cn(
                                "cursor-pointer transition-all duration-200 border-2",
                                isSelected ? 'border-primary' : 'border-card hover:border-accent',
                                theme.id !== 'default' && `theme-${theme.id}`
                            )}
                            onClick={() => updateSetting({ activeTheme: theme.id as any })}
                        >
                            <CardContent className="p-4 space-y-4">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-secondary rounded-lg">
                                            <theme.icon className="h-5 w-5 text-secondary-foreground" />
                                        </div>
                                        <h3 className="font-semibold text-card-foreground">{theme.name}</h3>
                                    </div>
                                    {isSelected && <CheckCircle className="h-5 w-5 text-primary" />}
                                </div>
                            
                                <div className="flex items-center space-x-2">
                                    {theme.colors.map((color, index) => (
                                        <div key={index} className={cn("h-8 w-full rounded-md", color, 'border border-black/10')} />
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}

const FollowUpSettings = ({ settings, onUpdate }: { settings: Partial<AutomationSettings>, onUpdate: (field: keyof AutomationSettings, value: any) => void }) => {
    const [localFollowUps, setLocalFollowUps] = useState(settings.followUps);
    const [activeTab, setActiveTab] = useState<'first' | 'second' | 'third'>('first');

    useEffect(() => {
        setLocalFollowUps(settings.followUps);
    }, [settings.followUps]);
    
    const handleStepChange = (step: 'first' | 'second' | 'third', field: keyof FollowUpStep, value: any) => {
        const newFollowUps = {
            ...localFollowUps,
            [step]: {
                ...localFollowUps![step],
                [field]: value,
            },
        };
        setLocalFollowUps(newFollowUps as any);
        // Defer DB update for sliders and text areas
        if(field !== 'intervalHours' && field !== 'message') {
             onUpdate('followUps', newFollowUps);
        }
    };

    const handleBlur = () => {
         onUpdate('followUps', localFollowUps);
    };

    const handleSliderCommit = () => {
        onUpdate('followUps', localFollowUps);
    }
    
    if (!localFollowUps) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center"><MessageCircleQuestion className="mr-3 h-5 w-5 text-primary" />Follow-up Automático</CardTitle>
                <CardDescription>Envie uma cadência de até 3 mensagens de acompanhamento se o cliente não responder após um certo tempo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg bg-card border gap-4">
                    <Label htmlFor="follow-up-enabled" className="font-medium">Ativar cadência de follow-up</Label>
                    <Switch
                        id="follow-up-enabled"
                        checked={settings.isFollowUpEnabled ?? false}
                        onCheckedChange={checked => onUpdate('isFollowUpEnabled', checked)}
                    />
                </div>

                <AnimatePresence>
                {settings.isFollowUpEnabled && (
                     <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <div className="border-b border-border/50">
                            <div className="flex space-x-1" aria-label="Navegação de Follow-ups">
                                {(['first', 'second', 'third'] as const).map((step, index) => (
                                    <button 
                                        key={step}
                                        onClick={() => setActiveTab(step)}
                                        className={cn(
                                            "px-4 py-2 text-sm font-medium flex items-center gap-2 whitespace-nowrap transition-colors duration-200 rounded-t-md",
                                            activeTab === step 
                                                ? 'bg-accent text-accent-foreground' 
                                                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                                        )}
                                    >
                                        {`${index + 1}º Contato`}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="p-4 rounded-b-lg bg-accent/30 border border-t-0 border-border/50">
                             {(['first', 'second', 'third'] as const).map(step => (
                                 <div key={step} className={cn("space-y-4", activeTab !== step && 'hidden')}>
                                     <div className="flex items-center justify-between">
                                        <Label htmlFor={`follow-up-${step}-enabled`} className="font-medium">{`Ativar ${step === 'first' ? 'primeiro' : step === 'second' ? 'segundo' : 'terceiro'} follow-up`}</Label>
                                        <Switch
                                            id={`follow-up-${step}-enabled`}
                                            checked={localFollowUps[step]?.enabled}
                                            onCheckedChange={checked => handleStepChange(step, 'enabled', checked)}
                                        />
                                    </div>
                                    <div style={{ opacity: localFollowUps[step]?.enabled ? 1 : 0.5 }}>
                                        <div className="space-y-2">
                                            <Label htmlFor={`follow-up-${step}-interval`}>Enviar após (horas de inatividade)</Label>
                                            <Slider
                                                id={`follow-up-${step}-interval`}
                                                min={1} max={168} step={1} // Up to 7 days
                                                value={[localFollowUps[step]?.intervalHours || 24]}
                                                onValueChange={(value) => handleStepChange(step, 'intervalHours', value[0])}
                                                onValueCommit={handleSliderCommit}
                                                disabled={!localFollowUps[step]?.enabled}
                                            />
                                            <div className="text-center font-bold text-lg">{localFollowUps[step]?.intervalHours || 24} horas</div>
                                        </div>
                                         <div className="space-y-2">
                                            <Label htmlFor={`follow-up-${step}-message`}>Mensagem do follow-up</Label>
                                            <Textarea
                                                id={`follow-up-${step}-message`}
                                                placeholder="Mensagem a ser enviada..."
                                                value={localFollowUps[step]?.message}
                                                onChange={e => handleStepChange(step, 'message', e.target.value)}
                                                onBlur={handleBlur}
                                                className="min-h-[100px]"
                                                 disabled={!localFollowUps[step]?.enabled}
                                            />
                                        </div>
                                    </div>
                                 </div>
                             ))}
                        </div>
                    </motion.div>
                )}
                </AnimatePresence>
            </CardContent>
        </Card>
    );
};


interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed',
    platform: string
  }>;
  prompt(): Promise<void>;
}

export const SettingsGeneral = ({ userId }: { userId: string }) => {
    const [automationSettings, setAutomationSettings] = useState<Partial<AutomationSettings>>({});
    const [aiProviderSettings, setAiProviderSettings] = useState<Partial<AiProviderSettings>>({});
    const [isPromptConfigured, setIsPromptConfigured] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [notificationPermission, setNotificationPermission] = useState('default');
    const [localOutOfHoursMessage, setLocalOutOfHoursMessage] = useState('');
    const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

    const { settings: displaySettings, loading: displayLoading, updateSetting } = useDisplaySettings(userId);

    const [fontSize, setFontSize] = useState(displaySettings.chatFontSize);
    const isDevMode = automationSettings.isDevModeEnabled ?? false;
    const isGroupingToggleLocked = !isDevMode;
    const isApiKeyConfigured = !!aiProviderSettings.apiKey;

    useEffect(() => {
        setFontSize(displaySettings.chatFontSize);
    }, [displaySettings.chatFontSize]);
    
    useEffect(() => {
      const handleBeforeInstallPrompt = (e: Event) => {
        e.preventDefault();
        setDeferredInstallPrompt(e as BeforeInstallPromptEvent);
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      };
    }, []);

    useEffect(() => {
        if (!userId) {
            setLoading(false);
            return;
        }
        
        const firestore = getFirebaseFirestore();

        const checkPromptConfig = async () => {
            const aiConfigRef = doc(firestore, 'users', userId, 'settings', 'aiConfig');
            const docSnap = await getDoc(aiConfigRef);
            if (docSnap.exists() && (docSnap.data() as AiConfig).fullPrompt) {
                setIsPromptConfigured(true);
            } else {
                setIsPromptConfigured(false);
            }
        };

        checkPromptConfig(); // Initial check

        const defaultFollowUps = {
            first: { enabled: true, intervalHours: 24, message: 'Olá! Só para saber se você ainda tem alguma dúvida sobre o que conversamos?' },
            second: { enabled: false, intervalHours: 48, message: 'Olá novamente! Passando para saber se você teve a chance de ver minha última mensagem.' },
            third: { enabled: false, intervalHours: 72, message: 'Esta é minha última tentativa de contato. Se precisar de algo, estarei por aqui!' },
        };
        const defaultAutomationSettings: Partial<AutomationSettings> = { 
            isAiActive: false,
            sendOutOfHoursMessage: false, 
            outOfHoursMessage: '', 
            isBusinessHoursEnabled: true, 
            autoClearLogs: true, 
            isMessageGroupingEnabled: true,
            messageGroupingInterval: 10,
            isDevModeEnabled: false,
            aiTemperature: 0.2,
            isFollowUpEnabled: false,
            followUps: defaultFollowUps,
        };

        const automationRef = doc(firestore, 'users', userId, 'settings', 'automation');
        const unsubscribeAutomation = onSnapshot(automationRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data() as AutomationSettings;
                setAutomationSettings({ ...defaultAutomationSettings, ...data });
                setLocalOutOfHoursMessage(data.outOfHoursMessage || '');
            } else {
                 setDoc(automationRef, defaultAutomationSettings);
                 setAutomationSettings(defaultAutomationSettings);
            }
            setLoading(false);
        }, (error) => {
            console.error("Error fetching automation settings:", error);
            setLoading(false);
        });

        const providerRef = doc(firestore, 'users', userId, 'settings', 'aiProvider');
        const unsubscribeProvider = onSnapshot(providerRef, (docSnap) => {
            if (docSnap.exists()) {
                setAiProviderSettings(docSnap.data() as AiProviderSettings);
            } else {
                setAiProviderSettings({});
            }
        });

        if (typeof window !== 'undefined' && 'Notification' in window) {
            setNotificationPermission(Notification.permission);
        }
        
        const aiConfigRef = doc(firestore, 'users', userId, 'settings', 'aiConfig');
        const unsubscribeAiConfig = onSnapshot(aiConfigRef, (docSnap) => {
             if (docSnap.exists() && (docSnap.data() as AiConfig).fullPrompt) {
                setIsPromptConfigured(true);
            } else {
                setIsPromptConfigured(false);
                handleAutomationChange('isAiActive', false);
            }
        });

        return () => {
             unsubscribeAutomation();
             unsubscribeAiConfig();
             unsubscribeProvider();
        }
    }, [userId]);
    
    const handleAutomationChange = async (field: keyof AutomationSettings, value: any) => {
        if (!userId) return;

        if (field === 'isAiActive' && value === true && (!isPromptConfigured || !isApiKeyConfigured)) {
            return;
        }
        
        setAutomationSettings(prev => ({...prev, [field]: value}));
        
        setSaving(true);
        try {
            const firestore = getFirebaseFirestore();
            const docRef = doc(firestore, 'users', userId, 'settings', 'automation');
            await setDoc(docRef, { [field]: value }, { merge: true });
        } catch (error) {
            console.error(`Error saving automation field ${field}:`, error);
            setAutomationSettings(prev => {
                const revertedState = {...prev};
                if(typeof value === 'boolean') {
                    (revertedState as any)[field] = !value;
                }
                return revertedState;
            });
        } finally {
            setSaving(false);
        }
    };

    const handleOutOfHoursMessageBlur = async () => {
        if (automationSettings.outOfHoursMessage === localOutOfHoursMessage) return;
        await handleAutomationChange('outOfHoursMessage', localOutOfHoursMessage);
    };

    const handleRequestNotificationPermission = async () => {
        if (typeof window === 'undefined' || !('Notification' in window) || notificationPermission !== 'default') {
            return;
        }

        try {
            const permission = await Notification.requestPermission();
            setNotificationPermission(permission);

            if (permission === 'granted') {
                 new Notification("Notificações Ativadas!", {
                    body: "Você receberá alertas importantes aqui.",
                    icon: "/icon-192.png"
                });
                updateSetting({ notificationsEnabled: true });
            }
        } catch (error) {
            console.error("Error requesting notification permission:", error);
        }
    };
    
    const renderNotificationControl = () => {
        if (notificationPermission === 'denied') {
            return <p className="text-sm text-destructive">As notificações estão bloqueadas nas configurações do seu navegador.</p>;
        }

        if (notificationPermission === 'default') {
            return (
                <Button onClick={handleRequestNotificationPermission}>
                    Ativar Notificações no Navegador
                </Button>
            );
        }

        return (
             <Switch
                id="notifications-enabled-switch"
                checked={displaySettings.notificationsEnabled ?? false}
                onCheckedChange={(checked) => updateSetting({ notificationsEnabled: checked })}
                disabled={!userId || displayLoading}
            />
        );
    };

    const handleFontSizeChange = (value: number[]) => {
        setFontSize(value[0]);
    };

    const handleFontSizeCommit = (value: number[]) => {
        updateSetting({ chatFontSize: value[0] });
    };
    
    const handleInstallClick = async () => {
      if (!deferredInstallPrompt) return;
      await deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredInstallPrompt(null);
      }
    };

    const getTemperatureLabel = (temp: number) => {
        if (temp <= 0.2) return 'Focado';
        if (temp <= 0.5) return 'Balanceado';
        if (temp <= 0.8) return 'Criativo';
        return 'Experimental';
    };
    
    const isAiSwitchDisabled = !isPromptConfigured || !isApiKeyConfigured || saving;
    let aiSwitchTooltipContent = '';
    if (!isApiKeyConfigured) {
        aiSwitchTooltipContent = 'Configure sua chave de API na aba "Provedor IA" para ativar.';
    } else if (!isPromptConfigured) {
        aiSwitchTooltipContent = 'Configure o Agente de IA primeiro para poder ativar.';
    }

    if (loading || displayLoading) {
         return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-pulse-subtle text-primary" /></div>;
    }

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl font-bold">Automação</h2>
                <p className="text-muted-foreground mt-1">Controle o comportamento geral do sistema.</p>
                <Card className="mt-4">
                     <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className={cn("p-0", isAiSwitchDisabled && "cursor-not-allowed")}>
                                    <CardHeader className={cn("flex flex-col sm:flex-row sm:items-center sm:justify-between", isAiSwitchDisabled && "opacity-50")}>
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-secondary rounded-lg">
                                                <Bot className="h-6 w-6 text-secondary-foreground" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold">Atendimento com IA</h3>
                                                <p className="text-sm text-muted-foreground">A IA está {(automationSettings.isAiActive && !isAiSwitchDisabled) ? 'ativa' : 'inativa'}.</p>
                                            </div>
                                        </div>
                                        <Switch
                                            className="mt-2 sm:mt-0"
                                            checked={isAiSwitchDisabled ? false : !!automationSettings.isAiActive}
                                            onCheckedChange={(val) => handleAutomationChange('isAiActive', val)}
                                            disabled={isAiSwitchDisabled}
                                        />
                                    </CardHeader>
                                </div>
                            </TooltipTrigger>
                             {aiSwitchTooltipContent && (
                                <TooltipContent>
                                    <div className="flex items-center gap-2">
                                        <KeyRound className="h-4 w-4" />
                                        <p>{aiSwitchTooltipContent}</p>
                                    </div>
                                </TooltipContent>
                            )}
                        </Tooltip>
                    </TooltipProvider>
                </Card>
            </div>
            
            <div>
                <h2 className="text-2xl font-bold">Modo Desenvolvedor</h2>
                <p className="text-muted-foreground mt-1">Controle o nível de logs e otimizações do sistema.</p>
                 <Card className="mt-4">
                     <CardHeader>
                        <CardTitle className="flex items-center"><ShieldCheck className="mr-3 h-5 w-5 text-primary" />Modo Desenvolvedor</CardTitle>
                        <CardDescription>Quando desativado, o sistema salva apenas logs de erro e força otimizações. Ative para depuração completa.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg bg-card border gap-4">
                            <Label htmlFor="dev-mode-enabled" className="font-medium">Ativar Modo Desenvolvedor</Label>
                            <Switch
                                id="dev-mode-enabled"
                                checked={automationSettings.isDevModeEnabled ?? false}
                                onCheckedChange={checked => handleAutomationChange('isDevModeEnabled', checked)}
                                disabled={saving || !userId}
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>
            
            <div>
                <h2 className="text-2xl font-bold">Agrupamento de Mensagens</h2>
                <p className="text-muted-foreground mt-1">Aguarde o cliente terminar de digitar antes de acionar a IA.</p>
                 <Card className="mt-4">
                     <CardHeader>
                        <CardTitle className="flex items-center"><Timer className="mr-3 h-5 w-5 text-primary" />Agrupar Mensagens</CardTitle>
                        <CardDescription>Evita que a IA responda a cada mensagem individualmente quando o cliente envia várias em sequência.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg bg-card border gap-4" style={{ opacity: isGroupingToggleLocked ? 0.7 : 1 }}>
                            <Label htmlFor="message-grouping-enabled" className="font-medium">Ativar agrupamento de mensagens</Label>
                            <Switch
                                id="message-grouping-enabled"
                                checked={isGroupingToggleLocked ? true : (automationSettings.isMessageGroupingEnabled ?? true)}
                                onCheckedChange={checked => handleAutomationChange('isMessageGroupingEnabled', checked)}
                                disabled={saving || !userId || isGroupingToggleLocked}
                            />
                        </div>
                        <div style={{ opacity: (isGroupingToggleLocked || automationSettings.isMessageGroupingEnabled) ? 1 : 0.5 }}>
                             <div className="p-4 rounded-lg bg-card border space-y-2">
                                <Label htmlFor="grouping-interval">Agrupar mensagens recebidas em um intervalo de (segundos)</Label>
                                <Slider
                                    id="grouping-interval"
                                    min={10}
                                    max={30}
                                    step={1}
                                    defaultValue={[10]}
                                    value={[automationSettings.messageGroupingInterval || 10]}
                                    onValueChange={(value) => setAutomationSettings(prev => ({...prev, messageGroupingInterval: value[0]}))}
                                    onValueCommit={(value) => handleAutomationChange('messageGroupingInterval', value[0])}
                                    disabled={saving || !userId || !(isGroupingToggleLocked || automationSettings.isMessageGroupingEnabled)}
                                />
                                <div className="text-center font-bold text-lg">{automationSettings.messageGroupingInterval || 10} segundos</div>
                            </div>
                        </div>
                         {isGroupingToggleLocked && (
                            <p className="text-xs text-muted-foreground p-2 text-center">O agrupamento de mensagens é forçado quando o Modo Desenvolvedor está desativado para otimizar a performance.</p>
                        )}
                    </CardContent>
                </Card>
            </div>
            
            <div>
                <h2 className="text-2xl font-bold">Configurações da IA</h2>
                <p className="text-muted-foreground mt-1">Ajuste os parâmetros de como a IA gera as respostas.</p>
                <Card className="mt-4">
                     <CardHeader>
                        <CardTitle className="flex items-center"><BrainCircuit className="mr-3 h-5 w-5 text-primary" />Temperatura da IA</CardTitle>
                        <CardDescription>Controle a criatividade das respostas da IA. Valores baixos (focado) são mais diretos e previsíveis. Valores altos (criativo) geram respostas mais variadas.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-2">
                         <div className="p-4 rounded-lg bg-card border space-y-4">
                             <div className="flex justify-between items-center mb-2">
                                <Label htmlFor="temperature-slider">Criatividade</Label>
                                <Badge variant="secondary">
                                    {getTemperatureLabel(automationSettings.aiTemperature ?? 0.2)}
                                </Badge>
                            </div>
                            <Slider
                                id="temperature-slider"
                                min={0.0}
                                max={1.0}
                                step={0.1}
                                value={[automationSettings.aiTemperature ?? 0.2]}
                                onValueChange={(value) => setAutomationSettings(prev => ({...prev, aiTemperature: value[0]}))}
                                onValueCommit={(value) => handleAutomationChange('aiTemperature', value[0])}
                                disabled={saving || !userId}
                            />
                            <div className="text-center font-bold text-lg">{automationSettings.aiTemperature?.toFixed(1) ?? '0.2'}</div>
                        </div>
                    </CardContent>
                </Card>
            </div>
            
            <div>
                <h2 className="text-2xl font-bold">Mensagens Automáticas e Follow-up</h2>
                <p className="text-muted-foreground mt-1">Configure respostas para situações específicas para manter os clientes engajados.</p>
                <div className="space-y-4 mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center"><MessageSquareOff className="mr-3 h-5 w-5 text-primary" />Fora de Expediente</CardTitle>
                            <CardDescription>Envie uma mensagem automática quando um cliente entrar em contato fora do horário de funcionamento.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg bg-card border gap-4">
                                <Label htmlFor="out-of-hours-enabled" className="font-medium">Ativar mensagem "Fora de Expediente"</Label>
                                <Switch
                                    id="out-of-hours-enabled"
                                    checked={automationSettings.sendOutOfHoursMessage ?? false}
                                    onCheckedChange={checked => handleAutomationChange('sendOutOfHoursMessage', checked)}
                                    disabled={saving || !userId}
                                />
                            </div>
                            <AnimatePresence>
                            {(automationSettings.sendOutOfHoursMessage) && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                                    className="overflow-hidden"
                                >
                                    <div className="p-4 rounded-lg bg-card border space-y-2">
                                        <Label htmlFor="out-of-hours-message">Mensagem a ser enviada</Label>
                                        <Textarea
                                            id="out-of-hours-message"
                                            placeholder="Ex: Olá! Nosso horário de atendimento é das 8h às 18h. Retornaremos sua mensagem assim que possível."
                                            value={localOutOfHoursMessage}
                                            onChange={e => setLocalOutOfHoursMessage(e.target.value)}
                                            onBlur={handleOutOfHoursMessageBlur}
                                            className="min-h-[100px]"
                                            disabled={saving || !userId}
                                        />
                                    </div>
                                </motion.div>
                            )}
                            </AnimatePresence>
                        </CardContent>
                    </Card>
                    <FollowUpSettings settings={automationSettings} onUpdate={handleAutomationChange} />
                </div>
            </div>

            <div>
                <h2 className="text-2xl font-bold">Horário de Funcionamento</h2>
                <p className="text-muted-foreground mt-1">Defina os horários em que a IA pode responder aos clientes.</p>
                <Card className="mt-4">
                    <CardHeader>
                        <CardTitle className="flex items-center"><CalendarDays className="mr-3 h-5 w-5 text-primary" />Controle de Horário</CardTitle>
                        <CardDescription>Ative para que a IA só responda nos horários definidos abaixo. Desative para que responda 24h.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg bg-card border gap-4">
                            <Label htmlFor="business-hours-enabled" className="font-medium">Respeitar horário de funcionamento</Label>
                            <Switch
                                id="business-hours-enabled"
                                checked={automationSettings.isBusinessHoursEnabled ?? true}
                                onCheckedChange={checked => handleAutomationChange('isBusinessHoursEnabled', checked)}
                                disabled={saving || !userId}
                            />
                        </div>
                        <AnimatePresence>
                            {(automationSettings.isBusinessHoursEnabled ?? true) && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                                    className="overflow-hidden"
                                >
                                    <BusinessOperatingHours userId={userId} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </CardContent>
                </Card>
            </div>

            <ThemeSelector userId={userId} />
            
             <div>
                <h2 className="text-2xl font-bold">Acesso e Alertas</h2>
                <p className="text-muted-foreground mt-1">Instale o painel como um aplicativo no seu dispositivo e habilite notificações para receber alertas importantes.</p>
                <div className="mt-4 space-y-4">
                    {deferredInstallPrompt && (
                        <Card>
                            <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className="p-3 bg-secondary rounded-lg flex-shrink-0">
                                        <Smartphone className="h-6 w-6 text-secondary-foreground" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold">Instalar no Dispositivo</h3>
                                        <p className="text-sm text-muted-foreground">Adicione o painel à tela inicial para acesso rápido.</p>
                                    </div>
                                </div>
                                <Button onClick={handleInstallClick} disabled={!deferredInstallPrompt} className="w-full sm:w-auto flex-shrink-0">
                                    <Download className="h-4 w-4 mr-2" />
                                    Instalar App
                                </Button>
                            </CardContent>
                        </Card>
                    )}
                     <Card>
                        <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="p-3 bg-secondary rounded-lg flex-shrink-0">
                                    <Bell className="h-6 w-6 text-secondary-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold">Alertas do Navegador</h3>
                                    <p className="text-sm text-muted-foreground">Receba um alerta quando uma intervenção for necessária.</p>
                                </div>
                            </div>
                            <div className="flex-shrink-0">
                               {renderNotificationControl()}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <div>
                <h2 className="text-2xl font-bold">Manutenção</h2>
                <p className="text-muted-foreground mt-1">Opções para otimização e manutenção do sistema.</p>
                 <Card className="mt-4">
                    <CardHeader>
                        <CardTitle className="flex items-center"><Trash2 className="mr-3 h-5 w-5 text-primary" />Limpeza Automática de Logs</CardTitle>
                        <CardDescription>Mantenha o banco de dados otimizado, evitando o acúmulo excessivo de logs antigos.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg bg-card border gap-4">
                            <Label htmlFor="auto-clear-logs" className="font-medium">Limpar logs automaticamente</Label>
                            <Switch
                                id="auto-clear-logs"
                                checked={automationSettings.autoClearLogs ?? true}
                                onCheckedChange={checked => handleAutomationChange('autoClearLogs', checked)}
                                disabled={saving || !userId}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground p-4">Quando ativado, o sistema manterá apenas os 50 logs mais recentes para cada categoria (IA, Webhook, Sistema), apagando os mais antigos automaticamente.</p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};
