/**
 * Karate global config.
 *
 * Resolution order for baseUrl:
 *   1. -Dbase.url=...           (system property)
 *   2. BASE_URL                  (environment variable)
 *   3. per-env block below       (default: local)
 *
 * Login is performed exactly ONCE per JVM via karate.callSingle(...). The
 * resulting JWT is exposed at config.authToken and a ready-to-use headers
 * object at config.headers - so feature Backgrounds just say:
 *
 *     Background:
 *       * configure headers = headers
 */
function fn() {
  var env = karate.env || 'local';
  karate.log('karate.env =', env);

  var systemBase = karate.properties['base.url'];
  var envBase = java.lang.System.getenv('BASE_URL');

  var config = {
    env: env,
    baseUrl: systemBase || envBase || 'http://localhost:3000',
    auth: {
      endpoint: '/auth/login',
      username: 'user1',
      password: 'password1'
    },
    timeouts: {
      connect: 5000,
      read: 15000
    }
  };

  if (env === 'docker') {
    config.baseUrl = systemBase || envBase || 'http://claims-server:3000';
  }

  karate.configure('connectTimeout', config.timeouts.connect);
  karate.configure('readTimeout', config.timeouts.read);

  // One-shot login; the result is cached for the whole JVM run.
  // Wrapped so feature lookup failures during dry-runs don't tank config.
  try {
    var loginResult = karate.callSingle('classpath:features/_common/auth.feature', config);
    config.authToken = loginResult.accessToken;
    config.headers = { Authorization: 'Bearer ' + loginResult.accessToken };
  } catch (e) {
    karate.log('callSingle login failed (server up?):', e);
    config.authToken = null;
    config.headers = {};
  }

  return config;
}
