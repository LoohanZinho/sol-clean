

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { Users, Settings, ChevronLeft, LogOut, ChevronRight, Menu, X, AlertTriangle, FlaskConical, ShoppingCart } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { cn } from '@/lib/utils';
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetClose, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChatView } from '@/components/app/ChatView';
import { SettingsPage } from '@/components/app/SettingsPage';
import { ClientsPage } from '@/components/app/ClientsPage';
import { TestsPage } from '@/components/app/TestsPage';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useInterventionNotification } from '@/hooks/useInterventionNotification';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase';
import type { AiConfig } from '@/lib/types';

interface AppLayoutProps {
    user: FirebaseUser;
    onLogout: () => void;
}

const baseMenuItems = [
    { id: 'conversas', icon: FaWhatsapp, label: 'Conversas' },
    { id: 'contatos', icon: Users, label: 'Contatos' },
    { id: 'ajustes', icon: Settings, label: 'Ajustes' },
];

export const AppLayout = ({ user, onLogout }: AppLayoutProps) => {
    const [activeView, setActiveView] = useState('conversas');
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const userId = user.uid;
    
    const { connectionStatus } = useConnectionStatus(userId);
    const [isAlertVisible, setIsAlertVisible] = useState(false);
    const [agentRole, setAgentRole] = useState<string | undefined>(undefined);

    const handleViewChange = (view: string) => {
        setActiveView(view);
    }
    
    const isOwner = useMemo(() => user.email === 'lohansantosborges@gmail.com', [user.email]);

    useEffect(() => {
        if (!userId) return;

        const firestore = getFirebaseFirestore();
        const docRef = doc(firestore, 'users', userId, 'settings', 'aiConfig');

        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data() as AiConfig;
                setAgentRole(data.agentRole);
            } else {
                setAgentRole(undefined);
            }
        });
        
        return () => unsubscribe();
    }, [userId]);


    const menuItems = useMemo(() => {
        const items = [...baseMenuItems];

        if (isOwner) {
            items.push({ id: 'testes', icon: FlaskConical, label: 'Testes' });
        }
        return items;
    }, [isOwner, agentRole]);


    useEffect(() => {
        if (connectionStatus.status === 'disconnected') {
            setIsAlertVisible(true);
        }
    }, [connectionStatus]);

    usePageTitle(userId, 'Painel de Atendimento');
    useInterventionNotification(userId);

    const toggleSidebar = () => {
        setIsSidebarCollapsed(!isSidebarCollapsed);
    };

    const renderActiveView = () => {
        switch (activeView) {
            case 'conversas':
                return <ChatView userId={userId} />;
            case 'ajustes':
                return <SettingsPage userId={userId} onLogout={onLogout} />;
             case 'contatos':
                return <ClientsPage userId={userId} />;
            case 'testes':
                return isOwner ? <TestsPage /> : null;
            default:
                return (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground p-4 text-center">
                        <div>
                             <h2 className="text-2xl font-semibold">Em breve</h2>
                             <p>A tela de '{getPageTitle()}' estará disponível em futuras atualizações.</p>
                        </div>
                    </div>
                );
        }
    };
    
    const NavButtons = ({ isMobile = false }: { isMobile?: boolean }) => (
        <>
            {menuItems.map(item => {
                const button = (
                    <Button
                        key={item.id}
                        variant={activeView === item.id ? 'secondary' : 'ghost'}
                        className={cn(
                            "w-full h-11 justify-start text-base md:text-sm font-semibold",
                            (isSidebarCollapsed && !isMobile) && "justify-center"
                        )}
                        onClick={() => {
                            handleViewChange(item.id);
                        }}
                        title={(isSidebarCollapsed && !isMobile) ? item.label : undefined}
                    >
                        <item.icon className={cn("h-5 w-5 flex-shrink-0", (!isSidebarCollapsed || isMobile) && "mr-3")} />
                        {(!isSidebarCollapsed || isMobile) && item.label}
                    </Button>
                );

                return isMobile ? <SheetClose asChild key={item.id}>{button}</SheetClose> : button;
            })}
        </>
    );

    const getPageTitle = () => {
        return menuItems.find(item => item.id === activeView)?.label || 'Painel';
    }

    return (
        <Sheet>
            <div className="flex bg-background text-foreground h-screen overflow-hidden">
                {/* --- Desktop Sidebar --- */}
                <aside className={cn(
                    "hidden md:flex flex-col bg-card transition-all duration-300 ease-in-out border-r border-border",
                    isSidebarCollapsed ? "w-20" : "w-64"
                )}>
                    <div className={cn(
                        "h-16 flex items-center border-b border-border px-6",
                        isSidebarCollapsed && "justify-center px-0"
                    )}>
                        <FaWhatsapp className="h-7 w-7 text-primary flex-shrink-0" />
                        {!isSidebarCollapsed && <h1 className="text-xl font-bold ml-3 text-card-foreground">SolTech IA</h1>}
                    </div>
                    <nav className="flex-1 p-3 space-y-1">
                        <NavButtons />
                    </nav>
                    <div className="p-3 border-t border-border">
                        <Button variant="ghost" className={cn("w-full justify-start text-muted-foreground", isSidebarCollapsed && "justify-center")} onClick={toggleSidebar} title={isSidebarCollapsed ? 'Expandir' : 'Recolher'}>
                            {isSidebarCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
                            {!isSidebarCollapsed && <span className="ml-2">Recolher</span>}
                        </Button>
                        <Button variant="ghost" className={cn("w-full justify-start text-muted-foreground", isSidebarCollapsed && "justify-center")} onClick={onLogout} title={isSidebarCollapsed ? 'Sair' : undefined}>
                            <LogOut className={cn("h-5 w-5", !isSidebarCollapsed && "mr-2")} />
                            {!isSidebarCollapsed && "Sair"}
                        </Button>
                    </div>
                </aside>
                
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                    {/* Header for non-chat views on mobile */}
                     {activeView !== 'conversas' && (
                         <header className={cn(
                             "md:hidden h-16 flex items-center justify-between px-4 border-b border-border bg-card flex-shrink-0 sticky top-0 z-20"
                         )}>
                            <SheetTrigger asChild>
                                <Button variant="ghost" size="icon">
                                    <Menu className="h-6 w-6" />
                                </Button>
                            </SheetTrigger>
                            <div className="text-lg font-semibold">
                                {getPageTitle()}
                            </div>
                            <div className="w-10"></div> {/* Spacer to center the title */}
                        </header>
                    )}
                    
                    {isOwner && process.env.NODE_ENV === 'development' && (
                         <div className={cn("bg-purple-600/20 border-b border-purple-500/30 text-purple-300 px-4 py-1.5 flex items-center justify-center gap-3 text-sm font-medium")}>
                            <FlaskConical className="h-4 w-4" />
                            <span>Modo de Desenvolvimento Ativo</span>
                        </div>
                    )}
                    
                    {isAlertVisible && (
                        <div className={cn("bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-300 px-4 py-2 flex items-center justify-between gap-4")}>
                            <div className="flex items-center gap-3">
                                <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                                <p className="text-sm font-medium">WhatsApp Desconectado. Verifique sua instância da Evolution API.</p>
                            </div>
                            <button onClick={() => setIsAlertVisible(false)} className="p-1 rounded-full hover:bg-yellow-500/20">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                    
                     <main className={cn(
                        "flex-1 flex flex-col overflow-y-auto",
                        activeView !== 'conversas' && 'p-4 md:p-8'
                    )}>
                        {renderActiveView()}
                    </main>
                </div>
            </div>
             <SheetContent side="left" className="p-0 w-64 bg-card">
                <SheetHeader>
                    <SheetTitle className="sr-only">Menu de Navegação</SheetTitle>
                </SheetHeader>
                <div className="flex flex-col h-full">
                    <div className="h-16 flex items-center border-b border-border px-6">
                        <FaWhatsapp className="h-7 w-7 text-primary flex-shrink-0" />
                        <h1 className="text-xl font-bold ml-3 text-card-foreground">SolTech IA</h1>
                    </div>
                    <nav className="flex-1 p-3 space-y-1">
                        <NavButtons isMobile />
                    </nav>
                    <div className="p-3 border-t border-border">
                        <SheetClose asChild>
                            <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={onLogout}>
                                <LogOut className="h-5 w-5 mr-2" />
                                Sair
                            </Button>
                        </SheetClose>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
};
