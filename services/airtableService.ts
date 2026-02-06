
import { AppConfig, UserProgress } from '../types';
import { Logger } from './logger';
import { Storage } from './storage';

class AirtableService {
    
    private getConfig() {
        // Read directly from storage to get the latest settings
        const appConfig = Storage.get<AppConfig>('appConfig', {} as any);
        const integ = appConfig?.integrations;
        
        return {
            pat: integ?.airtablePat || '',
            baseId: integ?.airtableBaseId || '',
            tableName: integ?.airtableTableName || 'Users'
        };
    }

    private getHeaders(pat: string) {
        return {
            'Authorization': `Bearer ${pat}`,
            'Content-Type': 'application/json'
        };
    }

    /**
     * Maps local UserProgress to Airtable fields
     */
    private mapUserToRecord(user: UserProgress) {
        const { id, airtableRecordId, name, role, xp, level, telegramId, ...rest } = user;
        
        return {
            fields: {
                "TelegramId": String(telegramId || user.telegramUsername || 'unknown'), 
                "Name": name || 'Unknown',
                "Role": role || 'STUDENT',
                "XP": Number(xp) || 0,
                "Level": Number(level) || 1,
                "Data": JSON.stringify(rest) 
            }
        };
    }

    /**
     * Maps Airtable Record back to UserProgress
     */
    private mapRecordToUser(record: any): UserProgress {
        const fields = record.fields;
        let additionalData = {};
        
        try {
            if (fields.Data) {
                additionalData = JSON.parse(fields.Data);
            }
        } catch (e) {
            console.error('Error parsing User Data from Airtable', e);
        }

        return {
            id: fields.TelegramId, 
            airtableRecordId: record.id,
            telegramId: fields.TelegramId,
            name: fields.Name,
            role: fields.Role,
            xp: fields.XP,
            level: fields.Level,
            ...additionalData
        } as UserProgress;
    }

    /**
     * Smart Sync User
     */
    async syncUser(localUser: UserProgress): Promise<UserProgress> {
        const { pat, baseId } = this.getConfig();

        // If not configured, just return local user (Mock Mode / Offline)
        if (!pat || !baseId) {
            // Logger.debug('Airtable not configured, skipping sync.');
            return localUser;
        }

        try {
            // 1. Check if user exists remotely
            const remoteRecord = await this.findUserByTelegramId(localUser.telegramId || localUser.telegramUsername || '');
            
            if (!remoteRecord) {
                // If not found, create it
                return await this.createRecord(localUser);
            }

            const remoteUser = this.mapRecordToUser(remoteRecord);
            
            // 2. Conflict Resolution
            const localTime = localUser.lastSyncTimestamp || 0;
            const remoteTime = remoteUser.lastSyncTimestamp || 0;

            if (Math.abs(localTime - remoteTime) < 2000) {
                 return localUser; 
            }

            if (localTime > remoteTime) {
                return await this.updateRecord(remoteRecord.id, localUser);
            } else {
                return { ...remoteUser, airtableRecordId: remoteRecord.id };
            }

        } catch (error: any) {
            // Graceful Fallback: If 401/403/404, just log warning and behave as if offline
            if (error.message && (error.message.includes('403') || error.message.includes('401') || error.message.includes('404'))) {
                Logger.warn('Airtable Sync Error (Permissions/Config)', error.message);
                return localUser; 
            }
            // For other errors, rethrow or just return local
            Logger.error('Airtable Sync Error', error);
            return localUser;
        }
    }

    /**
     * Create new record in Airtable
     */
    private async createRecord(user: UserProgress): Promise<UserProgress> {
        const { pat, baseId, tableName } = this.getConfig();
        const url = `https://api.airtable.com/v0/${baseId}/${tableName}`;
        
        const payload = {
            ...this.mapUserToRecord(user),
            typecast: true
        };
        
        const response = await fetch(url, {
            method: 'POST',
            headers: this.getHeaders(pat),
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Failed to create Airtable record: ${response.status} ${response.statusText} - ${errText}`);
        }
        const data = await response.json();
        return { ...user, airtableRecordId: data.id };
    }

    /**
     * Update existing record in Airtable
     */
    private async updateRecord(recordId: string, user: UserProgress): Promise<UserProgress> {
        const { pat, baseId, tableName } = this.getConfig();
        const url = `https://api.airtable.com/v0/${baseId}/${tableName}/${recordId}`;
        const payload = {
            ...this.mapUserToRecord(user),
            typecast: true
        };

        const response = await fetch(url, {
            method: 'PATCH',
            headers: this.getHeaders(pat),
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Failed to update Airtable record: ${response.status} ${response.statusText} - ${errText}`);
        }
        const data = await response.json();
        return { ...user, airtableRecordId: data.id };
    }

    /**
     * Find user by Telegram ID
     */
    async findUserByTelegramId(tgId: string): Promise<any | null> {
        const { pat, baseId, tableName } = this.getConfig();
        if (!pat || !baseId || !tgId) return null;

        const safeId = String(tgId).replace(/'/g, "\\'");
        const filter = encodeURIComponent(`{TelegramId} = '${safeId}'`);
        const url = `https://api.airtable.com/v0/${baseId}/${tableName}?filterByFormula=${filter}`;
        
        try {
            const response = await fetch(url, { headers: this.getHeaders(pat) });
            if (!response.ok) {
                // Return null if table not found or auth error, don't crash
                return null;
            }
            const data = await response.json();
            if (data.records && data.records.length > 0) {
                return data.records[0];
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Get All Users
     */
    async getAllUsers(): Promise<UserProgress[]> {
        const { pat, baseId, tableName } = this.getConfig();
        if (!pat || !baseId) return [];

        const url = `https://api.airtable.com/v0/${baseId}/${tableName}`;
        try {
            const response = await fetch(url, { headers: this.getHeaders(pat) });
            if (!response.ok) return [];
            const data = await response.json();
            
            if (!data.records) return [];

            return data.records.map((r: any) => this.mapRecordToUser(r));
        } catch (error) {
            Logger.error('Airtable Fetch All Error', error);
            return [];
        }
    }
}

export const airtable = new AirtableService();
