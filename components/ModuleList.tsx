
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
    <div className="grid grid-cols-1 gap-3 pb-24 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => {
            const isLocked = userProgress.level < module.minLevel;
            const completedCount = module.lessons.filter(l => userProgress.completedLessonIds.includes(l.id)).length;
            const totalCount = module.lessons.length;
            const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
            const isCompleted = progressPercent === 100;
            
            // Visual Config based on Category
            const getConfig = (cat: string) => {
                switch(cat) {
                    case 'SALES': return { 
                        bg: 'from-emerald-900/40 to-emerald-950/80',
                        border: 'border-emerald-500/20 hover:border-emerald-500/40',
                        accent: '#10B981', 
                        shadow: 'shadow-emerald-500/10',
                        icon: '💰'
                    };
                    case 'PSYCHOLOGY': return { 
                        bg: 'from-violet-900/40 to-violet-950/80',
                        border: 'border-violet-500/20 hover:border-violet-500/40',
                        accent: '#8B5CF6', 
                        shadow: 'shadow-violet-500/10',
                        icon: '🧠' 
                    };
                    case 'TACTICS': return { 
                        bg: 'from-rose-900/40 to-rose-950/80',
                        border: 'border-rose-500/20 hover:border-rose-500/40',
                        accent: '#F43F5E', 
                        shadow: 'shadow-rose-500/10',
                        icon: '⚔️' 
                    };
                    default: return { 
                        bg: 'from-blue-900/40 to-blue-950/80',
                        border: 'border-blue-500/20 hover:border-blue-500/40',
                        accent: '#6C5DD3', 
                        shadow: 'shadow-blue-500/10',
                        icon: '🛡️' 
                    };
                }
            };

            const style = getConfig(module.category);
            // Dynamic classes based on state
            const stateClasses = isLocked 
                ? 'opacity-70 grayscale border-white/5 bg-[#16181D]' 
                : `bg-gradient-to-br ${style.bg} ${style.border} ${style.shadow} hover:-translate-y-1 hover:shadow-xl`;

            return (
                <div 
                    key={module.id}
                    onClick={() => handleModuleClick(module, isLocked)}
                    className={`
                        relative w-full rounded-2xl overflow-hidden transition-all duration-300
                        border flex flex-col justify-between group h-full min-h-[140px]
                        ${shakingId === module.id ? 'animate-shake' : ''}
                        ${stateClasses}
                    `}
                >
                    {/* Background Texture */}
                    {!isLocked && <div className="absolute inset-0 opacity-[0.05] bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] pointer-events-none"></div>}
                    
                    {/* Glow Effect on Hover */}
                    {!isLocked && <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>}

                    <div className="p-4 flex flex-col h-full relative z-10">
                        {/* Top Row: Icon & Status */}
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-2.5">
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg shadow-inner border border-white/5 ${isLocked ? 'bg-white/5 text-white/20' : 'bg-black/20 text-white'}`}>
                                    {style.icon}
                                </div>
                                <div className="flex flex-col">
                                    <span 
                                        className="text-[8px] font-black uppercase tracking-[0.2em] mb-0.5"
                                        style={{ color: isLocked ? '#64748B' : style.accent }}
                                    >
                                        {module.category}
                                    </span>
                                    {isLocked && <span className="text-[8px] font-bold text-white/30 uppercase">Lvl {module.minLevel}+</span>}
                                </div>
                            </div>
                            
                            {/* Status Indicator */}
                            <div className="flex-shrink-0">
                                 {isLocked ? (
                                     <div className="w-6 h-6 rounded-full bg-black/30 border border-white/5 flex items-center justify-center">
                                        <svg className="w-3 h-3 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                     </div>
                                 ) : isCompleted ? (
                                     <div className="w-6 h-6 rounded-full bg-[#00B050]/20 border border-[#00B050]/50 flex items-center justify-center">
                                        <span className="text-[#00B050] font-black text-[9px]">✓</span>
                                     </div>
                                 ) : (
                                     <div className="w-6 h-6 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                                        <svg className="w-3 h-3 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                                     </div>
                                 )}
                             </div>
                        </div>

                        {/* Title */}
                        <h3 className={`text-sm font-extrabold leading-tight line-clamp-2 mb-auto ${isLocked ? 'text-white/40' : 'text-white'}`}>
                            {module.title}
                        </h3>

                        {/* Progress Bar */}
                        <div className="mt-4">
                             <div className="flex justify-between items-end mb-1.5">
                                 <span className="text-[9px] font-bold text-white/40">
                                     {completedCount} <span className="opacity-50">/ {totalCount}</span>
                                 </span>
                                 {!isLocked && (
                                     <span className="text-[9px] font-black" style={{ color: style.accent }}>
                                         {progressPercent}%
                                     </span>
                                 )}
                             </div>
                             
                             <div className="w-full h-1 bg-black/30 rounded-full overflow-hidden">
                                 <div 
                                    className="h-full rounded-full transition-all duration-700 ease-out relative" 
                                    style={{ 
                                        width: `${progressPercent}%`, 
                                        backgroundColor: isLocked ? '#334155' : style.accent
                                    }}
                                 >
                                     {!isLocked && <div className="absolute top-0 right-0 w-2 h-full bg-white/60 blur-[1px]"></div>}
                                 </div>
                             </div>
                        </div>
                    </div>
                </div>
            );
        })}
    </div>
  );
};
