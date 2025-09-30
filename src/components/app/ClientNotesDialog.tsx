
'use client';

import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from 'lucide-react';

interface ClientNotesDialogProps {
    userId: string;
    client: Conversation;
    isOpen: boolean;
    onClose: () => void;
}

export const ClientNotesDialog = ({ userId, client, isOpen, onClose }: ClientNotesDialogProps) => {
    const [notes, setNotes] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && client) {
            // Join array into a string for the textarea
            setNotes(Array.isArray(client.operatorNotes) ? client.operatorNotes.join('\n') : (client.operatorNotes || ''));
        }
    }, [isOpen, client]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!client.id) return;
        
        setError(null);
        setIsSaving(true);
        
        try {
            const firestore = getFirebaseFirestore();
            const clientRef = doc(firestore, 'users', userId, 'conversations', client.id);
            // Split string back into an array for saving
            const notesToSave = notes.split('\n').filter(note => note.trim() !== '');
            await updateDoc(clientRef, {
                operatorNotes: notesToSave,
            });
            onClose();
        } catch (err) {
            console.error("Error updating client notes: ", err);
            setError("Não foi possível salvar a anotação.");
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Anotações do Cliente</DialogTitle>
                    <DialogDescription>
                        Adicione ou edite informações importantes sobre {client.preferredName || client.name}. Estas notas são visíveis apenas para os operadores.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="py-4">
                        <Label htmlFor="client-notes" className="sr-only">Anotações</Label>
                        <Textarea
                            id="client-notes"
                            placeholder="Ex: Cliente prefere que o entregador ligue ao chegar..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="min-h-[180px] text-base"
                            disabled={isSaving}
                        />
                         {error && <p className="mt-2 text-center text-sm text-red-500">{error}</p>}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>Cancelar</Button>
                        <Button type="submit" disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-pulse-subtle" />}
                            Salvar Anotação
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

    
