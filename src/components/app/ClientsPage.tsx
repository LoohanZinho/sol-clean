'use client';

import React, { useState, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useConversations } from '@/hooks/useConversations';
import type { Conversation, Address, Order } from '@/lib/types';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Search, UserX, Edit, Trash2, ChevronLeft, ChevronRight, MoreVertical, Phone, MapPin, History, ShoppingCart } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { getFirebaseFirestore, getFirebaseStorage } from '@/lib/firebase';
import { deleteDoc, doc, writeBatch, collection, getDocs, query } from 'firebase/firestore';
import { ref, deleteObject, listAll } from 'firebase/storage';
import { Card, CardContent } from '../ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { Separator } from '../ui/separator';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

const EditClientDialog = dynamic(() => import('./EditClientDialog').then(mod => mod.EditClientDialog), {
    loading: () => <div className="p-4 flex justify-center"><Loader2 className="h-6 w-6 animate-pulse-subtle" /></div>
});

const ITEMS_PER_PAGE = 50;

const formatPhoneNumber = (phone: string): string => {
  if (!phone) return 'N/A';
  const cleaned = phone.replace(/\D/g, '');

  if (cleaned.length === 13) {
    const match = cleaned.match(/^(\d{2})(\d{2})(\d{5})(\d{4})$/);
    if (match) return `+${match[1]} (${match[2]}) ${match[3]}-${match[4]}`;
  }
  
  if (cleaned.length === 12) {
      const match = cleaned.match(/^(\d{2})(\d{2})(\d{4})(\d{4})$/);
      if (match) return `+${match[1]} (${match[2]}) ${match[3]}-${match[4]}`;
  }

  if (cleaned.length === 11) {
    const match = cleaned.match(/^(\d{2})(\d{5})(\d{4})$/);
    if (match) return `(${match[1]}) ${match[2]}-${match[3]}`;
  }
  
  if (cleaned.length === 10) {
      const match = cleaned.match(/^(\d{2})(\d{4})(\d{4})$/);
       if (match) return `(${match[1]}) ${match[2]}-${match[3]}`;
  }

  return phone;
};


export const ClientsPage = ({ userId }: { userId: string }) => {
    const { conversations: clients, loading: clientsLoading, error: clientsError } = useConversations(userId);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [clientToEdit, setClientToEdit] = useState<Conversation | null>(null);
    const [clientToDelete, setClientToDelete] = useState<Conversation | null>(null);
    const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    
    const loading = clientsLoading;
    const error = clientsError;

    const filteredClients = useMemo(() => {
        let sortedClients = [...clients].sort((a, b) => {
            const nameA = a.preferredName || a.name || '';
            const nameB = b.preferredName || b.name || '';
            return nameA.localeCompare(nameB);
        });
        
        if (!searchTerm) {
            return sortedClients;
        }
        return sortedClients.filter(client => 
            (client.preferredName || client.name).toLowerCase().includes(searchTerm.toLowerCase()) ||
            client.id.includes(searchTerm)
        );
    }, [clients, searchTerm]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    const paginatedClients = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        return filteredClients.slice(startIndex, endIndex);
    }, [filteredClients, currentPage]);

    const totalPages = Math.ceil(filteredClients.length / ITEMS_PER_PAGE);

    const handleNextPage = () => {
        if (currentPage < totalPages) {
            setCurrentPage(currentPage + 1);
        }
    };

    const handlePreviousPage = () => {
        if (currentPage > 1) {
            setCurrentPage(currentPage - 1);
        }
    };
    
    const handleEditClick = (client: Conversation) => {
        setClientToEdit(client);
    };

    const handleDeleteClick = (client: Conversation) => {
        setClientToDelete(client);
    };

    const confirmDelete = async () => {
        if (!userId || !clientToDelete) return;
        
        setIsDeleting(true);
        try {
            const firestore = getFirebaseFirestore();
            const storage = getFirebaseStorage();
            const conversationRef = doc(firestore, 'users', userId, 'conversations', clientToDelete.id);
            const messagesRef = collection(conversationRef, 'messages');
            const mediaFolderRef = ref(storage, `users/${userId}/conversations/${clientToDelete.id}/media`);
            
            const mediaFiles = await listAll(mediaFolderRef);
            await Promise.all(mediaFiles.items.map(fileRef => deleteObject(fileRef)));

            const batch = writeBatch(firestore);
            const messagesSnapshot = await getDocs(query(messagesRef));
            messagesSnapshot.forEach(messageDoc => {
                batch.delete(messageDoc.ref);
            });
            batch.delete(conversationRef);
            await batch.commit();

        } catch (error) {
            console.error("Error deleting client and their data:", error);
        } finally {
            setIsDeleting(false);
            setClientToDelete(null); 
        }
    };
    
    const renderAddress = (address: Address | null | undefined) => {
        if (!address?.street) return 'Não informado';
    
        return `${address.street}, ${address.number || 'S/N'}`;
    };

    return (
        <div className="flex-1 flex flex-col">
             <header className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold">Contatos</h1>
                    <p className="text-muted-foreground">Gerencie seus contatos do WhatsApp.</p>
                </div>
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input 
                        placeholder="Buscar por nome ou número..." 
                        className="pl-11 h-12 text-base w-full"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </header>
            
            <main className="flex-1 flex flex-col">
                 {loading && (
                    <div className="h-full flex items-center justify-center p-8">
                        <Loader2 className="h-10 w-10 animate-pulse-subtle text-primary mx-auto" />
                    </div>
                )}
                {error && (
                    <div className="h-full flex items-center justify-center p-8 text-red-500">
                        Erro ao carregar contatos.
                    </div>
                )}
                {!loading && filteredClients.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-muted-foreground">
                        <UserX className="h-16 w-16 text-muted-foreground/30" />
                        <p className="font-semibold mt-4 text-lg">Nenhum contato encontrado.</p>
                        <p className="text-sm mt-1">{searchTerm ? "Tente um termo de busca diferente." : "Novas conversas aparecerão aqui."}</p>
                    </div>
                )}
                 {!loading && filteredClients.length > 0 && (
                    <>
                        {/* Mobile View */}
                        <div className="md:hidden space-y-3">
                           {paginatedClients.map(client => (
                                <Card key={client.id} className="bg-card">
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-4 flex-1 min-w-0">
                                                <Avatar className="h-12 w-12">
                                                    <AvatarImage src={client.profilePicUrl || undefined} alt={client.name} />
                                                    <AvatarFallback>{((client.preferredName || client.name) || 'C').charAt(0).toUpperCase()}</AvatarFallback>
                                                </Avatar>
                                                <div className="space-y-1 flex-1 min-w-0">
                                                    <p className="font-semibold text-base truncate">{client.preferredName || client.name}</p>
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                        <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                                                        <span className="truncate">{formatPhoneNumber(client.id)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                        <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                                                        <span className="truncate">{renderAddress(client.address)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="-mr-2 flex-shrink-0">
                                                        <MoreVertical className="h-5 w-5" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onSelect={() => handleEditClick(client)}>
                                                        <Edit className="mr-2 h-4 w-4" /> Editar
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onSelect={() => handleDeleteClick(client)} className="text-red-500">
                                                        <Trash2 className="mr-2 h-4 w-4" /> Apagar
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        {/* Desktop View */}
                        <div className="hidden md:block bg-card border rounded-xl overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Contato</TableHead>
                                        <TableHead>Telefone</TableHead>
                                        <TableHead>Endereço</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedClients.map(client => (
                                        <TableRow key={client.id}>
                                            <TableCell className="w-[300px]">
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-10 w-10">
                                                        <AvatarImage src={client.profilePicUrl || undefined} alt={client.name} />
                                                        <AvatarFallback>{((client.preferredName || client.name) || 'C').charAt(0).toUpperCase()}</AvatarFallback>
                                                    </Avatar>
                                                    <div className="font-medium">{client.preferredName || client.name}</div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground font-mono">{formatPhoneNumber(client.id)}</TableCell>
                                            <TableCell className="text-muted-foreground w-[250px]">{renderAddress(client.address)}</TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                                                            <MoreVertical className="h-5 w-5" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent>
                                                        <DropdownMenuItem onSelect={() => handleEditClick(client)}>
                                                            <Edit className="mr-2 h-4 w-4" /> Editar
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onSelect={() => handleDeleteClick(client)} className="text-red-500">
                                                            <Trash2 className="mr-2 h-4 w-4" /> Apagar
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        
                        <div className="flex items-center justify-between p-4 mt-4">
                            <span className="text-sm text-muted-foreground">
                                Página {currentPage} de {totalPages}
                            </span>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" onClick={handlePreviousPage} disabled={currentPage === 1}>
                                    <ChevronLeft className="h-4 w-4 md:mr-2" />
                                    <span className="hidden md:inline">Anterior</span>
                                </Button>
                                <Button variant="outline" onClick={handleNextPage} disabled={currentPage === totalPages}>
                                    <span className="hidden md:inline">Próximo</span>
                                    <ChevronRight className="h-4 w-4 md:ml-2" />
                                </Button>
                            </div>
                        </div>
                    </>
                 )}
            </main>

            {clientToEdit && (
                <EditClientDialog
                    userId={userId}
                    client={clientToEdit}
                    isOpen={!!clientToEdit}
                    onClose={() => setClientToEdit(null)}
                />
            )}

            {clientToDelete && (
                <ConfirmDeleteDialog
                    isOpen={!!clientToDelete}
                    onClose={() => setClientToDelete(null)}
                    onConfirm={confirmDelete}
                    title={`Apagar Contato`}
                    description={`Tem certeza que deseja apagar o contato "${clientToDelete.preferredName || clientToDelete.name}"? Esta ação não pode ser desfeita e irá remover também o histórico de mensagens e todos os arquivos de mídia (áudios).`}
                    isDeleting={isDeleting}
                />
            )}
        </div>
    );
};
