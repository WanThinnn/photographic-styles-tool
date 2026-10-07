import test from 'node:test';
import assert from 'node:assert/strict';
import {preferredLanguage,STRINGS,t} from '../../web/src/i18n.js';

test('browser Vietnamese defaults to Vietnamese, with explicit choices taking priority',()=>{
  assert.equal(preferredLanguage({languages:['vi-VN','en-US']}),'vi');
  assert.equal(preferredLanguage({saved:'en',languages:['vi-VN']}),'en');
  assert.equal(preferredLanguage({saved:'zh',languages:['vi-VN']}),'zh');
  assert.equal(preferredLanguage({saved:'vi',languages:['en-US']}),'vi');
});

test('unsupported locales fall back to the first supported browser language',()=>{
  assert.equal(preferredLanguage({languages:['vi-VN','en-US']}),'vi');
  assert.equal(preferredLanguage({languages:['zh-Hant-TW']}),'zh');
  assert.equal(preferredLanguage({languages:['fr-FR','en-US','zh-CN']}),'en');
  assert.equal(preferredLanguage({saved:'unsupported',languages:['fr-FR']}),'en');
  assert.equal(preferredLanguage({saved:'constructor'}),'en');
});

test('Vietnamese includes every existing UI and processing message',()=>{
  assert.deepEqual(Object.keys(STRINGS.vi).sort(),Object.keys(STRINGS.en).sort());
  for(const key of Object.keys(STRINGS.en)) assert.ok(t('vi',key).trim(),key);
  assert.equal(t('vi','btn.download'),'Tải xuống');
  assert.equal(t('vi','st.ready'),'Đã xong');
});
