
'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Wrench, CheckCircle, AlertTriangle, GitBranch, Terminal, Calendar, MessageSquare, SlidersHorizontal, Info } from 'lucide-react';
import type { SerializableToolDefinitionForClient as SerializableToolDefinition } from '@/actions/testsActions';
import { motion } from 'framer-motion';

interface ToolCardProps {
    tool: SerializableToolDefinition;
}

const categoryIcons: Record<string, React.ElementType> = {
    'Agendamento': Calendar,
    'Gerenciamento de Conversa': MessageSquare,
    'Geral': SlidersHorizontal,
};

const ToolCard = ({ tool }: ToolCardProps) => {
    const { name, description, inputSchema, isSilent } = tool;
    
    const renderSchema = (schema: SerializableToolDefinition['inputSchema']) => {
        const entries = Object.entries(schema);
        if (entries.length === 0) {
            return <p className="text-sm text-muted-foreground">Esta ferramenta não requer parâmetros de entrada.</p>;
        }
        return (
            <div className="space-y-2">
                {entries.map(([key, value]) => (
                    <div key={key} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 p-2 rounded bg-background/50">
                       <div>
                            <code className="font-mono text-sm text-cyan-400">{key}</code>
                            <span className="text-muted-foreground text-xs">{value.isOptional ? ' (opcional)' : ''}</span>
                       </div>
                       <p className="text-xs text-muted-foreground sm:text-right sm:max-w-xs">{value.description}</p>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader>
                <div className="flex justify-between items-start">
                    <CardTitle className="flex items-center gap-3">
                        <Wrench className="h-5 w-5 text-primary" />
                        {name}
                    </CardTitle>
                     {isSilent && (
                        <div className="flex items-center gap-2 text-sm text-amber-400 p-2 bg-amber-500/10 rounded-lg">
                            <Info className="h-4 w-4" />
                            <span>Ferramenta Silenciosa</span>
                        </div>
                    )}
                </div>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                <Accordion type="multiple" className="w-full">
                    <AccordionItem value="params">
                        <AccordionTrigger>
                             <div className="flex items-center gap-2">
                                <Terminal className="h-4 w-4" /> Parâmetros de Entrada
                            </div>
                        </AccordionTrigger>
                        <AccordionContent>
                            {renderSchema(inputSchema)}
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="behavior">
                        <AccordionTrigger>
                            <div className="flex items-center gap-2">
                                <GitBranch className="h-4 w-4" /> Comportamento do Fluxo
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-4">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <CheckCircle className="h-5 w-5 text-green-500" />
                                    <h4 className="font-semibold">Em caso de Sucesso:</h4>
                                </div>
                                {isSilent ? (
                                    <p className="text-sm text-muted-foreground pl-7">
                                        O fluxo da IA é **finalizado** para evitar mensagens redundantes. A ferramenta já realiza a ação final (ex: envia a mídia, transfere o atendimento).
                                    </p>
                                ) : (
                                    <p className="text-sm text-muted-foreground pl-7">
                                        O resultado da ferramenta é enviado de volta para a IA, que inicia um **novo turno de pensamento** para decidir o próximo passo (ex: confirmar uma ação para o cliente).
                                    </p>
                                )}
                            </div>
                             <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <AlertTriangle className="h-5 w-5 text-destructive" />
                                    <h4 className="font-semibold">Em caso de Falha:</h4>
                                </div>
                                <p className="text-sm text-muted-foreground pl-7">
                                    A mensagem de erro retornada pela ferramenta é enviada para a IA, que inicia um **novo turno de pensamento** para decidir como lidar com o erro (ex: informar o cliente sobre a falha, tentar novamente ou transferir para um humano).
                                </p>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </CardContent>
        </Card>
    );
};


export const ToolDocumentation = ({ categorizedTools }: { categorizedTools: Record<string, SerializableToolDefinition[]> }) => {
    return (
        <>
            {Object.entries(categorizedTools).map(([category, tools]) => {
                if (tools.length === 0) return null;
                const Icon = categoryIcons[category] || Wrench;
                return (
                    <motion.div 
                        key={category}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="space-y-4"
                    >
                        <h2 className="text-2xl font-bold flex items-center gap-3 border-b pb-2 mb-4">
                            <Icon className="h-6 w-6 text-primary/80"/>
                            {category}
                        </h2>
                        {tools.map(tool => (
                            <ToolCard key={tool.name} tool={tool} />
                        ))}
                    </motion.div>
                );
            })}
        </>
    );
};
