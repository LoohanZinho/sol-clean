
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase';
import type { ActionConfig, WebhookEvent } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Loader2, PlusCircle, Edit, Trash2, Webhook, Send, Activity, MessageSquarePlus, MessageSquare, AlertCircle, CalendarCheck, User, Archive, Star, Lightbulb, CalendarX, Tag } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { ConfirmDeleteDialog } from '../ConfirmDeleteDialog';
import { saveActionConfig } from '@/actions/webhookSender';
import { ActionForm } from './ActionForm';
import { AnimatePresence, motion } from 'framer-motion';

export const SendWebhookPage = ({ userId }: { userId: string }) => {
    const [actions, setActions] = useState<ActionConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [actionToDelete, setActionToDelete] = useState<ActionConfig | null>(null);
    
    // 'new' for the new action form, action.id to edit, null to hide
    const [editingActionId, setEditingActionId] = useState<string | null>(null);

    const eventDetails: Record<WebhookEvent, { label: string; icon: React.ElementType, description: string, useCase: string, variables: string[] }> = {
        conversation_created: { 
            label: "Nova Conversa Criada", 
            icon: MessageSquarePlus,
            description: "Dispara quando um novo cliente, que não está na sua base, envia a primeira mensagem.",
            useCase: "Criar um novo 'Lead' ou 'Contato' automaticamente no seu CRM (ex: Hubspot, Pipedrive).",
            variables: ['clientData.name', 'clientData.id', 'triggeringMessage.text']
        },
        conversation_updated: { 
            label: "Conversa Atualizada", 
            icon: Edit,
            description: "Dispara quando uma propriedade importante da conversa é alterada (ex: movida de pasta, anotação adicionada).",
            useCase: "Manter um sistema externo (BI, Trello) sincronizado com o status atual de cada atendimento.",
            variables: ['clientData.name', 'clientData.id', 'clientData.folder', 'clientData.notes', 'clientData.aiSummary']
        },
        message_received: { 
            label: "Mensagem Recebida", 
            icon: MessageSquare,
            description: "Dispara a cada nova mensagem enviada pelo cliente.",
            useCase: "Criar um log completo de auditoria de toda a comunicação em um sistema externo.",
            variables: ['message.text', 'message.from', 'message.mediaType']
        },
        message_sent: { 
            label: "Mensagem Enviada", 
            icon: Send,
            description: "Dispara a cada nova mensagem enviada pelo sistema (IA ou operador).",
            useCase: "Complementar o log de 'Mensagem Recebida' para ter um histórico completo da conversa.",
            variables: ['message.text', 'message.source']
        },
        human_support_requested: { 
            label: "Suporte Humano Solicitado", 
            icon: AlertCircle,
            description: "Dispara quando a IA transfere o atendimento para um humano por qualquer motivo (cliente pediu, IA não sabe a resposta, etc.).",
            useCase: "Notificar a equipe de suporte em um canal do Slack ou abrir um ticket em um sistema como o Zendesk.",
            variables: ['reason', 'clientData.name', 'clientData.id']
        },
        appointment_scheduled: { 
            label: "Agendamento Marcado", 
            icon: CalendarCheck,
            description: "Dispara no momento em que a IA cria com sucesso um evento no Google Calendar.",
            useCase: "Sincronizar a agenda com outros sistemas, como criar uma ordem de serviço ou enviar um email de confirmação detalhado.",
            variables: ['clientData.name', 'appointment.serviceName', 'appointment.date', 'appointment.time']
        },
        client_info_updated: { 
            label: "Dados do Cliente Atualizados", 
            icon: User,
            description: "Dispara sempre que a IA salva ou atualiza dados do cliente (nome, endereço, notas).",
            useCase: "Manter seu CRM ou planilha de contatos sempre sincronizado em tempo real com os dados coletados pela IA.",
            variables: ['clientData.name', 'clientData.preferredName', 'clientData.address.street', 'clientData.notes']
        },
        lead_qualified: { 
            label: "Lead Qualificado", 
            icon: Star,
            description: "Dispara quando a IA está no papel de 'Qualificar Leads' e conclui com sucesso a coleta de informações.",
            useCase: "Alertar o time de vendas sobre um lead quente, enviando uma notificação para um canal do Slack ou marcando o lead como 'Qualificado' no CRM.",
            variables: ['clientData.name', 'clientData.notes']
        },
        ai_knowledge_miss: { 
            label: "Falha de Conhecimento da IA", 
            icon: Lightbulb,
            description: "Dispara quando a IA não encontra uma resposta no FAQ e precisa transferir para um humano.",
            useCase: "Criar um relatório de 'Perguntas que a IA não soube responder' para alimentar e melhorar continuamente sua base de conhecimento.",
            variables: ['clientQuestion', 'clientData.name']
        },
        appointment_rescheduled_or_canceled: { 
            label: "Agendamento Alterado", 
            icon: CalendarX,
            description: "Dispara quando a IA cancela ou reagenda um compromisso existente no Google Calendar.",
            useCase: "Informar outros sistemas sobre vagas liberadas na agenda ou notificar clientes em lista de espera.",
            variables: ['action', 'eventId', 'clientData.name']
        },
        conversation_ended_by_ai: { 
            label: "Conversa Finalizada pela IA", 
            icon: Archive,
            description: "Dispara quando a IA decide que o objetivo da conversa foi alcançado e a arquiva.",
            useCase: "Enviar uma pesquisa de satisfação (NPS) de forma precisa, medindo a performance do bot no momento exato em que ele considera o problema resolvido.",
            variables: ['summary', 'clientData.name']
        },
        tag_added: {
            label: "Tag Adicionada à Conversa",
            icon: Tag,
            description: "Dispara quando uma nova tag (etiqueta) é adicionada a uma conversa, seja pela IA ou por um operador.",
            useCase: "Notificar sistemas departamentais. Ex: Se a tag 'Financeiro' é adicionada, enviar um alerta para o sistema de cobrança.",
            variables: ['tag', 'clientData.name', 'clientData.id']
        },
        test_event: { 
            label: "Evento de Teste", 
            icon: Activity,
            description: "Um evento simples para validar a conexão e a estrutura do payload com seu sistema.",
            useCase: "Verificar se a sua URL ou número de telefone está recebendo as requisições corretamente durante a configuração.",
            variables: ['message']
        }
    };

    useEffect(() => {
        if (!userId) return;
        setLoading(true);
        const firestore = getFirebaseFirestore();
        const actionsRef = collection(firestore, 'users', userId, 'actions');
        const q = query(actionsRef, orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActionConfig));
            setActions(items);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching actions:", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [userId]);

    const handleToggleForm = (actionId: string | null) => {
        if (editingActionId === actionId) {
            setEditingActionId(null); // Hide if clicking the same edit button
        } else {
            setEditingActionId(actionId);
        }
    };
    
    const handleAddNew = () => {
         setEditingActionId(editingActionId === 'new' ? null : 'new');
    };

    const handleDelete = (action: ActionConfig) => {
        setActionToDelete(action);
        setIsDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!userId || !actionToDelete) return;
        await saveActionConfig({
            userId,
            configId: actionToDelete.id,
            action: 'delete',
        });
        setIsDeleteDialogOpen(false);
        setActionToDelete(null);
    };

    const handleToggleActive = async (action: ActionConfig) => {
        await saveActionConfig({
            userId,
            configId: action.id,
            action: 'update',
            config: { ...action, isActive: !action.isActive }
        });
    };

    const editingAction = useMemo(() => {
        if (!editingActionId || editingActionId === 'new') return null;
        return actions.find(a => a.id === editingActionId) || null;
    }, [editingActionId, actions]);
    

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h3 className="text-xl font-bold">Ações Automáticas</h3>
                    <p className="text-muted-foreground text-sm">Crie automações baseadas em eventos, como enviar notificações para sistemas externos (Webhooks) ou mandar mensagens de WhatsApp.</p>
                </div>
                <Button onClick={handleAddNew}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Adicionar Ação
                </Button>
            </div>
            
            <AnimatePresence>
            {editingActionId === 'new' && (
                <motion.div
                     initial={{ opacity: 0, height: 0 }}
                     animate={{ opacity: 1, height: 'auto' }}
                     exit={{ opacity: 0, height: 0 }}
                >
                    <ActionForm
                        userId={userId}
                        action={null}
                        eventDetails={eventDetails}
                        onClose={() => setEditingActionId(null)}
                    />
                </motion.div>
            )}
            </AnimatePresence>
            
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : actions.length === 0 && editingActionId !== 'new' ? (
                <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
                    <Webhook className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-semibold">Nenhuma ação configurada</h3>
                    <p className="text-muted-foreground mt-1">Clique em "Adicionar Ação" para começar.</p>
                </Card>
            ) : (
                <div className="space-y-4">
                    {actions.map(action => {
                        const eventInfo = eventDetails[action.event];
                        const isEditingThis = editingActionId === action.id;
                        return (
                           <div key={action.id}>
                                <Card>
                                    <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                        <div className="flex items-center gap-4 flex-1">
                                            <div className="p-3 bg-secondary rounded-lg">
                                                {action.type === 'whatsapp' ? 
                                                    <FaWhatsapp className="h-5 w-5 text-green-500"/> :
                                                    <Webhook className="h-5 w-5 text-secondary-foreground" />
                                                }
                                            </div>
                                            <div className="flex-1 space-y-1 min-w-0">
                                                <p className="font-semibold text-foreground">{action.name}</p>
                                                <p className="text-sm text-muted-foreground font-mono break-all">{action.url || action.phoneNumber}</p>
                                                <Badge variant="secondary">
                                                    {eventInfo ? <eventInfo.icon className="mr-2 h-3.5 w-3.5" /> : null}
                                                    {eventInfo ? eventInfo.label : action.event}
                                                </Badge>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 flex-shrink-0 self-end sm:self-center">
                                            <Switch
                                                checked={action.isActive}
                                                onCheckedChange={() => handleToggleActive(action)}
                                            />
                                            <Button variant="ghost" size="icon" onClick={() => handleToggleForm(action.id!)}>
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-400" onClick={() => handleDelete(action)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                                <AnimatePresence>
                                {isEditingThis && (
                                     <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                    >
                                        <ActionForm
                                            userId={userId}
                                            action={editingAction}
                                            eventDetails={eventDetails}
                                            onClose={() => setEditingActionId(null)}
                                        />
                                    </motion.div>
                                )}
                                </AnimatePresence>
                            </div>
                        )
                    })}
                </div>
            )}
            <ConfirmDeleteDialog
                isOpen={isDeleteDialogOpen}
                onClose={() => setIsDeleteDialogOpen(false)}
                onConfirm={confirmDelete}
                title="Apagar Ação?"
                description={`Tem certeza que deseja apagar a ação "${actionToDelete?.name}"? Esta ação é irreversível.`}
            />
        </div>
    );
};
