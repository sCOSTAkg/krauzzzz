
import { Storage } from './storage';
import { UserProgress, Module, Material, Stream, CalendarEvent, ArenaScenario, AppNotification, AppConfig } from '../types';
import { Logger } from './logger';
import { COURSE_MODULES, MOCK_EVENTS, MOCK_MATERIALS, MOCK_STREAMS } from '../constants';
import { SCENARIOS } from '../components/SalesArena';
import { airtable } from './airtableService';

type ContentTable = 'modules' | 'materials' | 'streams' | 'events' | 'scenarios' | 'notifications' | 'app_settings';

const SYNC_CHANNEL_NAME = 'salespro_sync_channel';

/**
 * BACKEND SERVICE
 * Now integrates with Airtable for the Users table (CRM).
 * Other content (static) is still synced via BroadcastChannel/LocalStorage for this version,
 * but Users/Habits are persistent in the Cloud.
 */
class BackendService {
  private channel: BroadcastChannel;

  constructor() {
      this.channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
  }

  // --- EVENTS ---
  
  /**
   * Subscribe to sync events
   */
  public onSync(callback: () => void) {
      this.channel.onmessage = (event) => {
          if (event.data && event.data.type === 'SYNC_UPDATE') {
              // Logger.info('Backend: Received sync signal from another tab');
              callback();
          }
      };
  }

  private notifySync() {
      this.channel.postMessage({ type: 'SYNC_UPDATE', timestamp: Date.now() });
  }
  
  // --- USER SYNC (AIRTABLE INTEGRATION) ---

  async syncUser(localUser: UserProgress): Promise<UserProgress> {
    // 1. Try Airtable first
    try {
        const remoteUser = await airtable.syncUser(localUser);
        
        // If the remote user returned is different (newer) than what we had, update cache
        if (remoteUser.lastSyncTimestamp && localUser.lastSyncTimestamp && remoteUser.lastSyncTimestamp > localUser.lastSyncTimestamp) {
            Logger.info('Backend: Remote data is newer, updating local cache.');
            this.updateLocalUserCache(remoteUser);
            return remoteUser;
        }
        
        return localUser; // Return local if it was newer or equal
    } catch (e) {
        Logger.warn('Backend: Airtable sync failed, falling back to LocalStorage', e);
        // Fallback: LocalStorage logic
        await this.saveUserLocal(localUser);
        return localUser;
    }
  }

  async saveUser(user: UserProgress) {
      // 1. Mark as updated NOW
      const updatedUser = { ...user, lastSyncTimestamp: Date.now() };

      // 2. Optimistic Update: Save local first
      await this.saveUserLocal(updatedUser);
      
      // 3. Async: Push to Airtable
      airtable.syncUser(updatedUser).then((synced) => {
          if (synced.airtableRecordId !== updatedUser.airtableRecordId) {
              // Update local again if we got a new ID (first create)
              this.saveUserLocal(synced);
          }
      }).catch(err => console.error("Background sync failed", err));
  }

  private async saveUserLocal(user: UserProgress) {
    const allUsers = Storage.get<UserProgress[]>('allUsers', []);
    const idx = allUsers.findIndex(u => u.telegramId === user.telegramId);
    const newAllUsers = [...allUsers];
    
    if (idx >= 0) {
        newAllUsers[idx] = user;
    } else {
        newAllUsers.push(user);
    }
    
    Storage.set('allUsers', newAllUsers);
    this.notifySync(); 
  }

  private updateLocalUserCache(user: UserProgress) {
      const allUsers = Storage.get<UserProgress[]>('allUsers', []);
      const idx = allUsers.findIndex(u => u.telegramId === user.telegramId);
      if (idx !== -1) {
          allUsers[idx] = user;
          Storage.set('allUsers', allUsers);
      }
  }

  // --- GLOBAL CONFIG SYNC ---

  async fetchGlobalConfig(defaultConfig: AppConfig): Promise<AppConfig> {
      return Storage.get('appConfig', defaultConfig);
  }

  async saveGlobalConfig(config: AppConfig) {
      Storage.set('appConfig', config);
      this.notifySync();
      Logger.info('Backend: Global config saved');
  }

  // --- CONTENT SYNC ---

  async fetchAllContent() {
      return {
          modules: Storage.get('courseModules', COURSE_MODULES),
          materials: Storage.get('materials', MOCK_MATERIALS),
          streams: Storage.get('streams', MOCK_STREAMS),
          events: Storage.get('events', MOCK_EVENTS),
          scenarios: Storage.get('scenarios', SCENARIOS),
      };
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
      if (key) {
          Storage.set(key, items);
          this.notifySync();
          Logger.info(`Backend: Saved ${items.length} items to ${table}`);
      }
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

  // --- USER MANAGEMENT (CRM) ---

  async getLeaderboard(): Promise<UserProgress[]> {
     // Fetch from Airtable for Admin/Leaderboard
     try {
         const users = await airtable.getAllUsers();
         if (users.length > 0) {
             Storage.set('allUsers', users); // Cache it
             return users;
         }
     } catch (e) {
         Logger.warn('Failed to fetch leaderboard from Airtable');
     }
     return Storage.get<UserProgress[]>('allUsers', []);
  }
}

export const Backend = new BackendService();
