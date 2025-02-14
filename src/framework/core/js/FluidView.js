/* global preact */

"use strict";

const fluidViewScope = function (fluid) {

    fluid.parseDOM = function (template) {
        const fragment = document.createRange().createContextualFragment(template);
        return fragment.firstElementChild;
    };

    fluid.domToHyper = function (h) {
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

    // Accepts a DOM node an returns a preact hyper invocation of it
    fluid.domToHyperPreact = fluid.domToHyper(preact.h);

    fluid.parseTemplate = function (element, self) {
        const tree = fluid.domToHyperPreact(element);

        function processNode(node) {
            if (typeof node === "string") {
                const tokens = fluid.parseStringTemplate(node);
                return fluid.renderStringTemplate(tokens, self);
            } else if (typeof node === "object") {
                fluid.each(node.props, (value, key) => {
                    const tokens = fluid.parseStringTemplate(value);
                    node.props[key] = fluid.renderStringTemplate(tokens, self);
                });
                // Process children recursively in place
                if (Array.isArray(node.props.children)) {
                    node.props.children = node.props.children.map(processNode);
                }
            }

            return node;
        }

        return processNode(tree);
    };

    fluid.def("fluid.viewComponent", {
        $layers: "fluid.component"
    });

    fluid.renderPreact = function (container, vTree) {
        preact.render(preact.h(() => vTree), container);
    };

    fluid.def("fluid.templateViewComponent", {
        $layers: "fluid.viewComponent",
        templateDOM: "$compute:fluid.parseDOM({self}.template)",
        vTree: "$compute:fluid.parseTemplate({self}.templateDOM, {self})",
        container: "$compute:fluid.unavailable(Container not specified)",
        render: "$effect:fluid.renderPreact({self}.container, {self}.vTree)"
    });

};

if (typeof(fluid) !== "undefined") {
    fluidViewScope(fluid);
}
