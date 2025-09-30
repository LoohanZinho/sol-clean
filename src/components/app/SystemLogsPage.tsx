

// src/components/app/SystemLogsPage.tsx
'use client';

import React, { useState } from 'react';
import { useSystemLogs } from '@/hooks/useSystemLogs';
import { clearSystemLogs } from '@/actions/logsActions';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertCircle, Trash2, Code, Server, XCircle, Info, Copy, Check } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';


const logDescriptions: Record<string, { title: string; description: string }> = {
    // Webhook e Enfileiramento
    'triggerAiFlow_enfileirada': {
        title: "Mensagem Enfileirada para Processamento",
        description: "Uma nova mensagem do cliente foi recebida pelo webhook e adicionada à fila de processamento da IA. Se o agrupamento de mensagens estiver ativo, o sistema aguardará um breve momento antes de acionar a IA."
    },
    'triggerAiFlow_timer_iniciado': {
        title: "Timer de Agrupamento Iniciado",
        description: "O sistema iniciou a contagem regressiva para agrupar mensagens. Isso evita que a IA responda a cada mensagem individualmente se o cliente enviar várias em sequência."
    },
    'triggerAiFlow_timer_finalizado': {
        title: "Timer Finalizado, Disparando IA",
        description: "O tempo de espera para agrupar mensagens terminou. O sistema agora está iniciando o fluxo principal de processamento da IA com todas as mensagens coletadas."
    },
    'webhook_business_hours_closed': {
        title: "Fora do Horário de Atendimento",
        description: "Uma mensagem foi recebida, mas o sistema está configurado para não acionar a IA fora do horário de funcionamento. Se houver uma mensagem automática para este cenário, ela será enviada."
    },
     'webhook_ignorar_resposta_ia': {
        title: "IA Desativada para a Conversa",
        description: "Uma mensagem foi recebida, mas a IA está manualmente desativada para esta conversa específica. Nenhuma resposta automática será gerada."
    },
    // Fluxo de Conversa Principal
    'processConversationFlowV2_start': {
        title: "Início do Fluxo da IA",
        description: "O fluxo principal que orquestra a resposta da IA foi iniciado. O sistema começará a buscar o contexto necessário (histórico, FAQ, etc.)."
    },
    'processConversationFlowV2_context_fetch_start': {
        title: "Início da Coleta de Contexto",
        description: "A IA está agora buscando todas as informações necessárias para tomar uma decisão, como o histórico recente da conversa, a base de conhecimento (FAQ) e as configurações do agente."
    },
    'processConversationFlowV2_context_fetch_end': {
        title: "Contexto Coletado com Sucesso",
        description: "Todas as informações de contexto foram carregadas. O sistema está pronto para montar o prompt e chamar o modelo de linguagem (Gemini)."
    },
    'processConversationFlowV2_no_pending_messages': {
        title: "Fila de Mensagens Vazia",
        description: "O fluxo da IA foi acionado, mas não encontrou nenhuma mensagem nova na fila para processar. Isso pode acontecer em cenários de condição de corrida se outro processo já limpou a fila. O fluxo será encerrado."
    },
    'processConversationFlowV2_end': {
        title: "Fim do Fluxo da IA",
        description: "O fluxo de processamento da IA foi concluído com sucesso para esta interação. O sistema agora aguarda a próxima mensagem do cliente."
    },
    // Chamada à IA e Ferramentas
    'callConversationAI_attempt': {
        title: "Tentativa de Chamada à IA",
        description: "O sistema está enviando o prompt (com todo o contexto e a pergunta do cliente) para o modelo de linguagem do Google (Gemini) para obter uma resposta."
    },
     'callConversationAI_model_strategy': {
        title: "Estratégia de Modelos Definida",
        description: "O sistema definiu a ordem de modelos de IA a serem tentados. Se o modelo primário falhar, ele tentará os modelos de fallback (se ativados)."
    },
    'callConversationAI_turn_start': {
        title: "Início do Turno de Pensamento",
        description: "A IA iniciou um ciclo de raciocínio. Em conversas complexas, ela pode precisar de vários 'turnos' para usar ferramentas e formular a resposta final."
    },
     'callConversationAI_tool_requests': {
        title: "IA Solicitou uma Ferramenta",
        description: "A IA decidiu que precisa de informações externas ou precisa realizar uma ação. Ela solicitou o uso de uma ferramenta (ex: consultar a agenda, salvar dados do cliente)."
    },
     'callConversationAI_no_tool_request': {
        title: "IA Não Solicitou Ferramentas",
        description: "A IA concluiu seu ciclo de pensamento sem a necessidade de usar ferramentas adicionais. A resposta de texto gerada (se houver) será enviada ao cliente."
    },
    // Envio de Mensagem
    'evolution-send-text-success': {
        title: "Mensagem Enviada com Sucesso",
        description: "A mensagem gerada (pela IA ou operador) foi enviada com sucesso para a API do WhatsApp e está a caminho do cliente."
    },
    'handleAiMessageSend_followup_scheduled': {
        title: "Follow-up Agendado",
        description: "A IA respondeu ao cliente e, como a conversa não parece ter sido finalizada, um acompanhamento automático (follow-up) foi agendado para o futuro."
    },
    // Erros e Falhas (Exemplos)
    'evolution-send-text-failure': {
        title: "Falha no Envio da Mensagem",
        description: "Houve um erro ao tentar enviar a mensagem pela API do WhatsApp. O erro pode ser da API ou de conexão. O log de erro técnico fornecerá mais detalhes."
    },
    'processConversationV2_critical': {
        title: "Erro Crítico no Fluxo da IA",
        description: "Ocorreu um erro inesperado e grave durante o processamento da conversa. A conversa foi movida para a pasta 'Suporte' para intervenção humana."
    },
    'default': {
        title: 'Log do Sistema',
        description: 'Este é um evento geral do sistema. Analise o contexto e a mensagem para entender a ocorrência.'
    }
};


const LogDialog = ({ log, isOpen, onClose }: { log: any, isOpen: boolean, onClose: () => void }) => {
    const [hasCopied, setHasCopied] = useState(false);
    const logInfo = logDescriptions[log.component] || logDescriptions['default'];

    const handleCopy = () => {
        const logContent = `
--- LOG DE SISTEMA ---
Componente: ${log.component}
Nível: ${log.level}
Timestamp: ${new Date(log.timestamp?.toDate()).toLocaleString('pt-BR')}

--- MENSAGEM ---
${log.message || 'N/A'}

--- ERRO ---
${JSON.stringify(log.error, null, 2)}

--- CONTEXTO ---
${JSON.stringify(log.context, null, 2)}
`;
        navigator.clipboard.writeText(logContent.trim());
        setHasCopied(true);
        setTimeout(() => setHasCopied(false), 2000);
    };

    return (
      <AlertDialog open={isOpen} onOpenChange={onClose}>
        <AlertDialogContent className="max-w-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{logInfo.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {logInfo.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="mt-4 max-h-[60vh] overflow-y-auto bg-muted/50 rounded-md p-4 border space-y-4">
            <div>
                <h3 className="font-semibold mb-2">Contexto</h3>
                <pre className="text-xs text-foreground/90 bg-black/20 p-2 rounded-md whitespace-pre-wrap break-all">
                    <code>{JSON.stringify(log.context, null, 2)}</code>
                </pre>
            </div>
            {log.level === 'error' && log.error && (
                <div>
                    <h3 className="font-semibold mb-2">Detalhes Técnicos do Erro</h3>
                    <pre className="text-xs text-red-400 bg-black/20 p-2 rounded-md whitespace-pre-wrap break-all">
                        <code>{JSON.stringify(log.error, null, 2)}</code>
                    </pre>
                </div>
            )}
            {log.level === 'info' && log.message && (
                 <div>
                    <h3 className="font-semibold mb-2">Mensagem</h3>
                    <pre className="text-xs text-foreground/90 bg-black/20 p-2 rounded-md whitespace-pre-wrap break-all">
                        <code>{log.message}</code>
                    </pre>
                </div>
            )}
          </div>
          <AlertDialogFooter>
            <Button variant="outline" onClick={handleCopy}>
                {hasCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {hasCopied ? 'Copiado!' : 'Copiar'}
            </Button>
            <AlertDialogAction onClick={onClose}>Fechar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
};

export const SystemLogsPage = ({ userId }: { userId: string }) => {
    const { logs, loading, error } = useSystemLogs(userId);
    const [selectedLog, setSelectedLog] = useState<any | null>(null);
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
        await clearSystemLogs(userId);
        // The hook will auto-update the list
        setIsDeleting(false);
    }

    return (
      <div className="flex-1 flex flex-col pt-8">
            <header className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold">Logs do Sistema</h1>
                    <p className="text-muted-foreground">Monitore erros e informações operacionais do sistema.</p>
                </div>
                 <Button variant="outline" onClick={() => setIsConfirmOpen(true)} disabled={loading || logs.length === 0 || isDeleting}>
                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    Limpar Logs do Sistema
                </Button>
            </header>
             <main className="flex-1 flex flex-col bg-card rounded-xl border border-border">
                 <div className="flex-grow overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-b-white/10 hover:bg-transparent">
                                <TableHead className="w-[180px]">Data</TableHead>
                                <TableHead className="w-[220px]">Componente</TableHead>
                                <TableHead>Mensagem</TableHead>
                                <TableHead className="w-[80px] text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                             {loading && (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-48 text-center">
                                        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                                    </TableCell>
                                </TableRow>
                            )}
                            {error && (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-48 text-center text-red-500 flex flex-col items-center justify-center gap-2">
                                        <XCircle className="h-10 w-10"/>
                                        <p className="font-semibold">Erro ao carregar os logs.</p>
                                        <p className="text-sm">Verifique o console para mais detalhes.</p>
                                    </TableCell>
                                </TableRow>
                            )}
                            {!loading && logs.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-48 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-4">
                                           <Server className="h-12 w-12 text-muted-foreground/30" />
                                            <p className="font-medium">Nenhum evento do sistema registrado.</p>
                                            <p className="text-sm">Tudo parece estar funcionando bem!</p>
                                       </div>
                                    </TableCell>
                                </TableRow>
                            )}
                            {!loading && logs.map(log => (
                                <TableRow key={log.id} className="border-b-white/5">
                                    <TableCell className="text-muted-foreground font-mono text-xs">{formatTimestamp(log.timestamp)}</TableCell>
                                    <TableCell>
                                        <Badge variant={log.level === 'error' ? 'destructive' : 'secondary'} className="font-mono">
                                             {log.level === 'error' ? <AlertCircle className="mr-1.5 h-3.5 w-3.5" /> : <Info className="mr-1.5 h-3.5 w-3.5" />}
                                            {log.component}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className={`font-mono text-xs truncate max-w-sm ${log.level === 'error' ? 'text-red-400' : 'text-muted-foreground'}`}>
                                        {log.message || log.error?.message || 'N/A'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" onClick={() => setSelectedLog(log)} title="Ver Detalhes do Log">
                                            <Code className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </main>
            {selectedLog && (
                <LogDialog
                    log={selectedLog}
                    isOpen={!!selectedLog}
                    onClose={() => setSelectedLog(null)}
                />
            )}
             <ConfirmDeleteDialog 
                isOpen={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                onConfirm={handleClearLogs}
                title="Limpar todos os Logs do Sistema?"
                description="Esta ação é irreversível e apagará permanentemente todos os registros de log do sistema. Deseja continuar?"
            />
       </div>
    );
};
