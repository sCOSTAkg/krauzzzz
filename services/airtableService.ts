
import { AppConfig, UserProgress, Module, Material, Stream, CalendarEvent, ArenaScenario, AppNotification } from '../types';
import { Logger } from './logger';
import { Storage } from './storage';

// Helper types matching your Airtable table names
type TableName = 'Users' | 'Modules' | 'Materials' | 'Streams' | 'Events' | 'Scenarios' | 'Notifications' | 'Config';

class AirtableService {
    
    private getConfig() {
        // Read directly from storage to get the latest settings entered in Admin Dashboard
        const appConfig = Storage.get<AppConfig>('appConfig', {} as any);
        const integ = appConfig?.integrations;
        
        return {
            pat: integ?.airtablePat || '',
            baseId: integ?.airtableBaseId || '',
            tables: {
                Users: integ?.airtableTableName || 'Users',
                Modules: 'Modules',
                Materials: 'Materials',
                Streams: 'Streams',
                Events: 'Events',
                Scenarios: 'Scenarios',
                Notifications: 'Notifications',
                Config: 'Config'
            }
        };
    }

    private getHeaders(pat: string) {
        return {
            'Authorization': `Bearer ${pat}`,
            'Content-Type': 'application/json'
        };
    }

    // --- GENERIC FETCH ---

    async fetchTable<T>(tableName: TableName, mapper: (record: any) => T): Promise<T[]> {
        const { pat, baseId, tables } = this.getConfig();
        const actualTableName = tables[tableName];

        if (!pat || !baseId) return [];

        const url = `https://api.airtable.com/v0/${baseId}/${actualTableName}`;
        
        try {
            const response = await fetch(url, { headers: this.getHeaders(pat) });
            if (!response.ok) {
                if (response.status === 404) Logger.warn(`Airtable: Table '${actualTableName}' not found.`);
                return [];
            }
            
            const data = await response.json();
            if (!data.records) return [];

            return data.records.map((r: any) => {
                try {
                    return mapper(r);
                } catch (e) {
                    console.error(`Error mapping record from ${tableName}`, r, e);
                    return null;
                }
            }).filter((i: any) => i !== null) as T[];
        } catch (error) {
            Logger.error(`Airtable: Error fetching ${tableName}`, error);
            return [];
        }
    }

    // --- GENERIC UPSERT (CREATE OR UPDATE) ---

    /**
     * Finds a record by a custom field (usually 'id' or 'TelegramId') and updates it, or creates a new one.
     */
    async upsertRecord(tableName: TableName, searchField: string, searchValue: string, fields: any) {
        const { pat, baseId, tables } = this.getConfig();
        if (!pat || !baseId) return;

        const actualTableName = tables[tableName];
        
        try {
            // 1. Find existing record
            const safeValue = String(searchValue).replace(/'/g, "\\'");
            const filter = encodeURIComponent(`{${searchField}} = '${safeValue}'`);
            const findUrl = `https://api.airtable.com/v0/${baseId}/${actualTableName}?filterByFormula=${filter}`;
            
            const findRes = await fetch(findUrl, { headers: this.getHeaders(pat) });
            const findData = await findRes.json();
            const existingRecord = findData.records?.[0];

            const url = `https://api.airtable.com/v0/${baseId}/${actualTableName}${existingRecord ? `/${existingRecord.id}` : ''}`;
            const method = existingRecord ? 'PATCH' : 'POST';

            // 2. Create or Update
            await fetch(url, {
                method,
                headers: this.getHeaders(pat),
                body: JSON.stringify({ fields: { ...fields, [searchField]: searchValue }, typecast: true })
            });

        } catch (error) {
            Logger.error(`Airtable: Error saving to ${tableName}`, error);
        }
    }

    // --- USER SYNC ---

    private mapRecordToUser(record: any): UserProgress {
        const f = record.fields;
        let additionalData = {};
        
        try {
            // "Data" field contains the JSON blob of habits, notebook, etc.
            if (f.Data) {
                additionalData = JSON.parse(f.Data);
            }
        } catch (e) {
            console.error('Error parsing User Data JSON', e);
        }

        return {
            id: f.TelegramId, 
            airtableRecordId: record.id,
            telegramId: f.TelegramId,
            name: f.Name,
            role: f.Role,
            xp: f.XP || 0,
            level: f.Level || 1,
            ...additionalData
        } as UserProgress;
    }

    async syncUser(localUser: UserProgress): Promise<UserProgress> {
        const { pat, baseId, tables } = this.getConfig();
        if (!pat || !baseId) return localUser;

        const tgId = localUser.telegramId || localUser.telegramUsername;
        if (!tgId) return localUser;

        try {
            // 1. Fetch remote user
            const safeId = String(tgId).replace(/'/g, "\\'");
            const filter = encodeURIComponent(`{TelegramId} = '${safeId}'`);
            const url = `https://api.airtable.com/v0/${baseId}/${tables.Users}?filterByFormula=${filter}`;
            
            const response = await fetch(url, { headers: this.getHeaders(pat) });
            const data = await response.json();
            const remoteRecord = data.records?.[0];

            // 2. Prepare fields for saving
            const { id, airtableRecordId, name, role, xp, level, telegramId, ...rest } = localUser;
            const payloadFields = {
                "TelegramId": String(tgId),
                "Name": name || 'Unknown',
                "Role": role || 'STUDENT',
                "XP": Number(xp) || 0,
                "Level": Number(level) || 1,
                "Data": JSON.stringify(rest)
            };

            // 3. Logic: If exists, compare timestamps. If not, create.
            if (!remoteRecord) {
                await this.upsertRecord('Users', 'TelegramId', String(tgId), payloadFields);
                return localUser;
            } else {
                const remoteUser = this.mapRecordToUser(remoteRecord);
                
                // Conflict Resolution: Latest sync wins
                const localTime = localUser.lastSyncTimestamp || 0;
                const remoteTime = remoteUser.lastSyncTimestamp || 0;

                // If local is newer (and difference > 5s), push to Airtable
                if (localTime > remoteTime + 5000) {
                    await this.upsertRecord('Users', 'TelegramId', String(tgId), payloadFields);
                    return localUser;
                } 
                // If remote is newer, return remote
                else if (remoteTime > localTime) {
                    return remoteUser;
                }
                
                // If synced or close, return local with recordId
                return { ...localUser, airtableRecordId: remoteRecord.id };
            }
        } catch (error) {
            Logger.warn('Airtable User Sync Failed', error);
            return localUser;
        }
    }

    // --- CONTENT MAPPERS & SAVERS ---

    // MODULES
    mapModule(record: any): Module {
        const f = record.fields;
        let lessons = [];
        try { lessons = f.lessons ? JSON.parse(f.lessons) : []; } catch(e) { console.error('Bad lessons JSON', e); }
        return {
            id: f.id || record.id,
            title: f.title,
            description: f.description,
            category: f.category,
            minLevel: f.minLevel,
            imageUrl: f.imageUrl,
            videoUrl: f.videoUrl,
            lessons: lessons
        };
    }
    async saveModule(module: Module) {
        await this.upsertRecord('Modules', 'id', module.id, {
            title: module.title,
            description: module.description,
            category: module.category,
            minLevel: module.minLevel,
            imageUrl: module.imageUrl,
            videoUrl: module.videoUrl,
            lessons: JSON.stringify(module.lessons) // ARRAY -> JSON STRING
        });
    }

    // MATERIALS
    mapMaterial(record: any): Material {
        const f = record.fields;
        return {
            id: f.id || record.id,
            title: f.title,
            description: f.description,
            type: f.type,
            url: f.url
        };
    }
    async saveMaterial(mat: Material) {
        await this.upsertRecord('Materials', 'id', mat.id, {
            title: mat.title,
            description: mat.description,
            type: mat.type,
            url: mat.url
        });
    }

    // STREAMS
    mapStream(record: any): Stream {
        const f = record.fields;
        return {
            id: f.id || record.id,
            title: f.title,
            date: f.date,
            status: f.status,
            youtubeUrl: f.youtubeUrl
        };
    }
    async saveStream(s: Stream) {
        await this.upsertRecord('Streams', 'id', s.id, {
            title: s.title,
            date: s.date,
            status: s.status,
            youtubeUrl: s.youtubeUrl
        });
    }

    // EVENTS
    mapEvent(record: any): CalendarEvent {
        const f = record.fields;
        return {
            id: f.id || record.id,
            title: f.title,
            description: f.description,
            date: f.date,
            type: f.type,
            durationMinutes: f.durationMinutes
        };
    }
    async saveEvent(e: CalendarEvent) {
        await this.upsertRecord('Events', 'id', e.id, {
            title: e.title,
            description: e.description,
            date: typeof e.date === 'string' ? e.date : e.date.toISOString(),
            type: e.type,
            durationMinutes: e.durationMinutes
        });
    }

    // SCENARIOS
    mapScenario(record: any): ArenaScenario {
        const f = record.fields;
        return {
            id: f.id || record.id,
            title: f.title,
            difficulty: f.difficulty,
            clientRole: f.clientRole,
            objective: f.objective,
            initialMessage: f.initialMessage
        };
    }
    async saveScenario(s: ArenaScenario) {
        await this.upsertRecord('Scenarios', 'id', s.id, {
            title: s.title,
            difficulty: s.difficulty,
            clientRole: s.clientRole,
            objective: s.objective,
            initialMessage: s.initialMessage
        });
    }

    // NOTIFICATIONS
    mapNotification(record: any): AppNotification {
        const f = record.fields;
        return {
            id: f.id || record.id,
            title: f.title,
            message: f.message,
            type: f.type,
            date: f.date,
            targetRole: f.targetRole
        };
    }
    async saveNotification(n: AppNotification) {
        await this.upsertRecord('Notifications', 'id', n.id, {
            title: n.title,
            message: n.message,
            type: n.type,
            date: n.date,
            targetRole: n.targetRole
        });
    }

    // CONFIG
    async getConfigRecord(): Promise<AppConfig | null> {
        // We assume a record with key="appConfig"
        const records = await this.fetchTable('Config', r => ({ key: r.fields.key, value: r.fields.value }));
        const cfgRecord = records.find(r => r.key === 'appConfig');
        if (cfgRecord && cfgRecord.value) {
            try { return JSON.parse(cfgRecord.value); } catch(e) { console.error('Bad Config JSON', e); }
        }
        return null;
    }
    async saveConfig(config: AppConfig) {
        await this.upsertRecord('Config', 'key', 'appConfig', {
            value: JSON.stringify(config)
        });
    }

    // USERS (LIST)
    async getAllUsers(): Promise<UserProgress[]> {
        return this.fetchTable('Users', (r) => this.mapRecordToUser(r));
    }

    // --- PUBLIC METHODS ---
    async getModules() { return this.fetchTable('Modules', (r) => this.mapModule(r)); }
    async getMaterials() { return this.fetchTable('Materials', (r) => this.mapMaterial(r)); }
    async getStreams() { return this.fetchTable('Streams', (r) => this.mapStream(r)); }
    async getEvents() { return this.fetchTable('Events', (r) => this.mapEvent(r)); }
    async getScenarios() { return this.fetchTable('Scenarios', (r) => this.mapScenario(r)); }
    async getNotifications() { return this.fetchTable('Notifications', (r) => this.mapNotification(r)); }
}

export const airtable = new AirtableService();
