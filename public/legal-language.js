(() => {
  let saved;
  try { saved = localStorage.getItem('adn-language'); } catch { /* Use explicit or browser language. */ }
  const requested = new URLSearchParams(location.search).get('lang');
  const language = [requested, saved].find((value) => value === 'es' || value === 'en') || (navigator.language.startsWith('es') ? 'es' : 'en');
  document.documentElement.lang = language;
  const privacy = location.pathname.endsWith('/privacy.html');
  document.title = `${language === 'es' ? privacy ? 'Privacidad' : 'Condiciones de uso' : privacy ? 'Privacy' : 'Terms of use'} · A Deafening Noise`;
})();
