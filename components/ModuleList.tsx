
import React, { useState } from 'react';
import { Module, UserProgress, Lesson } from '../types';
import { telegram } from '../services/telegramService';

interface ModuleListProps {
  modules: Module[];
  userProgress: UserProgress;
  onSelectLesson: (lesson: Lesson) => void;
  onBack: () => void;
}

const getYouTubeThumbnail = (url?: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) 
      ? `https://img.youtube.com/vi/${match[2]}/mqdefault.jpg` 
      : null;
};

export const ModuleList: React.FC<ModuleListProps> = ({ modules, userProgress, onSelectLesson }) => {
  const [shakingId, setShakingId] = useState<string | null>(null);
  const isAuthenticated = userProgress.isAuthenticated;

  const handleModuleClick = (module: Module, isLocked: boolean) => {
    if (!isAuthenticated) {
        setShakingId(module.id);
        telegram.haptic('warning');
        telegram.showAlert('Этот модуль доступен только участникам программы. Авторизуйтесь, чтобы начать.', 'Доступ закрыт');
        setTimeout(() => setShakingId(null), 400);
        return;
    }

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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 pb-32">
        {modules.map((module, index) => {
            const isLevelLocked = userProgress.level < module.minLevel;
            const isLocked = (isLevelLocked || !isAuthenticated);
            
            const completedCount = module.lessons.filter(l => userProgress.completedLessonIds.includes(l.id)).length;
            const totalCount = module.lessons.length;
            const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
            const isCompleted = progressPercent === 100;
            
            const bgImage = module.imageUrl || getYouTubeThumbnail(module.videoUrl);

            // Visual Config based on Category
            const getConfig = (cat: string) => {
                switch(cat) {
                    case 'SALES': return { accent: '#10B981', label: 'ПРОДАЖИ', gradient: 'from-emerald-900' };
                    case 'PSYCHOLOGY': return { accent: '#8B5CF6', label: 'ПСИХОЛОГИЯ', gradient: 'from-violet-900' };
                    case 'TACTICS': return { accent: '#F43F5E', label: 'ТАКТИКА', gradient: 'from-rose-900' };
                    default: return { accent: '#6366f1', label: 'БАЗА', gradient: 'from-indigo-900' };
                }
            };

            const style = getConfig(module.category);
            
            return (
                <div 
                    key={module.id}
                    onClick={() => handleModuleClick(module, isLocked)}
                    className={`
                        group relative w-full overflow-hidden rounded-[1.5rem] sm:rounded-[2rem]
                        aspect-[16/9] sm:aspect-[16/10] lg:aspect-[16/9]
                        border border-white/5 bg-[#16181D] shadow-lg
                        transition-all duration-300 active:scale-[0.98]
                        ${isLocked ? 'cursor-not-allowed grayscale-[0.6]' : 'cursor-pointer hover:shadow-xl hover:-translate-y-1'}
                        ${shakingId === module.id ? 'animate-shake' : ''}
                    `}
                    style={{ animationDelay: `${index * 0.05}s` }}
                >
                    {/* BACKGROUND IMAGE LAYER */}
                    <div className="absolute inset-0 z-0">
                        {bgImage ? (
                            <img 
                                src={bgImage} 
                                alt={module.title}
                                className={`w-full h-full object-cover transition-transform duration-700 ease-out ${isLocked ? 'scale-100 opacity-40' : 'group-hover:scale-110 opacity-70'}`}
                            />
                        ) : (
                            <div className={`w-full h-full bg-gradient-to-br ${style.gradient} to-[#16181D] opacity-30`}></div>
                        )}
                        {/* SMOOTH GRADIENT OVERLAY */}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/50 to-transparent"></div>
                    </div>

                    {/* TOP BAR (STATUS & TAGS) */}
                    <div className="absolute top-3 left-3 right-3 flex justify-between items-start z-10">
                         <span 
                            className="px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest backdrop-blur-md border border-white/5 shadow-sm"
                            style={{ backgroundColor: `${style.accent}20`, color: style.accent, borderColor: `${style.accent}30` }}
                         >
                             {style.label}
                         </span>

                         <div className="flex gap-2">
                            {isCompleted && (
                                <div className="w-6 h-6 rounded-full bg-[#00B050] flex items-center justify-center shadow-lg shadow-green-500/40 animate-scale-in">
                                    <span className="text-white font-black text-[9px]">✓</span>
                                </div>
                            )}
                            {isLocked && (
                                <div className="w-6 h-6 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center">
                                    <span className="text-[10px]">🔒</span>
                                </div>
                            )}
                         </div>
                    </div>

                    {/* CONTENT LAYER */}
                    <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5 z-10 flex flex-col justify-end h-full pointer-events-none">
                        <div className="mt-auto">
                            <h3 className="text-sm sm:text-base font-black text-white leading-tight mb-1 line-clamp-2 drop-shadow-sm group-hover:text-white transition-colors">
                                {module.title}
                            </h3>
                            
                            <p className="text-[9px] sm:text-[10px] font-medium text-white/60 line-clamp-2 mb-3 leading-relaxed">
                                {module.description}
                            </p>

                            {/* COMPACT PROGRESS BAR */}
                            <div className="flex items-center gap-2">
                                <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm">
                                     <div 
                                        className="h-full rounded-full transition-all duration-700 ease-out relative" 
                                        style={{ 
                                            width: `${isLocked ? 0 : progressPercent}%`, 
                                            backgroundColor: style.accent,
                                            boxShadow: `0 0 8px ${style.accent}`
                                        }}
                                     ></div>
                                </div>
                                <span className="text-[9px] font-bold min-w-[24px] text-right" style={{ color: isLocked ? '#64748B' : style.accent }}>
                                    {isLocked ? `L${module.minLevel}` : `${Math.round(progressPercent)}%`}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            );
        })}
    </div>
  );
};
