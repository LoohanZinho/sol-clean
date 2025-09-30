'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Conversation } from '@/lib/types';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { X, Edit, MessageSquareText, Tag, Pin, Archive, ArchiveRestore, CheckCircle2, Trash2, Bot, History } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { cn } from '@/lib/utils';
import { Separator } from '../ui/separator';

interface ClientInfoPanelProps {
    isOpen: boolean;
    onClose: () => void;
    conversation: Conversation;
    onEdit: () => void;
    onNotes: () => void;
    onTags: () => void;
    onPin: () => void;
    onArchive: () => void;
    onUnarchive: () => void;
    onMarkResolved: () => void;
    onDelete: () => void;
}

export const ClientInfoPanel = ({
    isOpen,
    onClose,
    conversation,
    onEdit,
    onNotes,
    onTags,
    onPin,
    onArchive,
    onUnarchive,
    onMarkResolved,
    onDelete
}: ClientInfoPanelProps) => {

    const panelVariants = {
        open: { x: 0 },
        closed: { x: '100%' },
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Overlay for mobile */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 z-40 md:hidden"
                    />
                    <motion.aside
                        key="client-info-panel"
                        initial="closed"
                        animate="open"
                        exit="closed"
                        variants={panelVariants}
                        transition={{ type: 'spring', stiffness: 400, damping: 40 }}
                        className="fixed top-0 right-0 h-full w-full max-w-sm bg-card border-l border-border z-50 flex flex-col"
                    >
                        <header className="h-16 flex items-center px-4 border-b border-border flex-shrink-0">
                            <Button variant="ghost" size="icon" onClick={onClose} className="mr-2">
                                <X className="h-5 w-5" />
                            </Button>
                            <h2 className="text-lg font-semibold">Dados do Contato</h2>
                        </header>
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            <div className="flex flex-col items-center text-center space-y-4">
                                <Avatar className="h-24 w-24">
                                    <AvatarImage src={conversation.profilePicUrl || undefined} alt="User Avatar" />
                                    <AvatarFallback className="text-3xl">{(conversation.preferredName || conversation.name || 'C').charAt(0).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <div className="flex items-center justify-center gap-2">
                                        <h3 className="text-xl font-bold">{conversation.preferredName || conversation.name}</h3>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <p className="text-muted-foreground">{conversation.id}</p>
                                </div>
                            </div>
                            
                            {conversation.aiSummary && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <Bot className="h-5 w-5 text-primary" />
                                            Resumo da IA
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="text-sm">
                                        <div 
                                            className="prose prose-sm prose-p:my-1 prose-ul:my-1 prose-li:text-card-foreground/90 text-card-foreground/90 marker:text-primary" 
                                            dangerouslySetInnerHTML={{ __html: conversation.aiSummary.replace(/\* /g, '<li>').replace(/\n/g, '<br/>').replace(/<li>/g, '<li style="margin-left: 1.5em;">') }} 
                                        />
                                    </CardContent>
                                </Card>
                            )}

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Informações</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4 text-sm">
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">Anotações do Operador</span>
                                        <Button variant="ghost" size="sm" onClick={onNotes}>
                                            {conversation.operatorNotes && conversation.operatorNotes.length > 0 ? 'Ver/Editar' : 'Adicionar'} <MessageSquareText className="ml-2 h-4 w-4" />
                                        </Button>
                                    </div>
                                     <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">Etiquetas</span>
                                        <Button variant="ghost" size="sm" onClick={onTags}>
                                           Gerenciar <Tag className="ml-2 h-4 w-4" />
                                        </Button>
                                    </div>
                                    {conversation.tags && conversation.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-2 pt-2">
                                            {conversation.tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                            
                             {conversation.systemNotes && conversation.systemNotes.length > 0 && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <History className="h-5 w-5 text-primary" />
                                            Histórico do Sistema
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3 text-sm">
                                        {conversation.systemNotes.map((note, index) => (
                                            <div key={index} className="flex items-start gap-3 text-muted-foreground">
                                                <div className="h-full mt-1.5"><div className="w-2 h-2 rounded-full bg-border" /></div>
                                                <span>{note}</span>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            )}


                            <Card>
                                <CardHeader>
                                     <CardTitle className="text-base">Ações</CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-2">
                                    <Button variant="outline" className="w-full justify-start text-base" onClick={onPin}>
                                        <Pin className={cn("h-4 w-4 mr-3", conversation.pinned && "fill-primary text-primary")} />
                                        {conversation.pinned ? "Desafixar do topo" : "Fixar no topo"}
                                    </Button>

                                    {conversation.folder === 'support' && (
                                        <Button variant="outline" className="w-full justify-start text-base border-green-500/50 text-green-400 hover:bg-green-500/10 hover:text-green-300" onClick={onMarkResolved}>
                                            <CheckCircle2 className="h-4 w-4 mr-3" />
                                            <span>Marcar como Resolvido</span>
                                        </Button>
                                    )}

                                    {conversation.folder === 'archived' ? (
                                        <Button variant="outline" className="w-full justify-start text-base" onClick={onUnarchive}>
                                            <ArchiveRestore className="h-4 w-4 mr-3" />
                                            <span>Desarquivar</span>
                                        </Button>
                                    ) : (
                                        conversation.folder !== 'support' && (
                                             <Button variant="outline" className="w-full justify-start text-base" onClick={onArchive}>
                                                <Archive className="h-4 w-4 mr-3" />
                                                <span>Arquivar</span>
                                            </Button>
                                        )
                                    )}
                                    
                                    <Separator className="my-2" />

                                    <Button variant="outline" className="w-full justify-start text-base border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300" onClick={onDelete}>
                                        <Trash2 className="h-4 w-4 mr-3" />
                                        <span>Apagar Conversa</span>
                                    </Button>
                                </CardContent>
                            </Card>

                        </div>
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
};
