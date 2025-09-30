

'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Settings, HelpCircle, BookOpen, Bot, Share2, CalendarClock, Cpu, Wallet } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { SettingsGeneral } from '@/components/app/SettingsGeneral';
import { LogsContainer } from './LogsContainer';
import { KnowledgeBasePage } from './KnowledgeBasePage';
import { AgentBuilderPage } from './AgentBuilderPage';
import { SettingsIntegrationsPage } from './SettingsIntegrationsPage';
import { BusinessHoursSettings } from './BusinessHoursSettings';
import { SettingsAiProvider } from './SettingsAiProvider';

interface SettingsPageProps {
    userId: string;
    onLogout: () => void;
}

export const SettingsPage = ({ userId }: SettingsPageProps) => {
    const [activeTab, setActiveTab] = useState('general');
    
    const renderContent = () => {
        switch (activeTab) {
            case 'agent':
                return <AgentBuilderPage userId={userId} />;
            case 'provider':
                return <SettingsAiProvider userId={userId} />;
            case 'knowledge':
                return <KnowledgeBasePage userId={userId} />;
            case 'horarios':
                return <BusinessHoursSettings userId={userId} />;
            case 'integrations':
                return <SettingsIntegrationsPage userId={userId} />;
            case 'general':
                return <SettingsGeneral userId={userId} />;
            case 'logs':
                return <LogsContainer userId={userId} />;
            default:
                return (
                     <div className="text-center p-8 text-muted-foreground">
                        <h2 className="text-2xl font-semibold">Em breve</h2>
                        <p>Esta seção estará disponível em futuras atualizações.</p>
                    </div>
                );
        }
    };
    
    const tabs = [
        { id: 'general', label: 'Geral', icon: Settings },
        { id: 'agent', label: 'Agente IA', icon: Bot },
        { id: 'provider', label: 'Provedor IA', icon: Cpu },
        { id: 'knowledge', label: 'Conhecimento', icon: BookOpen },
        { id: 'horarios', label: 'Horários', icon: CalendarClock },
        { id: 'integrations', label: 'Integrações', icon: Share2 },
        { id: 'logs', label: 'Logs', icon: HelpCircle },
    ];

    return (
        <div className="flex flex-col">
            <div className="flex justify-between items-start flex-shrink-0 pt-8 px-4 md:px-8">
                 <div>
                    <h1 className="text-2xl md:text-3xl font-bold">Ajustes</h1>
                    <p className="text-muted-foreground mt-2">Ajuste as preferências e automações do sistema.</p>
                </div>
            </div>

            <div className="mt-6 md:mt-8 border-b border-border/50 flex-shrink-0 px-4 md:px-8">
              <div className="flex space-x-2 sm:space-x-4 overflow-x-auto -mb-px">
                  {tabs.map(tab => (
                      <button 
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={cn(
                            "px-3 sm:px-4 py-2.5 text-sm font-medium flex items-center gap-2 whitespace-nowrap transition-colors duration-200",
                            activeTab === tab.id 
                                ? 'border-b-2 border-primary text-primary' 
                                : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent'
                          )}
                      >
                          <tab.icon className="h-4 w-4" />
                           <span className="hidden sm:inline">{tab.label}</span>
                           <span className="sm:hidden">{tab.mobileLabel || tab.label}</span>
                      </button>
                  ))}
              </div>
            </div>
            
            <div className="mt-6 px-4 md:px-8">
                {renderContent()}
            </div>
        </div>
    );
};
