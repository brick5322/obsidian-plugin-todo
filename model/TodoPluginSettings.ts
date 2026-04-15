export interface CompletedTaskRecord {
  taskId: string;           // content hash for deduplication
  path: string;             // source file path
  content: string;          // task description
  completedAt: string;      // ISO timestamp
  subtasks: CompletedTaskRecord[];
}

export interface TodoPluginSettings {
  dateFormat: string;
  dateTagFormat: string;
  openFilesInNewLeaf: boolean;
  enableDailyReport: boolean;
  dailyReportPath: string;
  dailyReportWhitelist: string;
  dailyReportTodayHeader: string;
  dailyReportNextHeader: string;
  dailyReportData: {
    date: string;
    completedTasks: CompletedTaskRecord[];
  };
  excludedDirectories: string;
}

export const DEFAULT_SETTINGS: TodoPluginSettings = {
  dateFormat: 'yyyy-MM-dd',
  dateTagFormat: '#%date%',
  openFilesInNewLeaf: true,
  enableDailyReport: false,
  dailyReportPath: 'Daily Reports',
  dailyReportWhitelist: '',
  dailyReportTodayHeader: '【今日工作】',
  dailyReportNextHeader: '【明日工作】',
  dailyReportData: {
    date: '',
    completedTasks: [],
  },
  excludedDirectories: '',
};
