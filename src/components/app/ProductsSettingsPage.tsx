'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';
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
import { Loader2, PlusCircle, ShoppingCart, Edit, Trash2, ImagePlus, X, FileText, DollarSign } from 'lucide-react';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { Checkbox } from '../ui/checkbox';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';

interface ProductItem {
    id: string;
    name: string;
    description: string;
    price?: number;
    imageUrls?: string[];
}

const ProductDialog = ({
    userId,
    isOpen,
    onClose,
    productItem,
}: {
    userId: string;
    isOpen: boolean;
    onClose: () => void;
    productItem: ProductItem | null;
}) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState<string>('');
    const [images, setImages] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isEditing = !!productItem;

    useEffect(() => {
        if (productItem) {
            setName(productItem.name);
            setDescription(productItem.description);
            setPrice(productItem.price ? String(productItem.price) : '');
            setImages(productItem.imageUrls || []);
        } else {
            setName('');
            setDescription('');
            setPrice('');
            setImages([]);
        }
        setError(null);
    }, [productItem, isOpen]);

    const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        setError(null);

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            try {
                const base64 = reader.result as string;
                const storage = getStorage();
                const storageRef = ref(storage, `users/${userId}/products/${uuidv4()}`);
                await uploadString(storageRef, base64, 'data_url');
                const downloadURL = await getDownloadURL(storageRef);
                setImages(prev => [...prev, downloadURL]);
            } catch (err: any) {
                const errorMessage = err.code ? `${err.code} - ${err.message}` : "Falha no upload do arquivo.";
                setError(errorMessage);
            } finally {
                setIsUploading(false);
            }
        };
        reader.onerror = () => {
            setError("Falha ao ler o arquivo.");
            setIsUploading(false);
        }
    };
    
    const handleRemoveImage = (index: number) => {
        // Here we just remove from state. Deletion from storage happens on save.
        setImages(prev => prev.filter((_, i) => i !== index));
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !description.trim()) {
            setError('Nome e descrição são obrigatórios.');
            return;
        }
        
        setError(null);
        setIsSaving(true);
        
        try {
            const firestore = getFirebaseFirestore();
            
            const priceAsNumber = price ? parseFloat(price.replace(',', '.')) : undefined;

            const dataToSave: Partial<ProductItem> & { type: string, name: string, description: string, createdAt?: any } = { 
                name, 
                description, 
                imageUrls: images, 
                type: 'product'
            };

            if (priceAsNumber !== undefined && !isNaN(priceAsNumber)) {
                dataToSave.price = priceAsNumber;
            }

            if (isEditing && productItem) {
                const itemRef = doc(firestore, 'users', userId, 'knowledge_base', productItem.id);
                await updateDoc(itemRef, dataToSave);
            } else {
                dataToSave.createdAt = serverTimestamp();
                const productRef = collection(firestore, 'users', userId, 'knowledge_base');
                await addDoc(productRef, dataToSave);
            }
            onClose();
        } catch (err) {
            console.error("Error saving product item: ", err);
            setError("Não foi possível salvar. Tente novamente.");
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-xl">
                 <form onSubmit={handleSubmit} className="flex flex-col h-full">
                    <DialogHeader>
                        <DialogTitle>{isEditing ? 'Editar Produto/Serviço' : 'Adicionar Produto/Serviço'}</DialogTitle>
                        <DialogDescription>
                            A IA usará esta informação para apresentar seus produtos/serviços, inclusive enviando imagens ou documentos.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 py-4 flex-grow">
                         <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="space-y-2 col-span-2">
                                <Label htmlFor="product-name">Nome do Produto/Serviço</Label>
                                <Input id="product-name" value={name} onChange={e => setName(e.target.value)} required />
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="product-price">Preço (R$)</Label>
                                <div className="relative">
                                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input id="product-price" value={price} onChange={e => setPrice(e.target.value)} placeholder="Ex: 150,00" className="pl-9" />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="product-description">Descrição</Label>
                            <Textarea id="product-description" value={description} onChange={e => setDescription(e.target.value)} required className="min-h-[100px]" />
                        </div>
                        <div className="space-y-2">
                            <Label>Imagens ou Documentos</Label>
                            <div className="grid grid-cols-3 gap-2">
                                {images.map((url, index) => {
                                    const isPdf = url.includes('.pdf');
                                    return (
                                        <div key={index} className="relative group">
                                            {isPdf ? (
                                                 <div className="w-full h-24 object-cover rounded-md bg-muted flex flex-col items-center justify-center text-center p-2">
                                                    <FileText className="h-8 w-8 text-destructive"/>
                                                    <span className="text-xs mt-2 text-muted-foreground break-all line-clamp-2">{decodeURIComponent(url.split('/').pop()?.split('?')[0] || '')}</span>
                                                 </div>
                                            ) : (
                                                <img src={url} alt={`Imagem ${index + 1}`} className="w-full h-24 object-cover rounded-md" />
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveImage(index)}
                                                className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </div>
                                    )
                                })}
                                <label htmlFor="image-upload" className="flex items-center justify-center w-full h-24 border-2 border-dashed rounded-md cursor-pointer hover:bg-accent">
                                    {isUploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6 text-muted-foreground" />}
                                    <input id="image-upload" type="file" className="hidden" onChange={handleImageUpload} accept="image/*,application/pdf" disabled={isUploading} />
                                </label>
                            </div>
                            <p className="text-xs text-muted-foreground">Você pode fazer upload de imagens (PNG, JPG) ou documentos (PDF).</p>
                        </div>
                        {error && <p className="text-center text-sm text-red-500">{error}</p>}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving || isUploading}>Cancelar</Button>
                        <Button type="submit" disabled={isSaving || isUploading}>
                            {(isSaving || isUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Salvar
                        </Button>
                    </DialogFooter>
                 </form>
            </DialogContent>
        </Dialog>
    );
};

export const ProductsSettingsPage = ({ userId }: { userId: string }) => {
    const [productItems, setProductItems] = useState<ProductItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<ProductItem | null>(null);
    const [selectedItem, setSelectedItem] = useState<ProductItem | null>(null);

    useEffect(() => {
        if (!userId) return;
        const firestore = getFirebaseFirestore();
        
        const knowledgeBaseRef = collection(firestore, 'users', userId, 'knowledge_base');
        const q = query(knowledgeBaseRef, where('type', '==', 'product'), orderBy('createdAt', 'desc'));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductItem));
            setProductItems(items);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching product items:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [userId]);

    const handleAdd = () => {
        setSelectedItem(null);
        setIsDialogOpen(true);
    };

    const handleEdit = (item: ProductItem) => {
        setSelectedItem(item);
        setIsDialogOpen(true);
    };

    const handleDelete = (item: ProductItem) => {
        setItemToDelete(item);
        setIsDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!userId || !itemToDelete) return;
        try {
            const firestore = getFirebaseFirestore();
            const storage = getStorage();
            
            // Delete images from storage first
            if (itemToDelete.imageUrls) {
                for (const url of itemToDelete.imageUrls) {
                    try {
                        const imageRef = ref(storage, url);
                        await deleteObject(imageRef);
                    } catch (storageError: any) {
                         // Ignore if file not found, as it might have been deleted already
                        if (storageError.code !== 'storage/object-not-found') {
                            console.error("Error deleting image from storage:", storageError);
                        }
                    }
                }
            }

            // Delete firestore document
            await deleteDoc(doc(firestore, 'users', userId, 'knowledge_base', itemToDelete.id));

        } catch (error) {
            console.error("Error deleting product item:", error);
        } finally {
            setIsDeleteDialogOpen(false);
            setItemToDelete(null);
        }
    };
    
    const formatPrice = (price: number | undefined) => {
        if (price === undefined) return null;
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);
    }

    return (
        <div className="space-y-6">
             <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h3 className="text-xl font-bold">Produtos e Serviços</h3>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Cadastre os itens que a IA deve conhecer, incluindo imagens e documentos.
                    </p>
                </div>
                <Button onClick={handleAdd}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Adicionar Item
                </Button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : productItems.length === 0 ? (
                <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
                    <ShoppingCart className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-semibold">Nenhum produto cadastrado</h3>
                    <p className="text-muted-foreground mt-1">Clique em "Adicionar Item" para começar a ensinar a IA sobre o que você oferece.</p>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {productItems.map(item => {
                        const firstUrl = item.imageUrls?.[0];
                        const isPdf = firstUrl?.includes('.pdf');
                        return (
                            <Card key={item.id}>
                                 {firstUrl ? (
                                    isPdf ? (
                                         <div className="w-full h-40 object-cover rounded-t-xl bg-muted flex flex-col items-center justify-center text-center p-2">
                                            <FileText className="h-12 w-12 text-destructive"/>
                                            <span className="text-xs mt-2 text-muted-foreground break-all line-clamp-2">{decodeURIComponent(firstUrl.split('/').pop()?.split('?')[0] || '')}</span>
                                         </div>
                                    ) : (
                                        <img src={firstUrl} alt={item.name} className="w-full h-40 object-cover rounded-t-xl" />
                                    )
                                 ) : (
                                     <div className="w-full h-40 object-cover rounded-t-xl bg-muted flex items-center justify-center">
                                        <ShoppingCart className="h-12 w-12 text-muted-foreground/30" />
                                     </div>
                                 )}
                                <CardContent className="p-4">
                                   <div className="flex justify-between items-start">
                                        <h4 className="font-semibold text-foreground flex-1 pr-2">{item.name}</h4>
                                         <div className="flex items-center gap-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(item)}>
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-400" onClick={() => handleDelete(item)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                   </div>
                                    <p className="text-muted-foreground text-sm mt-1 line-clamp-3">{item.description}</p>
                                    {item.price !== undefined && (
                                        <div className="mt-3 font-bold text-lg text-primary">{formatPrice(item.price)}</div>
                                    )}
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}

            <ProductDialog
                userId={userId}
                isOpen={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                productItem={selectedItem}
            />
            
            <ConfirmDeleteDialog
                isOpen={isDeleteDialogOpen}
                onClose={() => {
                    setIsDeleteDialogOpen(false);
                    setItemToDelete(null);
                }}
                onConfirm={confirmDelete}
                title="Apagar Item?"
                description={`Tem certeza que deseja apagar o item "${itemToDelete?.name}"? Todas as suas imagens e documentos também serão removidos.`}
            />
        </div>
    );
};
