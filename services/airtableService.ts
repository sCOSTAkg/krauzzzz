
import { UserProgress, Module, Lesson, Material, Stream, CalendarEvent, ArenaScenario, AppNotification } from '../types';
import { Logger } from './logger';

// Configuration
const DEFAULT_PAT = process.env.AIRTABLE_PAT || 'YOUR_AIRTABLE_PAT_TOKEN';
const DEFAULT_BASE_ID = 'appNbjsegO01M8Y36';

// Airtable field IDs for type-safe access
const FIELD_IDS = {
  modules: {
    id: 'fldXrKwChjJD4OqP7',
    title: 'fldIfN4rMfFjIKvbd',
    description: 'fldWqrXsxCmtqWWCf',
    category: 'fld3Z0ZI3pkSED9Ki',
    minLevel: 'fldtttFZcTLAFPJux',
    imageUrl: 'fld7nqcBw4LuRQdK1',
    videoUrl: 'fldp5cG4Dq3B5URjL',
    lessons2: 'fldtTLcstPo6J7g2c',
    image: 'fld6M7GkK3OaCLk5g',
    video: 'fldhJBQLxP55HO2Vy'
  },
  lessons: {
    id: 'fldyPMVyiTawKKRUH',
    title: 'fld397SIjkomraTdb',
    description: 'fld4DsUNddjyMGge4',
    content: 'fldgUG51LV5SbUJOO',
    xpReward: 'fldt83CLSrIAFBSwd',
    videoUrl: 'fldzyITATdXow7YFt',
    homeworkType: 'fldqC0NSBhD6rKibz',
    homeworkTask: 'fldVtHqaSds9a9y3J',
    aiGradingInstruction: 'fldU8FWWkWD7hClIx',
    module: 'fldJ8kmNEfzhTDmkw',
    order: 'fld1Zh7UKN6A6EMdA'
  },
  users: {
    telegramId: 'fldconLB26cmAGdcf',
    name: 'fldIsK1eUao1QcVg6',
    role: 'fldGbfhpB0SKtIEVK',
    xp: 'fld0cjpMOJjbQKPhi',
    level: 'fld2uQNqIXSHeVjaT',
    data: 'fld1IGydhxt91GkYB',
    lastSync: 'fldXjmnJFQQ1isAVq'
  }
};

class AirtableService {
  private baseUrl = 'https://api.airtable.com/v0';
  private baseId: string;
  private pat: string;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

  constructor() {
    this.baseId = DEFAULT_BASE_ID;
    this.pat = DEFAULT_PAT;
  }

  // Clear cache manually
  clearCache() {
    this.cache.clear();
    Logger.log('🧹 Airtable cache cleared');
  }

  private async request<T>(endpoint: string, options: RequestInit = {}, useCache = false): Promise<T> {
    // Check cache
    if (useCache && this.cache.has(endpoint)) {
      const cached = this.cache.get(endpoint)!;
      if (Date.now() - cached.timestamp < this.CACHE_TTL) {
        Logger.log(`📦 Using cached data for ${endpoint}`);
        return cached.data;
      }
    }

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
      const data = await response.json();

      // Cache the response
      if (useCache) {
        this.cache.set(endpoint, { data, timestamp: Date.now() });
      }

      return data;
    } catch (error) {
      Logger.error('Airtable request failed', error);
      throw error;
    }
  }

  // Fetch all modules with lessons - OPTIMIZED
  async fetchModules(): Promise<Module[]> {
    try {
      Logger.log('🔄 Fetching modules with lessons from Airtable...');
      const startTime = Date.now();

      // Fetch modules and lessons in parallel
      const [modulesResponse, lessonsResponse] = await Promise.all([
        this.request<{ records: any[] }>('Modules', {}, true),
        this.request<{ records: any[] }>(
          'Lessons?sort%5B0%5D%5Bfield%5D=order&sort%5B0%5D%5Bdirection%5D=asc',
          {},
          true
        )
      ]);

      Logger.log(`✅ Loaded ${modulesResponse.records.length} modules, ${lessonsResponse.records.length} lessons in ${Date.now() - startTime}ms`);

      // Create lessons map by Airtable Record ID
      const lessonsMap = new Map<string, Lesson[]>();

      lessonsResponse.records.forEach(lessonRecord => {
        const fields = lessonRecord.fields;

        const lesson: Lesson = {
          id: String(fields.id || lessonRecord.id),
          title: fields.title || 'Урок без названия',
          description: fields.description || '',
          content: fields.content || '',
          xpReward: Number(fields.xpReward) || 100,
          homeworkType: (fields.homeworkType || 'TEXT') as any,
          homeworkTask: fields.homeworkTask || '',
          aiGradingInstruction: fields.aiGradingInstruction || '',
          videoUrl: fields.videoUrl || ''
        };

        // Get module record IDs
        const moduleLinks = fields.Module || [];
        moduleLinks.forEach((moduleRecordId: string) => {
          if (!lessonsMap.has(moduleRecordId)) {
            lessonsMap.set(moduleRecordId, []);
          }
          lessonsMap.get(moduleRecordId)!.push(lesson);
        });
      });

      Logger.log(`📚 Grouped lessons into ${lessonsMap.size} modules`);

      // Build modules with lessons
      const modules: Module[] = [];
      const seenTitles = new Set<string>();

      modulesResponse.records.forEach(moduleRecord => {
        const fields = moduleRecord.fields;
        const airtableRecordId = moduleRecord.id;

        // Get lessons using "Lessons 2" field first (more reliable), then fallback to Module link
        let moduleLessons = lessonsMap.get(airtableRecordId) || [];

        // If no lessons found via Module link, try Lessons 2 field
        if (moduleLessons.length === 0) {
          const lessons2Field = fields['Lessons 2'] || [];
          if (lessons2Field.length > 0) {
            // Fetch these lessons by their record IDs
            lessons2Field.forEach((lessonRecordId: string) => {
              const lessonRecord = lessonsResponse.records.find(l => l.id === lessonRecordId);
              if (lessonRecord) {
                const lFields = lessonRecord.fields;
                moduleLessons.push({
                  id: String(lFields.id || lessonRecordId),
                  title: lFields.title || 'Урок',
                  description: lFields.description || '',
                  content: lFields.content || '',
                  xpReward: Number(lFields.xpReward) || 100,
                  homeworkType: (lFields.homeworkType || 'TEXT') as any,
                  homeworkTask: lFields.homeworkTask || '',
                  aiGradingInstruction: lFields.aiGradingInstruction || '',
                  videoUrl: lFields.videoUrl || ''
                });
              }
            });
          }
        }

        const module: Module = {
          id: String(fields.id || airtableRecordId),
          title: fields.title || 'Модуль',
          description: fields.description || '',
          category: this.mapCategory(fields.category),
          minLevel: Number(fields.minLevel) || 1,
          imageUrl: fields.imageUrl || this.getImageFromAttachments(fields.image),
          videoUrl: fields.videoUrl || this.getVideoFromAttachments(fields.video),
          pdfUrl: '',
          lessons: moduleLessons
        };

        // Avoid duplicates by title
        if (!seenTitles.has(module.title)) {
          seenTitles.add(module.title);
          modules.push(module);
          Logger.log(`  📚 ${module.title}: ${moduleLessons.length} уроков`);
        }
      });

      Logger.log(`✅ Returning ${modules.length} unique modules`);
      return modules;

    } catch (error) {
      Logger.error('❌ Failed to fetch modules', error);
      return [];
    }
  }

  // Fetch lessons only
  async fetchLessons(): Promise<Lesson[]> {
    try {
      const data = await this.request<{ records: any[] }>(
        'Lessons?sort%5B0%5D%5Bfield%5D=order&sort%5B0%5D%5Bdirection%5D=asc',
        {},
        true
      );

      return data.records.map(record => ({
        id: String(record.fields.id || record.id),
        title: record.fields.title || 'Урок',
        description: record.fields.description || '',
        content: record.fields.content || '',
        xpReward: Number(record.fields.xpReward) || 100,
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

  // Fetch materials - OPTIMIZED
  async fetchMaterials(): Promise<Material[]> {
    try {
      const data = await this.request<{ records: any[] }>('Materials', {}, true);
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

  // Fetch streams - OPTIMIZED
  async fetchStreams(): Promise<Stream[]> {
    try {
      const data = await this.request<{ records: any[] }>('Streams', {}, true);
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

  // Sync user progress - OPTIMIZED
  async syncUserProgress(user: UserProgress): Promise<boolean> {
    try {
      const telegramId = user.telegramId || user.id || '';
      if (!telegramId) {
        Logger.warn('No telegramId for user sync');
        return false;
      }

      // Check if user exists
      const checkUrl = `Users?filterByFormula={TelegramId}="${telegramId}"`;
      const checkData = await this.request<{ records: any[] }>(checkUrl);

      const userData = {
        TelegramId: telegramId,
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
          goals: user.goals,
          theme: user.theme,
          notifications: user.notifications
        }),
        LastSync: Date.now()
      };

      if (checkData.records.length > 0) {
        // Update existing
        const recordId = checkData.records[0].id;
        await this.request(`Users/${recordId}`, {
          method: 'PATCH',
          body: JSON.stringify({ fields: userData })
        });
        Logger.log('✅ User updated in Airtable');
      } else {
        // Create new
        await this.request('Users', {
          method: 'POST',
          body: JSON.stringify({ fields: userData })
        });
        Logger.log('✅ New user created in Airtable');
      }

      return true;
    } catch (error) {
      Logger.error('Failed to sync user', error);
      return false;
    }
  }

  // Load user progress
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
        id: fields.TelegramId,
        telegramId: fields.TelegramId,
        name: fields.Name || 'User',
        role: fields.Role || 'STUDENT',
        isAuthenticated: true,
        xp: Number(fields.XP) || 0,
        level: Number(fields.Level) || 1,
        completedLessonIds: parsedData.completedLessonIds || [],
        submittedHomeworks: parsedData.submittedHomeworks || [],
        chatHistory: parsedData.chatHistory || [],
        notebook: parsedData.notebook || [],
        habits: parsedData.habits || [],
        goals: parsedData.goals || [],
        theme: parsedData.theme || 'LIGHT',
        notifications: parsedData.notifications || {
          pushEnabled: false,
          telegramSync: false,
          deadlineReminders: false,
          chatNotifications: false
        },
        airtableRecordId: record.id,
        lastSyncTimestamp: Number(fields.LastSync) || Date.now(),
        registrationDate: record.createdTime
      } as UserProgress;
    } catch (error) {
      Logger.error('Failed to load user from Airtable', error);
      return null;
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
