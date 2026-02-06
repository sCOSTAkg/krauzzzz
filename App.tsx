
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Tab, UserProgress, Lesson, AppConfig, Module, Material, Stream, CalendarEvent, ArenaScenario, AppNotification } from './types';
import { COURSE_MODULES, MOCK_EVENTS, MOCK_MATERIALS, MOCK_STREAMS } from './constants';
import { HomeDashboard } from './components/HomeDashboard';
import { Profile } from './components/Profile';
import { LessonView } from './components/LessonView';
import { AdminDashboard } from './components/AdminDashboard';
import { CuratorDashboard } from './components/CuratorDashboard';
import { Auth } from './components/Auth';
import { Welcome } from './components/Welcome';
import { SmartNav } from './components/SmartNav';
import { Storage } from './services/storage';
import { telegram } from './services/telegramService';
import { Toast, ToastMessage } from './components/Toast';
import { SCENARIOS, SalesArena } from './components/SalesArena'; 
import { NotebookView } from './components/NotebookView';
import { MaterialsView } from './components/MaterialsView';
import { StreamsView } from './components/StreamsView';
import { SystemHealthAgent } from './components/SystemHealthAgent';
import { Backend } from './services/backendService';
import { XPService } from './services/xpService';

const DEFAULT_CONFIG: AppConfig = {
  appName: 'SalesPro: 300 Spartans',
  appDescription: 'Elite Sales Academy',
  primaryColor: '#6C5DD3',
  systemInstruction: `Ты — Командир элитного отряда продаж "300 Спартанцев". Твоя задача: сделать из новобранца настоящую машину продаж. СТИЛЬ: Жесткий, военный, вдохновляющий.`,
  integrations: { 
      telegramBotToken: '', 
      googleDriveFolderId: '', 
      crmWebhookUrl: '', 
      aiModelVersion: 'gemini-3-flash-preview',
      databaseUrl: process.env.DATABASE_URL || ""
  },
  features: { enableRealTimeSync: true, autoApproveHomework: false, maintenanceMode: false, allowStudentChat: true, publicLeaderboard: true },
  aiConfig: {
      activeProvider: 'GOOGLE_GEMINI',
      apiKeys: {},
      modelOverrides: {}
  },
  systemAgent: {
      enabled: true,
      autoFix: true,
      monitoringInterval: 20000,
      sensitivity: 'HIGH',
      autonomyLevel: 'FULL_AUTO'
  }
};

const DEFAULT_USER: UserProgress = {
  name: '',
  role: 'STUDENT',
  isAuthenticated: false,
  xp: 0,
  level: 1,
  completedLessonIds: [],
  submittedHomeworks: [],
  chatHistory: [],
  theme: 'LIGHT',
  notifications: {
    pushEnabled: false,
    telegramSync: false,
    deadlineReminders: true,
    chatNotifications: true
  },
  notebook: [],
  stats: XPService.getInitStats()
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.HOME);
  const [adminSubTab, setAdminSubTab] = useState<'OVERVIEW' | 'COURSE' | 'MATERIALS' | 'STREAMS' | 'USERS' | 'SETTINGS' | 'ARENA' | 'CALENDAR'>('OVERVIEW');
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [showWelcome, setShowWelcome] = useState(true);

  // Initialize from LocalStorage (Fast Load)
  const [appConfig, setAppConfig] = useState<AppConfig>(() => Storage.get<AppConfig>('appConfig', DEFAULT_CONFIG));
  const [modules, setModules] = useState<Module[]>(() => Storage.get<Module[]>('courseModules', COURSE_MODULES));
  const [materials, setMaterials] = useState<Material[]>(() => Storage.get<Material[]>('materials', MOCK_MATERIALS));
  const [streams, setStreams] = useState<Stream[]>(() => Storage.get<Stream[]>('streams', MOCK_STREAMS));
  const [events, setEvents] = useState<CalendarEvent[]>(() => Storage.get<CalendarEvent[]>('events', MOCK_EVENTS));
  const [scenarios, setScenarios] = useState<ArenaScenario[]>(() => Storage.get<ArenaScenario[]>('scenarios', SCENARIOS));
  const [allUsers, setAllUsers] = useState<UserProgress[]>(() => Storage.get<UserProgress[]>('allUsers', []));
  const [userProgress, setUserProgress] = useState<UserProgress>(() => Storage.get<UserProgress>('progress', DEFAULT_USER));
  const [notifications, setNotifications] = useState<AppNotification[]>(() => Storage.get<AppNotification[]>('local_notifications', []));

  // Ref to track last notification count for alerts
  const prevNotifCount = useRef(0);

  const activeLesson = selectedLessonId ? modules.flatMap(m => m.lessons).find(l => l.id === selectedLessonId) : null;
  const activeModule = activeLesson ? modules.find(m => m.lessons.some(l => l.id === activeLesson.id)) : null;

  // --- AUTOMATIC SYNCHRONIZATION ---
  
  const syncData = useCallback(async () => {
      // 1. Sync Global Config
      const remoteConfig = await Backend.fetchGlobalConfig(appConfig);
      if (JSON.stringify(remoteConfig) !== JSON.stringify(appConfig)) {
          setAppConfig(remoteConfig);
      }

      // 2. Sync Notifications
      const rawNotifs = await Backend.fetchNotifications();
      // Filter relevant notifications
      const myNotifs = rawNotifs.filter(n => {
          if (n.targetUserId && n.targetUserId !== userProgress.telegramId) return false;
          if (n.targetRole && n.targetRole !== 'ALL' && n.targetRole !== userProgress.role) return false;
          return true;
      });

      // Simple diff check for new notification alert
      if (myNotifs.length > notifications.length) {
          const latest = myNotifs[0];
          // Ensure we don't alert for old ones if we just loaded app
          if (latest && latest.date > new Date(Date.now() - 10000).toISOString()) { 
               addToast(latest.type === 'ALERT' ? 'error' : 'info', latest.title, latest.link);
               telegram.haptic('success');
          }
      }
      setNotifications(myNotifs);
      
      // 3. Sync Content
      const content = await Backend.fetchAllContent();
      if (content) {
          if (JSON.stringify(content.modules) !== JSON.stringify(modules)) setModules(content.modules);
          if (JSON.stringify(content.materials) !== JSON.stringify(materials)) setMaterials(content.materials);
          if (JSON.stringify(content.streams) !== JSON.stringify(streams)) setStreams(content.streams);
          if (JSON.stringify(content.events) !== JSON.stringify(events)) setEvents(content.events);
          if (JSON.stringify(content.scenarios) !== JSON.stringify(scenarios)) setScenarios(content.scenarios);
      }

      // 4. Sync User List
      const remoteUsers = await Backend.getLeaderboard();
      if (JSON.stringify(remoteUsers) !== JSON.stringify(allUsers)) {
          setAllUsers(remoteUsers);
      }

      // 5. Sync Current User Role/Stats
      if (userProgress.isAuthenticated) {
          const freshUser = await Backend.syncUser(userProgress);
          
          // Only update if critical fields changed
          if (freshUser.role !== userProgress.role || freshUser.level !== userProgress.level || freshUser.xp !== userProgress.xp) {
              setUserProgress(prev => ({ 
                  ...prev, 
                  role: freshUser.role,
                  level: freshUser.level,
                  xp: freshUser.xp,
                  name: freshUser.name // Also sync name in case admin changed it
              }));
          }
      }
  }, [appConfig, userProgress, modules, materials, streams, events, scenarios, allUsers, notifications]);

  // Setup Event Listener and Polling
  useEffect(() => {
      // Initial Sync
      syncData();

      // Listen for broadcasts from other tabs (Admin -> User sync)
      Backend.onSync(() => {
          syncData();
      });

      // Poll as backup (every 10 seconds)
      const interval = setInterval(syncData, 10000);
      return () => clearInterval(interval);
  }, []); // Remove dependencies to prevent loop, syncData is stable enough or handles its own deps via refs if needed, but here simple closure is fine for interval, for valid closure we might need to use refs or include syncData in deps if we wrap it in useCallback correctly.
  // Actually, to avoid stale closures in setInterval, we should use a ref for the callback or depend on [syncData].
  // But since syncData depends on state, it changes often.
  // Let's rely on BroadcastChannel mostly and a slower poll.
  
  // Re-attach poll when syncData changes to ensure fresh closure
  useEffect(() => {
      const interval = setInterval(syncData, 10000);
      return () => clearInterval(interval);
  }, [syncData]);


  // --- THEME & PERSISTENCE ---
  useEffect(() => {
    const root = document.documentElement;
    if (userProgress.theme === 'DARK') {
        root.classList.add('dark');
        telegram.setBackgroundColor('#050505');
        telegram.setHeaderColor('#050505');
    } else {
        root.classList.remove('dark');
        telegram.setBackgroundColor('#F3F4F6');
        telegram.setHeaderColor('#F3F4F6');
    }
  }, [userProgress.theme]);

  useEffect(() => {
    if (userProgress.isAuthenticated) setShowWelcome(false);
  }, [userProgress.isAuthenticated]);

  useEffect(() => {
    Storage.set('progress', userProgress);
    const timer = setTimeout(() => {
        if (userProgress.isAuthenticated) Backend.saveUser(userProgress);
    }, 1000);
    return () => clearTimeout(timer);
  }, [userProgress]);

  // --- ACTIONS ---

  const addToast = (type: 'success' | 'error' | 'info', message: string, link?: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, message, link }]);
    if (telegram.isAvailable) telegram.haptic(type === 'error' ? 'error' : 'success');
  };

  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  const handleNavigate = (link?: string) => {
      if (!link) return;
      if (link.startsWith('http')) {
          window.open(link, '_blank');
      } else if (Object.values(Tab).includes(link as Tab)) {
          setActiveTab(link as Tab);
      } else {
          console.log('Navigating to:', link);
      }
  };

  const handleLogin = async (userData: any) => {
    const tempUser = { ...userProgress, ...userData, isAuthenticated: true };
    setUserProgress(tempUser);
    setShowWelcome(false);
    Backend.saveUser(tempUser);
    addToast('success', 'С возвращением, боец!');
  };

  const handleLogout = () => {
    setUserProgress({ ...DEFAULT_USER });
    setActiveTab(Tab.HOME);
    setShowWelcome(true);
  };

  const handleUpdateUser = (data: Partial<UserProgress>) => setUserProgress(prev => ({ ...prev, ...data }));

  // --- ADMIN ACTIONS (With Immediate Local State Update) ---

  const handleUpdateModules = (newModules: Module[]) => { 
      setModules(newModules); 
      Backend.saveCollection('modules', newModules); 
  };
  const handleUpdateMaterials = (newMats: Material[]) => { 
      setMaterials(newMats); 
      Backend.saveCollection('materials', newMats); 
  };
  const handleUpdateStreams = (newStreams: Stream[]) => { 
      setStreams(newStreams); 
      Backend.saveCollection('streams', newStreams); 
  };
  const handleUpdateEvents = (newEvents: CalendarEvent[]) => { 
      setEvents(newEvents); 
      Backend.saveCollection('events', newEvents); 
  };
  const handleUpdateScenarios = (newScenarios: ArenaScenario[]) => { 
      setScenarios(newScenarios); 
      Backend.saveCollection('scenarios', newScenarios); 
  };
  const handleUpdateConfig = (newConfig: AppConfig) => { 
      setAppConfig(newConfig); 
      Backend.saveGlobalConfig(newConfig); 
  };
  const handleUpdateAllUsers = (newUsers: UserProgress[]) => {
      setAllUsers(newUsers);
      Storage.set('allUsers', newUsers);
      Backend.saveUser(newUsers.find(u => u.telegramId === userProgress.telegramId) || userProgress); // Sync logic wrapper
  };
  const handleSendBroadcast = (notification: AppNotification) => {
      Backend.sendBroadcast(notification);
      setNotifications(prev => [notification, ...prev]);
      addToast('success', 'Оповещение отправлено');
  };
  const handleClearNotifications = () => {
      Storage.set('local_notifications', []);
      setNotifications([]);
      // Need to tell backend to clear too in a real app, here we just clear local
      Backend.saveCollection('notifications', []); // Hack to trigger sync
      addToast('info', 'История очищена');
  };
  
  const handleUpdateLesson = (updatedLesson: Lesson) => {
      const updatedModules = modules.map(m => {
          if (m.lessons.some(l => l.id === updatedLesson.id)) {
              return {
                  ...m,
                  lessons: m.lessons.map(l => l.id === updatedLesson.id ? updatedLesson : l)
              };
          }
          return m;
      });
      setModules(updatedModules);
      Backend.saveCollection('modules', updatedModules);
      addToast('success', 'Урок обновлен');
  };

  // --- USER ACTIONS ---

  const handleCompleteLesson = (lessonId: string, xpBonus: number) => {
      const newXp = userProgress.xp + xpBonus;
      const newLevel = Math.floor(newXp / 1000) + 1;
      
      setUserProgress(prev => ({
          ...prev,
          xp: newXp,
          level: newLevel,
          completedLessonIds: [...prev.completedLessonIds, lessonId]
      }));
      addToast('success', `Урок пройден! +${xpBonus} XP`);
      setSelectedLessonId(null);
  };

  const handleXPEarned = (amount: number) => {
      setUserProgress(prev => {
          const newXp = prev.xp + amount;
          return {
              ...prev,
              xp: newXp,
              level: Math.floor(newXp / 1000) + 1
          };
      });
      addToast('success', `+${amount} XP`);
  };

  if (!userProgress.isAuthenticated) {
    if (showWelcome) return <Welcome onStart={() => setShowWelcome(false)} />;
    return <Auth onLogin={handleLogin} existingUsers={allUsers} />;
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-body text-text-primary transition-colors duration-300 overflow-hidden">
      
      {/* 
        AUTONOMOUS SYSTEM AGENT 
        Now injected with the ability to modify the app state directly
      */}
      <SystemHealthAgent 
          config={appConfig.systemAgent} 
          user={userProgress}
          appConfig={appConfig}
          modules={modules}
          onUpdateConfig={handleUpdateConfig}
          onUpdateModules={handleUpdateModules}
          onSendNotification={handleSendBroadcast}
      />

      <div className="fixed top-[var(--safe-top)] left-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => <Toast key={t.id} toast={t} onRemove={removeToast} onClick={() => handleNavigate(t.link)} />)}
      </div>

      <main className="flex-1 overflow-y-auto no-scrollbar scroll-smooth relative">
        {activeLesson ? (
           <div className="animate-slide-up min-h-full bg-body">
             <LessonView 
               lesson={activeLesson}
               isCompleted={userProgress.completedLessonIds.includes(activeLesson.id)}
               onComplete={handleCompleteLesson}
               onBack={() => setSelectedLessonId(null)}
               parentModule={activeModule}
               userProgress={userProgress}
               onUpdateUser={handleUpdateUser}
               onUpdateLesson={handleUpdateLesson}
             />
           </div>
        ) : (
           <div key={activeTab} className="animate-fade-in min-h-full">
              {activeTab === Tab.HOME && (
                 <HomeDashboard 
                   onNavigate={setActiveTab}
                   userProgress={userProgress}
                   onProfileClick={() => setActiveTab(Tab.PROFILE)}
                   modules={modules}
                   materials={materials}
                   streams={streams}
                   scenarios={scenarios}
                   onSelectLesson={(l) => setSelectedLessonId(l.id)}
                   onUpdateUser={handleUpdateUser}
                   allUsers={allUsers}
                   notifications={notifications}
                 />
              )}
              
              {activeTab === Tab.ARENA && <SalesArena />}
              
              {activeTab === Tab.NOTEBOOK && (
                 <NotebookView 
                    entries={userProgress.notebook} 
                    onUpdate={(e) => handleUpdateUser({ notebook: e })} 
                    onBack={() => setActiveTab(Tab.HOME)} 
                    onXPEarned={handleXPEarned}
                 />
              )}

              {activeTab === Tab.MATERIALS && (
                  <MaterialsView materials={materials} onBack={() => setActiveTab(Tab.HOME)} />
              )}

              {activeTab === Tab.STREAMS && (
                  <StreamsView 
                    streams={streams} 
                    onBack={() => setActiveTab(Tab.HOME)} 
                    userProgress={userProgress}
                    onUpdateUser={handleUpdateUser}
                  />
              )}

              {activeTab === Tab.PROFILE && (
                 <Profile 
                    userProgress={userProgress} 
                    onLogout={handleLogout} 
                    allUsers={allUsers}
                    onUpdateUser={handleUpdateUser}
                    events={events}
                 />
              )}

              {activeTab === Tab.CURATOR_DASHBOARD && userProgress.role !== 'STUDENT' && (
                  <CuratorDashboard 
                      users={allUsers}
                      modules={modules}
                  />
              )}

              {activeTab === Tab.ADMIN_DASHBOARD && userProgress.role === 'ADMIN' && (
                  <AdminDashboard 
                    config={appConfig}
                    onUpdateConfig={handleUpdateConfig}
                    modules={modules}
                    onUpdateModules={handleUpdateModules}
                    materials={materials}
                    onUpdateMaterials={handleUpdateMaterials}
                    streams={streams}
                    onUpdateStreams={handleUpdateStreams}
                    events={events}
                    onUpdateEvents={handleUpdateEvents}
                    scenarios={scenarios}
                    onUpdateScenarios={handleUpdateScenarios}
                    users={allUsers}
                    onUpdateUsers={handleUpdateAllUsers}
                    currentUser={userProgress}
                    activeSubTab={adminSubTab as any}
                    onSendBroadcast={handleSendBroadcast}
                    notifications={notifications}
                    onClearNotifications={handleClearNotifications}
                    addToast={addToast}
                  />
              )}
           </div>
        )}
      </main>

      <SmartNav 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        role={userProgress.role} 
        adminSubTab={adminSubTab}
        setAdminSubTab={setAdminSubTab}
        isLessonActive={!!selectedLessonId}
        onExitLesson={() => setSelectedLessonId(null)}
      />
    </div>
  );
};

export default App;
