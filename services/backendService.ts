
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { Storage } from './storage';
import { UserProgress, Module, Material, Stream, CalendarEvent, ArenaScenario, AppNotification, UserRole, AppConfig } from '../types';
import { Logger } from './logger';
import { COURSE_MODULES, MOCK_EVENTS, MOCK_MATERIALS, MOCK_STREAMS } from '../constants';
import { SCENARIOS } from '../components/SalesArena';

type ContentTable = 'modules' | 'materials' | 'streams' | 'events' | 'scenarios' | 'notifications' | 'app_settings';

class BackendService {
  
  // --- USER SYNC ---

  async syncUser(localUser: UserProgress): Promise<UserProgress> {
    // 1. Try Supabase Sync
    if (isSupabaseConfigured() && localUser.telegramId) {
        try {
          const { data, error } = await supabase!
            .from('profiles')
            .select('*')
            .eq('telegram_id', localUser.telegramId)
            .single();

          if (error && error.code !== 'PGRST116') { 
            Logger.error('Backend: User fetch error', error);
            return localUser;
          }

          if (data) {
            // Merge cloud data with local
            const mergedUser: UserProgress = {
              ...localUser,
              ...data.data, // JSONB fields
              xp: data.xp,
              level: data.level,
              role: data.role as any, // Authority on Role comes from DB
              name: data.username || localUser.name,
              isAuthenticated: true
            };
            return mergedUser;
          } 
          
          // Create if not exists
          await this.saveUser(localUser);
          return localUser;

        } catch (e) {
          Logger.error('Backend: User sync exception', e);
          return localUser;
        }
    }

    // 2. Fallback: Local "Mock DB" Sync (for Admin role updates to take effect in demo mode)
    // Check 'allUsers' storage which acts as the DB in local mode
    const allUsers = Storage.get<UserProgress[]>('allUsers', []);
    const remoteVer = allUsers.find(u => u.telegramId === localUser.telegramId || (u.telegramUsername && u.telegramUsername === localUser.telegramUsername));
    
    if (remoteVer) {
        // If the 'remote' (stored in allUsers) has newer data, sync critical fields
        // This allows admin updates (Role, Level reset) to propagate to the session
        let needsUpdate = false;
        const updates: Partial<UserProgress> = {};

        if (remoteVer.role !== localUser.role) {
            updates.role = remoteVer.role;
            needsUpdate = true;
        }
        if (remoteVer.level !== localUser.level) {
            updates.level = remoteVer.level;
            updates.xp = remoteVer.xp; // Sync XP if level changed (likely reset)
            needsUpdate = true;
        }
        // Also sync XP if it's significantly different (e.g. admin bonus)
        if (Math.abs(remoteVer.xp - localUser.xp) > 100) {
             updates.xp = remoteVer.xp;
             needsUpdate = true;
        }

        if (needsUpdate) {
            return { ...localUser, ...updates };
        }
    }

    return localUser;
  }

  async saveUser(user: UserProgress) {
    // NOTE: We do NOT set 'progress' key here anymore. 
    // 'progress' is the session of the CURRENT user. 
    // saveUser might be called by Admin to update ANOTHER user.
    // App.tsx handles persistence of the current user's session.

    if (isSupabaseConfigured() && user.telegramId) {
        try {
          const { id, telegramId, telegramUsername, xp, level, role, ...rest } = user;
          
          const payload = {
            telegram_id: telegramId,
            username: user.name,
            xp: xp,
            level: level,
            role: role,
            data: rest 
          };

          const { error } = await supabase!
            .from('profiles')
            .upsert(payload, { onConflict: 'telegram_id' });

          if (error) Logger.error('Backend: Save user error', error);

        } catch (e) {
          Logger.error('Backend: Save user exception', e);
        }
    }

    // Update Local "Mock DB" (allUsers) so Admin updates persist in local mode
    const allUsers = Storage.get<UserProgress[]>('allUsers', []);
    const idx = allUsers.findIndex(u => u.telegramId === user.telegramId);
    let newAllUsers = [...allUsers];
    if (idx >= 0) {
        newAllUsers[idx] = user;
    } else {
        newAllUsers.push(user);
    }
    Storage.set('allUsers', newAllUsers);
  }

  // --- GLOBAL CONFIG SYNC ---

  async fetchGlobalConfig(defaultConfig: AppConfig): Promise<AppConfig> {
      if (!isSupabaseConfigured()) return Storage.get('appConfig', defaultConfig);

      try {
          const { data, error } = await supabase!
              .from('app_settings')
              .select('*')
              .eq('id', 'global_config')
              .single();

          if (error || !data) return defaultConfig;
          return { ...defaultConfig, ...data.data };
      } catch (e) {
          Logger.error('Backend: Fetch config failed', e);
          return defaultConfig;
      }
  }

  async saveGlobalConfig(config: AppConfig) {
      Storage.set('appConfig', config);
      if (!isSupabaseConfigured()) return;

      try {
          const { error } = await supabase!
              .from('app_settings')
              .upsert({ id: 'global_config', data: config });
          
          if (error) throw error;
          Logger.info('Backend: Global config saved');
      } catch (e) {
          Logger.error('Backend: Save config failed', e);
      }
  }

  // --- CONTENT SYNC ---

  async fetchAllContent() {
      // In local mode, just return defaults or stored
      if (!isSupabaseConfigured()) {
          return {
              modules: Storage.get('courseModules', COURSE_MODULES),
              materials: Storage.get('materials', MOCK_MATERIALS),
              streams: Storage.get('streams', MOCK_STREAMS),
              events: Storage.get('events', MOCK_EVENTS),
              scenarios: Storage.get('scenarios', SCENARIOS),
          };
      }

      try {
          const [modules, materials, streams, events, scenarios] = await Promise.all([
              this.fetchCollection<Module>('modules', COURSE_MODULES),
              this.fetchCollection<Material>('materials', MOCK_MATERIALS),
              this.fetchCollection<Stream>('streams', MOCK_STREAMS),
              this.fetchCollection<CalendarEvent>('events', MOCK_EVENTS),
              this.fetchCollection<ArenaScenario>('scenarios', SCENARIOS),
          ]);

          return { modules, materials, streams, events, scenarios };
      } catch (e) {
          Logger.error('Backend: Fetch all content failed', e);
          return null;
      }
  }

  private async fetchCollection<T extends { id: string }>(table: ContentTable, defaultData: T[]): Promise<T[]> {
      try {
          const { data, error } = await supabase!.from(table).select('*');
          
          if (error) {
              if ((table === 'notifications' || table === 'app_settings') && error.code === '42P01') return [];
              console.warn(`Backend: Error fetching ${table}`, error.message);
              return defaultData;
          }

          if (!data || data.length === 0) {
              if (table === 'notifications') return [];
              if (table !== 'app_settings') {
                  Logger.info(`Backend: ${table} is empty. Seeding...`);
                  await this.saveCollection(table, defaultData);
                  return defaultData;
              }
              return defaultData;
          }

          return data.map(row => row.data as T);

      } catch (e) {
          return defaultData;
      }
  }

  async saveCollection<T extends { id: string }>(table: ContentTable, items: T[]) {
      const storageKeyMap: Partial<Record<ContentTable, string>> = {
          'modules': 'courseModules',
          'materials': 'materials',
          'streams': 'streams',
          'events': 'events',
          'scenarios': 'scenarios'
      };
      
      const key = storageKeyMap[table];
      if (key) Storage.set(key, items);

      if (!isSupabaseConfigured()) return;

      try {
          const payload = items.map(item => ({
              id: item.id,
              data: item
          }));

          const { error } = await supabase!
              .from(table)
              .upsert(payload, { onConflict: 'id' });

          if (error) throw error;

          Logger.info(`Backend: Saved ${items.length} items to ${table}`);

      } catch (e: any) {
          Logger.error(`Backend: Save ${table} failed`, e);
      }
  }

  // --- NOTIFICATIONS ---

  async fetchNotifications(): Promise<AppNotification[]> {
      if (!isSupabaseConfigured()) {
          return Storage.get<AppNotification[]>('local_notifications', []);
      }
      return this.fetchCollection<AppNotification>('notifications', []);
  }

  async sendBroadcast(notification: AppNotification) {
      if (!isSupabaseConfigured()) {
          const current = Storage.get<AppNotification[]>('local_notifications', []);
          Storage.set('local_notifications', [notification, ...current]);
          return;
      }

      try {
          const payload = {
              id: notification.id,
              data: notification
          };
          const { error } = await supabase!.from('notifications').insert(payload);
          if (error) throw error;
      } catch (e) {
          Logger.error('Backend: Send broadcast failed', e);
          throw e;
      }
  }

  // --- USER MANAGEMENT ---

  async getLeaderboard(): Promise<UserProgress[]> {
     if (!isSupabaseConfigured()) {
         return Storage.get<UserProgress[]>('allUsers', []);
     }

     try {
         const { data, error } = await supabase!
            .from('profiles')
            .select('*')
            .order('xp', { ascending: false })
            .limit(50);
         
         if (error) throw error;

         return data.map((row: any) => ({
             name: row.username,
             xp: row.xp,
             level: row.level,
             role: row.role,
             telegramId: row.telegram_id,
             avatarUrl: row.data?.avatarUrl,
             isAuthenticated: true,
             completedLessonIds: [],
             submittedHomeworks: [],
             chatHistory: [],
             notebook: [],
             theme: 'LIGHT',
             notifications: { pushEnabled: false, telegramSync: false, deadlineReminders: false, chatNotifications: false },
             ...row.data // Spread rest of data
         }));
     } catch (e) {
         Logger.error('Backend: Leaderboard error', e);
         return Storage.get<UserProgress[]>('allUsers', []);
     }
  }
}

export const Backend = new BackendService();
