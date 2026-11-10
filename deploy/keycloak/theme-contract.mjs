// The application has one supported language. Keep the realm and native theme
// aligned; the English message bundle is only a fallback for legacy realms.
export const themeLocaleSettings = () => ({
  internationalizationEnabled: true,
  supportedLocales: ['es'],
  defaultLocale: 'es',
});

const isConfigured = realm => realm.internationalizationEnabled === true
  && realm.defaultLocale === 'es'
  && Array.isArray(realm.supportedLocales)
  && realm.supportedLocales.length === 1 && realm.supportedLocales[0] === 'es';

export function inspectThemeLocale(realm) {
  if (isConfigured(realm)) return false;
  // Upgrade only the known previous contract, not a different language policy
  // deliberately configured by an operator.
  const legacy = [undefined, false].includes(realm.internationalizationEnabled)
    && [undefined, null, '', 'en', 'es'].includes(realm.defaultLocale)
    && (realm.supportedLocales == null || (Array.isArray(realm.supportedLocales)
      && realm.supportedLocales.every(locale => locale === 'es' || locale === 'en')));
  if (!legacy) throw Error('KEYCLOAK_BOOTSTRAP: idioma del realm incompatible; revisar la configuracion administrativa antes de continuar');
  return true;
}

export async function applyThemeLocale(request) {
  const desired = themeLocaleSettings();
  // Admin REST supports a partial RealmRepresentation. Never replace users,
  // clients, password policy, localization overrides or unrelated attributes.
  await request('', 'PUT', desired);
  const actual = await request('');
  if (!isConfigured(actual)) throw Error('KEYCLOAK_BOOTSTRAP: no se pudo verificar el idioma del tema aplicado');
  return desired;
}
