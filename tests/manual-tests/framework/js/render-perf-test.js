"use strict";

/* global preact, Vue */

const medianWithoutExtremes = function (results) {
    results.sort((a, b) => a - b);
    results.shift();
    results.pop();
    return results[Math.floor(results.length / 2)];
};

const makeProcessor = function (h) {
    const processElement = function (element) {
        if (element.nodeType === Node.TEXT_NODE) {
            return element.nodeValue.trim() || null; // Return text content directly
        }

        if (element.nodeType === Node.ELEMENT_NODE) {
            const tagName = element.tagName.toLowerCase();
            const props = {};

            for (let i = 0; i < element.attributes.length; i++) {
                const attr = element.attributes[i];
                props[attr.name] = attr.value;
            }

            const children = [];
            for (let i = 0; i < element.childNodes.length; ++i) {
                children.push(processElement(element.childNodes[i]));
            }

            return h(tagName, props, ...children);
        }

        return null; // Ignore other node types (comments, etc.)
    };
    return processElement;
};

const keyify = function (node) {
    const inputs = [... node.querySelectorAll("input")];
    inputs.forEach(input => {
        const parent = input.closest("li");
        const key = input.getAttribute("data-row-id");
        parent.setAttribute("key", key);
    });
    return node;
};

const parseDOM = function (template) {
    const fragment = document.createRange().createContextualFragment(template);
    return keyify(fragment.firstElementChild);
};

const preactProcessor = makeProcessor(preact.h);

const vueProcessor = makeProcessor(Vue.h);

const sources = {};

const fetchSources = async function () {
    const markup1 = await (await fetch("../testData/checklist-full.html")).text();
    const markup2 = await (await fetch("../testData/checklist-june.html")).text();

    const parsed2 = parseDOM(markup1);
    const parsed1 = parseDOM(markup2);
    const empty = document.createElement("div");
    Object.assign(sources, {markup1, markup2, parsed1, parsed2, empty});
};

const target = document.querySelector(".target");

let app, vueSourceRef;

fetchSources().then(() => {
    vueSourceRef = Vue.ref(sources.empty);
    app = Vue.createApp({ render: () => Vue.h("div", [vueProcessor(vueSourceRef.value)])});
    app.mount(target);
});


// eslint-disable-next-line no-unused-vars
const runTests = async function () {

    const testInner = function () {
        target.innerHTML = sources.markup1;
        target.innerHTML = sources.markup2;
    };

    let source;

    const renderPreact = function () {
        return preactProcessor(source);
    };

    const renderVue = function (sourceRef) {
        return Vue.computed( () => vueProcessor(sourceRef.value));
    };

    const testPreact = function () {
        source = sources.parsed1;
        preact.render(preact.h(renderPreact), target);
        source = sources.parsed2;
        preact.render(preact.h(renderPreact), target);
    };

    const testVue = async function () {
        vueSourceRef.value = sources.parsed1;
        await Vue.nextTick();
        vueSourceRef.value = sources.parsed2;
        await Vue.nextTick();
    };

    const results = [];
    const times = [];

    for (let j = 0; j < 10; ++j) {

        const now = Date.now();
        const its = 10;

        for (let i = 0; i < its; ++i) {
            //testInner();
            testPreact();
            //await testVue();
            // const nodes = target.querySelectorAll("*");
            // console.log(nodes.length + " nodes in target");
        }

        const delay = (Date.now() - now);
        const time = 1000 * (delay / its);

        results.push(its + " iterations concluded in " + delay + " ms: " + time + " us/it");
        times.push(time);
    }
    results.push("Median time: " + fluid.round(medianWithoutExtremes(times), 2) + " us/it");
    target.innerHTML = "";

    fluid.each(results, function (result) {
        console.log(result);
        return;
        document.querySelector(".results").append(
            Object.assign(document.createElement("li"), { textContent: result })
        );
    });
};
