
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Play, Pause, Loader2, AlertCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';

interface WhatsappAudioPlayerProps {
    url?: string | null;
    transcription?: string | null;
    transcriptionStatus?: 'pending' | 'success' | 'failed' | null;
    messageTimestamp?: string;
    profilePicUrl?: string;
}

export const WhatsappAudioPlayer = ({
    url,
    transcription,
    transcriptionStatus,
    messageTimestamp,
    profilePicUrl,
}: WhatsappAudioPlayerProps) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const animationFrameRef = useRef<number>();
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [waveformBars, setWaveformBars] = useState<number[]>([]);
    
    const isPlayable = !!url; 

    useEffect(() => {
        const bars = Array.from({ length: 30 }, () => Math.random() * 0.8 + 0.2);
        setWaveformBars(bars);
    }, []);

    const animate = useCallback(() => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
            animationFrameRef.current = requestAnimationFrame(animate);
        }
    }, []);

    const stopAnimate = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }
    }, []);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const setAudioData = () => {
            if (isFinite(audio.duration)) {
                setDuration(audio.duration);
            }
        };

        const handleAudioEnd = () => {
             setIsPlaying(false);
             stopAnimate();
             if(audioRef.current) {
                setCurrentTime(0);
                audioRef.current.currentTime = 0;
             }
        }
        
        audio.addEventListener('durationchange', setAudioData);
        audio.addEventListener('loadedmetadata', setAudioData); // Keep for some browser cases
        audio.addEventListener('ended', handleAudioEnd);

        if(audio.readyState > 0 && isFinite(audio.duration)) {
            setAudioData();
        }

        return () => {
            audio.removeEventListener('durationchange', setAudioData);
            audio.removeEventListener('loadedmetadata', setAudioData);
            audio.removeEventListener('ended', handleAudioEnd);
            stopAnimate();
        };
    }, [url, stopAnimate]);
    
    const togglePlayPause = () => {
        const audio = audioRef.current;
        if (!audio || !isPlayable) return;

        const isCurrentlyPlaying = !isPlaying;
        setIsPlaying(isCurrentlyPlaying);

        if (isCurrentlyPlaying) {
            audio.play().catch(e => {
                console.error("Error playing audio:", e)
                setIsPlaying(false);
            });
            animationFrameRef.current = requestAnimationFrame(animate);
        } else {
            audio.pause();
            stopAnimate();
        }
    };

    const formatTime = (timeInSeconds: number) => {
        if (isNaN(timeInSeconds) || timeInSeconds === 0) return '0:00';
        const minutes = Math.floor(timeInSeconds / 60);
        const seconds = Math.floor(timeInSeconds % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };
    
    const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
    
    const renderTranscriptionArea = () => {
        if (!transcription && transcriptionStatus === 'pending') {
            return (
                <div className="flex items-center gap-2 text-sm italic text-muted-foreground/80 mt-2">
                    <Loader2 className="h-4 w-4 animate-pulse-subtle" />
                    <span>Transcrevendo áudio...</span>
                </div>
            );
        }
        if (transcriptionStatus === 'failed') {
            return (
                <div className="flex items-center gap-2 text-sm text-red-400/80 mt-2">
                    <AlertCircle className="h-4 w-4" />
                    <span>Falha na transcrição.</span>
                </div>
            );
        }
        if (transcription) {
            return <p className="text-sm italic text-foreground/90 mt-2">"{transcription}"</p>;
        }
        return null;
    };


    return (
        <div className="w-full max-w-xs space-y-2">
             <audio ref={audioRef} src={url || undefined} preload="metadata" className="hidden" />
            <div className="flex items-center gap-2 w-full">
                <button onClick={togglePlayPause} disabled={!isPlayable} className="flex-shrink-0 h-10 w-10 bg-green-500 rounded-full flex items-center justify-center text-white focus:outline-none focus:ring-2 focus:ring-green-400 disabled:bg-gray-500 disabled:cursor-not-allowed">
                     {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5"/>}
                </button>
                
                <div className="flex-grow h-10 flex items-center relative">
                     <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-[3px] bg-gray-400/50 rounded-full" />
                     <div 
                        className="absolute left-0 top-1/2 -translate-y-1/2 h-[3px] bg-green-500 rounded-full"
                        style={{ width: `${progressPercentage}%` }}
                    />
                    
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center h-full w-full gap-[2px]">
                        {waveformBars.map((height, index) => {
                             const isPlayed = (index / waveformBars.length) * 100 < progressPercentage;
                             return (
                                <div 
                                    key={index} 
                                    className={cn("rounded-full", isPlayed ? 'bg-green-500' : 'bg-gray-400')}
                                    style={{
                                        width: '3px',
                                        height: `${height * 60}%`,
                                        maxHeight: '20px'
                                    }}
                                />
                             )
                        })}
                    </div>
                     <div
                        className="absolute top-1/2 -translate-y-1/2"
                        style={{ left: `calc(${progressPercentage}% - 6px)` }}
                    >
                        <div className="w-3 h-3 bg-green-500 rounded-full shadow" />
                    </div>
                </div>

                <div className="flex-shrink-0 w-10 h-10 relative">
                     <Avatar className="h-10 w-10">
                        <AvatarImage src={profilePicUrl || undefined} alt="User Avatar" />
                        <AvatarFallback>?</AvatarFallback>
                    </Avatar>
                     <div className="absolute bottom-[-2px] right-[-2px] bg-green-500 rounded-full p-1 border-2 border-muted/80">
                         <svg width="10" height="10" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2C10.343 2 9 3.343 9 5V12C9 13.657 10.343 15 12 15C13.657 15 15 13.657 15 12V5C15 3.343 13.657 2 12 2Z" fill="white"/>
                            <path d="M19 10V12C19 15.866 15.866 19 12 19C8.134 19 5 15.866 5 12V10H7V12C7 14.761 9.239 17 12 17C14.761 17 17 14.761 17 12V10H19Z" fill="white"/>
                        </svg>
                    </div>
                </div>
            </div>
             <div className="flex justify-between items-center px-1">
                <span className="text-xs text-muted-foreground">{formatTime(duration)}</span>
                <span className="text-xs text-muted-foreground">{messageTimestamp}</span>
            </div>
             {renderTranscriptionArea()}
        </div>
    );
};
