import { describe, expect, it } from 'vitest';
import { DEFAULT_LANGUAGE, normalizeLanguage, translate, translateDynamic } from './i18n';

describe('interface localization', () => {
  it('defaults unsupported or empty language values to Chinese', () => {
    expect(normalizeLanguage()).toBe(DEFAULT_LANGUAGE);
    expect(normalizeLanguage('fr')).toBe(DEFAULT_LANGUAGE);
    expect(normalizeLanguage('en')).toBe('en');
  });

  it('translates interface labels while keeping Chinese as the source language', () => {
    expect(translate('zh', '模型实验室')).toBe('模型实验室');
    expect(translate('en', '模型实验室')).toBe('Model Lab');
    expect(translate('en', '文生图')).toBe('Text to Image');
  });

  it('translates dynamic status messages without changing their values', () => {
    expect(translateDynamic('en', '已提交：task_123')).toBe('Submitted: task_123');
    expect(translateDynamic('en', '视频下载失败：token missing')).toBe('Video download failed: token missing');
    expect(translateDynamic('zh', '已提交：task_123')).toBe('已提交：task_123');
  });
});
