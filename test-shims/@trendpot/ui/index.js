const React = require("../../react");
const createElement = (type) => ({ children, ...props }) => ({ type, props: { ...props, children } });

const Button = createElement("button");
const Input = createElement("input");
const Label = createElement("label");
const Card = createElement("div");
const CardHeader = createElement("div");
const CardContent = createElement("div");
const CardFooter = createElement("div");

module.exports = { Button, Input, Label, Card, CardHeader, CardContent, CardFooter };

