

'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { BrainCircuit, Server, Webhook } from 'lucide-react';
import { AiLogsPage } from './AiLogsPage';
import { SystemLogsPage } from './SystemLogsPage';
import { WebhookLogsPage } from './WebhookLogsPage';


export const LogsContainer = ({ userId }: { userId: string }) => {
    const [activeLogTab, setActiveLogTab] = useState('ai');

    const renderLogContent = () => {
        switch (activeLogTab) {
            case 'ai':
                return <AiLogsPage userId={userId} />;
            case 'webhook':
                return <WebhookLogsPage userId={userId} />;
            case 'system':
                return <SystemLogsPage userId={userId} />;
            default:
                return null;
        }
    }

    const logTabs = [
        { id: 'ai', label: 'IA', icon: BrainCircuit },
        { id: 'webhook', label: 'Webhook', icon: Webhook },
        { id: 'system', label: 'Sistema', icon: Server },
    ];

    return (
        <div className="w-full space-y-6">
             <div>
                <h2 className="text-2xl font-bold">Logs do Sistema</h2>
                <p className="text-muted-foreground mt-1">Monitore as execuções da IA, chamadas de webhooks e eventos internos do sistema para diagnosticar problemas.</p>
            </div>
            <div className="border-b border-border/50">
                <div className="flex space-x-4" aria-label="Navegação de Logs">
                    {logTabs.map(tab => (
                         <button 
                            key={tab.id}
                            onClick={() => setActiveLogTab(tab.id)}
                            className={cn(
                                "px-4 py-2 text-sm font-medium flex items-center gap-2 whitespace-nowrap transition-colors duration-200 rounded-t-md",
                                activeLogTab === tab.id 
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
                {renderLogContent()}
            </div>
        </div>
    )
};
