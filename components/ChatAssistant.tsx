
import React, { useState, useRef, useEffect } from 'react';
import { Chat } from '@google/genai';
import { createChatSession, sendMessageToGemini } from '../services/geminiService';
import { telegram } from '../services/telegramService';
import { ChatMessage } from '../types';

export const ChatAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && !chatSession) {
      // Initialize session when first opened
      const session = createChatSession();
      setChatSession(session);
      // Initial greeting
      setMessages([{
        id: 'init',
        role: 'model',
        text: 'Боец! Командир на связи. Есть вопросы по тактике, продажам или дисциплине?',
        timestamp: new Date().toISOString()
      }]);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen, isTyping]);

  const toggleChat = () => {
    setIsOpen(!isOpen);
    telegram.haptic('medium');
  };

  const handleSend = async () => {
    if (!inputText.trim() || !chatSession) return;

    const userText = inputText;
    setInputText('');
    setIsTyping(true);
    telegram.haptic('light');

    // Add user message
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: userText,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMsg]);

    // Get response
    const responseText = await sendMessageToGemini(chatSession, userText);
    
    setIsTyping(false);
    telegram.haptic('success');

    // Add model response
    const modelMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'model',
      text: responseText,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, modelMsg]);
  };

  if (!isOpen) {
    return (
      <button 
        onClick={toggleChat}
        className="fixed bottom-24 right-4 z-[140] w-14 h-14 bg-[#6C5DD3] rounded-full shadow-2xl shadow-[#6C5DD3]/40 flex items-center justify-center text-white border-2 border-white/20 active:scale-90 transition-transform animate-fade-in group"
      >
        <span className="text-2xl group-hover:scale-110 transition-transform">💬</span>
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-[#14161B] animate-pulse"></div>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex flex-col justify-end sm:justify-center sm:items-center sm:p-6 animate-fade-in">
      <div 
        className="bg-[#14161B] w-full sm:w-[400px] h-[85vh] sm:h-[600px] sm:rounded-[2.5rem] rounded-t-[2.5rem] flex flex-col shadow-2xl border border-white/10 overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 bg-[#1F2128] border-b border-white/5 flex justify-between items-center relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#6C5DD3] flex items-center justify-center text-xl relative">
              👮‍♂️
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#1F2128] rounded-full"></div>
            </div>
            <div>
              <h3 className="text-white font-black text-sm">ШТАБ (AI)</h3>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Online</p>
            </div>
          </div>
          <button 
            onClick={toggleChat}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
          <div className="absolute inset-0 bg-black/80 pointer-events-none z-0"></div>
          
          <div className="relative z-10 space-y-4">
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-[#6C5DD3] text-white rounded-tr-sm shadow-lg' 
                      : 'bg-[#252830] text-white/90 border border-white/5 rounded-tl-sm shadow-md'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-[#252830] p-4 rounded-2xl rounded-tl-sm border border-white/5 flex gap-1">
                  <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce delay-100"></div>
                  <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce delay-200"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="p-4 bg-[#1F2128] border-t border-white/5 relative z-10">
          <div className="flex gap-2">
            <input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Вопрос командиру..."
              className="flex-1 bg-black/30 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm font-medium outline-none focus:border-[#6C5DD3] transition-colors placeholder:text-white/20"
            />
            <button 
              onClick={handleSend}
              disabled={!inputText.trim() || isTyping}
              className="w-12 h-12 bg-[#6C5DD3] rounded-2xl flex items-center justify-center text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#5b4eb5] active:scale-95 transition-all"
            >
              ➤
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
