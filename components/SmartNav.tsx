
import React, { useRef, useEffect, useState } from 'react';
import { Tab, UserRole, AppNotification, SmartNavAction } from '../types';
import { telegram } from '../services/telegramService';

interface SmartNavProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  role: UserRole;
  adminSubTab: string;
  setAdminSubTab: (tab: string) => void;
  isLessonActive: boolean;
  onExitLesson: () => void;
  notifications: AppNotification[];
  onClearNotifications: () => void;
  action?: SmartNavAction | null; 
}

export const SmartNav: React.FC<SmartNavProps> = ({ 
  activeTab, 
  setActiveTab, 
  role,
  adminSubTab,
  setAdminSubTab,
  isLessonActive,
  onExitLesson,
  notifications,
  onClearNotifications,
  action
}) => {
  const [expandedPanel, setExpandedPanel] = useState<'NONE' | 'ADMIN' | 'NOTIFICATIONS'>('NONE');
  
  // Swipe State
  const touchStart = useRef<{ x: number, y: number } | null>(null);
  const swipeThreshold = 50;

  // --- STATE MANAGEMENT ---
  const isMainTab = [Tab.HOME, Tab.PROFILE, Tab.ADMIN_DASHBOARD].includes(activeTab);
  const showBackButton = isLessonActive || (!isMainTab && !isLessonActive);
  const unreadCount = notifications.filter(n => !n.isRead).length;

  useEffect(() => {
      if (activeTab === Tab.ADMIN_DASHBOARD) {
          setExpandedPanel('ADMIN');
      } else if (expandedPanel === 'ADMIN') {
          setExpandedPanel('NONE');
      }
  }, [activeTab]);

  const toggleNotifications = () => {
      telegram.haptic('selection');
      setExpandedPanel(prev => prev === 'NOTIFICATIONS' ? 'NONE' : 'NOTIFICATIONS');
  };

  const handleBack = () => {
      telegram.haptic('medium');
      if (expandedPanel !== 'NONE') {
          setExpandedPanel('NONE');
          return;
      }
      if (isLessonActive) onExitLesson();
      else if (!isMainTab) setActiveTab(Tab.HOME);
  };

  const handleTabClick = (tab: Tab) => {
      telegram.haptic('selection');
      if (isLessonActive) onExitLesson(); 
      setActiveTab(tab);
      if (tab !== Tab.ADMIN_DASHBOARD && expandedPanel === 'ADMIN') setExpandedPanel('NONE');
      if (expandedPanel === 'NOTIFICATIONS') setExpandedPanel('NONE');
  };

  // --- SWIPE HANDLERS ---
  const onTouchStart = (e: React.TouchEvent) => {
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
      if (!touchStart.current) return;
      const touchEnd = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      
      const deltaX = touchEnd.x - touchStart.current.x;
      const deltaY = touchEnd.y - touchStart.current.y;

      // Swipe Right (Back)
      if (deltaX > swipeThreshold && Math.abs(deltaY) < swipeThreshold) {
          handleBack();
      }
      
      // Swipe Down (Collapse)
      if (deltaY > swipeThreshold) {
          if (expandedPanel !== 'NONE') {
              setExpandedPanel('NONE');
              telegram.haptic('light');
          }
      }

      touchStart.current = null;
  };

  // --- RENDER HELPERS ---

  const renderAdminLinks = () => (
      <div className="flex gap-1 px-1 pb-2 overflow-x-auto no-scrollbar animate-fade-in">
         {[
            { id: 'OVERVIEW', icon: '📊' },
            { id: 'NEURAL_CORE', icon: '🧠' },
            { id: 'COURSE', icon: '🎓' },
            { id: 'ARENA', icon: '⚔️' },
            { id: 'USERS', icon: '👥' },
            { id: 'SETTINGS', icon: '⚙️' },
         ].map(link => (
             <button
                key={link.id}
                onClick={() => { telegram.haptic('light'); setAdminSubTab(link.id); }}
                className={`flex-shrink-0 flex flex-col items-center justify-center w-14 h-12 rounded-xl border transition-all ${
                    adminSubTab === link.id 
                    ? 'bg-[#6C5DD3] border-[#6C5DD3] text-white shadow-lg' 
                    : 'bg-white/5 border-transparent text-white/40 hover:bg-white/10'
                }`}
             >
                 <span className="text-lg">{link.icon}</span>
             </button>
         ))}
      </div>
  );

  const renderNotifications = () => (
      <div className="px-3 pb-3 max-h-[60vh] overflow-y-auto custom-scrollbar animate-fade-in">
          <div className="flex justify-between items-center mb-4 px-1">
              <span className="text-[10px] font-black uppercase text-white/40 tracking-widest">Центр связи</span>
              <button onClick={onClearNotifications} className="text-[10px] text-red-400 font-bold hover:text-red-300">Очистить</button>
          </div>
          {notifications.length === 0 ? (
              <div className="py-6 text-center text-white/20 text-xs font-bold uppercase">Нет новых сообщений</div>
          ) : (
              <div className="space-y-2">
                  {notifications.map(n => (
                      <div key={n.id} className={`p-3 rounded-xl border flex gap-3 ${
                          n.type === 'ALERT' ? 'bg-red-500/10 border-red-500/30' : 'bg-white/5 border-white/5'
                      }`}>
                          <div className={`w-1 rounded-full ${n.type === 'ALERT' ? 'bg-red-500' : 'bg-[#6C5DD3]'}`}></div>
                          <div className="flex-1">
                              <h4 className="text-xs font-bold text-white leading-tight">{n.title}</h4>
                              <p className="text-[10px] text-white/60 mt-1 leading-snug">{n.message}</p>
                              <span className="text-[8px] text-white/20 mt-1 block">{new Date(n.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                          </div>
                      </div>
                  ))}
              </div>
          )}
      </div>
  );

  const renderAction = () => {
      if (!action) return null;
      
      const variantClasses = {
          primary: 'bg-gradient-to-r from-[#6C5DD3] to-[#8B7FD9] shadow-[#6C5DD3]/40',
          success: 'bg-gradient-to-r from-[#00B050] to-[#34D399] shadow-[#00B050]/40',
          danger: 'bg-gradient-to-r from-red-600 to-red-500 shadow-red-600/40'
      };
      
      return (
          <button 
              onClick={action.onClick}
              disabled={action.loading}
              className={`
                  w-full h-full flex items-center justify-center gap-3 rounded-[1.5rem] 
                  text-white font-black uppercase text-sm tracking-widest shadow-lg
                  active:scale-[0.98] transition-all duration-300 group relative overflow-hidden
                  ${variantClasses[action.variant || 'primary']}
              `}
          >
              {action.loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                  <>
                      {action.icon && <span className="text-lg">{action.icon}</span>}
                      <span>{action.label}</span>
                  </>
              )}
          </button>
      );
  };

  const isExpanded = expandedPanel !== 'NONE';

  return (
    <div className="fixed bottom-6 left-0 right-0 z-[100] flex justify-center pointer-events-none px-4" style={{ paddingBottom: 'var(--safe-bottom)' }}>
      {/* 
          CONTAINER 
          Uses flex to align the main island and the satellite bubble.
      */}
      <div 
        className="flex items-end justify-center relative w-full max-w-[380px] h-[64px]"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        
        {/* --- MAIN DYNAMIC ISLAND (Nav / Content) --- */}
        <div 
            className={`
                pointer-events-auto bg-[#0F1115] shadow-[0_20px_50px_-10px_rgba(0,0,0,0.5)] border border-white/10
                flex flex-col justify-end overflow-hidden relative z-20
                transition-[width,height,border-radius,transform] duration-[500ms] ease-[cubic-bezier(0.32,0.72,0,1)]
                ${isExpanded 
                    ? 'w-full h-auto min-h-[64px] rounded-[2.5rem]' // Expanded Mode
                    : action ? 'w-[200px] h-[64px] rounded-[2rem]' : 'w-[240px] h-[64px] rounded-[2rem]' // Idle Modes
                }
            `}
        >
            <div className="absolute inset-0 opacity-30 pointer-events-none bg-[radial-gradient(circle_at_50%_100%,_rgba(108,93,211,0.25),_transparent_80%)]"></div>

            {/* EXPANDED CONTENT AREA */}
            <div className={`transition-all duration-300 w-full ${isExpanded ? 'opacity-100 delay-100 px-1 pt-4' : 'opacity-0 h-0 pointer-events-none'}`}>
                {expandedPanel === 'ADMIN' && renderAdminLinks()}
                {expandedPanel === 'NOTIFICATIONS' && renderNotifications()}
            </div>

            {/* COLLAPSED NAV ROW */}
            <div className={`h-[64px] w-full flex items-center justify-between px-2 flex-shrink-0 transition-all duration-300 ${isExpanded && expandedPanel === 'NOTIFICATIONS' ? 'opacity-0 hidden' : 'opacity-100'}`}>
                
                {showBackButton && (
                    <button 
                        onClick={handleBack}
                        className="w-12 h-12 flex-shrink-0 rounded-full bg-white/5 flex items-center justify-center text-white hover:bg-white/10 active:scale-90 transition-all"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                )}

                <div className="flex-1 h-full py-1.5 flex items-center justify-center relative">
                    {action ? (
                        <div className="w-full h-full animate-slide-up">
                            {renderAction()}
                        </div>
                    ) : (
                        <div className="w-full h-full flex items-center justify-around">
                            <NavButton isActive={activeTab === Tab.HOME} onClick={() => handleTabClick(Tab.HOME)} icon={<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />} />
                            
                            {/* Profile (Center in collapsed nav) */}
                            <NavButton isActive={activeTab === Tab.PROFILE} onClick={() => handleTabClick(Tab.PROFILE)} icon={<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />} extraIcon={<circle cx="12" cy="7" r="4" />} />

                            {role === 'ADMIN' && (
                                <NavButton isActive={activeTab === Tab.ADMIN_DASHBOARD} onClick={() => handleTabClick(Tab.ADMIN_DASHBOARD)} icon={<path d="M12 2a10 10 0 1 0 10 10 M12 2v10l4.24-4.24" />} isAdmin />
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* --- SATELLITE BUBBLE (Notifications) --- */}
        {/* Sits to the right of the main island. On click, main island expands and this disappears/merges */}
        <button
            onClick={toggleNotifications}
            className={`
                pointer-events-auto absolute right-0 bottom-0 z-10
                w-[64px] h-[64px] rounded-full bg-[#0F1115] border border-white/10 shadow-lg
                flex items-center justify-center text-white
                transition-all duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)]
                ${isExpanded 
                    ? 'translate-x-[-150px] scale-50 opacity-0' // "Merges" into the main island
                    : 'translate-x-0 scale-100 opacity-100'      // Sits separately
                }
            `}
        >
            <div className={`transition-transform duration-300 ${isExpanded ? 'scale-0' : 'scale-100'}`}>
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                    <span className="absolute top-4 right-4 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#0F1115] animate-pulse"></span>
                )}
            </div>
        </button>

      </div>
    </div>
  );
};

const NavButton = ({ isActive, onClick, icon, extraIcon }: any) => {
    return (
        <button 
          onClick={onClick} 
          className={`
            relative w-12 h-12 flex items-center justify-center transition-all duration-300 rounded-xl group
            ${isActive ? 'text-white' : 'text-slate-500 hover:text-white'}
          `}
        >
          {isActive && (
             <div className="absolute inset-x-0 bottom-1 h-1 bg-[#6C5DD3] rounded-full shadow-[0_0_10px_#6C5DD3] mx-auto w-1/2"></div>
          )}
          
          <div className={`transition-all duration-300 ${isActive ? 'scale-110 -translate-y-1 drop-shadow-[0_0_8px_rgba(108,93,211,0.5)]' : 'group-hover:scale-110'}`}>
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  {icon}
                  {extraIcon}
              </svg>
          </div>
        </button>
    );
};
