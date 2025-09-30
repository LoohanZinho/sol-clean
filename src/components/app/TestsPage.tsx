
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Loader2, Zap } from 'lucide-react';
import { ToolDocumentation } from './ToolDocumentation';
import { getToolDefinitions, CategorizedTools } from '@/actions/testsActions';


export const TestsPage = () => {
    const [tools, setTools] = useState<CategorizedTools>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTools = async () => {
            try {
                const toolDefs = await getToolDefinitions();
                setTools(toolDefs);
            } catch (error) {
                console.error("Failed to fetch tool definitions:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchTools();
    }, []);

    return (
        <div className="flex-1 flex flex-col">
            <header className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <Zap className="h-7 w-7 text-primary" />
                        Features & Ferramentas da IA
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        Este é o catálogo de todas as ações que a IA pode executar, agrupadas por sua principal função.
                    </p>
                </div>
            </header>

            <main className="space-y-8">
                 {loading ? (
                    <div className="flex items-center justify-center p-16">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <ToolDocumentation categorizedTools={tools} />
                )}
            </main>
        </div>
    );
};
