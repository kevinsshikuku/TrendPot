const React = require("../../react");

const createElement = (type) => ({ children, ...props }) => ({
  type,
  props: { ...props, children }
});

const Button = createElement("button");
const Card = createElement("div");
const CardContent = createElement("div");
const CardHeader = createElement("div");

module.exports = { Button, Card, CardContent, CardHeader };
