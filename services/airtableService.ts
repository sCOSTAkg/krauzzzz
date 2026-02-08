
import { AppConfig, UserProgress, Module, Lesson, Material, Stream, CalendarEvent, ArenaScenario, AppNotification } from '../types';
import { Logger } from './logger';
import { Storage } from './storage';

// Configuration
const DEFAULT_PAT = process.env.AIRTABLE_PAT || 'YOUR_AIRTABLE_PAT_TOKEN';
const DEFAULT_BASE_ID = 'appNbjsegO01M8Y36';

class AirtableService {
  private baseUrl = 'https://api.airtable.com/v0';
  private baseId: string;
  private pat: string;

  constructor() {
    this.baseId = DEFAULT_BASE_ID;
    this.pat = DEFAULT_PAT;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/${this.baseId}/${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.pat}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    try {
      const response = await fetch(url, { ...options, headers });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Airtable API error: ${response.status} - ${errorText}`);
      }
      return await response.json();
    } catch (error) {
      Logger.error('Airtable request failed', error);
      throw error;
    }
  }

  // Fetch all modules with lessons from Airtable
  async fetchModules(): Promise<Module[]> {
    try {
      Logger.log('Fetching modules and lessons from Airtable...');

      // Fetch all lessons first
      const lessonsResponse = await this.request<{ records: any[] }>(
        'Lessons?sort%5B0%5D%5Bfield%5D=order&sort%5B0%5D%5Bdirection%5D=asc'
      );

      Logger.log(`Loaded ${lessonsResponse.records.length} lessons from Airtable`);

      // Create a map: Module Airtable Record ID -> Lessons
      const lessonsMap = new Map<string, Lesson[]>();

      lessonsResponse.records.forEach(lessonRecord => {
        const fields = lessonRecord.fields;

        // Create lesson object
        const lesson: Lesson = {
          id: String(fields.id || lessonRecord.id),
          title: fields.title || 'Урок без названия',
          description: fields.description || '',
          content: fields.content || '',
          xpReward: fields.xpReward || 100,
          homeworkType: (fields.homeworkType || 'TEXT') as any,
          homeworkTask: fields.homeworkTask || '',
          aiGradingInstruction: fields.aiGradingInstruction || '',
          videoUrl: fields.videoUrl || ''
        };

        // Get module links (these are Airtable record IDs like "recXXXXX")
        const moduleLinks = fields.Module || [];

        // Add this lesson to all its linked modules
        moduleLinks.forEach((moduleRecordId: string) => {
          if (!lessonsMap.has(moduleRecordId)) {
            lessonsMap.set(moduleRecordId, []);
          }
          lessonsMap.get(moduleRecordId)!.push(lesson);
        });
      });

      Logger.log(`Grouped lessons into ${lessonsMap.size} module groups`);

      // Now fetch modules
      const modulesResponse = await this.request<{ records: any[] }>('Modules');
      Logger.log(`Loaded ${modulesResponse.records.length} modules from Airtable`);

      const modules: Module[] = modulesResponse.records.map(moduleRecord => {
        const fields = moduleRecord.fields;
        const airtableRecordId = moduleRecord.id; // This is like "rec7BXKrGzAVDGKBM"

        // Get lessons for this module using its Airtable record ID
        const moduleLessons = lessonsMap.get(airtableRecordId) || [];

        const module: Module = {
          id: String(fields.id || airtableRecordId),
          title: fields.title || 'Модуль без названия',
          description: fields.description || '',
          category: this.mapCategory(fields.category),
          minLevel: fields.minLevel || 1,
          imageUrl: fields.imageUrl || this.getImageFromAttachments(fields.image),
          videoUrl: fields.videoUrl || this.getVideoFromAttachments(fields.video),
          pdfUrl: fields.pdfUrl || '',
          lessons: moduleLessons.sort((a, b) => {
            // Sort lessons by order if available
            return 0; // Keep original order from Airtable sort
          })
        };

        Logger.log(`Module "${module.title}" has ${moduleLessons.length} lessons`);
        return module;
      });

      // Filter out duplicate modules (keep only those with lessons or unique titles)
      const uniqueModules = modules.filter((mod, index, self) => {
        // Keep if has lessons
        if (mod.lessons && mod.lessons.length > 0) return true;
        // Or if it's the first occurrence of this title
        return index === self.findIndex(m => m.title === mod.title);
      });

      Logger.log(`Returning ${uniqueModules.length} unique modules`);
      return uniqueModules;
    } catch (error) {
      Logger.error('Failed to fetch modules with lessons', error);
      return [];
    }
  }

  // Fetch all lessons
  async fetchLessons(): Promise<Lesson[]> {
    try {
      const data = await this.request<{ records: any[] }>(
        'Lessons?sort%5B0%5D%5Bfield%5D=order&sort%5B0%5D%5Bdirection%5D=asc'
      );
      return data.records.map(record => ({
        id: String(record.fields.id || record.id),
        title: record.fields.title || 'Урок без названия',
        description: record.fields.description || '',
        content: record.fields.content || '',
        xpReward: record.fields.xpReward || 100,
        homeworkType: (record.fields.homeworkType || 'TEXT') as any,
        homeworkTask: record.fields.homeworkTask || '',
        aiGradingInstruction: record.fields.aiGradingInstruction || '',
        videoUrl: record.fields.videoUrl || ''
      }));
    } catch (error) {
      Logger.error('Failed to fetch lessons', error);
      return [];
    }
  }

  // Sync user progress to Airtable
  async syncUserProgress(user: UserProgress): Promise<boolean> {
    try {
      const checkData = await this.request<{ records: any[] }>(
        `Users?filterByFormula={TelegramId}="${user.telegramId || user.id}"`
      );

      const userData = {
        TelegramId: user.telegramId || user.id || '',
        Name: user.name,
        Role: user.role,
        XP: user.xp,
        Level: user.level,
        Data: JSON.stringify({
          completedLessonIds: user.completedLessonIds,
          submittedHomeworks: user.submittedHomeworks,
          chatHistory: user.chatHistory,
          notebook: user.notebook,
          habits: user.habits,
          goals: user.goals
        }),
        LastSync: Date.now()
      };

      if (checkData.records.length > 0) {
        const recordId = checkData.records[0].id;
        await this.request(`Users/${recordId}`, {
          method: 'PATCH',
          body: JSON.stringify({ fields: userData })
        });
      } else {
        await this.request('Users', {
          method: 'POST',
          body: JSON.stringify({ fields: userData })
        });
      }

      Logger.log('User synced to Airtable', user.telegramId);
      return true;
    } catch (error) {
      Logger.error('Failed to sync user', error);
      return false;
    }
  }

  // Load user progress from Airtable
  async loadUserProgress(telegramId: string): Promise<UserProgress | null> {
    try {
      const data = await this.request<{ records: any[] }>(
        `Users?filterByFormula={TelegramId}="${telegramId}"`
      );

      if (data.records.length === 0) return null;

      const record = data.records[0];
      const fields = record.fields;
      const parsedData = fields.Data ? JSON.parse(fields.Data) : {};

      return {
        ...Storage.getDefaultUserProgress(),
        telegramId: fields.TelegramId,
        name: fields.Name || 'User',
        role: fields.Role || 'STUDENT',
        xp: fields.XP || 0,
        level: fields.Level || 1,
        completedLessonIds: parsedData.completedLessonIds || [],
        submittedHomeworks: parsedData.submittedHomeworks || [],
        chatHistory: parsedData.chatHistory || [],
        notebook: parsedData.notebook || [],
        habits: parsedData.habits || [],
        goals: parsedData.goals || [],
        airtableRecordId: record.id,
        lastSyncTimestamp: fields.LastSync || Date.now()
      };
    } catch (error) {
      Logger.error('Failed to load user from Airtable', error);
      return null;
    }
  }

  // Fetch materials
  async fetchMaterials(): Promise<Material[]> {
    try {
      const data = await this.request<{ records: any[] }>('Materials');
      return data.records.map(record => ({
        id: String(record.fields.id || record.id),
        title: record.fields.title || '',
        description: record.fields.description || '',
        type: (record.fields.type || 'LINK') as any,
        url: record.fields.url || ''
      }));
    } catch (error) {
      Logger.error('Failed to fetch materials', error);
      return [];
    }
  }

  // Fetch streams
  async fetchStreams(): Promise<Stream[]> {
    try {
      const data = await this.request<{ records: any[] }>('Streams');
      return data.records.map(record => ({
        id: String(record.fields.id || record.id),
        title: record.fields.title || '',
        date: record.fields.date || new Date().toISOString(),
        youtubeUrl: record.fields.youtubeUrl || '',
        status: (record.fields.status || 'UPCOMING') as any
      }));
    } catch (error) {
      Logger.error('Failed to fetch streams', error);
      return [];
    }
  }

  // Helper methods
  private mapCategory(airtableCategory: string): any {
    const mapping: Record<string, string> = {
      'Модуль 1': 'GENERAL',
      'Модуль 2': 'SALES',
      'Модуль 3': 'PSYCHOLOGY',
      'Модуль 4': 'TACTICS',
      'Модуль 5': 'GENERAL'
    };
    return mapping[airtableCategory] || 'GENERAL';
  }

  private getImageFromAttachments(attachments: any[]): string {
    if (!attachments || attachments.length === 0) return '';
    return attachments[0].url || '';
  }

  private getVideoFromAttachments(attachments: any[]): string {
    if (!attachments || attachments.length === 0) return '';
    return attachments[0].url || '';
  }
}

// Export both for backward compatibility
export const airtableService = new AirtableService();
export const airtable = airtableService;
