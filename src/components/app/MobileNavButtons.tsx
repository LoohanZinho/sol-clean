
'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface MobileNavButtonsProps {
    menuItems: { id: string; icon: React.ElementType; label: string; }[];
    activeView: string;
    onNavigate: (view: string) => void;
}

export const MobileNavButtons = ({ menuItems, activeView, onNavigate }: MobileNavButtonsProps) => {
    return (
        <div className="h-full grid grid-cols-3">
            {menuItems.map((item) => {
                 if (item.id === 'testes') return null; // Não mostra a aba de testes no mobile
                const isActive = activeView === item.id;
                return (
                    <button
                        key={item.id}
                        onClick={() => onNavigate(item.id)}
                        className={cn(
                            "relative flex flex-col items-center justify-center gap-1 transition-colors",
                            isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        <item.icon className="h-6 w-6" />
                        <span className="text-xs font-medium">{item.label}</span>
                        {isActive && (
                            <motion.div
                                layoutId="mobile-active-indicator"
                                className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-10 bg-primary rounded-full"
                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            />
                        )}
                    </button>
                )
            })}
        </div>
    );
};
