

'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Share2, Calendar, Send } from 'lucide-react';
import { GoogleCalendarIntegration } from './integrations/GoogleCalendarIntegration';
import { SendWebhookPage } from './integrations/SendWebhookPage';

interface SettingsIntegrationsPageProps {
    userId: string;
}

export const SettingsIntegrationsPage = ({ userId }: SettingsIntegrationsPageProps) => {
    const [activeTab, setActiveTab] = useState('send-webhook');
    
    const renderContent = () => {
        switch (activeTab) {
            case 'google-calendar':
                return <GoogleCalendarIntegration userId={userId} />;
            case 'send-webhook':
                return <SendWebhookPage userId={userId} />;
            default:
                return null;
        }
    };
    
    const tabs = [
        { id: 'send-webhook', label: 'Enviar Notificação', icon: Send },
        { id: 'google-calendar', label: 'Google Calendar', icon: Calendar },
    ];

    return (
        <div className="space-y-6">
             <div>
                <h2 className="text-2xl font-bold">Integrações</h2>
                <p className="text-muted-foreground mt-1">Conecte o sistema com outros serviços para habilitar novas funcionalidades.</p>
            </div>
            <div className="border-b border-border/50">
                <div className="flex space-x-4" aria-label="Navegação de Integrações">
                    {tabs.map(tab => (
                         <button 
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "px-4 py-2 text-sm font-medium flex items-center gap-2 whitespace-nowrap transition-colors duration-200 rounded-t-md",
                                activeTab === tab.id 
                                    ? 'bg-accent text-accent-foreground' 
                                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                            )}
                        >
                            <tab.icon className="h-4 w-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>
             <div className="pt-2">
                {renderContent()}
            </div>
        </div>
    );
};
