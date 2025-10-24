module.exports = function override(config) {
  // Fallbacks pour les modules Node.js
  config.resolve.fallback = {
    ...config.resolve.fallback,
    "path": false,
    "fs": false,
    "crypto": false,
    "stream": false,
    "buffer": false,
    "querystring": false,
    "url": false,
    "util": false
  };

  // Configuration pour WebAssembly
  config.experiments = {
    ...config.experiments,
    asyncWebAssembly: true,
    syncWebAssembly: true
  };

  // Optimisations pour les modules WebAssembly
  config.module = {
    ...config.module,
    rules: [
      ...config.module.rules,
      {
        test: /\.wasm$/,
        type: "webassembly/async"
      }
    ]
  };

  // S'assurer que le nom du fichier WebAssembly reste le même
  config.output = {
    ...config.output,
    webassemblyModuleFilename: "[name].wasm"
  };

  return config;
};