'use client';

import React, { useState, useEffect, FormEvent } from 'react';
import { getFirebaseFirestore } from '@/lib/firebase';
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, getDoc, setDoc } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, UserPlus, Edit, Trash2, Users, KeyRound, Link as LinkIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { ConfirmDeleteDialog } from '@/components/app/ConfirmDeleteDialog';

const ADMIN_PASSWORD = "2Raparigas*";

type User = {
    id: string;
    email: string;
    password?: string;
};

// --- Firestore Functions (Client-Side) ---

async function getUsers() {
    try {
        const firestore = getFirebaseFirestore();
        const usersSnapshot = await getDocs(collection(firestore, 'users'));
        const users = usersSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as User));
        return users;
    } catch (error: any) {
        console.error("Error fetching users:", error);
        return [];
    }
}

async function createUser(email: string, password: string) {
    if (!email || !password) {
        return { success: false, error: "Email e senha são obrigatórios." };
    }
    try {
        const firestore = getFirebaseFirestore();
        await addDoc(collection(firestore, 'users'), { email, password });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

async function updateUser(id: string, email: string, password: string) {
     if (!id || !email || !password) {
        return { success: false, error: "ID, Email e senha são obrigatórios." };
    }
    try {
        const firestore = getFirebaseFirestore();
        await updateDoc(doc(firestore, 'users', id), { email, password });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

async function deleteUser(id: string) {
    if (!id) {
        return { success: false, error: "User ID is required." };
    }
    try {
        const firestore = getFirebaseFirestore();
        await deleteDoc(doc(firestore, 'users', id));
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

async function getGlobalEvolutionCredentials() {
    try {
        const firestore = getFirebaseFirestore();
        const docRef = doc(firestore, 'system_settings', 'evolutionApi');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data();
        }
        return null;
    } catch (error) {
        console.error("Error fetching global Evolution API credentials:", error);
        return null;
    }
}

async function saveGlobalEvolutionCredentials(credentials: { apiUrl: string; apiKey: string }) {
    try {
        const firestore = getFirebaseFirestore();
        const docRef = doc(firestore, 'system_settings', 'evolutionApi');
        await setDoc(docRef, credentials, { merge: true });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

const PasswordGate = ({ onCorrectPassword }: { onCorrectPassword: () => void }) => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState(false);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (password === ADMIN_PASSWORD) {
            onCorrectPassword();
        } else {
            setError(true);
        }
    };

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
            <Card className="w-full max-w-sm">
                <CardHeader className="items-center text-center">
                    <CardTitle className="text-2xl">Acesso Restrito</CardTitle>
                    <CardDescription>
                        Insira a senha de administrador para continuar.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="grid gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="admin-password">Senha</Label>
                            <Input
                                id="admin-password"
                                name="password"
                                type="password"
                                required
                                value={password}
                                onChange={(e) => { setPassword(e.target.value); setError(false); }}
                            />
                        </div>
                        {error && <p className="text-sm text-red-500 text-center">Senha incorreta.</p>}
                        <Button type="submit" className="w-full mt-4">
                            Entrar
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
};

const AdminPanel = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);

    // State for Evolution API credentials
    const [apiUrl, setApiUrl] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [loadingCreds, setLoadingCreds] = useState(true);
    const [savingCreds, setSavingCreds] = useState(false);
    const [credsError, setCredsError] = useState<string | null>(null);

    const fetchUsers = async () => {
        setLoadingUsers(true);
        const userList = await getUsers();
        setUsers(userList);
        setLoadingUsers(false);
    };
    
    const fetchCredentials = async () => {
        setLoadingCreds(true);
        const creds = await getGlobalEvolutionCredentials();
        if (creds) {
            setApiUrl(creds.apiUrl || '');
            setApiKey(creds.apiKey || '');
        }
        setLoadingCreds(false);
    };


    useEffect(() => {
        fetchUsers();
        fetchCredentials();
    }, []);
    
     const handleSaveCredentials = async (e: FormEvent) => {
        e.preventDefault();
        setSavingCreds(true);
        setCredsError(null);
        const result = await saveGlobalEvolutionCredentials({ apiUrl, apiKey });
        if (!result.success) {
            setCredsError(result.error || 'Ocorreu um erro ao salvar as credenciais.');
        }
        setSavingCreds(false);
    };

    const handleCreate = () => {
        setSelectedUser(null);
        setIsCreateDialogOpen(true);
    };

    const handleEdit = (user: User) => {
        setSelectedUser(user);
        setIsEditDialogOpen(true);
    };

    const handleDelete = (user: User) => {
        setSelectedUser(user);
        setIsDeleteDialogOpen(true);
    };

    return (
        <div className="container mx-auto p-4 md:p-8 space-y-12">
            <div>
                <header className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-3"><Users />Gerenciador de Usuários</h1>
                        <p className="text-muted-foreground mt-2">Crie, edite e remova usuários do sistema.</p>
                    </div>
                    <Button onClick={handleCreate}>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Novo Usuário
                    </Button>
                </header>
                <Card>
                    <CardContent className="p-0">
                        {loadingUsers ? (
                            <div className="p-16 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full">
                                    <thead className="bg-muted/50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">ID</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {users.map((user) => (
                                            <tr key={user.id}>
                                                <td className="px-6 py-4 whitespace-nowrap font-medium">{user.email}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-muted-foreground font-mono text-xs">{user.id}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                                                    <Button variant="ghost" size="icon" onClick={() => handleEdit(user)}><Edit className="h-4 w-4" /></Button>
                                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(user)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
            
             <div>
                <header className="mb-8">
                    <h1 className="text-3xl font-bold flex items-center gap-3"><KeyRound />Credenciais Globais</h1>
                    <p className="text-muted-foreground mt-2">Configure a conexão principal com a Evolution API para todo o sistema.</p>
                </header>
                <Card>
                    <CardContent className="p-6">
                        {loadingCreds ? (
                            <div className="p-16 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                        ) : (
                            <form onSubmit={handleSaveCredentials} className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="api-url" className="flex items-center gap-2"><LinkIcon className="h-4 w-4"/>URL da API</Label>
                                    <Input id="api-url" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="http://localhost:8080" required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="api-key" className="flex items-center gap-2"><KeyRound className="h-4 w-4"/>Chave da API</Label>
                                    <Input id="api-key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Sua chave de API global" required />
                                </div>
                                {credsError && <p className="text-sm text-red-500 text-center">{credsError}</p>}
                                <Button type="submit" disabled={savingCreds}>
                                    {savingCreds && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Salvar Credenciais
                                </Button>
                            </form>
                        )}
                    </CardContent>
                </Card>
            </div>

            <UserFormDialog
                isOpen={isCreateDialogOpen || isEditDialogOpen}
                onClose={() => { setIsCreateDialogOpen(false); setIsEditDialogOpen(false); }}
                user={selectedUser}
                onSuccess={fetchUsers}
            />

            {selectedUser && (
                <ConfirmDeleteDialog
                    isOpen={isDeleteDialogOpen}
                    onClose={() => setIsDeleteDialogOpen(false)}
                    onConfirm={async () => {
                        if (selectedUser) {
                            await deleteUser(selectedUser.id);
                            fetchUsers();
                            setIsDeleteDialogOpen(false);
                        }
                    }}
                    title="Confirmar Exclusão"
                    description={`Tem certeza de que deseja excluir o usuário ${selectedUser.email}? Esta ação não pode ser desfeita.`}
                />
            )}
        </div>
    );
};

const UserFormDialog = ({ isOpen, onClose, user, onSuccess }: { isOpen: boolean, onClose: () => void, user: User | null, onSuccess: () => void }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const isEditing = !!user;

    useEffect(() => {
        if (user) {
            setEmail(user.email);
            setPassword(user.password || '');
        } else {
            setEmail('');
            setPassword('');
        }
        setError(null);
    }, [user, isOpen]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setError(null);
        let result;
        if (isEditing && user) {
            result = await updateUser(user.id, email, password);
        } else {
            result = await createUser(email, password);
        }

        if (result.success) {
            onSuccess();
            onClose();
        } else {
            setError(result.error || 'Ocorreu um erro.');
        }
        setIsSaving(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{isEditing ? 'Editar Usuário' : 'Criar Novo Usuário'}</DialogTitle>
                    <DialogDescription>
                        {isEditing ? 'Altere o e-mail ou a senha do usuário.' : 'Preencha os dados para criar um novo acesso.'}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="password">Senha</Label>
                        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </div>
                     {error && <p className="text-sm text-red-500 text-center">{error}</p>}
                    <DialogFooter className="mt-4">
                        <DialogClose asChild>
                            <Button type="button" variant="ghost">Cancelar</Button>
                        </DialogClose>
                        <Button type="submit" disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isEditing ? 'Salvar Alterações' : 'Criar Usuário'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};


export default function AdminPage() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    if (!isAuthenticated) {
        return <PasswordGate onCorrectPassword={() => setIsAuthenticated(true)} />;
    }

    return <AdminPanel />;
}
