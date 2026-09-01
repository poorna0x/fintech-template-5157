(function () {
  try {
    if (localStorage.getItem('hro_cookie_consent_v1')) {
      document.documentElement.classList.add('hro-cookie-choice-known');
    }
  } catch (e) {}
})();
