
'use client';

import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from 'lucide-react';

type DaySchedule = {
    enabled: boolean;
    start: string;
    end: string;
};

export const BusinessOperatingHours = ({ userId }: { userId: string }) => {
    const [schedule, setSchedule] = useState<Record<string, DaySchedule>>({});
    const [loading, setLoading] = useState(true);

    const daysOfWeek = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
    const displayDays: Record<string, string> = {
        segunda: 'Segunda-feira',
        terca: 'Terça-feira',
        quarta: 'Quarta-feira',
        quinta: 'Quinta-feira',
        sexta: 'Sexta-feira',
        sabado: 'Sábado',
        domingo: 'Domingo',
    };
    
    useEffect(() => {
        if (!userId) return;
        const firestore = getFirebaseFirestore();
        const docRef = doc(firestore, 'users', userId, 'settings', 'businessHours');
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists() && docSnap.data()) {
                setSchedule(docSnap.data());
            } else {
                const defaultSchedule = daysOfWeek.reduce((acc, day) => {
                    acc[day] = { enabled: true, start: '08:00', end: '18:00' };
                    return acc;
                }, {} as Record<string, DaySchedule>);
                setSchedule(defaultSchedule);
            }
            setLoading(false);
        }, (error) => {
            console.error("Error fetching business operating hours:", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [userId]);

    const handleUpdate = async (day: string, field: 'enabled' | 'start' | 'end', value: any) => {
        const newSchedule = { 
            ...schedule,
            [day]: { ...schedule[day], [field]: value }
        };
        setSchedule(newSchedule);

        try {
            const firestore = getFirebaseFirestore();
            const docRef = doc(firestore, 'users', userId, 'settings', 'businessHours');
            await setDoc(docRef, newSchedule, { merge: true });
        } catch (error) {
            console.error("Error updating business operating hours:", error);
        }
    };
    
    if (loading) {
        return <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
    }

    return (
        <div className="space-y-6 pt-2">
            <Card className="pt-6">
                <CardContent className="p-0">
                    <div className="divide-y divide-border">
                    {daysOfWeek.map(day => (
                            <div key={day} className="p-4 md:p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor={`op-switch-${day}`} className="text-base font-medium text-foreground">{displayDays[day]}</Label>
                                    <Switch
                                        checked={schedule[day]?.enabled ?? false}
                                        onCheckedChange={(checked) => handleUpdate(day, 'enabled', checked)}
                                        id={`op-switch-${day}`}
                                        disabled={!userId}
                                    />
                                </div>
                            
                                <div style={{ opacity: schedule[day]?.enabled ? 1 : 0.5, transition: 'opacity 0.2s' }} className="flex items-center gap-2 pl-4 border-l-2 border-border ml-2 pt-4 pb-2">
                                    <Input
                                        type="time"
                                        className="w-full sm:w-32 bg-transparent"
                                        value={schedule[day]?.start || '08:00'}
                                        onChange={(e) => handleUpdate(day, 'start', e.target.value)}
                                        disabled={!schedule[day]?.enabled || !userId}
                                    />
                                    <span className="text-muted-foreground">às</span>
                                    <Input
                                        type="time"
                                        className="w-full sm:w-32 bg-transparent"
                                        value={schedule[day]?.end || '18:00'}
                                        onChange={(e) => handleUpdate(day, 'end', e.target.value)}
                                        disabled={!schedule[day]?.enabled || !userId}
                                    />
                                </div>
                            </div>
                    ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
