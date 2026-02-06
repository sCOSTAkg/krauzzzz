
import React, { useState, useRef, useEffect } from 'react';
import { createChatSession, sendMessageToGemini } from '../services/geminiService';
import { ChatMessage } from '../types';
import { COURSE_MODULES } from '../constants';
import { telegram } from '../services/telegramService';
import { Chat } from '@google/genai';

export const ChatAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize Chat Session with Course Context
  useEffect(() => {
    if (isOpen && !chatSession) {
      const courseContext = COURSE_MODULES.map(m => 
        `Module: ${m.title} (${m.description}). Lessons: ${m.lessons.map(l => l.title).join(', ')}.`
      ).join('\n');

      const systemInstruction = `
        Ты — "Стратег", искусственный интеллект элитного подразделения продаж "300 Спартанцев".
        Твоя база знаний включает следующие модули курса:
        ${courseContext}
        
        Твоя цель: Отвечать на вопросы бойца (пользователя) кратко, четко, по-военному, но с пользой для продаж.
        Используй терминологию: "боец", "цель", "тактика", "маневр".
        Не давай длинных лекций. Давай конкретные инструкции.
        Если вопрос не касается продаж или курса, ответь: "Отставить разговоры не по теме. Вернемся к задаче."
      `;

      setChatSession(createChatSession(systemInstruction));
      
      // Initial Greeting
      setMessages([{
        id: 'init',
        role: 'model',
        text: 'На связи Стратег. Жду вводных данных. Какая боевая задача?',
        timestamp: new Date().toISOString()
      }]);
    }
  }, [isOpen, chatSession]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || !chatSession) return;
    
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    telegram.haptic('light');

    try {
      const responseText = await sendMessageToGemini(chatSession, userMsg.text);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: new Date().toISOString()
      }]);
      telegram.haptic('medium');
    } catch (error) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: 'Помехи в эфире. Повторите запрос.',
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => { setIsOpen(true); telegram.haptic('selection'); }}
        className="fixed bottom-24 right-5 z-40 w-14 h-14 rounded-full bg-[#6C5DD3] text-white flex items-center justify-center shadow-2xl shadow-[#6C5DD3]/40 active:scale-90 transition-transform animate-fade-in border-2 border-white/10"
      >
        <span className="text-2xl">🤖</span>
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-pulse border-2 border-[#14161B]"></div>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#14161B]/95 backdrop-blur-xl animate-scale-in">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-white/10 bg-[#14161B]">
        <div className="flex items-center gap-3">
           <div className="w-10 h-10 rounded-xl bg-[#6C5DD3]/20 flex items-center justify-center text-xl border border-[#6C5DD3]/30">
             🤖
           </div>
           <div>
             <h3 className="text-white font-black text-sm uppercase tracking-wider">Стратег</h3>
             <p className="text-[#6C5DD3] text-[10px] font-bold animate-pulse">Online • AI-Link Stable</p>
           </div>
        </div>
        <button 
          onClick={() => setIsOpen(false)}
          className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed ${
              msg.role === 'user' 
                ? 'bg-[#6C5DD3] text-white rounded-tr-sm shadow-lg' 
                : 'bg-[#1F2128] border border-white/10 text-white rounded-tl-sm'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
             <div className="bg-[#1F2128] border border-white/10 px-4 py-3 rounded-2xl rounded-tl-sm flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce delay-75"></span>
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce delay-150"></span>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 pb-8 bg-[#14161B] border-t border-white/10">
        <div className="flex gap-2 relative">
          <input 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Запрос в штаб..."
            autoFocus
            className="flex-1 bg-white/5 border border-white/10 rounded-2xl pl-5 pr-12 py-4 text-white placeholder:text-white/20 focus:border-[#6C5DD3] outline-none font-medium transition-all"
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-2 bottom-2 w-10 bg-[#6C5DD3] rounded-xl flex items-center justify-center text-white disabled:opacity-50 disabled:bg-white/5 transition-all active:scale-95"
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
};
