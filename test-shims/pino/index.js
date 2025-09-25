function createLogger() {
  const logger = {
    child() {
      return logger;
    },
    info() {},
    warn() {},
    error() {},
    debug() {}
  };
  return logger;
}

module.exports = function pino() {
  return createLogger();
};

module.exports.stdTimeFunctions = {
  isoTime: () => new Date().toISOString()
};
