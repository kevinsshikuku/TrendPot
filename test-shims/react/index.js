const React = {
  useState(initial) {
    let state = typeof initial === "function" ? initial() : initial;
    const setState = (value) => {
      state = typeof value === "function" ? value(state) : value;
    };
    return [state, setState];
  },
  useEffect() {},
  useMemo(fn) {
    return fn();
  },
  useRef(initial = null) {
    return { current: initial };
  },
  useContext() {
    return null;
  },
  Fragment: Symbol.for("react.fragment")
};

module.exports = React;
module.exports.default = React;
module.exports.useState = React.useState;
module.exports.useEffect = React.useEffect;
module.exports.useMemo = React.useMemo;
module.exports.useRef = React.useRef;
module.exports.useContext = React.useContext;
module.exports.Fragment = React.Fragment;
