
import { Storage } from './storage';
import { UserProgress, Module, Material, Stream, CalendarEvent, ArenaScenario, AppNotification, AppConfig } from '../types';
import { Logger } from './logger';
import { COURSE_MODULES, MOCK_EVENTS, MOCK_MATERIALS, MOCK_STREAMS } from '../constants';
import { SCENARIOS } from '../components/SalesArena';
import { airtable } from './airtableService';

type ContentTable = 'modules' | 'materials' | 'streams' | 'events' | 'scenarios' | 'notifications' | 'app_settings';

const SYNC_CHANNEL_NAME = 'salespro_sync_channel';

class BackendService {
  private channel: BroadcastChannel;

  constructor() {
      this.channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
  }

  public onSync(callback: () => void) {
      this.channel.onmessage = (event) => {
          if (event.data && event.data.type === 'SYNC_UPDATE') {
              callback();
          }
      };
  }

  private notifySync() {
      this.channel.postMessage({ type: 'SYNC_UPDATE', timestamp: Date.now() });
  }

  // --- USER SYNC ---

  async syncUser(localUser: UserProgress): Promise<UserProgress> {
    try {
        const synced = await airtable.syncUserProgress(localUser);
        if (synced && JSON.stringify(synced) !== JSON.stringify(localUser)) {
             this.saveUserLocal(synced);
             return synced;
        }
        return localUser;
    } catch (e) {
        Logger.warn('Backend: User Sync failed, using local.', e);
        return localUser;
    }
  }

  async saveUser(user: UserProgress) {
      const updatedUser = { ...user, lastSyncTimestamp: Date.now() };
      this.saveUserLocal(updatedUser);
      airtable.syncUserProgress(updatedUser).then(success => {
          if (success) {
              Logger.log('User synced to Airtable');
          }
      }).catch(e => Logger.error("BG Sync Error", e));
  }

  private saveUserLocal(user: UserProgress) {
    Storage.set('progress', user);
    const allUsers = Storage.get<UserProgress[]>('allUsers', []);
    const idx = allUsers.findIndex(u => u.telegramId === user.telegramId);
    const newAllUsers = [...allUsers];
    if (idx >= 0) newAllUsers[idx] = user;
    else newAllUsers.push(user);
    Storage.set('allUsers', newAllUsers);
    this.notifySync(); 
  }

  // --- CONFIG SYNC ---

  async fetchGlobalConfig(defaultConfig: AppConfig): Promise<AppConfig> {
      try {
          // Config can be fetched from Storage for now
          return Storage.get('appConfig', defaultConfig);
      } catch (e) {
          Logger.warn('Config fetch failed');
      }
      return defaultConfig;
  }

  async saveGlobalConfig(config: AppConfig) {
      Storage.set('appConfig', config);
      this.notifySync();
  }

  // --- CONTENT SYNC (READ) ---

  async fetchAllContent() {
      // Parallel fetch from Airtable
      try {
          Logger.log('🔄 Fetching all content from Airtable...');

          const [mods, mats, strs] = await Promise.all([
              airtable.fetchModules(),      // ✅ FIXED: use correct method name
              airtable.fetchMaterials(),    // ✅ FIXED
              airtable.fetchStreams()       // ✅ FIXED
          ]);

          Logger.log(`✅ Loaded: ${mods.length} modules, ${mats.length} materials, ${strs.length} streams`);

          // Prefer Airtable data if available, otherwise fallback to LocalStorage, then Constants
          const content = {
              modules: mods.length > 0 ? mods : Storage.get('courseModules', COURSE_MODULES),
              materials: mats.length > 0 ? mats : Storage.get('materials', MOCK_MATERIALS),
              streams: strs.length > 0 ? strs : Storage.get('streams', MOCK_STREAMS),
              events: Storage.get('events', MOCK_EVENTS),  // Use local for now
              scenarios: Storage.get('scenarios', SCENARIOS), // Use local for now
          };

          // Log module details
          content.modules.forEach(mod => {
              Logger.log(`  📚 Module: ${mod.title} (${mod.lessons?.length || 0} lessons)`);
          });

          // Cache everything locally
          Storage.set('courseModules', content.modules);
          Storage.set('materials', content.materials);
          Storage.set('streams', content.streams);
          Storage.set('events', content.events);
          Storage.set('scenarios', content.scenarios);

          this.notifySync();
          return content;

      } catch (e) {
          Logger.error('❌ Airtable Content Sync failed', e);
          // Fallback to cached data
          return {
              modules: Storage.get('courseModules', COURSE_MODULES),
              materials: Storage.get('materials', MOCK_MATERIALS),
              streams: Storage.get('streams', MOCK_STREAMS),
              events: Storage.get('events', MOCK_EVENTS),
              scenarios: Storage.get('scenarios', SCENARIOS),
          };
      }
  }

  // --- CONTENT SYNC (WRITE) ---

  async saveCollection<T extends { id: string }>(table: ContentTable, items: T[]) {
      // 1. Update LocalStorage immediately for UI responsiveness
      const storageKeyMap: Partial<Record<ContentTable, string>> = {
          'modules': 'courseModules',
          'materials': 'materials',
          'streams': 'streams',
          'events': 'events',
          'scenarios': 'scenarios',
          'notifications': 'local_notifications'
      };
      const key = storageKeyMap[table];
      if (key) {
          Storage.set(key, items);
          this.notifySync();
          Logger.log(`💾 Saved ${items.length} ${table} to local storage`);
      }

      // 2. Push to Airtable (to be implemented when needed)
      // For now just save locally
  }

  // --- NOTIFICATIONS ---

  async fetchNotifications(): Promise<AppNotification[]> {
      return Storage.get<AppNotification[]>('local_notifications', []);
  }

  async sendBroadcast(notification: AppNotification) {
      const current = Storage.get<AppNotification[]>('local_notifications', []);
      Storage.set('local_notifications', [notification, ...current]);
      this.notifySync();
  }

  // --- CRM ---

  async getLeaderboard(): Promise<UserProgress[]> {
     return Storage.get<UserProgress[]>('allUsers', []);
  }
}

export const Backend = new BackendService();
