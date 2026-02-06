
import React, { useState } from 'react';
import { Habit } from '../types';
import { telegram } from '../services/telegramService';

interface HabitTrackerProps {
    habits: Habit[];
    onUpdateHabits: (newHabits: Habit[]) => void;
    onBack: () => void;
}

export const HabitTracker: React.FC<HabitTrackerProps> = ({ habits, onUpdateHabits, onBack }) => {
    const [newHabitTitle, setNewHabitTitle] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    const today = new Date().toISOString().split('T')[0];

    // --- LOGIC ---

    const toggleHabit = (habitId: string, date: string) => {
        telegram.haptic('selection');
        const updated = habits.map(h => {
            if (h.id === habitId) {
                const isCompleted = h.completedDates.includes(date);
                let newDates = isCompleted 
                    ? h.completedDates.filter(d => d !== date)
                    : [...h.completedDates, date];
                
                // Recalculate Streak (Simple version: consecutive days ending today/yesterday)
                // Sort dates desc
                newDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
                let streak = 0;
                let checkDate = new Date();
                
                // If today is completed, start check from today. If not, start from yesterday for streak calculation
                // (Assuming user might do it later today)
                if (newDates.includes(today)) {
                    streak = 1;
                    checkDate.setDate(checkDate.getDate() - 1);
                } else {
                    // If not done today, streak continues only if done yesterday
                    checkDate.setDate(checkDate.getDate() - 1); // Check yesterday
                }

                while (true) {
                    const iso = checkDate.toISOString().split('T')[0];
                    if (newDates.includes(iso)) {
                        streak++;
                        checkDate.setDate(checkDate.getDate() - 1);
                    } else {
                        break;
                    }
                }

                if (!isCompleted) telegram.haptic('success');

                return { ...h, completedDates: newDates, streak };
            }
            return h;
        });
        onUpdateHabits(updated);
    };

    const addHabit = () => {
        if (!newHabitTitle.trim()) return;
        const newHabit: Habit = {
            id: Date.now().toString(),
            title: newHabitTitle,
            streak: 0,
            completedDates: [],
            targetDaysPerWeek: 7,
            icon: '🔥'
        };
        onUpdateHabits([...habits, newHabit]);
        setNewHabitTitle('');
        setIsAdding(false);
        telegram.haptic('success');
    };

    const deleteHabit = (id: string) => {
        if(confirm('Удалить привычку?')) {
            onUpdateHabits(habits.filter(h => h.id !== id));
            telegram.haptic('warning');
        }
    };

    // Calendar Days Generator (Last 5 days + Today + Next 1)
    const getCalendarDays = () => {
        const days = [];
        for (let i = -5; i <= 1; i++) {
            const d = new Date();
            d.setDate(d.getDate() + i);
            days.push(d);
        }
        return days;
    };
    const calendarDays = getCalendarDays();

    return (
        <div className="flex flex-col h-full bg-[#0F1115] text-white animate-fade-in">
            {/* Header */}
            <div className="px-6 pt-[calc(var(--safe-top)+10px)] pb-4 flex items-center justify-between bg-[#0F1115]/90 backdrop-blur-md sticky top-0 z-20 border-b border-white/5">
                <button onClick={onBack} className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center active:scale-90 transition-transform">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[#6C5DD3]">Дисциплина</h2>
                <div className="w-10"></div>
            </div>

            <div className="p-6 space-y-8 pb-32">
                {/* Hero Stats */}
                <div className="bg-gradient-to-r from-[#6C5DD3] to-[#8B5CF6] rounded-[2.5rem] p-6 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-[30px] -mr-10 -mt-10"></div>
                    <div className="relative z-10">
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Всего привычек</span>
                        <h1 className="text-4xl font-black text-white mt-1">{habits.length}</h1>
                        <p className="text-xs font-bold text-white/80 mt-2">
                            {habits.filter(h => h.completedDates.includes(today)).length} выполнено сегодня
                        </p>
                    </div>
                </div>

                {/* Calendar Strip Header (Visual) */}
                <div className="flex justify-between px-2">
                    {calendarDays.map((d, i) => {
                        const iso = d.toISOString().split('T')[0];
                        const isToday = iso === today;
                        return (
                            <div key={i} className={`flex flex-col items-center gap-1 ${isToday ? 'scale-110' : 'opacity-50'}`}>
                                <span className="text-[8px] font-bold uppercase">{['Вс','Пн','Вт','Ср','Чт','Пт','Сб'][d.getDay()]}</span>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black border ${isToday ? 'bg-white text-black border-white' : 'border-white/20'}`}>
                                    {d.getDate()}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Habits List */}
                <div className="space-y-4">
                    {habits.map((habit, idx) => {
                        const isDoneToday = habit.completedDates.includes(today);
                        return (
                            <div key={habit.id} className="bg-[#1F2128] border border-white/5 rounded-[2rem] p-5 animate-slide-up" style={{ animationDelay: `${idx * 0.05}s` }}>
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-[#2C2F36] flex items-center justify-center text-xl shadow-inner">
                                            {habit.icon}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-sm text-white">{habit.title}</h3>
                                            <div className="flex items-center gap-1 text-[10px] text-[#FFAB7B] font-bold uppercase tracking-wide">
                                                <span>🔥</span> {habit.streak} день стрик
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => deleteHabit(habit.id)} className="text-white/20 hover:text-red-500 transition-colors px-2">✕</button>
                                </div>

                                {/* Weekly Dots */}
                                <div className="flex justify-between items-center bg-black/20 rounded-xl p-2">
                                    {calendarDays.map((d, i) => {
                                        const iso = d.toISOString().split('T')[0];
                                        const isDone = habit.completedDates.includes(iso);
                                        const isFuture = d > new Date();
                                        
                                        if (iso === today) {
                                            return (
                                                <button 
                                                    key={i}
                                                    onClick={() => toggleHabit(habit.id, today)}
                                                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isDone ? 'bg-[#00B050] text-white shadow-[0_0_15px_rgba(0,176,80,0.4)]' : 'bg-white/10 hover:bg-white/20 border border-white/10'}`}
                                                >
                                                    {isDone ? '✓' : ''}
                                                </button>
                                            );
                                        }

                                        return (
                                            <div key={i} className={`w-2 h-2 rounded-full ${isFuture ? 'bg-white/5' : isDone ? 'bg-[#00B050]' : 'bg-red-500/30'}`}></div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Add New Button */}
                {isAdding ? (
                    <div className="bg-[#1F2128] border border-[#6C5DD3] rounded-[2rem] p-4 flex items-center gap-3 animate-fade-in">
                        <input 
                            autoFocus
                            value={newHabitTitle}
                            onChange={e => setNewHabitTitle(e.target.value)}
                            placeholder="Название привычки..."
                            className="bg-transparent w-full outline-none text-sm font-bold text-white placeholder:text-white/30"
                            onKeyDown={e => e.key === 'Enter' && addHabit()}
                        />
                        <button onClick={addHabit} className="w-10 h-10 bg-[#6C5DD3] rounded-xl flex items-center justify-center font-bold text-white shadow-lg">OK</button>
                    </div>
                ) : (
                    <button 
                        onClick={() => setIsAdding(true)}
                        className="w-full py-4 border-2 border-dashed border-white/10 rounded-[2rem] text-white/40 font-black uppercase text-xs hover:border-[#6C5DD3] hover:text-[#6C5DD3] transition-all flex items-center justify-center gap-2"
                    >
                        <span>+</span> Добавить Трекер
                    </button>
                )}
            </div>
        </div>
    );
};
