import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code = fs.readFileSync(new URL('../public/legal-language.js', import.meta.url), 'utf8');
for (const [search, saved, browser, expected] of [['?lang=es', 'en', 'en', 'es'], ['?lang=en', 'es', 'es', 'en'], ['', 'es', 'en', 'es'], ['', null, 'es-ES', 'es'], ['?lang=invalid', null, 'fr', 'en']]) {
  const document = { documentElement: {}, title: '' };
  vm.runInNewContext(code, { document, location: { search, pathname: '/privacy.html' }, navigator: { language: browser }, localStorage: { getItem: () => saved }, URLSearchParams });
  assert.equal(document.documentElement.lang, expected);
  assert.equal(document.title, `${expected === 'es' ? 'Privacidad' : 'Privacy'} · A Deafening Noise`);
}
