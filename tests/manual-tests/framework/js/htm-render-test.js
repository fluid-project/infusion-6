"use strict";

/* global preact, preactSignals, htm */

const html = htm.bind(preact.h);
const {signal} = preactSignals;

// eslint-disable-next-line no-unused-vars
const runTests = async function () {

    const leaf = signal("Initial text");
    const prop = signal("Initial prop");

    const nodes = html`<div><div class="inner" prop="${prop}">${leaf}</div></div>`;

    const element = document.querySelector(".target");
    preact.render(nodes, element);
    const inner = element.querySelector(".inner");
    console.log("Got inner value " + inner.textContent);
    console.log("Got inner prop " + inner.getAttribute("prop"));
    leaf.value = "Updated value";
    console.log("Got inner value " + inner.textContent);
    const inner2 = element.querySelector(".inner");
    console.log("Element identical ", inner === inner2);
    prop.value = "Updated prop";
    console.log("Got inner prop " + inner.getAttribute("prop"));
};
