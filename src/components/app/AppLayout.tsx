
'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { Users, Settings, ChevronLeft, LogOut, ChevronRight, Menu, X, AlertTriangle, FlaskConical, QrCode, Smartphone, Copy, Check, Terminal } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetClose, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { createWhatsAppInstance, checkInstanceConnectionState, fetchAndSaveInstanceApiKey } from '@/actions/evolutionApiActions';
import { Loader2, ServerCrash, CheckCircle, RefreshCw } from 'lucide-react';
import { MobileNavButtons } from './MobileNavButtons';

interface AppLayoutProps {
    user: FirebaseUser;
    onLogout: () => void;
}

const baseMenuItems = [
    { id: 'conversas', icon: FaWhatsapp, label: 'Conversas' },
    { id: 'contatos', icon: Users, label: 'Contatos' },
    { id: 'ajustes', icon: Settings, label: 'Ajustes' },
];

const ConnectionLogDialog = ({ isOpen, onClose, logs }: { isOpen: boolean, onClose: () => void, logs: any[] }) => {
    const [hasCopied, setHasCopied] = useState(false);

    const handleCopy = () => {
        const logContent = logs.map(log => {
            return `
--- ETAPA: ${log.step} ---
STATUS: ${log.status}
REQUISIÇÃO:
- Método: ${log.request?.method}
- URL: ${log.request?.url}
- Headers: ${JSON.stringify(log.request?.headers, null, 2)}
- Corpo: ${JSON.stringify(log.request?.data, null, 2)}
RESPOSTA:
- Corpo: ${JSON.stringify(log.data, null, 2)}
`;
        }).join('\n');
        navigator.clipboard.writeText(logContent.trim());
        setHasCopied(true);
        setTimeout(() => setHasCopied(false), 2000);
    };

    if (!isOpen) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Logs da Conexão em Tempo Real</DialogTitle>
                    <DialogDescription>
                        Detalhes das requisições e respostas da API durante o processo de pareamento.
                    </DialogDescription>
                </DialogHeader>
                <div className="mt-4 max-h-[60vh] overflow-y-auto bg-muted/50 rounded-md p-4 border space-y-4">
                    {logs.length === 0 && <p className="text-muted-foreground">Aguardando início da conexão...</p>}
                    {logs.map((log, index) => (
                        <div key={index}>
                            <h3 className="font-semibold mb-2">{log.step}</h3>
                            <pre className="text-xs text-foreground/90 bg-black/20 p-2 rounded-md whitespace-pre-wrap break-all">
                                <code>
                                    <p><strong>STATUS:</strong> {log.status}</p>
                                    <p><strong>[REQUISIÇÃO]</strong></p>
                                    <p><strong>Método:</strong> {log.request?.method}</p>
                                    <p><strong>URL:</strong> {log.request?.url}</p>
                                    <p><strong>Corpo:</strong> {JSON.stringify(log.request?.data, null, 2)}</p>
                                    <p><strong>[RESPOSTA]</strong></p>
                                    <p><strong>Corpo:</strong> {JSON.stringify(log.data, null, 2)}</p>
                                </code>
                            </pre>
                        </div>
                    ))}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={handleCopy} disabled={logs.length === 0}>
                        {hasCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                        {hasCopied ? 'Copiado!' : 'Copiar Tudo'}
                    </Button>
                    <Button onClick={onClose}>Fechar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export const AppLayout = ({ user, onLogout }: AppLayoutProps) => {
    const [activeView, setActiveView] = useState('conversas');
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const userId = user.uid;
    
    const [agentRole, setAgentRole] = useState<string | undefined>(undefined);
    
    const [isLoading, setIsLoading] = useState(false);
    const [pairingCode, setPairingCode] = useState<string | null>(null);
    const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    
    // Admin log states
    const [connectionLogs, setConnectionLogs] = useState<any[]>([]);
    const [isLogDialogOpen, setIsLogDialogOpen] = useState(false);

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

    usePageTitle(userId, 'Painel de Atendimento');
    useInterventionNotification(userId);

    const toggleSidebar = () => {
        setIsSidebarCollapsed(!isSidebarCollapsed);
    };

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
        setIsFinalizing(true);
        setPairingCode(null);
        setQrCodeBase64(null);
        
        if (user.email) {
            await fetchAndSaveInstanceApiKey(userId, user.email);
        }
        
        setIsConnected(true);
        setIsFinalizing(false);
    };

    const startPolling = () => {
        if (!user.email) return;
        stopPolling(); 
        pollingIntervalRef.current = setInterval(async () => {
            try {
                const result = await checkInstanceConnectionState(user.email!);
                if (result.state === 'open') {
                    await handleSuccessfulConnection();
                } else if (result.state === 'close') {
                    setError("A conexão foi fechada. Por favor, tente novamente.");
                    stopPolling();
                } else if (result.state === 'ERROR') {
                    setError(result.error || 'Erro ao verificar status.');
                    stopPolling();
                }
            } catch (e: any) {
                setError(e.message || 'Falha ao verificar o estado da conexão.');
                stopPolling();
            }
        }, 5000);
    };

    const handleConnect = async () => {
        if (!user.email) {
            setError("Email do usuário não encontrado. Não é possível criar a instância.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setPairingCode(null);
        setQrCodeBase64(null);
        setIsConnected(false);
        setIsDialogOpen(true);
        setConnectionLogs([]);
        stopPolling();

        try {
            const result = await createWhatsAppInstance(user.email, userId);
            setConnectionLogs(result.logs);
            if (result.success) {
                if (result.state === 'open') {
                    await handleSuccessfulConnection();
                } else {
                    setPairingCode(result.pairingCode || null);
                    setQrCodeBase64(result.qrCodeBase64 || null);
                    if (result.pairingCode || result.qrCodeBase64) {
                        startPolling();
                    } else {
                        setError('Não foi possível obter o código de pareamento ou QR Code da API.');
                    }
                }
            } else {
                setError(result.error || 'Ocorreu um erro desconhecido.');
            }
        } catch (e: any) {
            setError(e.message || 'Falha ao conectar com o servidor.');
            setConnectionLogs(prev => [...prev, { step: 'Erro Inesperado na Aplicação', error: { message: e.message, stack: e.stack }}]);
        } finally {
            setIsLoading(false);
        }
    };

    const renderActiveView = () => {
        switch (activeView) {
            case 'conversas':
                return <ChatView userId={userId} userEmail={user.email || ''} />;
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
        <>
            <Sheet>
                <div className="flex bg-background text-foreground h-screen overflow-hidden">
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
                            <div className="w-10"></div>
                        </header>
                        
                        <main className={cn(
                            "flex-1 flex flex-col overflow-y-auto",
                            activeView !== 'conversas' && 'p-4 md:p-8',
                            "md:pb-0 pb-16"
                        )}>
                            {renderActiveView()}
                        </main>
                        
                        <footer className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-card/80 backdrop-blur-lg border-t border-border z-30">
                            <MobileNavButtons menuItems={menuItems} activeView={activeView} onNavigate={handleViewChange} />
                        </footer>
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

            <Dialog open={isDialogOpen} onOpenChange={(open) => {
                if (!open) {
                    stopPolling();
                    setIsDialogOpen(false);
                }
            }}>
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
                        {!isLoading && !error && !isConnected && (qrCodeBase64 || pairingCode) && (
                             <Tabs defaultValue="qrcode" className="w-full">
                                <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="qrcode" disabled={!qrCodeBase64}><QrCode className="h-4 w-4 mr-2"/>QR Code</TabsTrigger>
                                    <TabsTrigger value="pairingcode" disabled={!pairingCode}><Smartphone className="h-4 w-4 mr-2"/>Código</TabsTrigger>
                                </TabsList>
                                <TabsContent value="qrcode">
                                    <div className="flex flex-col items-center justify-center space-y-4 pt-4">
                                        {qrCodeBase64 ? (
                                            <Image src={qrCodeBase64} alt="QR Code" width={250} height={250} className="rounded-lg" />
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
                     {isOwner && (
                        <DialogFooter>
                            <Button variant="secondary" onClick={() => setIsLogDialogOpen(true)}>
                                <Terminal className="mr-2 h-4 w-4" />
                                Ver Logs da Conexão
                            </Button>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>
            
            {isOwner && (
                <ConnectionLogDialog 
                    isOpen={isLogDialogOpen}
                    onClose={() => setIsLogDialogOpen(false)}
                    logs={connectionLogs}
                />
            )}
        </>
    );
};
