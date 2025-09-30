

'use client';

import React, { useState } from 'react';
import { useWebhookLogs } from '@/hooks/useWebhookLogs';
import { clearWebhookLogs } from '@/actions/logsActions';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertCircle, ShieldOff, FileWarning, Code, XCircle, Info, MessagesSquare, ArrowRightCircle, Trash2, CheckCircle, Database, MessageSquare, Image, Mic, Video, FileText, Wallet, MousePointerClick, Power, Copy, Check, Send, Repeat } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from '@/lib/utils';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { FaGoogle, FaWhatsapp } from 'react-icons/fa';


const StatusInfo: React.FC<{ status: string, source: string }> = ({ status, source }) => {
    // Mapeamento de status para componentes de Badge
    const statusMap: Record<string, React.ReactElement> = {
        'recebida_nova_mensagem': <Badge className="bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30"><CheckCircle className="mr-1.5 h-3.5 w-3.5"/>Nova Mensagem</Badge>,
        'recebida_mensagem_enviada': <Badge className="bg-sky-500/20 text-sky-400 border-sky-500/30 hover:bg-sky-500/30"><Send className="mr-1.5 h-3.5 w-3.5"/>Mensagem Enviada (Eco)</Badge>,
        'recebida_atualizacao_status': <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30"><Repeat className="mr-1.5 h-3.5 w-3.5"/>Status Atualizado</Badge>,
        'erro_payload_invalido': <Badge variant="destructive" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30"><FileWarning className="mr-1.5 h-3.5 w-3.5"/>Payload Inválido</Badge>,
        'erro_parse_body': <Badge variant="destructive" className="bg-orange-500/20 text-orange-400 border-orange-500/30 hover:bg-orange-500/30"><AlertCircle className="mr-1.5 h-3.5 w-3.5"/>Erro de Parse</Badge>,
        'ignorado_mensagem_de_grupo': <Badge variant="outline"><MessagesSquare className="mr-1.5 h-3.5 w-3.5"/>Grupo Ignorado</Badge>,
        'ignorado_evento_nao_tratado': <Badge variant="outline" title={status}><Info className="mr-1.5 h-3.5 w-3.5"/>Evento Ignorado</Badge>,
        'payment.created': <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30"><Wallet className="mr-1.5 h-3.5 w-3.5"/>Pagamento Criado</Badge>,
        'payment.updated': <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 hover:bg-purple-500/30"><Wallet className="mr-1.5 h-3.5 w-3.5"/>Pagamento Atualizado</Badge>,
    };

    if (statusMap[status]) {
        return statusMap[status];
    }
  
    // Fallback para status genéricos ou desconhecidos
    return <Badge variant="secondary" className="capitalize">{status.replace(/_/g, ' ')}</Badge>;
};


const PayloadDialog = ({ payload, isOpen, onClose }: { payload: any, isOpen: boolean, onClose: () => void }) => {
    const [hasCopied, setHasCopied] = useState(false);

    const handleCopy = () => {
        const logContent = JSON.stringify(payload, null, 2);
        navigator.clipboard.writeText(logContent);
        setHasCopied(true);
        setTimeout(() => setHasCopied(false), 2000);
    };
    
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Payload</DialogTitle>
            <DialogDescription>
              Corpo da requisição recebida pelo webhook.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 max-h-[60vh] overflow-y-auto bg-muted/50 rounded-md p-4 border">
            <pre className="text-sm text-foreground/90 whitespace-pre-wrap break-all">
              <code className="language-json">{JSON.stringify(payload, null, 2)}</code>
            </pre>
          </div>
          <DialogFooter>
              <Button variant="outline" onClick={handleCopy}>
                  {hasCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  {hasCopied ? 'Copiado!' : 'Copiar'}
              </Button>
              <Button onClick={onClose}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
};

export const WebhookLogsPage = ({ userId }: { userId: string }) => {
    const { logs, loading, error } = useWebhookLogs(userId);
    const [selectedPayload, setSelectedPayload] = useState<any | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    const formatTimestamp = (timestamp: any) => {
        if (!timestamp) return 'N/A';
        return timestamp.toDate().toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    }

    const handleClearLogs = async () => {
        setIsDeleting(true);
        setIsConfirmOpen(false);
        await clearWebhookLogs(userId);
        // The hook will auto-update the list
        setIsDeleting(false);
    }
    
    const getOrigin = (log: any) => {
        if (log.source === 'mercadopago') return 'Mercado Pago';
        if (log.source === 'google') return log.payload?.headers?.['x-goog-resource-id'] || 'Google Drive';
        return log.payload?.data?.key?.remoteJid?.split('@')[0] || log.payload?.instance || 'N/A';
    }
    
    const OriginIcon = ({ source }: { source: string }) => {
        if (source === 'mercadopago') return <span title="Mercado Pago"><Wallet className="h-5 w-5 text-blue-400" /></span>;
        if (source === 'google') return <span title="Google Drive"><FaGoogle className="h-5 w-5 text-blue-400" /></span>;
        return <span title="Evolution API"><FaWhatsapp className="h-5 w-5 text-green-500" /></span>;
    }

    const getMessageContentType = (log: any): { icon: React.ElementType, label: string } => {
        const { source, payload } = log;

        if (source === 'google') {
            return { icon: Repeat, label: 'Documento' };
        }

        if (!payload) {
            return { icon: FileWarning, label: 'Payload Ausente' };
        }
        
        if (source === 'mercadopago') {
             if (payload.topic === 'payment') return { icon: Wallet, label: 'Notificação de Pagamento' };
             if (payload.type === 'payment') return { icon: Wallet, label: 'Evento de Pagamento' };
        }

        if (!payload.data) {
             return { icon: FileWarning, label: 'Dados Ausentes' };
        }
        

        const message = payload.data.message;
        if (!message) {
            const eventType = payload.event || 'Evento desconhecido';
            if (eventType.includes('connection.update')) return { icon: Power, label: 'Conexão' };
            return { icon: Info, label: eventType };
        }
    
        if (message.conversation || message.extendedTextMessage?.text) return { icon: MessageSquare, label: 'Texto' };
        if (message.imageMessage) return { icon: Image, label: 'Imagem' };
        if (message.videoMessage) return { icon: Video, label: 'Vídeo' };
        if (message.audioMessage) return { icon: Mic, label: 'Áudio' };
        if (message.documentMessage) return { icon: FileText, label: 'Documento' };
        
        return { icon: Info, label: 'Mídia Desconhecida' };
    };


    return (
      <div className="flex-1 flex flex-col pt-8">
            <header className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold">Logs do Webhook</h1>
                    <p className="text-muted-foreground">Monitore as chamadas brutas recebidas de serviços externos.</p>
                </div>
                 <Button variant="outline" onClick={() => setIsConfirmOpen(true)} disabled={loading || logs.length === 0 || isDeleting}>
                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    Limpar Logs do Webhook
                </Button>
            </header>
             <main className="flex-1 flex flex-col bg-card rounded-xl border border-border">
                 <div className="flex-grow overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-b-white/10 hover:bg-transparent">
                                <TableHead className="w-[180px]">Data</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                                <TableHead>Origem</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead className="w-[220px]">Status</TableHead>
                                <TableHead>Erro</TableHead>
                                <TableHead className="w-[80px] text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                             {loading && (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-48 text-center">
                                        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                                    </TableCell>
                                </TableRow>
                            )}
                            {error && (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-48 text-center text-red-500 flex flex-col items-center justify-center gap-2">
                                        <XCircle className="h-10 w-10"/>
                                        <p className="font-semibold">Erro ao carregar os logs.</p>
                                        <p className="text-sm">Verifique o console para mais detalhes.</p>
                                    </TableCell>
                                </TableRow>
                            )}
                            {!loading && logs.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-48 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-4">
                                           <Info className="h-12 w-12 text-muted-foreground/30" />
                                            <p className="font-medium">Nenhuma chamada de webhook registrada.</p>
                                            <p className="text-sm">As chamadas de serviços externos aparecerão aqui.</p>
                                       </div>
                                    </TableCell>
                                </TableRow>
                            )}
                            {!loading && logs.map(log => {
                                const contentType = getMessageContentType(log);
                                return (
                                    <TableRow key={log.id} className="border-b-white/5">
                                        <TableCell className="text-muted-foreground font-mono text-xs">{formatTimestamp(log.receivedAt)}</TableCell>
                                        <TableCell><OriginIcon source={log.source} /></TableCell>
                                        <TableCell className="font-mono text-sm">{getOrigin(log)}</TableCell>
                                        <TableCell className="text-sm">
                                            <div className="flex items-center gap-2">
                                                <contentType.icon className="h-4 w-4 text-muted-foreground" />
                                                <span>{contentType.label}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell><StatusInfo status={log.status} source={log.source} /></TableCell>
                                        <TableCell className={cn(
                                            "text-sm truncate max-w-xs font-mono text-xs",
                                             log.error ? 'text-red-400' : 'text-muted-foreground'
                                        )}>
                                            {log.error || '-'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => setSelectedPayload(log.payload)} title="Ver Payload">
                                                <Code className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                )}
                            )}
                        </TableBody>
                    </Table>
                </div>
            </main>
            {selectedPayload && (
                <PayloadDialog
                    payload={selectedPayload}
                    isOpen={!!selectedPayload}
                    onClose={() => setSelectedPayload(null)}
                />
            )}
             <ConfirmDeleteDialog 
                isOpen={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                onConfirm={handleClearLogs}
                title="Limpar todos os Logs de Webhook?"
                description="Esta ação é irreversível e apagará permanentemente todos os registros de chamadas de webhook recebidas. Deseja continuar?"
            />
       </div>
    );
};
