
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { getFirebaseFirestore, getFirebaseStorage } from '@/lib/firebase';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, FileText, UploadCloud, Trash2, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import type { SyncedDocument } from '@/lib/types';
import { cn } from '@/lib/utils';

export const RagSettingsPage = ({ userId }: { userId: string }) => {
    const [syncedDocs, setSyncedDocs] = useState<SyncedDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploadingFiles, setUploadingFiles] = useState<Record<string, { progress: number; name: string }>>({});
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [docToDelete, setDocToDelete] = useState<SyncedDocument | null>(null);

    useEffect(() => {
        if (!userId) return;
        const firestore = getFirebaseFirestore();
        const docsRef = collection(firestore, 'users', userId, 'synced_documents');
        const q = query(docsRef, orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SyncedDocument));
            setSyncedDocs(items);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching synced docs:", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [userId]);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        acceptedFiles.forEach(file => {
            if (file.type !== 'application/pdf') {
                // simple alert for now, could be a toast
                alert("Apenas arquivos PDF são permitidos.");
                return;
            }
            uploadFile(file);
        });
    }, [userId]);

    const uploadFile = (file: File) => {
        const storage = getFirebaseStorage();
        const storageRef = ref(storage, `users/${userId}/rag_documents/${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file);
        
        const uploadId = file.name + Date.now();
        setUploadingFiles(prev => ({ ...prev, [uploadId]: { progress: 0, name: file.name } }));

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadingFiles(prev => ({ ...prev, [uploadId]: { ...prev[uploadId], progress } }));
            },
            (error) => {
                console.error("Upload failed:", error);
                setUploadingFiles(prev => {
                    const newFiles = { ...prev };
                    delete newFiles[uploadId];
                    return newFiles;
                });
            },
            () => {
                getDownloadURL(uploadTask.snapshot.ref).then(() => {
                    setUploadingFiles(prev => {
                        const newFiles = { ...prev };
                        delete newFiles[uploadId];
                        return newFiles;
                    });
                    // Firestore document creation is now handled by the backend Cloud Function
                });
            }
        );
    };

    const handleDelete = (doc: SyncedDocument) => {
        setDocToDelete(doc);
        setIsDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!userId || !docToDelete) return;
        
        const firestore = getFirebaseFirestore();
        const storage = getFirebaseStorage();
        
        try {
            // Delete from Firestore
            await deleteDoc(doc(firestore, 'users', userId, 'synced_documents', docToDelete.id));
            
            // Delete the original file from Storage
            const fileRef = ref(storage, `users/${userId}/rag_documents/${docToDelete.name}`);
            await deleteObject(fileRef);

            // Note: The related vectors in the 'document_vectors' subcollection
            // will be deleted by a backend Cloud Function triggered by the deletion of the document.
        } catch (error) {
            console.error("Error deleting document:", error);
        } finally {
            setIsDeleteDialogOpen(false);
            setDocToDelete(null);
        }
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, noClick: true });

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h3 className="text-xl font-bold">RAG (Retrieval-Augmented Generation)</h3>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Faça o upload de documentos PDF para que a IA aprenda com eles e responda perguntas complexas.
                    </p>
                </div>
            </div>

            <div {...getRootProps()} className={cn("p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors", isDragActive ? "border-primary bg-primary/10" : "hover:border-accent hover:bg-accent/10")}>
                <input {...getInputProps()} />
                <div className="flex flex-col items-center justify-center gap-4 text-muted-foreground">
                    <UploadCloud className="h-12 w-12" />
                    <p className="font-semibold">{isDragActive ? "Solte os arquivos aqui..." : "Arraste e solte seus arquivos PDF aqui"}</p>
                    <p className="text-sm">ou</p>
                    <Button type="button" onClick={() => (document.querySelector('input[type=file]') as HTMLInputElement)?.click()}>
                        Selecionar Arquivos
                    </Button>
                </div>
            </div>

            {Object.entries(uploadingFiles).length > 0 && (
                <div className="space-y-2">
                    <h4 className="font-semibold">Uploads em Andamento</h4>
                    {Object.entries(uploadingFiles).map(([id, { name, progress }]) => (
                        <Card key={id}>
                            <CardContent className="p-4 flex items-center gap-4">
                                <FileText className="h-6 w-6 flex-shrink-0" />
                                <div className="flex-1">
                                    <p className="font-medium truncate">{name}</p>
                                    <Progress value={progress} className="h-2 mt-1" />
                                </div>
                                <span className="text-sm font-mono">{Math.round(progress)}%</span>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : syncedDocs.length === 0 && Object.keys(uploadingFiles).length === 0 ? (
                <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
                    <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-semibold">Nenhum documento sincronizado</h3>
                    <p className="text-muted-foreground mt-1">Sua IA está usando apenas a base de FAQ e Produtos. Faça upload de um PDF para expandir seu conhecimento.</p>
                </Card>
            ) : (
                <div className="space-y-4">
                    {syncedDocs.map(docItem => {
                        return (
                            <Card key={docItem.id}>
                                <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                        <FileText className="h-6 w-6 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold truncate">{docItem.name}</p>
                                             <div className="flex items-center gap-2 text-sm">
                                                {docItem.lastSynced && <span className="text-muted-foreground text-xs">{docItem.lastSynced}</span>}
                                            </div>
                                            {docItem.error && <p className="text-xs text-red-500 truncate" title={docItem.error}>Erro: {docItem.error}</p>}
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-400 self-end sm:self-center" onClick={() => handleDelete(docItem)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}

            <ConfirmDeleteDialog
                isOpen={isDeleteDialogOpen}
                onClose={() => setIsDeleteDialogOpen(false)}
                onConfirm={confirmDelete}
                title="Apagar Documento?"
                description={`Tem certeza que deseja apagar o documento "${docToDelete?.name}"? Todo o conhecimento que a IA aprendeu com ele será permanentemente perdido.`}
            />
        </div>
    );
};
