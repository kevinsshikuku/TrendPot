const React = require("../../react");

const Button = ({ children, ...props }) => {
  return { type: "button", props: { ...props, children } };
};

module.exports = { Button };
