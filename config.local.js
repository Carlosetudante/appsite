// Local-only overrides (not for git).
(function () {
  window.OracleConfig = window.OracleConfig || {};
  Object.assign(window.OracleConfig, {
    useLLM: true,
    assistantAutoLLM: true,
    llmProvider: 'local_offline',
    llmModel: 'offline-local',
    localLlmModel: 'offline-local',
    localLlmModelPath: '',
    localLlmContextSize: 2048,
    localLlmMaxTokens: 320,
    localLlmTemperature: 0.68,
    localLlmTopP: 0.9,
    // APIs externas desligadas no perfil offline:
    minimaxApiKey: '',
    rapidapiKey: '',
    rapidapiGeminiKey: '',
    googleGeminiApiKey: '',
    movieApiProvider: 'tmdb',
    movieApiBaseUrl: 'https://api.themoviedb.org/3',
    movieApiImageBaseUrl: 'https://image.tmdb.org/t/p/w342',
    movieEmbedProvider: 'embedmovies',
    movieEmbedBaseUrl: 'https://playerflixapi.com',
    movieApiLanguage: 'pt-BR',
    movieApiRegion: 'BR',
    movieApiKey: '60612f21e29fa58732ad5cef7387de0d'
  });
})();
