

'use client';

import { FormEvent } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';

interface LoginScreenProps {
    onLogin: (e: FormEvent<HTMLFormElement>) => void;
    error: string | null;
    loading: boolean;
}

export const LoginScreen = ({ onLogin, error, loading }: LoginScreenProps) => (
  <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
    <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
        <div className="p-3 bg-primary/10 rounded-full mb-2">
            <FaWhatsapp className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-2xl">Acessar Painel</CardTitle>
        <CardDescription>
            Insira suas credenciais para gerenciar suas conversas.
        </CardDescription>
        </CardHeader>
        <CardContent>
        <form onSubmit={onLogin} className="grid gap-4">
            <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="seu@email.com" required disabled={loading} />
            </div>
            <div className="grid gap-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" name="password" type="password" required placeholder="Sua senha" disabled={loading} />
            </div>
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
            <Button type="submit" className="w-full mt-4" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-pulse-subtle" />}
            {loading ? 'Entrando...' : 'Entrar'}
            </Button>
        </form>
        </CardContent>
    </Card>
  </main>
);
