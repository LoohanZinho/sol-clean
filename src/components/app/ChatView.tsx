
'use client';

import React, { useState, useEffect, useRef, FormEvent, Suspense, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useConversations } from '@/hooks/useConversations';
import { useMessages } from '@/hooks/useMessages';
import { useDisplaySettings } from '@/hooks/useDisplaySettings';
import type { Conversation, AppMessage, AiConfig, AiProviderSettings } from '@/lib/types';
import { cn } from '@/lib/utils';
import { sendMessageAction } from '@/actions/messageActions';
import { logSystemInfo } from '@/ai/flows/system-log-helpers';

import { doc, updateDoc, collection, writeBatch, getDocs, query, addDoc, Timestamp, arrayUnion, arrayRemove, getDoc, onSnapshot } from 'firebase/firestore';
import { getFirebaseFirestore, getFirebaseStorage } from '@/lib/firebase';
import { ref, deleteObject, listAll } from 'firebase/storage';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AnimatePresence, motion } from 'framer-motion';

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Search, Send, Loader2, ChevronLeft, MoreVertical, Pin, PinOff, Bot, User as UserIcon, AlertCircle, Trash2, Mic, ArchiveRestore, Inbox, FileText, UserCheck, Coffee, MessageSquareText, Edit, MessageSquarePlus, Check, AlertTriangle, CheckCircle2, CheckCheck, Menu, ClipboardCheck, Tag, Filter, X, KeyRound, Archive, Info } from 'lucide-react';
import { WhatsappAudioPlayer } from './WhatsappAudioPlayer';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { ClientNotesDialog } from './ClientNotesDialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { ClientInfoPanel } from './ClientInfoPanel';
import { WhatsAppConnection } from './WhatsAppConnection';
import { useEvolutionApiCredentials } from '@/hooks/useEvolutionApiCredentials';

const EditClientDialog = dynamic(() => import('./EditClientDialog').then(mod => mod.EditClientDialog), {
    loading: () => <div className="p-4 flex justify-center"><Loader2 className="h-6 w-6 animate-pulse-subtle" /></div>
});

const ManageTagsDialog = dynamic(() => import('./ManageTagsDialog').then(mod => mod.ManageTagsDialog), {
    loading: () => <div className="p-4 flex justify-center"><Loader2 className="h-6 w-6 animate-pulse-subtle" /></div>
});

const ReactPlayer = dynamic(() => import('react-player/lazy'), { ssr: false });

type FilterType = 'inbox' | 'support' | 'archived';

const TABS: { id: FilterType, label: string, mobileLabel: string }[] = [
    { id: 'inbox', label: 'Cx. de Entrada', mobileLabel: 'Entrada' },
    { id: 'support', label: 'Suporte', mobileLabel: 'Suporte' },
    { id: 'archived', label: 'Arquivadas', mobileLabel: 'Arquivadas' },
];

interface ChatViewProps {
    userId: string;
    userEmail: string;
}

const renderFormattedText = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\*[^*]+\*)/g);
    return parts.map((part, index) => {
        if (part.startsWith('*') && part.endsWith('*')) {
            return <strong key={index}>{part.slice(1, -1)}</strong>;
        }
        return part;
    });
};

export const ChatView = ({ userId, userEmail }: ChatViewProps) => {
    const { conversations, loading: conversationsLoading, error: conversationsError } = useConversations(userId);
    const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
    const { messages, loading: messagesLoading, error: messagesError } = useMessages(userId, selectedConversation?.id || null);
    const { settings: displaySettings } = useDisplaySettings(userId);
    const [newMessage, setNewMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilter, setActiveFilter] = useState<FilterType>('inbox');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isNotesDialogOpen, setIsNotesDialogOpen] = useState(false);
    const [isTagsDialogOpen, setIsTagsDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null);
    const [isSearchVisible, setIsSearchVisible] = useState(false);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const messageInputRef = useRef<HTMLInputElement>(null);
    const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false);

    const [isAiReady, setIsAiReady] = useState(false);
    const [aiNotReadyReason, setAiNotReadyReason] = useState('');

    const [infoDialogOpen, setInfoDialogOpen] = useState(false);
    const [infoDialogMessage, setInfoDialogMessage] = useState({ title: '', description: '' });
    
    const { credentials: userCredentials } = useEvolutionApiCredentials(userId);
    const isUserConnected = !!userCredentials;

    const allTags = useMemo(() => {
        const tagSet = new Set<string>();
        conversations.forEach(convo => {
            convo.tags?.forEach(tag => tagSet.add(tag));
        });
        return Array.from(tagSet).sort();
    }, [conversations]);

    const handleTagFilterChange = (tag: string) => {
        setSelectedTags(prev => 
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    useEffect(() => {
        if (!userId) return;

        const firestore = getFirebaseFirestore();
        const checkPrerequisites = async () => {
            const aiConfigRef = doc(firestore, 'users', userId, 'settings', 'aiConfig');
            const providerRef = doc(firestore, 'users', userId, 'settings', 'aiProvider');
            
            const [aiConfigSnap, providerSnap] = await Promise.all([getDoc(aiConfigRef), getDoc(providerRef)]);
            
            const isPromptConfigured = aiConfigSnap.exists() && !!aiConfigSnap.data().fullPrompt;
            const isApiKeyConfigured = providerSnap.exists() && !!providerSnap.data().apiKey;

            if (!isUserConnected) {
                setIsAiReady(false);
                setAiNotReadyReason('Conecte seu WhatsApp para ativar a IA.');
            } else if (!isApiKeyConfigured) {
                setIsAiReady(false);
                setAiNotReadyReason('Configure sua chave de API na aba "Provedor IA" para ativar.');
            } else if (!isPromptConfigured) {
                setIsAiReady(false);
                setAiNotReadyReason('Configure o Agente de IA primeiro para poder ativar.');
            } else {
                setIsAiReady(true);
                setAiNotReadyReason('');
            }
        };

        const unsubAiConfig = onSnapshot(doc(firestore, 'users', userId, 'settings', 'aiConfig'), checkPrerequisites);
        const unsubProvider = onSnapshot(doc(firestore, 'users', userId, 'settings', 'aiProvider'), checkPrerequisites);

        return () => {
            unsubAiConfig();
            unsubProvider();
        };
    }, [userId, isUserConnected]);


    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    useEffect(() => {
        if (selectedConversation && messageInputRef.current) {
            messageInputRef.current.focus();
        }
    }, [selectedConversation]);
    
     useEffect(() => {
        if (selectedConversation) {
            const updatedConvo = conversations.find(c => c.id === selectedConversation.id);
            if (updatedConvo) {
                setSelectedConversation(updatedConvo);
            }
        }
    }, [conversations, selectedConversation]);

    const filteredConversations = useMemo(() => {
        let convos = conversations;

        if (searchTerm) {
            convos = convos.filter(c =>
                (c.preferredName || c.name).toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.id.includes(searchTerm)
            );
        }

        if (selectedTags.length > 0) {
            convos = convos.filter(c => 
                selectedTags.every(tag => c.tags?.includes(tag))
            );
        }

        const filtered = convos.filter(c => c.folder === activeFilter);
        
        const pinned = filtered.filter(c => c.pinned);
        const unpinned = filtered.filter(c => !c.pinned);
        
        return [...pinned, ...unpinned];

    }, [conversations, searchTerm, activeFilter, selectedTags]);
    
    const hasActiveConversations = useMemo(() => conversations.some(c => c.folder === 'inbox'), [conversations]);
    const hasArchivedConversations = useMemo(() => conversations.some(c => c.folder === 'archived'), [conversations]);

    const handleSendMessage = async (e: FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedConversation || !userId || isSending) return;
    
        setIsSending(true);
    
        try {
            const result = await sendMessageAction({
                userId,
                phone: selectedConversation.id,
                message: newMessage,
                source: 'operator',
                operatorEmail: userEmail || 'Operador',
            });
    
            if (result.success) {
                setNewMessage('');
            } else {
                setInfoDialogMessage({ title: 'Falha no Envio', description: result.error || 'Ocorreu um erro inesperado ao tentar enviar a mensagem. Verifique os logs.' });
                setInfoDialogOpen(true);
            }
        } catch (error) {
            setInfoDialogMessage({ title: 'Erro Crítico', description: 'Ocorreu uma falha grave ao enviar a mensagem. A ação pode não ter sido completada.' });
            setInfoDialogOpen(true);
        } finally {
            setIsSending(false);
        }
    };

    const handleMoveConversation = async (conversationId: string, targetFolder: 'inbox' | 'archived' | 'support') => {
        if (!userId) return;
        const firestore = getFirebaseFirestore();
        const conversationRef = doc(firestore, 'users', userId, 'conversations', conversationId);
        try {
            await updateDoc(conversationRef, {
                folder: targetFolder
            });
            if (selectedConversation?.id === conversationId) {
                setSelectedConversation(null);
            }
        } catch (error) {
            setInfoDialogMessage({ title: 'Erro ao Mover', description: `Ocorreu uma falha ao tentar mover a conversa para ${targetFolder}.` });
            setInfoDialogOpen(true);
        }
    };
    
    const handleDeleteConfirmation = (conversation: Conversation) => {
        setConversationToDelete(conversation);
        setIsDeleteDialogOpen(true);
    };

    const handleDeleteConversation = async () => {
        if (!userId || !conversationToDelete) return;

        const firestore = getFirebaseFirestore();
        const storage = getFirebaseStorage();
        const conversationRef = doc(firestore, 'users', userId, 'conversations', conversationToDelete.id);
        const messagesRef = collection(conversationRef, 'messages');
        const mediaFolderRef = ref(storage, `users/${userId}/conversations/${conversationToDelete.id}/media`);

        setIsDeleteDialogOpen(false);

        try {
            // Delete all files in the media folder
            const mediaFiles = await listAll(mediaFolderRef);
            await Promise.all(mediaFiles.items.map(fileRef => deleteObject(fileRef)));

            // Delete Firestore documents
            const batch = writeBatch(firestore);
            const messagesSnapshot = await getDocs(query(messagesRef));
            messagesSnapshot.forEach(messageDoc => {
                batch.delete(messageDoc.ref);
            });
            batch.delete(conversationRef);
            await batch.commit();

            setSelectedConversation(null);
            setConversationToDelete(null);
            setIsInfoPanelOpen(false);

        } catch (error) {
            console.error("Error deleting conversation and its data:", error);
            setInfoDialogMessage({ title: 'Erro ao Apagar', description: 'Ocorreu uma falha ao tentar apagar a conversa e seus arquivos. Verifique o console para mais detalhes.' });
            setInfoDialogOpen(true);
        }
    };

    const handleTogglePin = async (conversationId: string, currentPinStatus: boolean) => {
        if (!userId) return;
        const firestore = getFirebaseFirestore();
        const conversationRef = doc(firestore, 'users', userId, 'conversations', conversationId);
        try {
            await updateDoc(conversationRef, {
                pinned: !currentPinStatus
            });
        } catch (error) {
            setInfoDialogMessage({ title: 'Erro ao Fixar', description: 'Ocorreu uma falha ao tentar alterar o status de fixado da conversa.' });
            setInfoDialogOpen(true);
        }
    };

    const handleToggleConversationAi = async (conversationId: string, currentAiStatus: boolean) => {
        if (!userId || !isAiReady) return;
        
        const newAiStatus = !currentAiStatus;
        setSelectedConversation(prev => prev ? ({ ...prev, isAiActive: newAiStatus }) : null);

        const firestore = getFirebaseFirestore();
        const conversationRef = doc(firestore, 'users', userId, 'conversations', conversationId);
        const messagesRef = collection(conversationRef, 'messages');
        
        try {
            await updateDoc(conversationRef, { isAiActive: newAiStatus });

            const operatorName = userEmail || 'Operador';
            const messageText = newAiStatus 
                ? `IA ativada pelo operador (${operatorName})`
                : `IA desativada pelo operador (${operatorName})`;
                
            await addDoc(messagesRef, {
                text: messageText,
                from: 'agent',
                source: 'operator',
                type: 'system',
                timestamp: Timestamp.now(),
            });

            const logMessage = `IA ${newAiStatus ? 'ativada' : 'desativada'} pelo operador.`;
            await logSystemInfo(userId, 'toggleConversationAi', logMessage, { conversationId, operator: operatorName });

        } catch (error) {
            setInfoDialogMessage({ title: 'Erro ao Mudar Modo IA', description: 'Ocorreu uma falha ao tentar alterar o modo da IA para esta conversa.' });
            setInfoDialogOpen(true);
            setSelectedConversation(prev => prev ? ({ ...prev, isAiActive: currentAiStatus }) : null);
        }
    };

    const formatTimestamp = (timestamp: any) => {
        if (!timestamp) return '';
        const date = timestamp.toDate();
        return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    
    const handleConversationSelect = async (convo: Conversation) => {
        if (selectedConversation?.id !== convo.id) {
            setIsInfoPanelOpen(false);
        }
        setSelectedConversation(convo);
    
        const firestore = getFirebaseFirestore();
        const conversationRef = doc(firestore, 'users', userId, 'conversations', convo.id);
    
        // Mark as read
        if (convo.unreadCount && convo.unreadCount > 0) {
            try {
                await updateDoc(conversationRef, { unreadCount: 0 });
            } catch (error) {
                // Log error if needed, but don't block UI
            }
        }
    };
    
    const handleBackToConversations = () => {
        setSelectedConversation(null);
        setIsInfoPanelOpen(false);
    }
    
    const renderSystemMessage = (msg: AppMessage) => {
        // Hide tool result messages from the chat UI
        if (msg.source === 'tool') {
            return null;
        }

        const isAiEnabled = msg.text.includes('ativada');
        const isAiDisabledByOperator = msg.text.includes('desativada');
        const isNoteSaved = msg.text.includes('anotação');
        
        let icon = <Bot className="h-4 w-4 text-green-500" />;
        let borderColor = "border-green-500/20";
        
        if (isAiDisabledByOperator) {
            icon = <UserIcon className="h-4 w-4 text-red-500" />;
            borderColor = "border-red-500/20";
        }
        
        if (isNoteSaved) {
            icon = <ClipboardCheck className="h-4 w-4 text-amber-400" />;
            borderColor = "border-amber-500/20";
        }

        return (
            <div className="flex justify-center items-center my-4">
                <div className={cn(
                    "flex items-center gap-2 text-xs text-muted-foreground bg-card px-3 py-1.5 rounded-full border",
                    borderColor
                )}>
                    {icon}
                    <span>{msg.text}</span>
                    <span className="opacity-80">{formatTimestamp(msg.timestamp)}</span>
                </div>
            </div>
        );
    };
    
    const renderMessageStatus = (msg: AppMessage) => {
        if (msg.from !== 'agent') return null;

        switch(msg.status) {
            case 'sending':
                return <span title="Enviando..."><Loader2 className="ml-1.5 h-4 w-4 text-muted-foreground/80 animate-pulse-subtle" /></span>;
            case 'sent':
                return <span title="Enviado ao servidor"><Check className="ml-1.5 h-4 w-4 text-muted-foreground/80" /></span>;
            case 'delivered':
                return <span title="Entregue ao cliente"><CheckCheck className="ml-1.5 h-4 w-4 text-muted-foreground/80" /></span>;
            case 'failed':
                 return <span title="Falha ao enviar"><AlertTriangle className="ml-1.5 h-4 w-4 text-red-400" /></span>;
            default:
                 return <span title="Enviado"><CheckCheck className="ml-1.5 h-4 w-4 text-muted-foreground/80" /></span>;
        }
    };

    const renderChatMessage = (msg: AppMessage) => {
        const messageTimestamp = formatTimestamp(msg.timestamp);
        
        return (
            <motion.div 
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className={cn('flex items-end gap-2 sm:gap-3', msg.from === 'agent' ? 'justify-end' : 'justify-start')}
            >
                {msg.from === 'user' && (
                    <Avatar className="h-9 w-9">
                        <AvatarImage src={selectedConversation?.profilePicUrl || undefined} alt="User Avatar" />
                        <AvatarFallback>{((selectedConversation?.preferredName || selectedConversation?.name) || 'C').charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                )}
                <div className={cn(
                    'rounded-xl max-w-[80%] sm:max-w-sm md:max-w-lg shadow-md',
                    msg.mediaType === 'audio' ? 'p-2' : 'p-3',
                    msg.from === 'agent' ? 'bg-secondary text-secondary-foreground rounded-br-none' : 'bg-muted rounded-bl-none'
                )}>
                    {renderMessageContent(msg, messageTimestamp)}
                    {msg.mediaType !== 'audio' && (
                        <div className="flex items-center justify-end mt-2">
                            <p className='text-xs text-muted-foreground/80'>
                                {messageTimestamp}
                            </p>
                            {renderMessageStatus(msg)}
                        </div>
                    )}
                </div>
                {msg.from === 'agent' && (
                    <Avatar className="h-9 w-9" title={msg.operatorEmail ? `Enviada por: ${msg.operatorEmail}` : `Enviada pela IA`}>
                        {msg.source === 'operator' ? (
                            <AvatarFallback>
                                <UserIcon className="h-5 w-5"/>
                            </AvatarFallback>
                        ) : (
                            <>
                                <AvatarImage src="/icon.png" alt="Bot Avatar" />
                                <AvatarFallback><Bot className="h-5 w-5"/></AvatarFallback>
                            </>
                        )}
                    </Avatar>
                )}
            </motion.div>
        );
    };

    const renderMessageContent = (msg: AppMessage, messageTimestamp: string) => {
        const imageUrl = msg.mediaUrl;

        switch (msg.mediaType) {
            case 'image':
                return (
                    <a href={imageUrl ?? undefined} target="_blank" rel="noopener noreferrer" className="space-y-2">
                        {imageUrl && <img src={imageUrl} alt={msg.text || 'Imagem'} className="rounded-lg max-w-xs cursor-pointer" />}
                        {msg.text && msg.text !== 'Imagem' && <p className="mt-2">{renderFormattedText(msg.text)}</p>}
                    </a>
                );
            case 'video':
                return (
                    <div className="space-y-2">
                        {msg.mediaUrl && (
                            <div className="w-full max-w-xs">
                                <Suspense fallback={<div className="w-full aspect-video bg-muted rounded-lg flex items-center justify-center"><Loader2 className="h-6 w-6 animate-pulse-subtle"/></div>}>
                                    <ReactPlayer url={msg.mediaUrl} controls width="100%" height="auto" />
                                </Suspense>
                            </div>
                        )}
                        {msg.text && <p className="mt-2">{renderFormattedText(msg.text)}</p>}
                    </div>
                );
            case 'audio':
                 return (
                    <WhatsappAudioPlayer 
                        url={msg.mediaUrl} 
                        transcription={msg.transcription}
                        transcriptionStatus={msg.transcriptionStatus}
                        messageTimestamp={messageTimestamp}
                        profilePicUrl={msg.from === 'user' ? selectedConversation?.profilePicUrl : '/icon.png'}
                    />
                );
            case 'document':
                 return (
                    <a href={msg.mediaUrl ?? undefined} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 underline text-primary">
                        <FileText className="h-4 w-4" />
                        <span>{msg.text || 'Documento'}</span>
                    </a>
                );
            default:
                return (
                    <div>
                        <p className="whitespace-pre-wrap break-words">{renderFormattedText(msg.text)}</p>
                    </div>
                );
        }
    }

    const renderEmptyState = () => {
        if (selectedTags.length > 0) {
             return (
                <div className="text-center p-8 text-muted-foreground">
                    <Filter className="h-12 w-12 mx-auto mb-4" />
                    <h3 className="font-semibold">Nenhuma Conversa Encontrada</h3>
                    <p className="text-sm">Nenhuma conversa nesta pasta corresponde a todas as tags selecionadas.</p>
                </div>
            );
        }
        switch (activeFilter) {
            case 'support':
                return (
                    <div className="text-center p-8 text-muted-foreground">
                        <UserCheck className="h-12 w-12 mx-auto mb-4" />
                        <h3 className="font-semibold">Fila de Suporte Vazia</h3>
                        <p className="text-sm">Nenhum cliente precisa de atendimento humano no momento.</p>
                    </div>
                );
             case 'archived':
                return (
                     <div className="text-center p-8 text-muted-foreground">
                        <ArchiveRestore className="h-12 w-12 mx-auto mb-4" />
                        <h3 className="font-semibold">Nenhuma Conversa Arquivada</h3>
                        <p className="text-sm">Você pode arquivar conversas para limpar sua caixa de entrada.</p>
                    </div>
                );
            case 'inbox':
            default:
                if (!hasActiveConversations && hasArchivedConversations) {
                    return (
                        <div className="text-center p-8 text-muted-foreground">
                            <ArchiveRestore className="h-12 w-12 mx-auto mb-4" />
                            <h3 className="font-semibold">Caixa de Entrada Limpa</h3>
                            <p className="text-sm">Todas as conversas foram arquivadas. Veja na aba "Arquivadas".</p>
                        </div>
                    );
                }
                return (
                    <div className="text-center p-8 text-muted-foreground">
                        <Inbox className="h-12 w-12 mx-auto mb-4" />
                        <h3 className="font-semibold">Caixa de Entrada Vazia</h3>
                        <p className="text-sm">Novas conversas de clientes aparecerão aqui.</p>
                    </div>
                );
        }
    };
    
    const renderCentralPane = () => {
        if (!selectedConversation) {
            if (!isUserConnected) {
                return <WhatsAppConnection userId={userId} userEmail={userEmail} />;
            }
             if (!hasActiveConversations && !hasArchivedConversations && !conversationsLoading) {
                 return (
                     <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-background p-8 text-center">
                        <Coffee className="h-20 w-20 mb-6 text-muted-foreground/30" />
                        <h2 className="text-2xl font-semibold">Está tranquilo por aqui.</h2>
                        <p className="max-w-md mt-2 text-muted-foreground">Assim que um cliente mandar uma mensagem, a conversa aparecerá aqui.</p>
                    </div>
                );
            }
            if (!hasActiveConversations && hasArchivedConversations && !conversationsLoading) {
                 return (
                     <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-background p-8 text-center">
                        <ArchiveRestore className="h-20 w-20 mb-6 text-muted-foreground/30" />
                        <h2 className="text-2xl font-semibold">Caixa de Entrada Limpa</h2>
                        <p className="max-w-md mt-2 text-muted-foreground">Todas as conversas ativas foram arquivadas. Selecione a aba "Arquivadas" para visualizá-las.</p>
                    </div>
                );
            }
            return (
                <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-background p-8 text-center">
                    <MessageSquareText className="h-20 w-20 mb-6 text-muted-foreground/30" />
                    <h2 className="text-2xl font-semibold">Selecione uma conversa</h2>
                    <p className="max-w-md mt-2 text-muted-foreground">Escolha uma conversa da lista à esquerda para começar a atender.</p>
                </div>
            );
        }
        
        return (
             <>
                <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-border bg-card flex-shrink-0 z-10">
                    <div className="flex items-center min-w-0 flex-1">
                        <Button variant="ghost" size="icon" className="md:hidden mr-2 flex-shrink-0" onClick={handleBackToConversations}>
                            <ChevronLeft className="h-6 w-6" />
                        </Button>
                        <Avatar className="h-10 w-10 mr-3 flex-shrink-0">
                            <AvatarImage src={selectedConversation.profilePicUrl || undefined} alt="User Avatar" />
                            <AvatarFallback>{(selectedConversation.preferredName || selectedConversation.name || 'C').charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-base truncate">{selectedConversation.preferredName || selectedConversation.name}</h3>
                                {selectedConversation.operatorNotes && (
                                    <span title="Este cliente possui anotações">
                                        <MessageSquareText className="h-4 w-4 text-amber-400 flex-shrink-0" />
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-muted-foreground truncate">{selectedConversation.id}</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-1 md:space-x-2 flex-shrink-0">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className={cn("flex items-center space-x-2", !isAiReady && "cursor-not-allowed")}>
                                        <Switch
                                            id="ai-mode"
                                            checked={isAiReady && (selectedConversation.isAiActive ?? true)}
                                            onCheckedChange={() => handleToggleConversationAi(selectedConversation.id, selectedConversation.isAiActive ?? true)}
                                            disabled={!isAiReady}
                                        />
                                        <Label htmlFor="ai-mode" className={cn("text-sm font-medium hidden sm:block", !isAiReady && "opacity-50")}>IA</Label>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {aiNotReadyReason ? (
                                        <div className="flex items-center gap-2">
                                            <KeyRound className="h-4 w-4"/>
                                            <p>{aiNotReadyReason}</p>
                                        </div>
                                    ) : (
                                        <p>{(selectedConversation.isAiActive ?? true) ? "IA está ativa para esta conversa" : "IA está inativa. Apenas o operador pode responder."}</p>
                                    )}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        <Button variant="ghost" size="icon" onClick={() => setIsInfoPanelOpen(prev => !prev)}>
                            <Info className="h-5 w-5" />
                        </Button>
                    </div>
                </header>
                <div 
                    ref={messagesContainerRef}
                    className="flex-1 p-4 md:p-6 space-y-4 overflow-y-auto bg-background"
                    style={{ fontSize: `${displaySettings.chatFontSize}px` }}
                >
                    {selectedConversation.folder === 'support' && (
                         <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 sticky top-0 z-10 backdrop-blur-sm space-y-2">
                             <div className="flex items-center gap-3 text-sm">
                                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                                <p className="font-medium">Esta conversa precisa de atendimento humano.</p>
                            </div>
                            {selectedConversation.aiSummary && (
                                <div className="border-t border-amber-500/20 pt-2 text-xs text-amber-300/90 pl-1 prose prose-p:my-1 prose-ul:my-1 prose-li:text-amber-300/90 marker:text-amber-400">
                                    <p className="font-semibold text-amber-300 mb-1">Resumo da IA:</p>
                                    <div dangerouslySetInnerHTML={{ __html: selectedConversation.aiSummary.replace(/\* /g, '<li>').replace(/\n/g, '<br/>').replace(/<li>/g, '<li style="margin-left: 1.5em;">') }} />
                                </div>
                            )}
                        </div>
                    )}
                    {selectedConversation.folder === 'archived' && (
                        <div className="p-3 rounded-lg bg-slate-700/50 border border-slate-600/80 text-slate-300 sticky top-0 z-10 backdrop-blur-sm space-y-2">
                             <div className="flex items-center gap-3 text-sm">
                                <Archive className="h-5 w-5 flex-shrink-0" />
                                <p className="font-medium">Esta conversa foi arquivada.</p>
                            </div>
                            {selectedConversation.aiSummary && (
                                <div className="border-t border-slate-600/80 pt-2 text-xs text-slate-300/90 pl-1 prose prose-p:my-1 prose-ul:my-1 prose-li:text-slate-300/90 marker:text-slate-400">
                                    <p className="font-semibold text-slate-200 mb-1">Resumo Final:</p>
                                    <div dangerouslySetInnerHTML={{ __html: selectedConversation.aiSummary.replace(/\* /g, '<li>').replace(/\n/g, '<br/>').replace(/<li>/g, '<li style="margin-left: 1.5em;">') }} />
                                </div>
                            )}
                        </div>
                    )}
                    {messagesLoading && <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-pulse-subtle text-primary"/></div>}
                    {messagesError && <p className="text-center text-red-500">Erro ao carregar mensagens.</p>}
                    <AnimatePresence>
                        {!messagesLoading && messages.map((msg: AppMessage) => (
                            <div key={msg.id}>
                                {msg.type === 'system' ? renderSystemMessage(msg) : renderChatMessage(msg)}
                            </div>
                        ))}
                    </AnimatePresence>
                    <div ref={messagesEndRef} />
                </div>
                <footer className="border-t border-border bg-card flex-shrink-0 z-10">
                     <form onSubmit={handleSendMessage} className="flex items-center gap-2 sm:gap-4 p-2 sm:p-4">
                        <div className="flex-1 flex items-center bg-input rounded-full px-4 h-12">
                             <input
                                ref={messageInputRef}
                                placeholder={ (selectedConversation.isAiActive ?? true) ? "IA está ativa. Envie para falar como operador." : "Digite uma mensagem..."}
                                className="flex-1 bg-transparent px-2 sm:px-4 text-base placeholder:text-muted-foreground focus:outline-none"
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                disabled={!selectedConversation || !userId || isSending}
                            />
                        </div>
                        <Button type="submit" variant="default" size="icon" className="rounded-full h-12 w-12 flex-shrink-0" disabled={!newMessage.trim() || isSending}>
                            {isSending ? <Loader2 className="h-6 w-6 animate-pulse-subtle" /> : <Send className="h-6 w-6" />}
                        </Button>
                    </form>
                </footer>
             </>
        );
    }

    const renderLastMessagePreview = (convo: Conversation) => {
        return (
            <div className="flex items-center gap-2">
                {convo.lastMessageMediaType === 'audio' ? (
                    <>
                        <Mic className="h-4 w-4 flex-shrink-0" />
                        <span className="text-muted-foreground">{convo.lastMessageDuration || 'Áudio'}</span>
                    </>
                ) : (
                    <p className="text-sm text-muted-foreground truncate">{renderFormattedText(convo.lastMessage || '...')}</p>
                )}
            </div>
        );
    };

    const parentRef = useRef<HTMLDivElement>(null);

    const rowVirtualizer = useVirtualizer({
        count: filteredConversations.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 76,
        overscan: 5,
    });

    return (
        <div className="flex flex-1 h-full overflow-hidden relative">
            <aside className={cn(
                "w-full md:w-[380px] flex flex-col border-r border-border bg-card flex-shrink-0 transition-all duration-300",
                "md:flex",
                selectedConversation ? "hidden" : "flex",
                isInfoPanelOpen && "md:w-[380px]"
            )}>
                <header className="h-16 flex items-center justify-between px-4 border-b border-border flex-shrink-0 md:hidden">
                    <SheetTrigger asChild>
                        <Button variant="ghost" size="icon" className="-ml-2">
                            <Menu className="h-6 w-6" />
                        </Button>
                    </SheetTrigger>
                    <h2 className="text-xl font-bold">Conversas</h2>
                    <Button variant="ghost" size="icon" onClick={() => setIsSearchVisible(prev => !prev)}>
                        <Search className="h-6 w-6" />
                    </Button>
                </header>

                <div className="p-4 flex-shrink-0 space-y-4">
                    {isSearchVisible && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                            <Input 
                                placeholder="Buscar..." 
                                className="h-11 text-base w-full"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                autoFocus
                            />
                        </motion.div>
                    )}
                     <div className="relative p-1 bg-muted rounded-full flex items-center w-full">
                        {TABS.map((tab) => (
                             <button
                                key={tab.id}
                                onClick={() => setActiveFilter(tab.id)}
                                className={cn(
                                    "relative w-full rounded-full py-1.5 text-sm font-medium transition-colors",
                                    activeFilter === tab.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <span className="relative z-10 hidden sm:inline">{tab.label}</span>
                                <span className="relative z-10 sm:hidden">{tab.mobileLabel}</span>
                                {activeFilter === tab.id && (
                                     <motion.div
                                        layoutId="active-tab-indicator"
                                        className="absolute inset-0 bg-background rounded-full shadow-sm"
                                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                    />
                                )}
                            </button>
                        ))}
                    </div>
                     {allTags.length > 0 && (
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="w-full justify-start">
                                    <Filter className="mr-2 h-4 w-4" />
                                    {selectedTags.length > 0 ? `Filtrando por ${selectedTags.length} tag(s)` : 'Filtrar por tags'}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-0">
                                <div className="p-4 space-y-2">
                                    {allTags.map(tag => (
                                        <div key={tag} className="flex items-center space-x-2">
                                            <Switch
                                                id={`tag-${tag}`}
                                                checked={selectedTags.includes(tag)}
                                                onCheckedChange={() => handleTagFilterChange(tag)}
                                            />
                                            <Label htmlFor={`tag-${tag}`}>{tag}</Label>
                                        </div>
                                    ))}
                                </div>
                                {selectedTags.length > 0 && (
                                    <div className="p-2 border-t">
                                         <Button variant="ghost" size="sm" className="w-full" onClick={() => setSelectedTags([])}>
                                            <X className="mr-2 h-4 w-4" />
                                            Limpar Filtros
                                        </Button>
                                    </div>
                                )}
                            </PopoverContent>
                        </Popover>
                    )}
                </div>

                <div ref={parentRef} className="flex-1 overflow-y-auto overflow-x-hidden relative">
                     {conversationsLoading ? (
                        <div className="p-4 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-pulse-subtle"/></div>
                    ) : conversationsError ? (
                        <p className="p-4 text-red-500">Erro ao carregar conversas.</p>
                    ) : filteredConversations.length === 0 ? (
                        renderEmptyState()
                    ) : (
                        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                            {rowVirtualizer.getVirtualItems().map(virtualItem => {
                                const convo = filteredConversations[virtualItem.index];
                                return (
                                    <div
                                        key={virtualItem.key}
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            width: '100%',
                                            height: `${virtualItem.size}px`,
                                            transform: `translateY(${virtualItem.start}px)`,
                                        }}
                                    >
                                        <motion.div
                                             initial={{ opacity: 0, y: 10 }}
                                             animate={{ opacity: 1, y: 0 }}
                                             transition={{ duration: 0.3, delay: virtualItem.index * 0.02 }}
                                             className={cn(
                                                'flex items-start p-3 cursor-pointer border-l-4 h-full',
                                                selectedConversation?.id === convo.id 
                                                    ? 'bg-primary/10 border-primary' 
                                                    : 'border-transparent hover:bg-white/5'
                                            )}
                                            onClick={() => handleConversationSelect(convo)}
                                            whileTap={{ scale: 0.98 }}
                                        >
                                            <Avatar className="h-12 w-12 mr-4 mt-1">
                                                <AvatarImage src={convo.profilePicUrl || undefined} alt={convo.name} />
                                                <AvatarFallback>{((convo.preferredName || convo.name) || 'C').charAt(0).toUpperCase()}</AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-center">
                                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                                        <h3 className="font-semibold truncate text-base flex-shrink">{convo.preferredName || convo.name}</h3>
                                                        {convo.tags && convo.tags.length > 0 && (
                                                            <Badge variant="secondary" className="text-xs whitespace-nowrap flex-shrink-0">
                                                                <Tag className="h-3 w-3 mr-1" />
                                                                {convo.tags[0]}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                                        {convo.pinned && <Pin className="h-4 w-4 text-primary" />}
                                                        <span className="text-xs text-muted-foreground">{formatTimestamp(convo.updatedAt)}</span>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        {renderLastMessagePreview(convo)}
                                                    </div>
                                                    {convo.unreadCount && convo.unreadCount > 0 ? (
                                                        <div className="flex-shrink-0 h-5 w-5 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold mt-1">
                                                            {convo.unreadCount}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </motion.div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </aside>

            <main className={cn(
                "flex-1 flex flex-col h-full bg-background relative transition-all duration-300",
                "md:flex",
                selectedConversation ? "flex" : "hidden"
            )}>
               {renderCentralPane()}
            </main>

            {selectedConversation && (
                <ClientInfoPanel
                    isOpen={isInfoPanelOpen}
                    onClose={() => setIsInfoPanelOpen(false)}
                    conversation={selectedConversation}
                    onEdit={() => setIsEditDialogOpen(true)}
                    onNotes={() => setIsNotesDialogOpen(true)}
                    onTags={() => setIsTagsDialogOpen(true)}
                    onPin={() => handleTogglePin(selectedConversation.id, selectedConversation.pinned || false)}
                    onArchive={() => handleMoveConversation(selectedConversation.id, 'archived')}
                    onUnarchive={() => handleMoveConversation(selectedConversation.id, 'inbox')}
                    onMarkResolved={() => handleMoveConversation(selectedConversation.id, 'inbox')}
                    onDelete={() => handleDeleteConfirmation(selectedConversation)}
                />
            )}

            {selectedConversation && isEditDialogOpen && (
                <EditClientDialog
                    userId={userId}
                    client={selectedConversation}
                    isOpen={isEditDialogOpen}
                    onClose={() => setIsEditDialogOpen(false)}
                />
            )}
            {selectedConversation && isNotesDialogOpen && (
                <ClientNotesDialog
                    userId={userId}
                    client={selectedConversation}
                    isOpen={isNotesDialogOpen}
                    onClose={() => setIsNotesDialogOpen(false)}
                />
            )}
            {selectedConversation && isTagsDialogOpen && (
                <ManageTagsDialog
                    userId={userId}
                    conversation={selectedConversation}
                    isOpen={isTagsDialogOpen}
                    onClose={() => setIsTagsDialogOpen(false)}
                />
            )}
             {conversationToDelete && isDeleteDialogOpen && (
                <ConfirmDeleteDialog
                    isOpen={isDeleteDialogOpen}
                    onClose={() => setIsDeleteDialogOpen(false)}
                    onConfirm={handleDeleteConversation}
                    title="Apagar Conversa"
                    description={`Tem certeza que deseja apagar permanentemente a conversa com "${conversationToDelete.preferredName || conversationToDelete.name}"? Todo o histórico de mensagens e arquivos de mídia (áudios) serão perdidos.`}
                />
            )}
            <AlertDialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>{infoDialogMessage.title}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {infoDialogMessage.description}
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogAction onClick={() => setInfoDialogOpen(false)}>OK</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
