const decorator = () => () => undefined;
const InjectModel = decorator;
const Schema = decorator;
const Prop = decorator;
const SchemaFactory = {
  createForClass() {
    return {
      virtual() {
        return {
          get() {
            return undefined;
          }
        };
      }
    };
  }
};
const MongooseModule = {
  forRoot() {
    return {};
  },
  forFeature() {
    return {};
  }
};
module.exports = { InjectModel, Schema, Prop, SchemaFactory, MongooseModule };
