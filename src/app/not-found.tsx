
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Componente para a página 404 (Não Encontrado).
 * Esta página é exibida automaticamente pelo Next.js quando uma rota não é encontrada.
 * @returns {React.ReactElement} O componente da página 404.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
      <AlertTriangle className="mb-4 h-16 w-16 text-primary" />
      <h1 className="text-4xl font-bold">404 - Página Não Encontrada</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        A página que você está tentando acessar não existe ou foi movida.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">Voltar para o Início</Link>
      </Button>
    </div>
  );
}
