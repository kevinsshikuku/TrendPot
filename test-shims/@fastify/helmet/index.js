function helmet() {
  return async function helmetPlugin() {
    return undefined;
  };
}

module.exports = helmet;
module.exports.default = helmet;
