
'use client';

import React, { useState, useEffect, KeyboardEvent } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase';
import type { Conversation } from '@/lib/types';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, X, Plus } from 'lucide-react';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';
import { findAndTriggerActions } from '@/actions/webhookSender'; 
import { logSystemFailure } from '@/ai/flows/system-log-helpers';


interface ManageTagsDialogProps {
    userId: string;
    conversation: Conversation;
    isOpen: boolean;
    onClose: () => void;
}

export const ManageTagsDialog = ({ userId, conversation, isOpen, onClose }: ManageTagsDialogProps) => {
    const [tags, setTags] = useState<string[]>([]);
    const [newTag, setNewTag] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && conversation) {
            setTags(conversation.tags || []);
        }
    }, [isOpen, conversation]);

    const handleAddTag = async () => {
        const trimmedTag = newTag.trim();
        if (!trimmedTag || tags.includes(trimmedTag)) {
            setNewTag('');
            return;
        }

        setError(null);
        setIsSaving(true);
        try {
            const firestore = getFirebaseFirestore();
            const conversationRef = doc(firestore, 'users', userId, 'conversations', conversation.id);
            await updateDoc(conversationRef, {
                tags: arrayUnion(trimmedTag)
            });
            
            setNewTag('');

            // Create a plain object for the server action to avoid serialization errors
            const payloadClientData = {
                id: conversation.id,
                name: conversation.name,
                preferredName: conversation.preferredName,
                tags: [...tags, trimmedTag],
            };

            // Fire and forget webhook trigger
            findAndTriggerActions(userId, 'tag_added', {
                conversationId: conversation.id,
                clientData: payloadClientData,
                tag: trimmedTag,
                addedBy: 'operator'
            }).catch(err => {
                logSystemFailure(userId, 'action_trigger_failed_manual_tag', { message: `Falha ao disparar a ação 'tag_added' para a tag '${trimmedTag}': ${err.message}` }, { conversationId: conversation.id, tag: trimmedTag });
            });


        } catch (err) {
            console.error("Error adding tag:", err);
            setError("Não foi possível adicionar a etiqueta.");
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleRemoveTag = async (tagToRemove: string) => {
        setError(null);
        setIsSaving(true);
        try {
            const firestore = getFirebaseFirestore();
            const conversationRef = doc(firestore, 'users', userId, 'conversations', conversation.id);
            await updateDoc(conversationRef, {
                tags: arrayRemove(tagToRemove)
            });
        } catch (err) {
             console.error("Error removing tag:", err);
             setError("Não foi possível remover a etiqueta.");
        } finally {
             setIsSaving(false);
        }
    }
    
    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddTag();
        }
    }
    
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Gerenciar Etiquetas</DialogTitle>
                    <DialogDescription>
                        Adicione ou remova etiquetas para organizar esta conversa.
                    </DialogDescription>
                </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                             <Label htmlFor="new-tag">Nova Etiqueta</Label>
                             <div className="flex gap-2">
                                <Input
                                    id="new-tag"
                                    placeholder="Ex: Orçamento"
                                    value={newTag}
                                    onChange={(e) => setNewTag(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    disabled={isSaving}
                                />
                                <Button type="button" onClick={handleAddTag} disabled={isSaving || !newTag.trim()}>
                                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                </Button>
                             </div>
                        </div>

                         {tags.length > 0 && (
                             <div className="space-y-2">
                                <Label>Etiquetas Atuais</Label>
                                <div className="flex flex-wrap gap-2 p-2 rounded-lg border bg-muted/50 min-h-[40px]">
                                    {tags.map(tag => (
                                        <Badge key={tag} variant="secondary" className="flex items-center gap-1.5 text-base">
                                            {tag}
                                            <button 
                                                onClick={() => handleRemoveTag(tag)} 
                                                className="rounded-full hover:bg-destructive/20 p-0.5"
                                                disabled={isSaving}
                                                aria-label={`Remover etiqueta ${tag}`}
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </Badge>
                                    ))}
                                </div>
                             </div>
                         )}

                         {error && <p className="mt-2 text-center text-sm text-red-500">{error}</p>}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>Fechar</Button>
                    </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
