

'use client';

import React, { useState } from 'react';
import { useAiLogs } from '@/hooks/useAiLogs';
import { clearAiLogs } from '@/actions/logsActions';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertCircle, Trash2, Code, BrainCircuit, XCircle, Bot, Copy, Check, Wrench, MessageSquareWarning, MessageSquareText, ChevronDown } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '../ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { silentTools } from '@/lib/schemas';


const LogDetailsDialog = ({ log, isOpen, onClose }: { log: any, isOpen: boolean, onClose: () => void }) => {
    const [hasCopied, setHasCopied] = useState(false);

    const formatJson = (data: any) => {
        if (!data) return "N/A";
        if (typeof data === 'string') {
            try {
                const parsed = JSON.parse(data);
                return JSON.stringify(parsed, null, 2);
            } catch (e) {
                return data;
            }
        }
        return JSON.stringify(data, null, 2);
    }

    const handleCopy = () => {
        const logContent = `
--- LOG DE IA ---
Componente: ${log.flow}
Modelo: ${log.modelName || 'N/A'}
Timestamp: ${new Date(log.timestamp?.toDate()).toLocaleString('pt-BR')}

--- SYSTEM PROMPT ---
${log.systemPrompt || 'N/A'}

--- PROMPT (CONVERSA) ---
${formatJson(log.prompt)}

--- RACIOCÍNIO DA IA ---
${log.reasoning || 'N/A'}

--- RESPOSTA PARA O CLIENTE ---
${log.responseText || 'N/A'}

--- FERRAMENTAS SOLICITADAS ---
${formatJson(log.toolRequests)}

--- RESPOSTA (RAW) ---
${formatJson(log.response)}

--- ERRO ---
${formatJson(log.error)}

--- CONTEXTO ---
${formatJson(log.context)}
`;
        navigator.clipboard.writeText(logContent.trim());
        setHasCopied(true);
        setTimeout(() => setHasCopied(false), 2000);
    };
    
    return (
      <AlertDialog open={isOpen} onOpenChange={onClose}>
        <AlertDialogContent className="max-w-4xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Detalhes do Log da IA</AlertDialogTitle>
            <AlertDialogDescription>
              Informações completas sobre a execução do fluxo de IA, incluindo o prompt do sistema e da conversa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="mt-4 max-h-[70vh] overflow-y-auto bg-muted/50 rounded-md p-4 border space-y-4">
             {log.systemPrompt && (
                <div>
                    <h3 className="font-semibold mb-2">System Prompt (Regras da IA)</h3>
                    <pre className="text-xs text-foreground/90 bg-black/20 p-2 rounded-md whitespace-pre-wrap break-all">
                        <code>{log.systemPrompt}</code>
                    </pre>
                </div>
            )}
            <div>
                <h3 className="font-semibold mb-2">Prompt (Conversa)</h3>
                <pre className="text-xs text-foreground/90 bg-black/20 p-2 rounded-md whitespace-pre-wrap break-all">
                    <code>{formatJson(log.prompt)}</code>
                </pre>
            </div>
            {log.reasoning && (
                <div>
                    <h3 className="font-semibold mb-2">Raciocínio da IA</h3>
                    <pre className="text-xs text-amber-300 bg-black/20 p-2 rounded-md whitespace-pre-wrap break-all">
                        <code>{log.reasoning}</code>
                    </pre>
                </div>
            )}
             {log.responseText && (
                <div>
                    <h3 className="font-semibold mb-2">Resposta da IA para o Cliente</h3>
                    <pre className="text-xs text-foreground/90 bg-black/20 p-2 rounded-md whitespace-pre-wrap break-all">
                        <code>{log.responseText}</code>
                    </pre>
                </div>
            )}
             {log.toolRequests && log.toolRequests.length > 0 && (
                <div>
                    <h3 className="font-semibold mb-2">Ferramentas Solicitadas pela IA</h3>
                    <pre className="text-xs text-cyan-400 bg-black/20 p-2 rounded-md whitespace-pre-wrap break-all">
                        <code>{formatJson(log.toolRequests)}</code>
                    </pre>
                </div>
            )}
            {log.response && (
                <div>
                    <h3 className="font-semibold mb-2">Resposta da IA (Output Bruto)</h3>
                    <pre className="text-xs text-foreground/90 bg-black/20 p-2 rounded-md whitespace-pre-wrap break-all">
                        <code>{formatJson(log.response)}</code>
                    </pre>
                </div>
            )}
            {log.error && (
                <div>
                    <h3 className="font-semibold mb-2">Detalhes Técnicos do Erro</h3>
                    <pre className="text-xs text-red-400 bg-black/20 p-2 rounded-md whitespace-pre-wrap break-all">
                        <code>{formatJson(log.error)}</code>
                    </pre>
                </div>
            )}
             <div>
                <h3 className="font-semibold mb-2">Contexto Adicional</h3>
                <pre className="text-xs text-foreground/90 bg-black/20 p-2 rounded-md whitespace-pre-wrap break-all">
                    <code>{formatJson(log.context)}</code>
                </pre>
            </div>
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

const getResponsePreview = (log: any) => {
    const textResponse = log.responseText;
    const toolRequests = log.toolRequests;

    const usedSilentTool = toolRequests?.some((req: any) => silentTools.includes(req.name));
    
    const parts = [];

    if (log.error) {
        const errorMessage = log.error.message || (typeof log.error === 'string' ? log.error : 'Erro desconhecido');
        parts.push(
             <div key="error" className="flex items-start gap-2 text-red-400">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <p className="line-clamp-4">{errorMessage}</p>
            </div>
        );
    } else {
        if (textResponse && usedSilentTool) {
            parts.push(
                <div key="omitted" className="flex items-start gap-2 text-amber-400">
                    <MessageSquareWarning className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="font-semibold">[Resposta de texto omitida]</p>
                        <p className="text-amber-500/80 text-xs italic line-clamp-2">"{textResponse}"</p>
                    </div>
                </div>
            );
        } else if (textResponse) {
             parts.push(
                <div key="text" className="flex items-start gap-2 text-muted-foreground">
                    <MessageSquareText className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <p className="line-clamp-4">{textResponse}</p>
                </div>
            );
        }
        
        if (toolRequests && toolRequests.length > 0) {
            parts.push(
                <div key="tools" className="space-y-1 pt-2">
                    {toolRequests.map((req: any, index: number) => {
                        if (!req) return null;
                        const toolName = req?.name || 'ferramenta';
                        const toolInput = req?.args || {};
                        return (
                            <div key={index} className="flex items-start gap-2 text-cyan-400">
                                <Wrench className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <div className="flex flex-col">
                                    <span className="font-semibold">{toolName}</span>
                                    <span className="text-cyan-500/80 text-xs break-all line-clamp-2">
                                        {JSON.stringify(toolInput)}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            );
        }
    }
    
    if (parts.length === 0) {
         return <span className="text-muted-foreground/50">Nenhuma resposta ou ferramenta registrada.</span>;
    }

    return <div className="space-y-2">{parts}</div>;
};


export const AiLogsPage = ({ userId }: { userId: string }) => {
    const { logs, loading, error } = useAiLogs(userId);
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
        await clearAiLogs(userId);
        setIsDeleting(false);
    }


    return (
      <div className="flex-1 flex flex-col pt-8">
            <header className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold">Logs da IA</h1>
                    <p className="text-muted-foreground">Monitore as decisões e falhas que ocorreram durante os fluxos de IA.</p>
                </div>
                <Button variant="outline" onClick={() => setIsConfirmOpen(true)} disabled={loading || logs.length === 0 || isDeleting}>
                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    Limpar Logs
                </Button>
            </header>
             <main className="flex-1 flex flex-col">
                 {loading ? (
                    <div className="flex-1 flex items-center justify-center p-8">
                        <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
                    </div>
                ) : error ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-red-500 gap-2">
                        <XCircle className="h-12 w-12"/>
                        <p className="font-semibold">Erro ao carregar os logs.</p>
                        <p className="text-sm">Verifique o console para mais detalhes.</p>
                    </div>
                ) : logs.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground">
                        <BrainCircuit className="h-16 w-16 text-muted-foreground/30" />
                        <p className="font-semibold mt-4 text-lg">Nenhum log da IA registrado.</p>
                        <p className="text-sm mt-1">As interações da IA aparecerão aqui.</p>
                    </div>
                ) : (
                    <>
                        {/* --- Mobile View: Cards --- */}
                        <div className="md:hidden space-y-4">
                            {logs.map(log => {
                                const isHeuristic = log.flow.startsWith('heuristic_');
                                const Icon = isHeuristic ? Bot : BrainCircuit;
                                return (
                                    <Card key={log.id} className="bg-card">
                                        <CardContent className="p-4 space-y-3">
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="flex flex-col">
                                                     <span className="font-mono text-xs text-muted-foreground">{formatTimestamp(log.timestamp)}</span>
                                                     <Badge variant={log.error ? "destructive" : "secondary"} className={cn("font-mono w-fit mt-1", isHeuristic && !log.error && "bg-green-500/20 text-green-300 border-green-500/30")}>
                                                        {log.error ? <AlertCircle className="mr-1.5 h-3.5 w-3.5" /> : <Icon className="mr-1.5 h-3.5 w-3.5" />}
                                                        {log.flow}
                                                    </Badge>
                                                </div>
                                                <Button variant="ghost" size="icon" onClick={() => setSelectedLog(log)} title="Ver Detalhes do Log">
                                                    <Code className="h-4 w-4" />
                                                </Button>
                                            </div>
                                            <div className="font-mono text-xs max-w-full">
                                                {getResponsePreview(log)}
                                            </div>
                                             <Accordion type="single" collapsible className="w-full">
                                                <AccordionItem value="details" className="border-b-0">
                                                    <AccordionTrigger className="text-xs pt-2">
                                                        Mais Detalhes
                                                    </AccordionTrigger>
                                                    <AccordionContent className="space-y-2 text-xs">
                                                         <p><strong className="text-muted-foreground">Conversa:</strong> {log.context?.conversationId || 'N/A'}</p>
                                                        {log.modelName && <p><strong className="text-muted-foreground">Modelo:</strong> {log.modelName}</p>}
                                                    </AccordionContent>
                                                </AccordionItem>
                                            </Accordion>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                        {/* --- Desktop View: Table --- */}
                        <div className="hidden md:block bg-card rounded-xl border border-border">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-b-white/10 hover:bg-transparent">
                                        <TableHead className="w-[180px]">Data</TableHead>
                                        <TableHead className="w-[220px]">Fluxo / Modelo</TableHead>
                                        <TableHead>Resposta / Erro</TableHead>
                                        <TableHead>Conversa ID</TableHead>
                                        <TableHead className="w-[80px] text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {logs.map(log => {
                                        const isHeuristic = log.flow.startsWith('heuristic_');
                                        const Icon = isHeuristic ? Bot : BrainCircuit;

                                        return (
                                            <TableRow key={log.id} className="border-b-white/5">
                                                <TableCell className="text-muted-foreground font-mono text-xs">{formatTimestamp(log.timestamp)}</TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col gap-1.5">
                                                        <Badge variant={log.error ? "destructive" : "secondary"} className={cn("font-mono w-fit", isHeuristic && !log.error && "bg-green-500/20 text-green-300 border-green-500/30")}>
                                                            {log.error ? <AlertCircle className="mr-1.5 h-3.5 w-3.5" /> : <Icon className="mr-1.5 h-3.5 w-3.5" />}
                                                            {log.flow}
                                                        </Badge>
                                                        {log.modelName && (
                                                            <Badge variant="outline" className="font-mono w-fit text-xs border-sky-500/30 text-sky-400">{log.modelName}</Badge>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-mono text-xs max-w-sm">
                                                    {getResponsePreview(log)}
                                                </TableCell>
                                                <TableCell className="font-mono text-sm">
                                                    {log.context?.conversationId || 'N/A'}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="ghost" size="icon" onClick={() => setSelectedLog(log)} title="Ver Detalhes do Log">
                                                        <Code className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </>
                )}
            </main>
            {selectedLog && (
                <LogDetailsDialog
                    log={selectedLog}
                    isOpen={!!selectedLog}
                    onClose={() => setSelectedLog(null)}
                />
            )}
            <ConfirmDeleteDialog 
                isOpen={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                onConfirm={handleClearLogs}
                title="Limpar todos os Logs da IA?"
                description="Esta ação é irreversível e apagará permanentemente todos os registros de log da IA. Deseja continuar?"
            />
       </div>
    );
};
