import { App, PluginSettingTab, Setting } from 'obsidian';
import { DateTime } from 'luxon';
import TodoPlugin from 'main';
import { DEFAULT_SETTINGS } from '../model/TodoPluginSettings';
import { t } from '../lang/helpers';

export class SettingsTab extends PluginSettingTab {
  private plugin: TodoPlugin;

  constructor(app: App, plugin: TodoPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    const currentSettings = this.plugin.getSettings();

    containerEl.empty();

    containerEl.createEl('h2', { text: t('SETTINGS_HEADING') });

    const tagFormatSetting = new Setting(containerEl);
    tagFormatSetting
      .setName(t('DATE_TAG_FORMAT_NAME'))
      .setDesc(this.dateTagFormatDescription())
      .addText((text) =>
        text.setPlaceholder(currentSettings.dateTagFormat).onChange(async (dateTagFormat) => {
          // TODO: refactor this
          if (dateTagFormat.length === 0) {
            dateTagFormat = DEFAULT_SETTINGS.dateTagFormat;
          }

          if (!this.validateDateTag(dateTagFormat)) {
            tagFormatSetting.descEl.empty();
            tagFormatSetting.setDesc(this.dateTagFormatDescription(t('DATE_TAG_FORMAT_MUST_INCLUDE')));
            return;
          }

          tagFormatSetting.descEl.empty();
          tagFormatSetting.setDesc(this.dateTagFormatDescription());

          this.plugin.updateSettings({ ...currentSettings, dateTagFormat });
        }),
      );

    const dateFormatSetting = new Setting(containerEl);
    dateFormatSetting
      .setName(t('DATE_FORMAT_NAME'))
      .setDesc(this.dateFormatDescription())
      .addText((text) =>
        text.setPlaceholder(currentSettings.dateFormat).onChange(async (dateFormat) => {
          // TODO: refactor this
          if (dateFormat.length === 0) {
            dateFormat = DEFAULT_SETTINGS.dateFormat;
          }

          if (!this.validateDateFormat(dateFormat)) {
            dateFormatSetting.descEl.empty();
            dateFormatSetting.setDesc(this.dateTagFormatDescription('Invalid date format.'));
            return;
          }

          dateFormatSetting.descEl.empty();
          dateFormatSetting.setDesc(this.dateTagFormatDescription());

          this.plugin.updateSettings({ ...currentSettings, dateFormat });
        }),
      );

    new Setting(containerEl)
      .setName(t('OPEN_IN_NEW_LEAF_NAME'))
      .setDesc(t('OPEN_IN_NEW_LEAF_DESC'))
      .addToggle((toggle) => {
        toggle.setValue(currentSettings.openFilesInNewLeaf);
        toggle.onChange(async (openFilesInNewLeaf) => {
          this.plugin.updateSettings({ ...currentSettings, openFilesInNewLeaf });
        });
      });

    new Setting(containerEl)
      .setName(t('EXCLUDED_DIRS_NAME'))
      .setDesc(t('EXCLUDED_DIRS_DESC'))
      .addTextArea((text) =>
        text
          .setPlaceholder('Folder1, Folder2/Subfolder')
          .setValue(currentSettings.excludedDirectories)
          .onChange(async (excludedDirectories) => {
            this.plugin.updateSettings({ ...currentSettings, excludedDirectories });
          }),
      );

    new Setting(containerEl).setName(t('DAILY_REPORT_HEADING')).setHeading();

    new Setting(containerEl)
      .setName(t('ENABLE_DAILY_REPORT_NAME'))
      .setDesc(t('ENABLE_DAILY_REPORT_DESC'))
      .addToggle((toggle) => {
        toggle.setValue(currentSettings.enableDailyReport);
        toggle.onChange(async (enableDailyReport) => {
          this.plugin.updateSettings({ ...currentSettings, enableDailyReport });
        });
      });

    new Setting(containerEl)
      .setName(t('DAILY_REPORT_PATH_NAME'))
      .setDesc(t('DAILY_REPORT_PATH_DESC'))
      .addText((text) =>
        text.setPlaceholder(currentSettings.dailyReportPath).onChange(async (dailyReportPath) => {
          if (dailyReportPath.length === 0) {
            dailyReportPath = DEFAULT_SETTINGS.dailyReportPath;
          }
          this.plugin.updateSettings({ ...currentSettings, dailyReportPath });
        }),
      );

    new Setting(containerEl)
      .setName(t('DAILY_REPORT_WHITELIST_NAME'))
      .setDesc(t('DAILY_REPORT_WHITELIST_DESC'))
      .addTextArea((text) =>
        text
          .setPlaceholder('Folder/Subfolder, AnotherFolder')
          .setValue(currentSettings.dailyReportWhitelist)
          .onChange(async (dailyReportWhitelist) => {
            this.plugin.updateSettings({ ...currentSettings, dailyReportWhitelist });
          }),
      );

    new Setting(containerEl)
      .setName(t('TODAY_WORK_HEADER_NAME'))
      .setDesc(t('TODAY_WORK_HEADER_DESC'))
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.dailyReportTodayHeader)
          .setValue(currentSettings.dailyReportTodayHeader)
          .onChange(async (dailyReportTodayHeader) => {
            this.plugin.updateSettings({ ...currentSettings, dailyReportTodayHeader });
          }),
      );

    new Setting(containerEl)
      .setName(t('NEXT_TASKS_HEADER_NAME'))
      .setDesc(t('NEXT_TASKS_HEADER_DESC'))
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.dailyReportNextHeader)
          .setValue(currentSettings.dailyReportNextHeader)
          .onChange(async (dailyReportNextHeader) => {
            this.plugin.updateSettings({ ...currentSettings, dailyReportNextHeader });
          }),
      );
  }

  private dateTagFormatDescription(error?: string): DocumentFragment {
    const el = document.createDocumentFragment();
    el.appendText(t('DATE_TAG_FORMAT_DESC'));
    el.appendChild(document.createElement('br'));
    el.appendText(t('DATE_TAG_FORMAT_MUST_INCLUDE'));
    el.appendChild(document.createElement('br'));
    el.appendText(t('DATE_TAG_FORMAT_SEE_DATE_FORMAT'));
    if (error != null) {
      el.appendChild(document.createElement('br'));
      el.appendText(`${t('ERROR_PREFIX')}${error}`);
    }
    return el;
  }

  private dateFormatDescription(error?: string): DocumentFragment {
    const el = document.createDocumentFragment();
    el.appendText(t('DATE_FORMAT_DESC'));
    el.appendChild(document.createElement('br'));

    const a = document.createElement('a');
    a.href = 'https://moment.github.io/luxon/#/formatting?id=table-of-tokens';
    a.text = t('SEE_DOCS');
    a.target = '_blank';
    el.appendChild(a);

    if (error != null) {
      el.appendChild(document.createElement('br'));
      el.appendText(`${t('ERROR_PREFIX')}${error}`);
    }
    return el;
  }

  private validateDateTag(dateTag: string): boolean {
    if (dateTag.length === 0) {
      return true;
    }
    return dateTag.includes('%date%');
  }

  private validateDateFormat(dateFormat: string): boolean {
    if (dateFormat.length === 0) {
      return true;
    }
    const expected = DateTime.fromISO('2020-05-25');
    const formatted = expected.toFormat(dateFormat);
    const parsed = DateTime.fromFormat(formatted, dateFormat);
    return parsed.hasSame(expected, 'day') && parsed.hasSame(expected, 'month') && parsed.hasSame(expected, 'year');
  }
}
