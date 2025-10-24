inde// src/mocks/index.js
if (process.env.NODE_ENV === 'development') {
  const { worker } = require('./browser')
  worker.start({
    onUnhandledRequest: 'bypass', // 'warn' pour le débogage
  })
}x