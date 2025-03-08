/* global signal */

"use strict";

const fluidViewScope = function (fluid) {

    fluid.parseDOM = function (template) {
        const fragment = document.createRange().createContextualFragment(template);
        return fragment.firstElementChild;
    };

    fluid.elementToVNode = function (element) {
        const tag = element.tagName.toLowerCase();
        const attrs = {};

        for (let i = 0; i < element.attributes.length; i++) {
            const attr = element.attributes[i];
            attrs[attr.name] = attr.value;
        }
        // Could also have members:
        // element/onDomBind
        // OR: elementSignal/renderEffects
        return {tag, attrs};
    };

    fluid.domToVDom = function (node) {
        if (node.nodeType === Node.TEXT_NODE) {
            return {text: node.nodeValue.trim()};
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
            const togo = fluid.elementToVNode(node);

            const children = [];
            for (let i = 0; i < node.childNodes.length; ++i) {
                children.push(fluid.domToVDom(node.childNodes[i]));
            }
            togo.children = children;

            return togo;
        }

        return null; // Ignore other node types (comments, etc.)
    };

    fluid.unavailableElement = fluid.unavailable("DOM element not available");

    fluid.bindDomTokens = function (vnode, rendered, applyFunc) {
        if (fluid.isSignal(rendered)) {
            vnode.elementSignal ||= signal(fluid.unavailableElement);
            const renderEffect = fluid.effect( function (element, text) {
                applyFunc(element, text);
            }, [vnode.elementSignal, rendered]);
            // TODO: Create generalised means to nullify all effects allocated by a component - somehow arrange for these to end up at an address
            fluid.pushArray(vnode, "renderEffects", renderEffect);
        } else {
            fluid.pushArray(vnode, "onDomBind", element => applyFunc(element, rendered));
        }
    };

    fluid.parseTemplate = function (element, self) {
        function processVNode(vnode) {
            if (vnode.text !== undefined) {
                const tokens = fluid.parseStringTemplate(vnode.text);
                const rendered = fluid.renderStringTemplate(tokens, self);
                fluid.bindDomTokens(vnode, rendered, (node, text) => node.nodeValue = text);
                return Object.assign(vnode, {text: rendered});
            } else {
                fluid.each(vnode.attrs, (value, key) => {
                    const tokens = fluid.parseStringTemplate(value);
                    const rendered = fluid.renderStringTemplate(tokens, self);
                    fluid.bindDomTokens(vnode, rendered, (node, text) => node.setAttribute(key, text));
                    vnode.attrs[key] = fluid.renderStringTemplate(tokens, self);
                });
                vnode.children = vnode.children.map(processVNode);
            }
            return vnode;
        }

        const tree = fluid.domToVDom(element);
        return processVNode(tree);
    };

    fluid.unbindDom = function (/*vnode, element*/) {
        // Try to remove event listeners and the like?
    };

    fluid.bindDom = function (vnode, element) {
        if (vnode.elementSignal) {
            fluid.unbindDom(vnode, vnode.elementSignal.value);
            vnode.elementSignal.value = element;
        } else if (vnode.onDomBind) {
            fluid.unbindDom(vnode, vnode.element);
            vnode.element = element;
            vnode.onDomBind.forEach(binder => binder(element));
        }
    };

    fluid.def("fluid.viewComponent", {
        $layers: "fluid.component"
    });

    fluid.nodeFromVNode = function (vnode) {
        if (vnode.text) {
            return document.createTextNode(vnode.text);
        } else {
            return document.createElement(vnode.tag);
        }
    };

    fluid.matchNodeToVNode = function (node, vnode) {
        if (vnode.text) {
            return node.nodeType === Node.TEXT_NODE;
        } else {
            return node.nodeType === Node.ELEMENT_NODE && node.tagName.toLowerCase() === vnode.tag;
        }
    };

    // Helpful comparison: https://lazamar.github.io/virtual-dom/#applying-a-diff
    fluid.patchChildren = function (vnode, element) {
        fluid.bindDom(vnode, element);
        if (vnode.children) {
            const vcount = vnode.children.length;
            for (let i = 0; i < vcount; ++i) {
                const vchild = vnode.children[i];
                let other = element.childNodes[i];
                if (!other || !fluid.matchNodeToVNode(other, vchild)) {
                    const fresh = fluid.nodeFromVNode(vchild);
                    if (other) {
                        other.replaceWith(fresh);
                    } else {
                        element.appendChild(fresh);
                    }
                    other = fresh;
                }
                fluid.patchChildren(vchild, other);
            }
            for (let i = element.childNodes.length - 1; i >= vcount; --i) {
                element.childNodes[i].remove();
            }
        }
    };

    fluid.renderView = function (container, vTree, elideParent) {
        let useTree = vTree;
        if (!elideParent) {
            useTree = fluid.elementToVNode(container);
            useTree.children = [vTree];
        }
        fluid.patchChildren(useTree, container);
    };

    fluid.def("fluid.templateViewComponent", {
        $layers: "fluid.viewComponent",
        elideParent: false,
        templateDOM: "$compute:fluid.parseDOM({self}.template)",
        vTree: "$compute:fluid.parseTemplate({self}.templateDOM, {self})",
        container: "$compute:fluid.unavailable(Container not specified)",
        render: "$effect:fluid.renderView({self}.container, {self}.vTree, {self}.elideParent)"
    });

};

if (typeof(fluid) !== "undefined") {
    fluidViewScope(fluid);
}
