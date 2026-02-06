
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
      ? `https://img.youtube.com/vi/${match[2]}/maxresdefault.jpg` 
      : null;
};

export const ModuleList: React.FC<ModuleListProps> = ({ modules, userProgress, onSelectLesson }) => {
  const [shakingId, setShakingId] = useState<string | null>(null);
  const isAuthenticated = userProgress.isAuthenticated;

  const handleModuleClick = (module: Module, isLocked: boolean) => {
    if (!isAuthenticated) {
        setShakingId(module.id);
        telegram.haptic('error');
        telegram.showAlert('Доступ закрыт. Пожалуйста, авторизуйтесь.', 'Security');
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
    <div className="grid grid-cols-1 gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => {
            const isLevelLocked = userProgress.level < module.minLevel;
            const isLocked = isLevelLocked || !isAuthenticated;
            
            const completedCount = module.lessons.filter(l => userProgress.completedLessonIds.includes(l.id)).length;
            const totalCount = module.lessons.length;
            const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
            const isCompleted = progressPercent === 100;
            
            // Resolve Image: Manual -> Video Thumbnail -> Fallback Abstract
            const bgImage = module.imageUrl || getYouTubeThumbnail(module.videoUrl);

            // Visual Config based on Category
            const getConfig = (cat: string) => {
                switch(cat) {
                    case 'SALES': return { 
                        border: 'border-emerald-500/50',
                        accent: '#10B981', 
                        glow: 'shadow-[0_0_30px_-10px_rgba(16,185,129,0.3)]',
                        icon: '💰'
                    };
                    case 'PSYCHOLOGY': return { 
                        border: 'border-violet-500/50',
                        accent: '#8B5CF6', 
                        glow: 'shadow-[0_0_30px_-10px_rgba(139,92,246,0.3)]',
                        icon: '🧠' 
                    };
                    case 'TACTICS': return { 
                        border: 'border-rose-500/50',
                        accent: '#F43F5E', 
                        glow: 'shadow-[0_0_30px_-10px_rgba(244,63,94,0.3)]',
                        icon: '⚔️' 
                    };
                    default: return { 
                        border: 'border-indigo-500/50',
                        accent: '#6366f1', 
                        glow: 'shadow-[0_0_30px_-10px_rgba(99,102,241,0.3)]',
                        icon: '🛡️' 
                    };
                }
            };

            const style = getConfig(module.category);
            
            return (
                <div 
                    key={module.id}
                    onClick={() => handleModuleClick(module, isLocked)}
                    className={`
                        relative w-full aspect-[4/5] sm:aspect-[3/4] rounded-[2rem] overflow-hidden transition-all duration-500 
                        flex flex-col justify-end group active:scale-[0.98] shadow-2xl
                        ${isLocked ? 'grayscale opacity-80 cursor-not-allowed' : 'hover:shadow-2xl hover:-translate-y-1'}
                        ${shakingId === module.id ? 'animate-shake' : ''}
                        border-2 ${style.border}
                    `}
                >
                    {/* BACKGROUND IMAGE LAYER */}
                    <div className="absolute inset-0 bg-[#16181D]">
                        {bgImage ? (
                            <img 
                                src={bgImage} 
                                alt={module.title}
                                className="w-full h-full object-cover transition-transform duration-[2s] ease-out group-hover:scale-110 opacity-80"
                            />
                        ) : (
                            <div className={`w-full h-full bg-gradient-to-br from-[#16181D] to-[#2C2F36] opacity-50`}></div>
                        )}
                        {/* Cinematic Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/60 to-transparent"></div>
                    </div>

                    {/* LOCKED OVERLAY */}
                    {isLocked && (
                        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/40 backdrop-blur-[2px]">
                            <div className="bg-black/60 border border-white/10 rounded-2xl px-5 py-3 flex items-center gap-3 backdrop-blur-md shadow-xl">
                                <span className="text-xl">🔒</span>
                                <div>
                                    <p className="text-[10px] font-black uppercase text-white tracking-widest">Доступ закрыт</p>
                                    <p className="text-[9px] text-white/50">{isAuthenticated ? `Требуется LVL ${module.minLevel}` : 'Авторизуйтесь'}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* CONTENT LAYER */}
                    <div className="relative z-10 p-5 space-y-3">
                        
                        {/* Header Badge */}
                        <div className="flex justify-between items-center mb-auto">
                            <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
                                <span className="text-sm leading-none drop-shadow-md">{style.icon}</span>
                                <span 
                                    className="text-[8px] font-black uppercase tracking-[0.15em]"
                                    style={{ color: style.accent }}
                                >
                                    {module.category}
                                </span>
                            </div>
                            
                            {/* Status */}
                            {isCompleted && (
                                <div className="w-8 h-8 rounded-full bg-[#00B050] flex items-center justify-center shadow-lg shadow-[#00B050]/40">
                                    <span className="text-white font-black text-xs">✓</span>
                                </div>
                            )}
                        </div>

                        {/* Title */}
                        <div>
                            <h3 className="text-xl font-black text-white leading-tight drop-shadow-md line-clamp-2 mb-1">
                                {module.title}
                            </h3>
                            <p className="text-[10px] font-medium text-white/60 line-clamp-2 leading-relaxed">
                                {module.description}
                            </p>
                        </div>

                        {/* Progress Bar */}
                        {!isLocked && (
                             <div className="space-y-1.5 pt-2">
                                 <div className="flex justify-between items-end px-1">
                                     <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">
                                         Прогресс
                                     </span>
                                     <span className="text-[9px] font-black" style={{ color: style.accent }}>
                                         {Math.round(progressPercent)}%
                                     </span>
                                 </div>
                                 <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm border border-white/5">
                                     <div 
                                        className="h-full rounded-full transition-all duration-700 ease-out relative" 
                                        style={{ 
                                            width: `${progressPercent}%`, 
                                            backgroundColor: style.accent,
                                            boxShadow: `0 0 10px ${style.accent}`
                                        }}
                                     ></div>
                                 </div>
                             </div>
                        )}
                        
                        {/* Action Hint */}
                        {!isLocked && (
                            <div className="pt-2 flex items-center gap-2 text-white/30 text-[9px] font-bold uppercase tracking-widest group-hover:text-white transition-colors">
                                <span>Открыть модуль</span>
                                <span className="text-lg leading-none">→</span>
                            </div>
                        )}
                    </div>
                </div>
            );
        })}
    </div>
  );
};
