export interface TodoPluginSettings {
  dateFormat: string;
  dateTagFormat: string;
  openFilesInNewLeaf: boolean;
  enableDailyReport: boolean;
  dailyReportPath: string;
}

export const DEFAULT_SETTINGS: TodoPluginSettings = {
  dateFormat: 'yyyy-MM-dd',
  dateTagFormat: '#%date%',
  openFilesInNewLeaf: true,
  enableDailyReport: false,
  dailyReportPath: 'Daily Reports',
};
