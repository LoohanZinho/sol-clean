

'use client';

import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';

type TimeSlot = {
    start: string;
    end: string;
};

type DaySchedule = {
    enabled: boolean;
    slots: TimeSlot[];
};

export const BusinessHoursSettings = ({ userId }: { userId: string }) => {
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
            if (docSnap.exists()) {
                setSchedule(docSnap.data() || {});
            } else {
                const defaultSchedule = daysOfWeek.reduce((acc, day) => {
                    acc[day] = { enabled: true, slots: [{ start: '08:00', end: '18:00' }] };
                    return acc;
                }, {} as typeof schedule);
                setSchedule(defaultSchedule);
            }
            setLoading(false);
        }, (error) => {
            console.error("Error fetching business hours:", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [userId]);

    const handleUpdate = async (day: string, field: 'enabled' | 'slots', value: any) => {
        const newSchedule = { ...schedule };
        newSchedule[day] = { ...newSchedule[day], [field]: value };
        setSchedule(newSchedule);

        try {
            const firestore = getFirebaseFirestore();
            const docRef = doc(firestore, 'users', userId, 'settings', 'businessHours');
            await setDoc(docRef, newSchedule, { merge: true });
        } catch (error) {
            console.error("Error updating business hours:", error);
        }
    };
    
    const handleSlotChange = (day: string, slotIndex: number, field: 'start' | 'end', value: string) => {
        const daySchedule = schedule[day];
        if (!daySchedule) return;

        const newSlots = [...daySchedule.slots];
        newSlots[slotIndex] = { ...newSlots[slotIndex], [field]: value };
        handleUpdate(day, 'slots', newSlots);
    };

    const addSlot = (day: string) => {
        const daySchedule = schedule[day];
        if (!daySchedule) return;
        
        const newSlots = [...daySchedule.slots, { start: '08:00', end: '18:00' }];
        handleUpdate(day, 'slots', newSlots);
    };

    const removeSlot = (day: string, slotIndex: number) => {
        const daySchedule = schedule[day];
        if (!daySchedule) return;

        const newSlots = daySchedule.slots.filter((_, index) => index !== slotIndex);
        handleUpdate(day, 'slots', newSlots);
    };

    if (loading) {
        return <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold">Horário de Atendimento para Agendamentos</h2>
                <p className="text-muted-foreground mt-1">
                    Defina aqui os dias e horários em que a IA poderá marcar compromissos na sua agenda. A IA só oferecerá e confirmará horários que estejam dentro dos intervalos que você configurar.
                </p>
            </div>
            <Card className="pt-6">
                <CardContent className="p-0">
                    <div className="divide-y divide-border">
                    {daysOfWeek.map(day => (
                            <div key={day} className="p-4 md:p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor={`switch-${day}`} className="text-base font-medium text-foreground">{displayDays[day]}</Label>
                                    <Switch
                                        checked={schedule[day]?.enabled ?? false}
                                        onCheckedChange={(checked) => handleUpdate(day, 'enabled', checked)}
                                        id={`switch-${day}`}
                                        disabled={!userId}
                                    />
                                </div>
                            
                                <div style={{ opacity: schedule[day]?.enabled ? 1 : 0.5, transition: 'opacity 0.2s' }} className="space-y-3 pl-4 border-l-2 border-border ml-2 pt-4 pb-2">
                                    {schedule[day]?.slots?.map((slot, index) => (
                                        <div key={index} className="flex items-center gap-2">
                                            <Input
                                                type="time"
                                                className="w-full sm:w-28 bg-transparent"
                                                value={slot.start}
                                                onChange={(e) => handleSlotChange(day, index, 'start', e.target.value)}
                                                disabled={!schedule[day]?.enabled || !userId}
                                            />
                                            <span className="text-muted-foreground">às</span>
                                            <Input
                                                type="time"
                                                className="w-full sm:w-28 bg-transparent"
                                                value={slot.end}
                                                onChange={(e) => handleSlotChange(day, index, 'end', e.target.value)}
                                                disabled={!schedule[day]?.enabled || !userId}
                                            />
                                            <Button variant="ghost" size="icon" onClick={() => removeSlot(day, index)} disabled={!schedule[day]?.enabled || schedule[day]?.slots.length <= 1}>
                                                <Trash2 className="h-4 w-4 text-destructive"/>
                                            </Button>
                                        </div>
                                    ))}
                                    <Button variant="outline" size="sm" onClick={() => addSlot(day)} disabled={!schedule[day]?.enabled}>
                                        <PlusCircle className="h-4 w-4 mr-2"/>
                                        Adicionar Horário
                                    </Button>
                                </div>
                            </div>
                    ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
