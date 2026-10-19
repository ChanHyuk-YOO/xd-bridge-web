import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { resolveLocale, supportedLocales, translations, setLocale, t, errorText } from '../src/i18n.js';

test('browser locale selects by preference and falls back without geolocation',()=>{
 assert.equal(resolveLocale(['ko-KR','en-US']),'ko');
 assert.equal(resolveLocale(['en-GB','ko-KR']),'en');
 assert.equal(resolveLocale(['ja-JP']),'ja');
 assert.equal(resolveLocale(['zh-TW']),'zh');
 assert.equal(resolveLocale(['zh_Hans_CN']),'zh');
 assert.equal(resolveLocale(['fr-FR','ja-JP']),'ja');
 assert.equal(resolveLocale(['fr-FR']),'en');
 assert.equal(resolveLocale([]),'en');
});
test('every Korean landing-page string has all supported translations',async()=>{
 const html=await fs.readFile('src/index.html','utf8');
 const strings=[...html.matchAll(/>([^<>]*[가-힣][^<>]*)</g)].map(m=>m[1].trim()).filter(s=>s!=='한국어');
 for(const source of strings){assert.ok(translations[source],`Missing translation: ${source}`);for(const language of supportedLocales)assert.equal(typeof translations[source][language],'string');}
 for(const [source,entry]of Object.entries(translations))for(const language of supportedLocales){
  assert.deepEqual([...entry[language].matchAll(/\{\w+\}/g)].map(m=>m[0]).sort(),[...source.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort(),`Parameters changed: ${source}/${language}`);
 }
});
test('translated counts and warnings preserve user content; unknown Korean errors have a localized fallback',()=>{
 setLocale('en');
 assert.equal(t('{count}개 아트보드를 읽었습니다. 변환 보고서도 확인해 주세요.',{count:4}),'Loaded 4 artboards. Check the conversion report too.');
 assert.equal(t('지원하지 않는 도형: ellipse'),'Unsupported shape: ellipse');
 assert.equal(t('고객 문서 이름'),'고객 문서 이름');
 assert.match(errorText('파이썬의 알려지지 않은 오류'),/Conversion failed/);
 setLocale('ja');assert.equal(t('문의하기'),'お問い合わせ');
 setLocale('zh');assert.equal(t('문의하기'),'联系我们');
 setLocale('ko');assert.equal(t('문의하기'),'문의하기');
});
