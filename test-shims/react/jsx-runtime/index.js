function createElement(type, props, key, isStaticChildren, source, self) {
  const children = props?.children;
  const rest = { ...props, children };
  return { type, props: rest, children, key: key ?? null };
}

module.exports = {
  jsx: createElement,
  jsxs: createElement,
  Fragment: Symbol.for("react.fragment")
};
