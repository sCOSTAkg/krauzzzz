
import React, { useState } from 'react';
import { Module, UserProgress, Lesson } from '../types';
import { telegram } from '../services/telegramService';

interface ModuleListProps {
  modules: Module[];
  userProgress: UserProgress;
  onSelectLesson: (lesson: Lesson) => void;
  onBack: () => void;
}

export const ModuleList: React.FC<ModuleListProps> = ({ modules, userProgress, onSelectLesson }) => {
  const [shakingId, setShakingId] = useState<string | null>(null);

  const handleModuleClick = (module: Module, isLocked: boolean) => {
    if (isLocked) {
        setShakingId(module.id);
        telegram.haptic('error');
        setTimeout(() => setShakingId(null), 400);
        return;
    }
    
    telegram.haptic('medium');
    const nextLesson = module.lessons.find(l => !userProgress.completedLessonIds.includes(l.id)) || module.lessons[0];
    if (nextLesson) onSelectLesson(nextLesson);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-24">
        {modules.map((module, index) => {
            const isLocked = userProgress.level < module.minLevel;
            const completedCount = module.lessons.filter(l => userProgress.completedLessonIds.includes(l.id)).length;
            const totalCount = module.lessons.length;
            const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
            const isCompleted = progressPercent === 100;
            
            // Dynamic Gradients based on Category
            const getGradient = (cat: string, locked: boolean) => {
                if (locked) return 'bg-[#1F2128]';
                switch(cat) {
                    case 'SALES': return 'bg-gradient-to-br from-emerald-900/40 to-[#1F2128]';
                    case 'PSYCHOLOGY': return 'bg-gradient-to-br from-violet-900/40 to-[#1F2128]';
                    case 'TACTICS': return 'bg-gradient-to-br from-rose-900/40 to-[#1F2128]';
                    default: return 'bg-gradient-to-br from-[#6C5DD3]/20 to-[#1F2128]';
                }
            };

            const accentColor = isLocked ? '#64748B' : (module.category === 'SALES' ? '#10B981' : module.category === 'PSYCHOLOGY' ? '#8B5CF6' : module.category === 'TACTICS' ? '#F43F5E' : '#6C5DD3');

            return (
                <div 
                    key={module.id}
                    onClick={() => handleModuleClick(module, isLocked)}
                    className={`
                        relative w-full rounded-2xl overflow-hidden transition-all duration-200
                        border border-white/5 flex flex-col justify-between
                        ${shakingId === module.id ? 'animate-shake' : ''}
                        ${isLocked ? 'opacity-70 grayscale' : 'cursor-pointer hover:border-white/10 active:scale-[0.98] shadow-lg shadow-black/20'}
                        ${getGradient(module.category, isLocked)}
                    `}
                    style={{ minHeight: '110px' }}
                >
                    <div className="p-4 flex flex-col h-full justify-between relative z-10">
                        {/* Header */}
                        <div className="flex justify-between items-start gap-3">
                            <div className="flex-1">
                                <span 
                                    className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md border mb-2 inline-block"
                                    style={{ color: accentColor, borderColor: `${accentColor}30`, backgroundColor: `${accentColor}10` }}
                                >
                                    {module.category}
                                </span>
                                <h3 className={`text-sm font-bold leading-tight line-clamp-2 ${isLocked ? 'text-slate-500' : 'text-white'}`}>
                                    {module.title}
                                </h3>
                            </div>
                            
                            {/* Icon State */}
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all ${
                                 isLocked 
                                 ? 'border-white/5 text-slate-600 bg-black/20' 
                                 : 'border-white/10 text-white bg-white/5 shadow-inner'
                             }`}>
                                 {isLocked ? (
                                     <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                 ) : (
                                    isCompleted ? <span className="text-green-500 font-bold">✓</span> : 
                                     <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: accentColor }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                 )}
                             </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="mt-4">
                             <div className="flex justify-between items-end mb-1.5">
                                 <span className="text-[9px] font-bold text-slate-500">
                                     {completedCount}/{totalCount}
                                 </span>
                                 <span className="text-[9px] font-black" style={{ color: accentColor }}>
                                     {progressPercent}%
                                 </span>
                             </div>
                             
                             <div className="w-full h-1 bg-black/40 rounded-full overflow-hidden">
                                 <div 
                                    className="h-full rounded-full transition-all duration-500 ease-out" 
                                    style={{ 
                                        width: `${progressPercent}%`, 
                                        backgroundColor: accentColor,
                                        boxShadow: isLocked ? 'none' : `0 0 8px ${accentColor}60`
                                    }}
                                 ></div>
                             </div>
                        </div>
                    </div>

                    {/* Decorative Background Number */}
                    <div className="absolute -right-2 -bottom-6 text-[5rem] font-black leading-none opacity-[0.03] select-none pointer-events-none text-white">
                        {index + 1}
                    </div>
                </div>
            );
        })}
    </div>
  );
};
