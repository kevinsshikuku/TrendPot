const React = require("../../react");

const renderNode = (node) => {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(renderNode).join("");
  }
  if (node.type === React.Fragment || node.type === Symbol.for("react.fragment")) {
    return renderNode(node.props?.children);
  }
  if (typeof node.type === "function") {
    return renderNode(node.type(node.props ?? {}));
  }
  const props = node.props ?? {};
  const attrs = Object.entries(props)
    .filter(([key, value]) => key !== "children" && key !== "dangerouslySetInnerHTML" && value !== false && value !== undefined)
    .map(([key, value]) => {
      if (value === true) {
        return key;
      }
      return `${key}="${String(value)}"`;
    })
    .join(" ");
  const openTag = attrs ? `<${node.type} ${attrs}>` : `<${node.type}>`;
  if (props.dangerouslySetInnerHTML?.__html) {
    return `${openTag}${props.dangerouslySetInnerHTML.__html}</${node.type}>`;
  }
  const children = renderNode(props.children);
  return `${openTag}${children}</${node.type}>`;
};

module.exports = {
  renderToString(element) {
    return renderNode(element);
  }
};
