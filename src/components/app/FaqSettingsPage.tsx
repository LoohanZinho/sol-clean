
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy, serverTimestamp, writeBatch } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase';
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, PlusCircle, HelpCircle, Edit, Trash2 } from 'lucide-react';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { Checkbox } from '../ui/checkbox';
import { cn } from '@/lib/utils';
import { clearSelectedFaqItems } from '@/actions/logsActions';

interface FaqItem {
    id: string;
    question: string;
    answer: string;
}

const FaqDialog = ({
    userId,
    isOpen,
    onClose,
    faqItem,
}: {
    userId: string;
    isOpen: boolean;
    onClose: () => void;
    faqItem: FaqItem | null;
}) => {
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isEditing = !!faqItem;

    useEffect(() => {
        if (faqItem) {
            setQuestion(faqItem.question);
            setAnswer(faqItem.answer);
        } else {
            setQuestion('');
            setAnswer('');
        }
        setError(null);
    }, [faqItem, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!question.trim() || !answer.trim()) {
            setError('Pergunta e resposta são obrigatórias.');
            return;
        }
        
        setError(null);
        setIsSaving(true);
        
        try {
            const firestore = getFirebaseFirestore();
            
            if (isEditing && faqItem) {
                const itemRef = doc(firestore, 'users', userId, 'knowledge_base', faqItem.id);
                await updateDoc(itemRef, { question, answer });
            } else {
                const faqRef = collection(firestore, 'users', userId, 'knowledge_base');
                await addDoc(faqRef, { question, answer, type: 'faq', createdAt: serverTimestamp() });
            }
            onClose();
        } catch (err) {
            console.error("Error saving FAQ item: ", err);
            setError("Não foi possível salvar. Tente novamente.");
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{isEditing ? 'Editar Pergunta Frequente' : 'Adicionar Pergunta Frequente'}</DialogTitle>
                    <DialogDescription>
                        A IA usará esta informação para responder às dúvidas dos clientes.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-6 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="question">Pergunta do Cliente</Label>
                            <Input
                                id="question"
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                placeholder="Ex: Qual o horário de funcionamento?"
                                required
                                disabled={isSaving}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="answer">Resposta da IA</Label>
                            <Textarea
                                id="answer"
                                value={answer}
                                onChange={(e) => setAnswer(e.target.value)}
                                placeholder="Ex: Funcionamos de segunda a sexta, das 9h às 18h."
                                required
                                disabled={isSaving}
                                className="min-h-[120px]"
                            />
                        </div>
                         {error && <p className="text-center text-sm text-red-500">{error}</p>}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>Cancelar</Button>
                        <Button type="submit" disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Salvar
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export const FaqSettingsPage = ({ userId }: { userId: string }) => {
    const [faqItems, setFaqItems] = useState<FaqItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<FaqItem | null>(null);
    const [selectedItem, setSelectedItem] = useState<FaqItem | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    
    const isAllSelected = useMemo(() => faqItems.length > 0 && selectedIds.length === faqItems.length, [selectedIds, faqItems]);

    useEffect(() => {
        if (!userId) return;
        const firestore = getFirebaseFirestore();
        
        const knowledgeBaseRef = collection(firestore, 'users', userId, 'knowledge_base');
        const q = query(knowledgeBaseRef, where('type', '==', 'faq'), orderBy('createdAt', 'desc'));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FaqItem));
            setFaqItems(items);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching FAQ items:", error);
            setLoading(false);
        });

        return () => {
            unsubscribe();
        };
    }, [userId]);
    
    const handleSelectAll = () => {
        if (isAllSelected) {
            setSelectedIds([]);
        } else {
            setSelectedIds(faqItems.map(item => item.id));
        }
    }
    
    const handleSelectId = (id: string, checked: boolean) => {
        if (checked) {
            setSelectedIds(prev => [...prev, id]);
        } else {
            setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
        }
    }

    const handleDeleteSelected = async () => {
        if (!userId || selectedIds.length === 0) return;
        try {
            const firestore = getFirebaseFirestore();
            const batch = writeBatch(firestore);
            selectedIds.forEach(id => {
                const docRef = doc(firestore, 'users', userId, 'knowledge_base', id);
                batch.delete(docRef);
            });
            await batch.commit();
            setSelectedIds([]);
        } catch (error) {
            console.error("Error deleting selected FAQ items:", error);
        } finally {
            setIsDeleteDialogOpen(false);
        }
    }

    const handleAdd = () => {
        setSelectedItem(null);
        setIsDialogOpen(true);
    };

    const handleEdit = (item: FaqItem) => {
        setSelectedItem(item);
        setIsDialogOpen(true);
    };

    const handleDelete = (item: FaqItem) => {
        setItemToDelete(item);
        setIsDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!userId || !itemToDelete) return;
        try {
            const firestore = getFirebaseFirestore();
            await deleteDoc(doc(firestore, 'users', userId, 'knowledge_base', itemToDelete.id));
        } catch (error) {
            console.error("Error deleting FAQ item:", error);
        } finally {
            setIsDeleteDialogOpen(false);
            setItemToDelete(null);
        }
    };
    
    const getBulkDeleteDescription = () => {
        const count = selectedIds.length;
        if (count > 0) {
             return `Tem certeza que deseja apagar os ${count} itens selecionados? Esta ação é irreversível.`
        }
        if (itemToDelete) {
             return `Tem certeza que deseja apagar a pergunta "${itemToDelete.question}"? Esta ação não pode ser desfeita.`
        }
        return "Descrição de exclusão padrão."
    }
    
    const onConfirmDelete = () => {
        if (selectedIds.length > 0) {
            handleDeleteSelected();
        } else {
            confirmDelete();
        }
    }
    
    const openDeleteDialog = () => {
        if(selectedIds.length > 0 || itemToDelete) {
            setIsDeleteDialogOpen(true);
        }
    }


    return (
        <div className="space-y-6">
             <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h3 className="text-xl font-bold">Perguntas e Respostas</h3>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Cadastre as perguntas mais comuns e suas respostas ideais.
                    </p>
                </div>
                 <div className="flex items-center gap-2">
                     <Button 
                        variant="outline" 
                        onClick={() => openDeleteDialog()}
                        disabled={selectedIds.length === 0}
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Apagar ({selectedIds.length})
                    </Button>
                    <Button onClick={handleAdd}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Adicionar Pergunta
                    </Button>
                </div>
            </div>
            
            <div className="flex items-center gap-4 px-4 py-2 border rounded-lg bg-card">
                <Checkbox 
                    id="select-all-faq" 
                    checked={isAllSelected}
                    onCheckedChange={handleSelectAll}
                    disabled={faqItems.length === 0}
                />
                <Label htmlFor="select-all-faq" className="text-sm font-medium">Selecionar Tudo</Label>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : faqItems.length === 0 ? (
                <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
                    <HelpCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-semibold">Sua Base de Conhecimento está vazia</h3>
                    <p className="text-muted-foreground mt-1">Clique em "Adicionar Pergunta" para ensinar sua primeira resposta à IA.</p>
                </Card>
            ) : (
                <div className="space-y-4">
                    {faqItems.map(item => (
                        <Card key={item.id} className={cn("transition-colors", selectedIds.includes(item.id) && "bg-secondary/50 border-primary")}>
                            <CardContent className="p-4 flex items-start justify-between gap-4">
                                <Checkbox
                                    id={`select-faq-${item.id}`}
                                    checked={selectedIds.includes(item.id)}
                                    onCheckedChange={(checked) => handleSelectId(item.id, !!checked)}
                                    className="mt-1"
                                />
                                <div className="flex-1">
                                    <p className="font-semibold text-foreground">{item.question}</p>
                                    <p className="text-muted-foreground text-sm mt-1">{item.answer}</p>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-400" onClick={() => handleDelete(item)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <FaqDialog
                userId={userId}
                isOpen={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                faqItem={selectedItem}
            />
            
            <ConfirmDeleteDialog
                isOpen={isDeleteDialogOpen}
                onClose={() => {
                    setIsDeleteDialogOpen(false);
                    setItemToDelete(null);
                }}
                onConfirm={onConfirmDelete}
                title={selectedIds.length > 0 ? "Apagar Perguntas?" : "Apagar Pergunta?"}
                description={getBulkDeleteDescription()}
            />
        </div>
    );
};
