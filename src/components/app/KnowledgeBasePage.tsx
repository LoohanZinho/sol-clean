
'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { BookOpen, HelpCircle, ShoppingCart, FileText } from 'lucide-react';
import { FaqSettingsPage } from './FaqSettingsPage';
import { ProductsSettingsPage } from './ProductsSettingsPage';
import { RagSettingsPage } from './RagSettingsPage';

export const KnowledgeBasePage = ({ userId }: { userId: string }) => {
    const [activeTab, setActiveTab] = useState('faq');

    const renderContent = () => {
        switch (activeTab) {
            case 'faq':
                return <FaqSettingsPage userId={userId} />;
            case 'products':
                return <ProductsSettingsPage userId={userId} />;
            case 'rag':
                return <RagSettingsPage userId={userId} />;
            default:
                return null;
        }
    };
    
    const tabs = [
        { id: 'faq', label: 'FAQ (Perguntas e Respostas)', icon: HelpCircle },
        { id: 'products', label: 'Produtos e Serviços', icon: ShoppingCart },
        { id: 'rag', label: 'RAG (Documentos)', icon: FileText },
    ];

    return (
        <div className="space-y-6">
             <div>
                <h2 className="text-2xl font-bold">Base de Conhecimento</h2>
                <p className="text-muted-foreground mt-1">
                    Ensine a IA a responder sobre seus produtos, serviços, dúvidas frequentes e documentos.
                </p>
            </div>
            <div className="border-b border-border/50">
                <div className="flex space-x-4" aria-label="Navegação da Base de Conhecimento">
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
