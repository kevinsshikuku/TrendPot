class ObjectId {
  constructor(value) {
    this.value = value ?? "000000000000000000000000";
  }

  toHexString() {
    return this.value;
  }
}

const Types = {
  ObjectId
};

const SchemaTypes = Types;

const mongooseStub = {
  Schema: class Schema {},
  model() {
    return {};
  },
  connection: {},
  Types,
  SchemaTypes
};

module.exports = mongooseStub;
module.exports.Types = Types;
module.exports.SchemaTypes = SchemaTypes;
module.exports.default = mongooseStub;
