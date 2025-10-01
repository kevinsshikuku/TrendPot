class NestException extends Error {
  constructor(message) {
    super(message);
    this.name = new.target.name;
  }
}

class BadRequestException extends NestException {}
class UnauthorizedException extends NestException {}
class ForbiddenException extends NestException {}
class ConflictException extends NestException {}
class TooManyRequestsException extends NestException {}

const decorator = () => () => undefined;
const Module = decorator;
const Injectable = decorator;
const SetMetadata = () => decorator();

class Logger {
  log() {}
  error() {}
  warn() {}
  info() {}
  debug() {}
}

module.exports = {
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  TooManyRequestsException,
  Module,
  Injectable,
  SetMetadata,
  Logger
};
