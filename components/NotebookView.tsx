
import React, { useState } from 'react';
import { NotebookEntry } from '../types';
import { telegram } from '../services/telegramService';
import { XPService, XP_RULES } from '../services/xpService';

interface NotebookViewProps {
  entries: NotebookEntry[];
  onUpdate: (entries: NotebookEntry[]) => void;
  onBack: () => void;
  onXPEarned: (amount: number) => void;
}

export const NotebookView: React.FC<NotebookViewProps> = ({ entries, onUpdate, onXPEarned }) => {
  const [activeTab, setActiveTab] = useState<'IDEA' | 'GRATITUDE'>('IDEA');
  const [inputText, setInputText] = useState('');

  // Filter: IDEA tab shows IDEA and NOTE types. GRATITUDE shows GRATITUDE.
  const filteredEntries = entries.filter(e => 
      activeTab === 'IDEA' ? (e.type === 'IDEA' || e.type === 'NOTE') : e.type === 'GRATITUDE'
  );

  const addEntry = () => {
      if (!inputText.trim()) return;
      telegram.haptic('light');
      
      const type = activeTab === 'GRATITUDE' ? 'GRATITUDE' : 'IDEA';
      
      const newEntry: NotebookEntry = {
          id: Date.now().toString(),
          text: inputText,
          isChecked: false,
          type: type,
          date: new Date().toISOString()
      };
      
      onUpdate([...entries, newEntry]);
      
      // Calculate and award XP
      const xp = XPService.calculateNotebookXP(type);
      if (xp > 0) {
          onXPEarned(xp);
      }

      setInputText('');
  };

  const deleteEntry = (id: string) => {
      onUpdate(entries.filter(e => e.id !== id));
  };

  return (
    <div className="px-6 pt-10 pb-32 max-w-2xl mx-auto space-y-8 animate-fade-in">
       <div>
            <span className="text-[#6C5DD3] text-[10px] font-black uppercase tracking-[0.3em] mb-2 block">Personal Logs</span>
            <h1 className="text-4xl font-black text-text-primary tracking-tighter">БЛОКНОТ <br/><span className="text-text-secondary opacity-30">ВОИНА</span></h1>
       </div>

       {/* Tabs - Only Notes and Gratitude now */}
       <div className="grid grid-cols-2 gap-2">
             {[
                 { id: 'IDEA', label: 'Заметки / Инсайты', icon: '💡', xp: XP_RULES.NOTEBOOK_HOMEWORK_LOG },
                 { id: 'GRATITUDE', label: 'Благодарности', icon: '🙏', xp: XP_RULES.NOTEBOOK_GRATITUDE },
             ].map(tab => (
                 <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`py-3.5 px-4 rounded-2xl text-left transition-all relative overflow-hidden border ${
                        activeTab === tab.id 
                        ? 'bg-[#1F2128] text-white border-[#6C5DD3]/50 shadow-lg' 
                        : 'bg-surface text-text-secondary border-border-color hover:bg-black/5'
                    }`}
                 >
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-xl">{tab.icon}</span>
                        <span className="text-[9px] font-black bg-[#6C5DD3]/20 text-[#6C5DD3] px-1.5 py-0.5 rounded">+{tab.xp} XP</span>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider block">{tab.label}</span>
                 </button>
             ))}
       </div>

       {/* Quick Add */}
       <div className="flex gap-3">
            <input 
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addEntry()}
                placeholder={`Новая запись (${activeTab === 'GRATITUDE' ? 'Кому/Чему благодарен?' : 'Мысль, инсайт, задача...'})`}
                className="flex-1 bg-surface border border-border-color rounded-2xl px-5 py-4 text-sm font-bold text-text-primary focus:border-[#6C5DD3] outline-none shadow-sm transition-all"
            />
            <button onClick={addEntry} className="w-14 h-14 bg-[#6C5DD3] text-white rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-[#6C5DD3]/20 active:scale-95 transition-all">+</button>
       </div>

       {/* List */}
       <div className="space-y-3">
            {filteredEntries.length === 0 ? (
                <div className="text-center py-20 opacity-30">
                    <p className="text-text-secondary text-xs font-black uppercase tracking-widest">
                        {activeTab === 'GRATITUDE' ? 'Запиши первую благодарность' : 'Записей пока нет'}
                    </p>
                </div>
            ) : (
                filteredEntries.map((item, i) => (
                    <div 
                        key={item.id} 
                        className="bg-surface p-4 rounded-[1.5rem] border border-border-color flex items-center gap-4 animate-slide-up group transition-all"
                        style={{ animationDelay: `${i*0.05}s` }}
                    >
                        <div className="w-10 h-10 rounded-xl bg-body flex items-center justify-center text-lg shadow-inner flex-shrink-0">
                            {item.type === 'GRATITUDE' ? '🙏' : '📝'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-text-primary leading-snug break-words">
                                {item.text}
                            </p>
                            <p className="text-[9px] text-text-secondary mt-1 font-mono uppercase">
                                {new Date(item.date).toLocaleDateString('ru-RU')} • {new Date(item.date).toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'})}
                            </p>
                        </div>
                        <button onClick={() => deleteEntry(item.id)} className="w-8 h-8 flex items-center justify-center text-text-secondary opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all">✕</button>
                    </div>
                ))
            )}
       </div>
    </div>
  );
};
