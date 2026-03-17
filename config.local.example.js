// Copy to `config.local.js` for local overrides.
(function () {
  window.OracleConfig = window.OracleConfig || {};
  Object.assign(window.OracleConfig, {
    useLLM: true,
    llmProvider: 'local_offline',
    llmModel: 'offline-local',
    localLlmModel: 'offline-local',
    localLlmModelPath: '',
    localLlmContextSize: 2048,
    localLlmMaxTokens: 320,
    localLlmTemperature: 0.68,
    localLlmTopP: 0.9,
    movieApiProvider: 'tmdb',
    movieApiBaseUrl: 'https://api.themoviedb.org/3',
    movieApiImageBaseUrl: 'https://image.tmdb.org/t/p/w342',
    movieApiLanguage: 'pt-BR',
    movieApiRegion: 'BR',
    movieApiKey: '',
    telemetry: true,
    telemetrySample: 1.0
  });
})();
