import { DEFAULT_SETTINGS } from './TodoPluginSettings';

describe('TodoPluginSettings', () => {
  test('does not include excluded-directory settings', () => {
    expect(DEFAULT_SETTINGS).toEqual({
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
    });
  });
});
