
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
    <div className="space-y-5 pb-8">
        {modules.map((module, index) => {
            const isLocked = userProgress.level < module.minLevel;
            const completedCount = module.lessons.filter(l => userProgress.completedLessonIds.includes(l.id)).length;
            const totalCount = module.lessons.length;
            const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
            
            // Refined Palette
            const accentColor = module.category === 'SALES' ? '#10B981' : // Emerald
                                module.category === 'PSYCHOLOGY' ? '#8B5CF6' : // Violet
                                module.category === 'TACTICS' ? '#EF4444' : // Red
                                '#6C5DD3'; // Default Purple

            // Calculate module number (Index + 1 padded)
            const moduleNum = (index + 1).toString().padStart(2, '0');

            return (
                <div 
                    key={module.id}
                    onClick={() => handleModuleClick(module, isLocked)}
                    className={`
                        relative w-full rounded-[2.5rem] overflow-hidden transition-all duration-300 group select-none
                        ${shakingId === module.id ? 'animate-shake' : ''}
                        ${isLocked ? 'grayscale opacity-80' : 'cursor-pointer hover:scale-[1.01] active:scale-[0.99] shadow-xl'}
                    `}
                    style={{ 
                        backgroundColor: '#14161B',
                        boxShadow: isLocked ? 'none' : `0 10px 30px -10px ${accentColor}40`
                    }}
                >
                    {/* Top Accent Line */}
                    <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: accentColor }}></div>

                    {/* Background Pattern */}
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 mix-blend-overlay"></div>
                    
                    {/* Content Container */}
                    <div className="relative z-10 p-6 flex flex-col h-full min-h-[160px] justify-between">
                        
                        {/* Header: Number & Status */}
                        <div className="flex justify-between items-start">
                            <div>
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 block mb-1">Module</span>
                                <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-white/10 leading-none tracking-tighter" style={{ textShadow: `0 0 30px ${accentColor}20` }}>
                                    {moduleNum}
                                </h2>
                            </div>
                            
                            {isLocked ? (
                                <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                                    <span className="text-xl">🔒</span>
                                </div>
                            ) : (
                                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${accentColor}20`, color: accentColor, border: `1px solid ${accentColor}40` }}>
                                    <span className="text-xs font-black">{progressPercent}%</span>
                                </div>
                            )}
                        </div>

                        {/* Middle: Title */}
                        <div className="mt-4 mb-4">
                            <h3 className="text-xl font-bold text-white leading-tight mb-1 line-clamp-2">
                                {module.title}
                            </h3>
                            <p className="text-[10px] font-bold uppercase tracking-wider opacity-60" style={{ color: accentColor }}>
                                {module.category} SERIES
                            </p>
                        </div>

                        {/* Bottom: Progress Bar */}
                        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div 
                                className="h-full transition-all duration-1000 ease-out relative"
                                style={{ width: `${progressPercent}%`, backgroundColor: accentColor }}
                            >
                                <div className="absolute right-0 top-0 bottom-0 w-2 bg-white/50 blur-[2px]"></div>
                            </div>
                        </div>
                        
                        <div className="flex justify-between items-center mt-2">
                            <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">{completedCount}/{totalCount} completed</span>
                            {!isLocked && (
                                <span className="text-[9px] font-black uppercase tracking-widest flex items-center gap-1 group-hover:gap-2 transition-all" style={{ color: accentColor }}>
                                    Start <span className="text-lg leading-none">→</span>
                                </span>
                            )}
                            {isLocked && (
                                <span className="text-[9px] font-bold text-red-500 uppercase tracking-widest">
                                    Locked (Lvl {module.minLevel})
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
