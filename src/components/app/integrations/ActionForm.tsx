

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { saveActionConfig, sendTestAction } from '@/actions/webhookSender';
import type { ActionConfig, WebhookEvent } from '@/lib/types';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from '@/components/ui/textarea';
import { Label } from "@/components/ui/label";
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Send, CheckCircle, AlertTriangle, Eye, EyeOff, Sparkles, Info, Webhook, Tag } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import crypto from 'crypto';
import { AnimatePresence, motion } from 'framer-motion';
import Handlebars from 'handlebars';
import { Card, CardContent } from '@/components/ui/card';

interface ActionFormProps {
    userId: string;
    action: ActionConfig | null;
    onClose: () => void;
    eventDetails: Record<WebhookEvent, { label: string; icon: React.ElementType, description: string, useCase: string, variables: string[] }>;
}

const getSamplePayload = (event: WebhookEvent, triggerTags: string[] = []) => {
    const timestamp = new Date().toISOString();
    const basePayload: any = {
        event: event,
        timestamp: timestamp,
        userId: 'user_12345',
        data: {
            conversationId: '5511999998888',
        },
    };
    
    const eventData: Record<string, any> = {
        conversationId: '5511999998888',
    };
    const clientData = {
        id: '5511999998888',
        name: 'João Silva',
        preferredName: 'João',
        folder: 'inbox',
        isAiActive: true,
        address: { street: 'Rua das Flores', number: '123', neighborhood: 'Jardim das Rosas' },
        notes: ['Preferência por contato após as 18h.'],
        tags: ['Orçamento', 'VIP'],
    };

    switch (event) {
        case 'conversation_created':
        case 'conversation_updated':
            eventData.triggeringMessage = { id: 'MSG_ID_ABC123', text: 'Olá, gostaria de um orçamento.', from: 'user' };
            break;
        case 'message_received':
        case 'message_sent':
            eventData.message = { id: 'MSG_ID_XYZ789', text: 'Esta é uma mensagem de exemplo.', from: event === 'message_received' ? 'user' : 'agent', source: event === 'message_sent' ? 'ai' : undefined };
            break;
        case 'human_support_requested':
             eventData.reason = 'Cliente solicitou falar com um atendente.';
            break;
        case 'appointment_scheduled':
            eventData.appointment = { eventId: 'cal_event_id_12345', serviceName: 'Consulta de Rotina', date: '25/12/2024', time: '15:30', title: 'Consulta de Rotina - João Silva' };
            break;
        case 'client_info_updated':
            eventData.updatedFields = ['preferredName', 'address', 'notes'];
            break;
        case 'lead_qualified':
             eventData.reason = 'Lead qualificado e pronto para atendimento';
            break;
        case 'ai_knowledge_miss':
             eventData.reason = 'Falha de conhecimento da IA.';
             eventData.clientQuestion = 'Vocês fazem entrega em Marte?';
            break;
        case 'appointment_rescheduled_or_canceled':
             eventData.action = 'canceled'; // or 'rescheduled'
             eventData.eventId = 'cal_event_id_67890';
            break;
        case 'conversation_ended_by_ai':
             eventData.summary = 'O cliente tirou a dúvida sobre o horário de funcionamento e ficou satisfeito.';
            break;
        case 'tag_added':
            eventData.tag = triggerTags[0] || 'TagDeExemplo';
            break;
        case 'test_event':
        default:
             eventData.message = 'Esta é uma mensagem de teste do painel de configuração de webhooks.';
    }

    basePayload.data = {
        ...eventData,
        clientData: clientData,
    };
    return basePayload;
};

const getVariableDescriptions = (event: WebhookEvent): Record<string, { desc: string, example: any }> => {
    const samplePayload = getSamplePayload(event).data;
    const baseVariables: Record<string, { desc: string, example: any }> = {
        'conversationId': { desc: "O número de WhatsApp do cliente.", example: samplePayload.conversationId || '5511999998888' },
        'clientData.name': { desc: "Nome do cliente no WhatsApp.", example: samplePayload.clientData?.name },
        'clientData.preferredName': { desc: "Nome preferido do cliente.", example: samplePayload.clientData?.preferredName },
        'clientData.notes': { desc: "Anotações salvas sobre o cliente.", example: samplePayload.clientData?.notes?.join(', ') },
        'clientData.address.street': { desc: "Endereço do cliente.", example: samplePayload.clientData?.address?.street },
    };

    switch (event) {
        case 'appointment_scheduled':
            return {
                ...baseVariables,
                'appointment.serviceName': { desc: "Nome do serviço agendado.", example: samplePayload.appointment?.serviceName },
                'appointment.date': { desc: "Data do agendamento (DD/MM/AAAA).", example: samplePayload.appointment?.date },
                'appointment.time': { desc: "Hora do agendamento (HH:mm).", example: samplePayload.appointment?.time },
            };
        case 'ai_knowledge_miss':
             return {
                ...baseVariables,
                'clientQuestion': { desc: "A pergunta que a IA não soube responder.", example: samplePayload.clientQuestion },
             }
        case 'message_received':
        case 'message_sent':
            return {
                ...baseVariables,
                'message.text': { desc: "O conteúdo da mensagem.", example: samplePayload.message?.text },
                'message.source': { desc: "A origem da mensagem enviada ('ai' ou 'operator').", example: samplePayload.message?.source },
            }
        case 'tag_added':
            return {
                ...baseVariables,
                'tag': { desc: "A etiqueta que foi adicionada à conversa.", example: samplePayload.tag },
            }
        default:
            return baseVariables;
    }
};

export const ActionForm = ({ userId, action, onClose, eventDetails }: ActionFormProps) => {
    const isEditing = !!action;
    
    // Form state
    const [name, setName] = useState('');
    const [type, setType] = useState<'webhook' | 'whatsapp'>('webhook');
    const [event, setEvent] = useState<WebhookEvent>('conversation_created');
    const [isActive, setIsActive] = useState(true);
    const [url, setUrl] = useState('');
    const [secret, setSecret] = useState('');
    const [showSecret, setShowSecret] = useState(false);
    const [phoneNumber, setPhoneNumber] = useState('');
    const [messageTemplate, setMessageTemplate] = useState('');
    const [triggerTags, setTriggerTags] = useState<string[]>([]);
    
    // UI state
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setName(action?.name || '');
        setType(action?.type || 'webhook');
        setEvent(action?.event || 'conversation_created');
        setIsActive(action?.isActive ?? true);
        setUrl(action?.url || '');
        setSecret(action?.secret || '');
        setPhoneNumber(action?.phoneNumber || '');
        setMessageTemplate(action?.messageTemplate || '');
        setTriggerTags(action?.triggerTags || []);
        setError(null);
        setTestResult(null);
    }, [action]);

    const handleSendTest = async () => {
        if (type === 'webhook' && !url) {
            setError("URL é obrigatória para enviar um teste de webhook.");
            return;
        }
        if (type === 'whatsapp' && (!phoneNumber || !messageTemplate)) {
            setError("Número e modelo da mensagem são obrigatórios para um teste de WhatsApp.");
            return;
        }

        setIsTesting(true);
        setTestResult(null);
        setError(null);
        
        try {
            const result = await sendTestAction({ 
                userId, 
                config: { type, url, secret, phoneNumber, messageTemplate, event, triggerTags }
            });
            setTestResult(result);
        } catch (e: any) {
            setTestResult({ success: false, message: e.message || "Erro desconhecido." });
        } finally {
            setIsTesting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            setError('O nome da ação é obrigatório.');
            return;
        }
        if (type === 'webhook' && !url.trim()) {
             setError('A URL do webhook é obrigatória.');
            return;
        }
        if(type === 'whatsapp' && (!phoneNumber.trim() || !messageTemplate.trim())) {
            setError('O número de telefone e o modelo da mensagem são obrigatórios.');
            return;
        }
        
        setError(null);
        setIsSaving(true);
        
        try {
            const configToSave: Partial<ActionConfig> = {
                name,
                type,
                event,
                isActive,
            };

            if (type === 'webhook') {
                configToSave.url = url;
                configToSave.secret = secret;
            } else {
                configToSave.phoneNumber = phoneNumber;
                configToSave.messageTemplate = messageTemplate;
            }

            if (event === 'tag_added') {
                configToSave.triggerTags = triggerTags;
            }

            await saveActionConfig({
                userId,
                action: isEditing ? 'update' : 'create',
                configId: action?.id,
                config: configToSave,
            });
            onClose();
        } catch (err: any) {
            console.error("Error saving action:", err);
            setError(err.message || "Não foi possível salvar. Tente novamente.");
        } finally {
            setIsSaving(false);
        }
    };
    
    const selectedEventDetails = eventDetails[event];
    const samplePayload = getSamplePayload(event, triggerTags);
    const variableDescriptions = getVariableDescriptions(event);

    const formattedMessagePreview = useMemo(() => {
        if (!messageTemplate) return 'Digite seu modelo de mensagem...';
        try {
            const template = Handlebars.compile(messageTemplate, { noEscape: true });
            return template(samplePayload);
        } catch (e) {
            return "Erro no modelo...";
        }
    }, [messageTemplate, samplePayload]);

    const webhookRequestPreview = useMemo(() => {
        const body = JSON.stringify(samplePayload, null, 2);
        let headers = `Content-Type: application/json\nUser-Agent: Studio-Webhook-Sender/1.0`;

        if (secret) {
            const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
            headers += `\nx-hub-signature-256: sha256=${signature}`;
        }
        
        return `POST ${url || 'https://seu-sistema.com/api/webhook'} HTTP/1.1\n${headers}\n\n${body}`;
    }, [url, secret, samplePayload]);

    return (
        <Card className="mt-4 border-primary/50">
            <CardContent className="p-6">
                <form onSubmit={handleSubmit} className="flex h-full flex-col">
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="action-name">Nome da Ação</Label>
                            <Input
                                id="action-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ex: Notificar CRM sobre novo lead"
                                required
                                disabled={isSaving || isTesting}
                            />
                        </div>

                         <div className="space-y-3">
                            <Label>Tipo de Ação</Label>
                            <RadioGroup value={type} onValueChange={(v: any) => setType(v)} className="flex gap-4">
                                <Label htmlFor="type-webhook" className="flex items-center gap-2 border rounded-lg p-4 flex-1 cursor-pointer hover:bg-accent has-[[data-state=checked]]:border-primary">
                                    <RadioGroupItem value="webhook" id="type-webhook" />
                                    <Webhook className="h-5 w-5" />
                                    Enviar Webhook
                                </Label>
                                <Label htmlFor="type-whatsapp" className="flex items-center gap-2 border rounded-lg p-4 flex-1 cursor-pointer hover:bg-accent has-[[data-state=checked]]:border-primary">
                                    <RadioGroupItem value="whatsapp" id="type-whatsapp" />
                                    <FaWhatsapp className="h-5 w-5 text-green-500" />
                                    Mensagem WhatsApp
                                </Label>
                            </RadioGroup>
                        </div>
                        
                        <div className="space-y-2">
                            <Label htmlFor="webhook-event">Quando este evento acontecer...</Label>
                            <Select value={event} onValueChange={(v: WebhookEvent) => setEvent(v)} disabled={isSaving || isTesting}>
                                <SelectTrigger id="webhook-event"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {Object.entries(eventDetails).map(([key, { label, icon: Icon }]) => (
                                        <SelectItem key={key} value={key}>
                                            <div className="flex items-center gap-2">
                                                <Icon className="h-4 w-4" />
                                                <span>{label}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        
                        <AnimatePresence>
                            {selectedEventDetails && (
                                <motion.div
                                    key={event}
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="p-4 bg-muted/50 rounded-lg border space-y-3"
                                >
                                    <div className="flex items-start gap-3">
                                        <Info className="h-5 w-5 mt-0.5 text-accent-foreground flex-shrink-0" />
                                        <div>
                                            <h4 className="font-semibold text-accent-foreground">O que este evento faz?</h4>
                                            <p className="text-sm text-muted-foreground">{selectedEventDetails.description}</p>
                                        </div>
                                    </div>
                                     <div className="flex items-start gap-3">
                                        <Sparkles className="h-5 w-5 mt-0.5 text-accent-foreground flex-shrink-0" />
                                        <div>
                                            <h4 className="font-semibold text-accent-foreground">Caso de Uso Real</h4>
                                            <p className="text-sm text-muted-foreground">{selectedEventDetails.useCase}</p>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <AnimatePresence>
                            {event === 'tag_added' && (
                                <motion.div
                                    key="tag-trigger-fields"
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="space-y-2"
                                >
                                    <Label htmlFor="trigger-tags">...e a tag adicionada for uma destas:</Label>
                                    <Input
                                        id="trigger-tags"
                                        value={triggerTags.join(', ')}
                                        onChange={(e) => setTriggerTags(e.target.value.split(',').map(t => t.trim()))}
                                        placeholder="Ex: Orçamento, VIP, Reclamação"
                                        disabled={isSaving || isTesting}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Separe as tags por vírgula. Se deixado em branco, a ação será disparada para qualquer tag adicionada.
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>


                        <AnimatePresence mode="wait">
                            {type === 'webhook' ? (
                                <motion.div 
                                    key="webhook-fields"
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 10 }}
                                    transition={{ duration: 0.2 }}
                                    className="space-y-4"
                                >
                                    <div className="space-y-2">
                                        <Label htmlFor="webhook-url">...enviar um webhook para esta URL</Label>
                                        <Input
                                            id="webhook-url"
                                            value={url}
                                            onChange={(e) => setUrl(e.target.value)}
                                            placeholder="https://seu-sistema.com/api/webhook"
                                            type="url"
                                            disabled={isSaving || isTesting}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="webhook-secret">Segredo (Opcional)</Label>
                                        <div className="relative">
                                            <Input
                                                id="webhook-secret"
                                                value={secret}
                                                onChange={(e) => setSecret(e.target.value)}
                                                type={showSecret ? 'text' : 'password'}
                                                placeholder="Use para validar a requisição"
                                                disabled={isSaving || isTesting}
                                            />
                                            <Button type="button" variant="ghost" size="icon" className="absolute top-1/2 right-2 -translate-y-1/2" onClick={() => setShowSecret(!showSecret)}>
                                                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                        <p className="text-xs text-muted-foreground">Se preenchido, o webhook será enviado com um cabeçalho `x-hub-signature-256` para validação.</p>
                                    </div>
                                    <div>
                                        <Label>Pré-visualização da Requisição</Label>
                                        <pre className="mt-2 text-xs text-foreground/90 bg-black/20 p-2 rounded-md whitespace-pre-wrap break-all max-h-60 overflow-auto">
                                            <code>{webhookRequestPreview}</code>
                                        </pre>
                                    </div>
                                </motion.div>
                            ) : (
                                 <motion.div 
                                    key="whatsapp-fields"
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 10 }}
                                    transition={{ duration: 0.2 }}
                                    className="space-y-4"
                                >
                                    <div className="space-y-2">
                                        <Label htmlFor="whatsapp-number">...enviar uma mensagem para este número</Label>
                                        <Input
                                            id="whatsapp-number"
                                            value={phoneNumber}
                                            onChange={(e) => setPhoneNumber(e.target.value)}
                                            placeholder="5511999998888"
                                            disabled={isSaving || isTesting}
                                        />
                                    </div>
                                     <div className="space-y-2">
                                        <Label htmlFor="whatsapp-template">...com este modelo de mensagem</Label>
                                        <Textarea
                                            id="whatsapp-template"
                                            value={messageTemplate}
                                            onChange={(e) => setMessageTemplate(e.target.value)}
                                            placeholder="Ex: Novo agendamento para {{data.clientData.name}} no dia {{data.appointment.date}}!"
                                            className="min-h-[120px] font-mono text-sm"
                                            disabled={isSaving || isTesting}
                                        />
                                        <div className="p-4 bg-muted/50 rounded-lg border space-y-3">
                                            <h4 className="text-sm font-semibold text-accent-foreground mb-2">Variáveis Disponíveis para este Evento:</h4>
                                            <ul className="space-y-2 text-sm">
                                                {Object.entries(variableDescriptions).map(([key, { desc, example }]) => example ? (
                                                    <li key={key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                                        <code 
                                                            className="font-mono text-xs bg-background p-1 rounded-md cursor-pointer hover:bg-primary/20"
                                                            onClick={() => setMessageTemplate(prev => `${prev} {{data.${key}}}`)}
                                                        >
                                                            {`{{data.${key}}}`}
                                                        </code>
                                                        <span className="text-muted-foreground sm:text-right text-xs truncate">
                                                            {desc} (Ex: "{String(example)}")
                                                        </span>
                                                    </li>
                                                ): null)}
                                            </ul>
                                        </div>
                                    </div>
                                    
                                     <div>
                                        <Label>Pré-visualização</Label>
                                         <div className="mt-2 p-4 rounded-lg bg-[#075e54] text-white w-full max-w-sm self-start">
                                            <div className="bg-[#dcf8c6] text-black p-2 rounded-lg shadow-sm" style={{ wordBreak: 'break-word' }}>
                                                 <p className="whitespace-pre-wrap">{formattedMessagePreview}</p>
                                            </div>
                                        </div>
                                     </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        
                         <div className="flex items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                                <Label htmlFor="action-active">Ação Ativa</Label>
                                <p className="text-[0.8rem] text-muted-foreground">Se desativado, esta ação não será executada.</p>
                            </div>
                            <Switch id="action-active" checked={isActive} onCheckedChange={setIsActive} disabled={isSaving || isTesting} />
                        </div>
                        
                         {error && <p className="text-center text-sm text-red-500">{error}</p>}
                         {testResult && (
                            <div className={`flex items-center gap-2 text-sm p-3 rounded-md ${testResult.success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                {testResult.success ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                                <span>{testResult.message}</span>
                            </div>
                         )}
                        
                    </div>

                    <div className="pt-6 border-t mt-6">
                         <div className="w-full flex flex-col-reverse sm:flex-row sm:justify-between items-center gap-2">
                            <Button type="button" variant="outline" onClick={handleSendTest} disabled={isSaving || isTesting}>
                                {isTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                Enviar Teste
                            </Button>
                            <div className="flex gap-2">
                                 <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving || isTesting}>Cancelar</Button>
                                <Button type="submit" disabled={isSaving || isTesting}>
                                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Salvar Ação
                                </Button>
                            </div>
                        </div>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
};
