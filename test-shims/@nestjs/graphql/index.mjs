const decorator = () => () => undefined;

export const Resolver = decorator;
export const Query = decorator;
export const Mutation = decorator;
export const Args = decorator;
export const Context = decorator;
export const ObjectType = decorator;
export const Field = decorator;
export const InputType = decorator;
export const ID = {};
export const Int = {};
export const Float = {};
export const GraphQLISODateTime = {};

export class GqlExecutionContext {
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

export const registerEnumType = () => undefined;

const defaultExport = {
  Resolver,
  Query,
  Mutation,
  Args,
  Context,
  ObjectType,
  Field,
  InputType,
  ID,
  Int,
  Float,
  GraphQLISODateTime,
  GqlExecutionContext,
  registerEnumType
};

export default defaultExport;
