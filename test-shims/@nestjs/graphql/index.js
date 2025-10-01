const decorator = () => () => undefined;
const Resolver = decorator;
const Query = decorator;
const Mutation = decorator;
const Args = decorator;
const ObjectType = decorator;
const Field = decorator;
const InputType = decorator;
const Int = {};
const Float = {};
const GraphQLISODateTime = {};
const registerEnumType = () => undefined;

class GqlExecutionContext {
  constructor(payload) {
    this.payload = payload ?? { context: {}, info: {} };
  }

  static create(executionContext) {
    if (executionContext && executionContext.__gql) {
      return new GqlExecutionContext(executionContext.__gql);
    }

    const fallback = {
      context: executionContext?.context ?? {},
      info: executionContext?.info ?? {}
    };

    return new GqlExecutionContext(fallback);
  }

  getContext() {
    return this.payload.context;
  }

  getInfo() {
    return this.payload.info;
  }
}

module.exports = {
  Resolver,
  Query,
  Mutation,
  Args,
  ObjectType,
  Field,
  InputType,
  Int,
  Float,
  GraphQLISODateTime,
  registerEnumType,
  GqlExecutionContext
};
