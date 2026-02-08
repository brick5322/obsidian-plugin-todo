export interface TodoPluginSettings {
  dateFormat: string;
  dateTagFormat: string;
  openFilesInNewLeaf: boolean;
  enableDailyReport: boolean;
  dailyReportPath: string;
  dailyReportWhitelist: string;
  dailyReportTodayHeader: string;
  dailyReportNextHeader: string;
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
};
