
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
    <div className="grid grid-cols-1 gap-4 pb-32 sm:grid-cols-2 lg:grid-cols-3">
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
                    case 'SALES': return { accent: '#10B981', icon: '💰', gradient: 'from-emerald-900/80 to-black/80' };
                    case 'PSYCHOLOGY': return { accent: '#8B5CF6', icon: '🧠', gradient: 'from-violet-900/80 to-black/80' };
                    case 'TACTICS': return { accent: '#F43F5E', icon: '⚔️', gradient: 'from-rose-900/80 to-black/80' };
                    default: return { accent: '#6366f1', icon: '🛡️', gradient: 'from-indigo-900/80 to-black/80' };
                }
            };

            const style = getConfig(module.category);
            
            return (
                <div 
                    key={module.id}
                    onClick={() => handleModuleClick(module, isLocked)}
                    className={`
                        relative w-full h-40 sm:h-48 rounded-3xl overflow-hidden transition-all duration-300
                        flex flex-col justify-end group active:scale-[0.97]
                        ${isLocked ? 'cursor-not-allowed opacity-90' : 'hover:shadow-2xl hover:-translate-y-1 cursor-pointer'}
                        ${shakingId === module.id ? 'animate-shake' : ''}
                        shadow-lg shadow-black/20
                    `}
                    style={{ animationDelay: `${index * 0.1}s` }}
                >
                    {/* BACKGROUND LAYER */}
                    <div className="absolute inset-0 bg-[#16181D]">
                        {bgImage ? (
                            <img 
                                src={bgImage} 
                                alt={module.title}
                                className={`w-full h-full object-cover transition-transform duration-[2s] ease-out ${isLocked ? 'scale-100 grayscale-[0.8]' : 'group-hover:scale-110 grayscale-[0.2]'}`}
                            />
                        ) : (
                            <div className="w-full h-full bg-gradient-to-br from-[#1F2128] to-[#16181D]"></div>
                        )}
                        {/* Dynamic Gradient Overlay */}
                        <div className={`absolute inset-0 bg-gradient-to-t ${style.gradient} via-black/40 to-transparent opacity-90`}></div>
                    </div>

                    {/* STATUS INDICATORS (Top Right) */}
                    <div className="absolute top-3 right-3 flex gap-2 z-20">
                        {isCompleted && (
                            <div className="w-6 h-6 rounded-full bg-[#00B050] flex items-center justify-center shadow-lg shadow-green-500/30">
                                <span className="text-white font-black text-[10px]">✓</span>
                            </div>
                        )}
                        {isLocked && (
                            <div className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center">
                                <span className="text-[10px]">🔒</span>
                            </div>
                        )}
                    </div>

                    {/* CONTENT LAYER */}
                    <div className="relative z-10 p-4 w-full">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg leading-none drop-shadow-md filter">{style.icon}</span>
                            <span className="text-[9px] font-black uppercase tracking-widest text-white/60" style={{ color: style.accent }}>
                                {module.category}
                            </span>
                        </div>

                        <h3 className="text-sm font-black text-white leading-tight drop-shadow-lg mb-1 line-clamp-2">
                            {module.title}
                        </h3>
                        
                        <p className="text-[9px] font-medium text-white/70 line-clamp-1 mb-3">
                            {module.description}
                        </p>

                        {/* Progress or Lock Status */}
                        <div className="flex items-center gap-3">
                            {!isLocked ? (
                                <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm border border-white/5">
                                     <div 
                                        className="h-full rounded-full transition-all duration-700 ease-out relative" 
                                        style={{ 
                                            width: `${progressPercent}%`, 
                                            backgroundColor: style.accent,
                                            boxShadow: `0 0 10px ${style.accent}`
                                        }}
                                     ></div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/5 border border-white/5 backdrop-blur-md">
                                    <span className="text-[8px] font-bold text-white/50 uppercase">
                                        {!isAuthenticated ? 'Войдите в профиль' : `Требуется LVL ${module.minLevel}`}
                                    </span>
                                </div>
                            )}
                            
                            {!isLocked && (
                                <span className="text-[9px] font-black" style={{ color: style.accent }}>
                                    {Math.round(progressPercent)}%
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            );
        })}
    </div>
  );
};
