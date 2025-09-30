

'use client';

import React, { useState, useEffect, FormEvent } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase';
import type { AiConfig, GenerateAgentPromptInput, GenerateFieldSuggestionInput } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Sparkles, Wand2, FileText, CheckCircle, AlertTriangle, RefreshCw, Eraser, ChevronsRight, Lightbulb, Link as LinkIcon, PlusCircle, Trash2 } from 'lucide-react';
import { generateAgentPromptAction } from '@/actions/agentConfigActions';
import { generateFieldSuggestion } from '@/ai/flows/generate-field-suggestion';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { checkGoogleAuthState } from '@/actions/google-auth-actions';

const initialConfigState: Partial<AiConfig> = {
    companyName: '',
    businessDescription: 'Somos uma empresa focada em entender e resolver as necessidades dos nossos clientes, oferecendo soluções personalizadas e um atendimento de alta qualidade.',
    agentRole: 'Agendar / Marcar Horários',
    agentPersonality: 'Empático e paciente',
    useEmojis: true,
    useGreeting: true,
    contactPhone: '',
    contactEmail: '',
    agentObjective: 'Entender a necessidade do cliente, responder todas as suas dúvidas, quebrar objeções com base nos nossos diferenciais e, como objetivo final, realizar o agendamento do serviço.',
    unknownAnswerResponse: 'Não tenho essa informação no momento, mas um dos nossos atendentes virá lhe atender e poderá te ajudar com isso.',
    humanizationTriggers: 'Cliente expressa frustração ou irritação.\nCliente menciona um problema com um serviço já realizado.\nCliente pede para falar com um gerente ou responsável.',
    targetAudience: '',
    keyProducts: 'Nosso principal diferencial é a qualidade do atendimento e a flexibilidade de horários. Oferecemos garantia em todos os nossos serviços.',
    commonMistakes: 'Nunca prometer algo que não pode ser cumprido.\nNão ignorar as preocupações do cliente.\nNão finalizar a conversa sem ter certeza que o cliente está satisfeito.',
    fixedLinks: '',
    qualifyingQuestions: [],
    routingSectors: [],
    surveyQuestions: '',
    notifyOnTagAdded: true, // Novo campo
};

const roleDescriptions: Record<string, string> = {
    'Suporte / Tirar Dúvidas': 'O agente usará a Base de Conhecimento (FAQ) para responder perguntas e seguir procedimentos para resolver problemas do cliente antes de escalar para um humano.',
    'Agendar / Marcar Horários': 'A IA coletará as informações necessárias (serviço, dia, hora) e usará a ferramenta para marcar horários na agenda.',
    'SDR (Qualificar Leads)': 'A IA atuará como um pré-vendedor, fazendo perguntas-chave para filtrar contatos e entender o potencial do cliente antes de transferir para um vendedor humano.',
    'Roteamento / Triagem': 'A IA entenderá a necessidade do cliente e o transferirá para o departamento ou especialista correto, funcionando como um recepcionista digital.',
};

const personalityDescriptions: Record<string, string> = {
    'Amigável e casual': 'Tom de voz casual e positivo. Usa emojis com moderação para criar uma conversa leve. Ex: "Oi! 😊 Claro, posso te ajudar com isso!"',
    'Profissional e formal': 'Tom de voz formal e eficiente. Foco em clareza e precisão, sem gírias ou emojis. Ex: "Prezado(a) cliente, sua solicitação foi recebida. Por favor, aguarde."',
    'Divertido e criativo': 'Tom de voz criativo e bem-humorado. Pode usar uma linguagem temática para surpreender o cliente. Ex: "Missão agendamento iniciada! 🚀 Para qual dia e hora?"',
    'Técnico e preciso': 'Tom de voz preciso e informativo. Usa termos técnicos corretos e foca em dados. Ex: "Para prosseguir, é necessário verificar a especificação técnica do item."',
    'Empático e paciente': 'Tom de voz calmo e acolhedor. Valida os sentimentos do cliente antes de agir. Ex: "Entendo sua frustração. Para que eu possa ajudar, pode me contar o que aconteceu?"',
    'Curto e direto': 'Tom de voz objetivo e sem rodeios. Responde apenas o essencial para resolver a solicitação. Ex: "Preço: R$50. Deseja agendar?"',
};

const AgentConfigForm = ({ config, handleConfigChange, handleQualifyingQuestionChange, addQualifyingQuestion, removeQualifyingQuestion, handleRoutingSectorChange, addRoutingSector, removeRoutingSector, mode, setMode, handleGeneratePrompt, isGenerating, handleClearFields, handleGenerateSuggestion, isSuggestingFor, showCalendarWarning }: any) => (
    <form onSubmit={handleGeneratePrompt}>
        <div className="space-y-6">
            <AnimatePresence>
                {showCalendarWarning && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300"
                    >
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0 text-amber-400" />
                            <div className="flex-1">
                                <h4 className="font-semibold text-amber-300 mb-1">Ação Necessária</h4>
                                <p className="text-sm text-amber-300/90">
                                    Para usar a função de agendamento, você precisa conectar sua conta do Google Calendar na aba 'Integrações' dos Ajustes.
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center"><Wand2 className="mr-2"/>Construtor do Agente de IA</CardTitle>
                    <CardDescription>Responda as perguntas abaixo para que a IA possa construir a personalidade e as regras do seu assistente.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                    {/* --- Simple Mode --- */}
                    <fieldset className="space-y-4">
                         <legend className="text-lg font-semibold">📌 Sobre a Empresa e o Agente</legend>
                        <div className="space-y-2">
                            <Label htmlFor="company-name">Nome da Empresa</Label>
                            <Input id="company-name" value={config.companyName} onChange={e => handleConfigChange('companyName', e.target.value)} placeholder="Ex: Pizzaria do Zé" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="business-desc">Descrição do Negócio (Core Business)</Label>
                            <Textarea id="business-desc" value={config.businessDescription} onChange={e => handleConfigChange('businessDescription', e.target.value)} placeholder="Ex: Somos uma pizzaria delivery especializada em pizzas artesanais com ingredientes frescos." required />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="agent-personality">Tom de voz esperado</Label>
                                <Select value={config.agentPersonality} onValueChange={(v: string) => handleConfigChange('agentPersonality', v)}>
                                    <SelectTrigger id="agent-personality"><SelectValue placeholder="Selecione um tom de voz" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Amigável e casual">Amigável e casual</SelectItem>
                                        <SelectItem value="Profissional e formal">Profissional e formal</SelectItem>
                                        <SelectItem value="Divertido e criativo">Divertido e criativo</SelectItem>
                                        <SelectItem value="Técnico e preciso">Técnico e preciso</SelectItem>
                                        <SelectItem value="Empático e paciente">Empático e paciente</SelectItem>
                                        <SelectItem value="Curto e direto">Curto e direto</SelectItem>
                                    </SelectContent>
                                </Select>
                                {config.agentPersonality && personalityDescriptions[config.agentPersonality] && (
                                    <p className="text-xs text-muted-foreground mt-2 px-1">
                                        {personalityDescriptions[config.agentPersonality]}
                                    </p>
                                )}
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="agent-role">Prioridade do agente</Label>
                                <Select value={config.agentRole} onValueChange={(v: string) => handleConfigChange('agentRole', v)}>
                                    <SelectTrigger id="agent-role"><SelectValue placeholder="Selecione a prioridade" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Suporte / Tirar Dúvidas">Suporte / Tirar Dúvidas</SelectItem>
                                        <SelectItem value="Agendar / Marcar Horários">Agendar / Marcar Horários</SelectItem>
                                        <SelectItem value="SDR (Qualificar Leads)">SDR (Qualificar Leads)</SelectItem>
                                        <SelectItem value="Roteamento / Triagem">Roteamento / Triagem</SelectItem>
                                    </SelectContent>
                                </Select>
                                {config.agentRole && roleDescriptions[config.agentRole] && (
                                    <p className="text-xs text-muted-foreground mt-2 px-1">
                                        {roleDescriptions[config.agentRole]}
                                    </p>
                                )}
                            </div>
                        </div>
                    </fieldset>

                    <AnimatePresence>
                    {config.agentRole === 'SDR (Qualificar Leads)' && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.5, ease: 'easeInOut' }}
                            className="overflow-hidden"
                        >
                            <fieldset className="space-y-4 pt-8 border-t">
                                <legend className="text-lg font-semibold text-primary">⭐ Configuração da Qualificação de Leads</legend>
                                <div className="space-y-2">
                                    <Label>Perguntas de Qualificação</Label>
                                    <div className="space-y-3">
                                        {(config.qualifyingQuestions || []).map((question: string, index: number) => (
                                            <div key={index} className="flex items-center gap-2">
                                                <Input
                                                    type="text"
                                                    placeholder={`Pergunta ${index + 1}`}
                                                    value={question}
                                                    onChange={(e) => handleQualifyingQuestionChange(index, e.target.value)}
                                                />
                                                <Button type="button" variant="ghost" size="icon" onClick={() => removeQualifyingQuestion(index)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                    <Button type="button" variant="outline" size="sm" onClick={addQualifyingQuestion} className="mt-2">
                                        <PlusCircle className="mr-2 h-4 w-4" />
                                        Adicionar Pergunta
                                    </Button>
                                    <p className="text-xs text-muted-foreground mt-2">A IA fará essas perguntas em sequência, salvará as respostas nas anotações do cliente e depois transferirá o atendimento.</p>
                                </div>
                            </fieldset>
                        </motion.div>
                    )}
                    </AnimatePresence>

                    <AnimatePresence>
                    {config.agentRole === 'Roteamento / Triagem' && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.5, ease: 'easeInOut' }}
                            className="overflow-hidden"
                        >
                            <fieldset className="space-y-4 pt-8 border-t">
                                <legend className="text-lg font-semibold text-primary">⭐ Configuração de Roteamento</legend>
                                <div className="space-y-2">
                                    <Label>Setores (Tags) para Roteamento</Label>
                                     <div className="space-y-3">
                                        {(config.routingSectors || []).map((sector: string, index: number) => (
                                            <div key={index} className="flex items-center gap-2">
                                                <Input
                                                    type="text"
                                                    placeholder={`Setor ${index + 1} (ex: Vendas)`}
                                                    value={sector}
                                                    onChange={(e) => handleRoutingSectorChange(index, e.target.value)}
                                                />
                                                <Button type="button" variant="ghost" size="icon" onClick={() => removeRoutingSector(index)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                    <Button type="button" variant="outline" size="sm" onClick={addRoutingSector} className="mt-2">
                                        <PlusCircle className="mr-2 h-4 w-4" />
                                        Adicionar Setor
                                    </Button>
                                    <p className="text-xs text-muted-foreground mt-2">
                                       Defina os setores para os quais a IA pode transferir. A IA usará estes nomes como tags.
                                    </p>
                                </div>
                                <div className="flex items-center justify-between rounded-lg border p-4">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="notify-on-tag-added">Receber notificação ao adicionar tag</Label>
                                        <p className="text-[0.8rem] text-muted-foreground">Envia uma notificação push quando o agente classifica um cliente.</p>
                                    </div>
                                    <Switch id="notify-on-tag-added" checked={config.notifyOnTagAdded ?? true} onCheckedChange={v => handleConfigChange('notifyOnTagAdded', v)} />
                                </div>
                            </fieldset>
                        </motion.div>
                    )}
                    </AnimatePresence>
                    
                    {/* Advanced Mode */}
                    <AnimatePresence>
                    {mode === 'advanced' && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.5, ease: 'easeInOut' }}
                            className="overflow-hidden space-y-8"
                        >
                            <fieldset className="space-y-4 pt-8 border-t">
                                <legend className="text-lg font-semibold">🎯 Objetivo e Funções (Avançado)</legend>
                                <div className="space-y-2">
                                    <Label htmlFor="agent-objective">Ação desejada em cada interação</Label>
                                    <Input id="agent-objective" value={config.agentObjective} onChange={e => handleConfigChange('agentObjective', e.target.value)} placeholder="Ex: Clicar no link do cardápio, agendar visita" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="target-audience">Público-alvo principal</Label>
                                    <Textarea id="target-audience" value={config.targetAudience} onChange={e => handleConfigChange('targetAudience', e.target.value)} placeholder="Quem são os clientes ideais (faixa etária, interesses, localização, dores)?" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="key-products">Ofertas e diferenciais a reforçar</Label>
                                    <Textarea id="key-products" value={config.keyProducts} onChange={e => handleConfigChange('keyProducts', e.target.value)} placeholder="Quais serviços/produtos o agente deve sempre reforçar?" />
                                </div>
                            </fieldset>
                            
                            <fieldset className="space-y-4 pt-8 border-t">
                                <legend className="text-lg font-semibold">🛑 Regras e Restrições (Avançado)</legend>
                                <div className="space-y-2">
                                    <Label htmlFor="unknown-answer-response">Resposta para quando não souber algo</Label>
                                    <Input id="unknown-answer-response" value={config.unknownAnswerResponse} onChange={e => handleConfigChange('unknownAnswerResponse', e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <Label htmlFor="common-mistakes">Erros comuns a evitar</Label>
                                        <Button type="button" size="sm" variant="ghost" onClick={() => handleGenerateSuggestion('commonMistakes')} disabled={!!isSuggestingFor}>
                                             {isSuggestingFor === 'commonMistakes' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                                             Sugerir
                                        </Button>
                                    </div>
                                    <Textarea id="common-mistakes" value={config.commonMistakes} onChange={e => handleConfigChange('commonMistakes', e.target.value)} placeholder="O que o agente NUNCA deve fazer (ex.: dar preços sem autorização, prometer resultados, responder com piadas)?" />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <Label htmlFor="humanization-triggers">Gatilhos para transferir para um humano</Label>
                                         <Button type="button" size="sm" variant="ghost" onClick={() => handleGenerateSuggestion('humanizationTriggers')} disabled={!!isSuggestingFor}>
                                             {isSuggestingFor === 'humanizationTriggers' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                                             Sugerir
                                         </Button>
                                    </div>
                                    <Textarea id="humanization-triggers" value={config.humanizationTriggers} onChange={e => handleConfigChange('humanizationTriggers', e.target.value)} placeholder="Quais situações exigem atendimento humano imediato (ex.: reclamações financeiras, pedidos urgentes, clientes VIP)?" />
                                </div>
                            </fieldset>

                            <fieldset className="space-y-4 pt-8 border-t">
                                <legend className="text-lg font-semibold">📲 Integrações e Ações Extras (Avançado)</legend>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="flex items-center justify-between rounded-lg border p-4">
                                        <div className="space-y-0.5">
                                            <Label htmlFor="use-greeting">Usar saudação inicial?</Label>
                                            <p className="text-[0.8rem] text-muted-foreground">Define se a IA cumprimenta o cliente com "Bom dia", etc.</p>
                                        </div>
                                        <Switch id="use-greeting" checked={config.useGreeting} onCheckedChange={v => handleConfigChange('useGreeting', v)} />
                                    </div>
                                    <div className="flex items-center justify-between rounded-lg border p-4">
                                        <div className="space-y-0.5">
                                            <Label htmlFor="use-emojis">Permitir uso de Emojis?</Label>
                                            <p className="text-[0.8rem] text-muted-foreground">Define se a IA pode usar emojis para se expressar.</p>
                                        </div>
                                        <Switch id="use-emojis" checked={config.useEmojis} onCheckedChange={v => handleConfigChange('useEmojis', v)} />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="fixed-links">Links fixos</Label>
                                    <Textarea id="fixed-links" value={config.fixedLinks} onChange={e => handleConfigChange('fixedLinks', e.target.value)} placeholder="Tem algum link que o agente deve sempre oferecer (cardápio, catálogo, site)? Coloque um por linha." />
                                </div>
                                <div className="space-y-2">
                                    <Label>Informações de Contato da Empresa (Opcional)</Label>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <Input value={config.contactPhone} onChange={e => handleConfigChange('contactPhone', e.target.value)} placeholder="Telefone de contato" />
                                        <Input value={config.contactEmail} onChange={e => handleConfigChange('contactEmail', e.target.value)} placeholder="Email de contato" type="email" />
                                    </div>
                                    <p className="text-xs text-muted-foreground">O agente usará essas informações se alguém perguntar como entrar em contato com a empresa por outros meios.</p>
                                </div>
                            </fieldset>
                        </motion.div>
                    )}
                    </AnimatePresence>
                </CardContent>
                <CardFooter className="flex-col sm:flex-row items-center justify-between gap-4">
                    <Button type="button" variant="link" onClick={() => setMode(mode === 'simple' ? 'advanced' : 'simple')}>
                        {mode === 'simple' ? 'Configuração Avançada' : 'Configuração Simples'}
                        <ChevronsRight className="h-4 w-4 ml-2" />
                    </Button>
                    <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" onClick={handleClearFields} disabled={isGenerating}>
                            <Eraser className="mr-2 h-4 w-4" />
                            Limpar
                        </Button>
                        <Button type="submit" disabled={isGenerating}>
                            {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                            Gerar/Atualizar Prompt
                        </Button>
                    </div>
                </CardFooter>
            </Card>
        </div>
    </form>
);

export const AgentBuilderPage = ({ userId }: { userId: string }) => {
    // --- State Management ---
    const [mode, setMode] = useState<'simple' | 'advanced'>('simple');
    const [config, setConfig] = useState<Partial<AiConfig>>(initialConfigState);
    const [generatedPrompt, setGeneratedPrompt] = useState<string>('');
    const [promptFeedback, setPromptFeedback] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isConfigSaved, setIsConfigSaved] = useState(false);
    const [isSuggestingFor, setIsSuggestingFor] = useState<string | null>(null);
    const [isGoogleAuthenticated, setIsGoogleAuthenticated] = useState(false);


    // --- Derived State ---
    const isFeedbackPositive = promptFeedback?.startsWith('Parabéns!');
    const feedbackTips = isFeedbackPositive ? null : promptFeedback;
    const showCalendarWarning = config.agentRole === 'Agendar / Marcar Horários' && !isGoogleAuthenticated;


    // --- Data Fetching ---
    useEffect(() => {
        if (!userId) return;

        const checkAuth = async () => {
            const authState = await checkGoogleAuthState({ userId });
            setIsGoogleAuthenticated(authState.isAuthenticated);
        };
        checkAuth();

        const firestore = getFirebaseFirestore();
        const docRef = doc(firestore, 'users', userId, 'settings', 'aiConfig');
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data() as AiConfig;
                setConfig((prevConfig) => ({
                    ...initialConfigState, // Start with defaults
                    ...prevConfig,         // Keep current state
                    ...data,               // Overwrite with DB data
                }));
                if (data.fullPrompt) {
                    setGeneratedPrompt(data.fullPrompt);
                    setIsConfigSaved(true);
                }
            } else {
                 setConfig(initialConfigState);
            }
            setLoading(false);
        }, (err) => {
            setError("Falha ao carregar a configuração da IA.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [userId]);
    
    // --- Handlers ---
    const handleConfigChange = (field: keyof Omit<AiConfig, 'fullPrompt'>, value: any) => {
        setConfig(prev => ({ ...prev, [field]: value }));
    };
    
    const handleQualifyingQuestionChange = (index: number, value: string) => {
        const newQuestions = [...(config.qualifyingQuestions || [])];
        newQuestions[index] = value;
        handleConfigChange('qualifyingQuestions', newQuestions);
    };

    const addQualifyingQuestion = () => {
        const newQuestions = [...(config.qualifyingQuestions || []), ''];
        handleConfigChange('qualifyingQuestions', newQuestions);
    };

    const removeQualifyingQuestion = (index: number) => {
        const newQuestions = (config.qualifyingQuestions || []).filter((_, i) => i !== index);
        handleConfigChange('qualifyingQuestions', newQuestions);
    };
    
    const handleRoutingSectorChange = (index: number, value: string) => {
        const newSectors = [...(config.routingSectors || [])];
        newSectors[index] = value;
        handleConfigChange('routingSectors', newSectors);
    };

    const addRoutingSector = () => {
        const newSectors = [...(config.routingSectors || []), ''];
        handleConfigChange('routingSectors', newSectors);
    };

    const removeRoutingSector = (index: number) => {
        const newSectors = (config.routingSectors || []).filter((_, i) => i !== index);
        handleConfigChange('routingSectors', newSectors);
    };

    const handleClearFields = () => {
        setConfig(initialConfigState);
        setGeneratedPrompt('');
        setPromptFeedback(null);
        setError(null);
        setSuccess(null);
    };

    const handleGeneratePrompt = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        setPromptFeedback(null);

        if (!config.businessDescription || !config.agentRole) {
            setError("Por favor, preencha a 'Descrição do Negócio' e a 'Prioridade do agente' antes de gerar o prompt.");
            return;
        }

        setIsGenerating(true);

        try {
            const input: GenerateAgentPromptInput = {
                userId,
                mode,
                businessDescription: config.businessDescription || '',
                agentRole: config.agentRole || '',
                companyName: config.companyName,
                agentPersonality: config.agentPersonality,
                useEmojis: config.useEmojis,
                useGreeting: config.useGreeting,
                contactPhone: config.contactPhone,
                contactEmail: config.contactEmail,
                agentObjective: config.agentObjective,
                targetAudience: config.targetAudience,
                keyProducts: config.keyProducts,
                commonMistakes: config.commonMistakes,
                humanizationTriggers: config.humanizationTriggers,
                fixedLinks: config.fixedLinks,
                unknownAnswerResponse: config.unknownAnswerResponse,
                qualifyingQuestions: Array.isArray(config.qualifyingQuestions) ? config.qualifyingQuestions : [],
                routingSectors: Array.isArray(config.routingSectors) ? config.routingSectors.filter(Boolean) : [],
                surveyQuestions: config.surveyQuestions,
                notifyOnTagAdded: config.notifyOnTagAdded,
            };
            const result = await generateAgentPromptAction(input);

            if (result.success && result.prompt) {
                setGeneratedPrompt(result.prompt);
                setSuccess("Prompt gerado com sucesso! Verifique o resultado e as dicas da IA.");
                if (result.feedback) {
                    setPromptFeedback(result.feedback);
                }
            } else {
                setError(result.error || "Ocorreu um erro desconhecido ao gerar o prompt.");
            }
        } catch (err: any) {
            console.error("[ERRO NO FLUXO DE GERAÇÃO DE PROMPT]:", err);
            setError(`Falha na geração do prompt: ${err.message}`);
        } finally {
            setIsGenerating(false);
        }
    };
    
    const handleSaveConfig = async () => {
        if (!userId) {
            setError("Usuário inválido.");
            return;
        }

        setError(null);
        setSuccess(null);
        setIsSaving(true);
        
        try {
            const firestore = getFirebaseFirestore();
            const docRef = doc(firestore, 'users', userId, 'settings', 'aiConfig');
            
            // Filter out empty sectors before saving
            const configToSave = { 
                ...config, 
                routingSectors: (config.routingSectors || []).filter(sector => sector.trim() !== '') 
            };

            await setDoc(docRef, { ...configToSave, fullPrompt: generatedPrompt }, { merge: true });
            setSuccess("Configuração do agente salva com sucesso!");
            setIsConfigSaved(true);

        } catch (err: any) {
            setError(`Falha ao salvar a configuração: ${err.message}`);
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleGenerateSuggestion = async (fieldName: 'commonMistakes' | 'humanizationTriggers') => {
        if (!config.businessDescription || !config.agentRole) {
            setError("Preencha a 'Descrição do Negócio' e 'Prioridade do agente' primeiro.");
            return;
        }
        setIsSuggestingFor(fieldName);
        setError(null);
        try {
            const input: GenerateFieldSuggestionInput = {
                userId,
                businessDescription: config.businessDescription,
                agentRole: config.agentRole,
                fieldName,
            };
            const result = await generateFieldSuggestion(input);
            if (result.success && result.suggestion) {
                handleConfigChange(fieldName, result.suggestion);
            } else {
                setError(result.error || "Falha ao gerar sugestão.");
            }
        } catch (err: any) {
            setError(`Erro ao gerar sugestão: ${err.message}`);
        } finally {
            setIsSuggestingFor(null);
        }
    };

    if (loading) {
        return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    return (
        <div className="space-y-6">
            {!isConfigSaved ? (
                <AgentConfigForm
                    config={config}
                    handleConfigChange={handleConfigChange}
                    handleQualifyingQuestionChange={handleQualifyingQuestionChange}
                    addQualifyingQuestion={addQualifyingQuestion}
                    removeQualifyingQuestion={removeQualifyingQuestion}
                    handleRoutingSectorChange={handleRoutingSectorChange}
                    addRoutingSector={addRoutingSector}
                    removeRoutingSector={removeRoutingSector}
                    mode={mode}
                    setMode={setMode}
                    handleGeneratePrompt={handleGeneratePrompt}
                    isGenerating={isGenerating}
                    handleClearFields={handleClearFields}
                    handleGenerateSuggestion={handleGenerateSuggestion}
                    isSuggestingFor={isSuggestingFor}
                    showCalendarWarning={showCalendarWarning}
                />
            ) : null}

            {isConfigSaved || generatedPrompt ? (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center"><FileText className="mr-2"/>Resultado: Prompt do Sistema</CardTitle>
                        <CardDescription>
                            Este é o cérebro da sua IA. Ele foi gerado com base nas suas respostas. Você pode editar o texto abaixo antes de salvar.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Textarea 
                            value={generatedPrompt}
                            onChange={(e) => setGeneratedPrompt(e.target.value)}
                            placeholder="Clique em 'Gerar/Atualizar Prompt' para ver o resultado aqui."
                            className="min-h-[350px] font-mono text-sm leading-relaxed"
                        />

                        <AnimatePresence>
                            {isFeedbackPositive && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-green-300"
                                >
                                    <div className="flex items-start gap-3">
                                        <CheckCircle className="h-5 w-5 mt-0.5 flex-shrink-0 text-green-400" />
                                        <div className="flex-1">
                                            <h4 className="font-semibold text-green-300 mb-1">Tudo Certo!</h4>
                                            <p className="text-sm text-green-300/90">{promptFeedback}</p>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                            {feedbackTips && (
                                 <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-300"
                                >
                                    <div className="flex items-start gap-3">
                                        <Lightbulb className="h-5 w-5 mt-0.5 flex-shrink-0" />
                                        <div className="flex-1">
                                            <h4 className="font-semibold mb-1">Dicas da IA para Melhorar seu Prompt</h4>
                                            <div className="text-sm prose prose-p:my-1 prose-ul:my-1 prose-li:text-blue-300/90 text-blue-300/90 marker:text-blue-400" dangerouslySetInnerHTML={{ __html: feedbackTips.replace(/\* /g, '<li>').replace(/\n/g, '<br/>').replace(/<li>/g, '<li style="margin-left: 1.5em;">') }} />
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                       
                    </CardContent>
                    <CardFooter className="flex-col items-start gap-4">
                        <div className="flex flex-col sm:flex-row items-center justify-end gap-4 w-full">
                            {success && <p className="text-sm text-green-500 flex items-center gap-2"><CheckCircle className="h-4 w-4"/>{success}</p>}
                            {error && <p className="text-sm text-red-500 flex items-center gap-2"><AlertTriangle className="h-4 w-4"/>{error}</p>}
                            
                            {isConfigSaved ? (
                                 <Button size="lg" variant="outline" onClick={() => setIsConfigSaved(false)}>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Refazer Configuração
                                </Button>
                            ) : null}

                            <Button size="lg" onClick={handleSaveConfig} disabled={isSaving || !generatedPrompt}>
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Salvar Configuração do Agente
                            </Button>
                        </div>
                    </CardFooter>
                </Card>
            ) : null}
        </div>
    );
};
