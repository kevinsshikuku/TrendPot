class BadRequestException extends Error {}
const decorator = () => () => undefined;
const Module = decorator;
const Injectable = decorator;
class Logger {
  log() {
    /* no-op for tests */
  }
  error() {
    /* no-op for tests */
  }
}
module.exports = { BadRequestException, Module, Injectable, Logger };
