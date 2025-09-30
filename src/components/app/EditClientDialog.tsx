

'use client';

import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase';
import type { Conversation, Address } from '@/lib/types';
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
import { Loader2 } from 'lucide-react';
import { findAndTriggerActions } from '@/actions/webhookSender';
import { logSystemFailure } from '@/ai/flows/system-log-helpers';

interface EditClientDialogProps {
    userId: string;
    client: Conversation;
    isOpen: boolean;
    onClose: () => void;
}

export const EditClientDialog = ({ userId, client, isOpen, onClose }: EditClientDialogProps) => {
    const [name, setName] = useState('');
    const [address, setAddress] = useState<Partial<Address>>({
        street: '',
        number: '',
        neighborhood: '',
        city: '',
        complement: '',
        referencePoint: ''
    });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (client) {
            setName(client.preferredName || '');
            setAddress({
                street: client.address?.street || '',
                number: client.address?.number || '',
                neighborhood: client.address?.neighborhood || '',
                city: client.address?.city || '',
                complement: client.address?.complement || '',
                referencePoint: client.address?.referencePoint || ''
            });
        }
    }, [client]);

    const handleAddressChange = (field: keyof Address, value: string) => {
        setAddress(prev => ({...prev, [field]: value}));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        setError(null);
        setIsSaving(true);
        
        try {
            const firestore = getFirebaseFirestore();
            const clientRef = doc(firestore, 'users', userId, 'conversations', client.id);
            
            const updates = {
                preferredName: name,
                address: address,
            };

            await updateDoc(clientRef, updates);

            // Dispara a notificação após a atualização bem-sucedida
            findAndTriggerActions(userId, 'client_info_updated', {
                conversationId: client.id,
                clientData: { ...client, ...updates },
                updatedFields: Object.keys(updates)
            }).catch(err => {
                logSystemFailure(userId, 'action_trigger_failed_client_info_updated', { message: err.message }, { conversationId: client.id });
            });


            onClose();
        } catch (err) {
            console.error("Error updating client: ", err);
            setError("Não foi possível atualizar o cliente. Tente novamente.");
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Editar Contato</DialogTitle>
                    <DialogDescription>
                        Atualize as informações do contato selecionado.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex flex-col h-full">
                    <div className="grid gap-6 py-4 max-h-[70vh] overflow-y-auto px-2 -mx-2 flex-grow">
                        <div className="space-y-2">
                            <Label htmlFor="client-name">Nome Preferido</Label>
                            <Input
                                id="client-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Como você quer chamar este contato?"
                                disabled={isSaving}
                            />
                        </div>

                         <div className="space-y-2">
                            <Label htmlFor="whatsapp-name">Nome no WhatsApp (Original)</Label>
                            <Input
                                id="whatsapp-name"
                                value={client.name}
                                disabled
                                className="bg-muted"
                            />
                        </div>
                        
                        <fieldset className="space-y-4">
                           <legend className="text-sm font-medium mb-2">Endereço</legend>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                               <div className="space-y-2 col-span-1 sm:col-span-2">
                                  <Label htmlFor="street">Endereço</Label>
                                  <Input
                                      id="street"
                                      placeholder="Rua, Av, etc."
                                      value={address.street || ''}
                                      onChange={(e) => handleAddressChange('street', e.target.value)}
                                      disabled={isSaving}
                                  />
                                </div>
                                 <div className="space-y-2 col-span-1">
                                  <Label htmlFor="number">Número</Label>
                                  <Input
                                      id="number"
                                      value={address.number || ''}
                                      onChange={(e) => handleAddressChange('number', e.target.value)}
                                      disabled={isSaving}
                                  />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor="neighborhood">Bairro (Opcional)</Label>
                                  <Input
                                      id="neighborhood"
                                      value={address.neighborhood || ''}
                                      onChange={(e) => handleAddressChange('neighborhood', e.target.value)}
                                      disabled={isSaving}
                                  />
                                </div>
                                 <div className="space-y-2">
                                  <Label htmlFor="city">Cidade (Opcional)</Label>
                                  <Input
                                      id="city"
                                      value={address.city || ''}
                                      onChange={(e) => handleAddressChange('city', e.target.value)}
                                      disabled={isSaving}
                                  />
                                </div>
                            </div>
                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="complement">Complemento (Opcional)</Label>
                                    <Input
                                        id="complement"
                                        value={address.complement || ''}
                                        onChange={(e) => handleAddressChange('complement', e.target.value)}
                                        placeholder="Apto, bloco, casa, etc."
                                        disabled={isSaving}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="reference">Ponto de Referência (Opcional)</Label>
                                    <Input
                                        id="reference"
                                        value={address.referencePoint || ''}
                                        onChange={(e) => handleAddressChange('referencePoint', e.target.value)}
                                        placeholder="Próximo à padaria, etc."
                                        disabled={isSaving}
                                    />
                                </div>
                            </div>
                        </fieldset>

                         {error && <p className="text-center text-sm text-red-500">{error}</p>}
                    </div>
                    <DialogFooter className="flex-shrink-0">
                        <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>Cancelar</Button>
                        <Button type="submit" disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-pulse-subtle" />}
                            Salvar Alterações
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
