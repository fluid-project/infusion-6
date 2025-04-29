/* global signal, computed */

"use strict";

const fluidViewScope = function (fluid) {

    const $t = fluid.proxySymbol;

    /**
     * @typedef {Object} VNode
     * @property {String} tag - The tag name of the element (e.g., 'div', 'span').
     * @property {Object<String, String>} attrs - A key-value map of the element's attributes.
     * @property {VNode[]} [children] - An array of child virtual nodes.
     * @property {String} [text] - The text content in the case this VNode represents a DOM TextNode.
     * @property {Shadow} [shadow] - The shadow for a component for which this vnode is the template root
     *
     * @property {signal<HTMLElement>|undefined} [elementSignal] - A signal that resolves to the corresponding DOM element.
     * @property {Function[]} [renderEffects] - An array of effects that manage updates to the corresponding DOM element
     */

    /**
     * Parses an HTML string into a DOM element.
     *
     * @param {String} template - The HTML string to parse.
     * @return {HTMLElement|null} The first element in the parsed DOM fragment, or null if none exists.
     */
    fluid.parseDOM = function (template) {
        const fragment = document.createRange().createContextualFragment(template);
        return fragment.firstElementChild;
    };

    /**
     * Converts a single DOM Element node to a VNode
     *
     * @param {HTMLElement} element - The DOM element to convert.
     * @return {VNode} The virtual node representation of the element.
     */
    fluid.elementToVNode = function (element) {
        const tag = element.tagName.toLowerCase();
        const attrs = {};

        for (let i = 0; i < element.attributes.length; i++) {
            const attr = element.attributes[i];
            attrs[attr.name] = attr.value;
        }
        // Could also have members:
        // elementSignal/renderEffects
        return {tag, attrs};
    };

    /**
     * Converts a DOM tree into a virtual DOM representation.
     *
     * @param {Node} node - The root node of the DOM to convert.
     * @return {VNode|null} A virtual DOM representation of the tree, or null if the node type is not supported.
     */
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

    // event "on" handling logic lithified with thanks from https://github.com/vuejs/petite-vue/blob/main/src/directives/on.ts (Licencs: MIT)

    const systemModifiers = ["ctrl", "shift", "alt", "meta"];


    const modifierGuards = {
        stop: (e) => e.stopPropagation(),
        prevent: (e) => e.preventDefault(),
        self: (e) => e.target !== e.currentTarget,
        ctrl: (e) => !e.ctrlKey,
        shift: (e) => !e.shiftKey,
        alt: (e) => !e.altKey,
        meta: (e) => !e.metaKey,
        left: (e) => "button" in e && e.button !== 0,
        middle: (e) => "button" in e && e.button !== 1,
        right: (e) => "button" in e && e.button !== 2,
        exact: (e, modifiers) =>
            systemModifiers.some((m) => e[`${m}Key`] && !modifiers[m])
    };

    const hyphenateRE = /\B([A-Z])/g;
    const modifierRE = /\.([\w-]+)/g;

    fluid.parseModifiers = (raw) => {
        let modifiers;
        raw = raw.replace(modifierRE, (_, m) => {
            (modifiers || (modifiers = {}))[m] = true;
            return "";
        });
        return {event: raw, modifiers};
    };

    fluid.hyphenate = str => str.replace(hyphenateRE, "-$1").toLowerCase();

    fluid.applyOns = function (segs, shadow, el, on) {
        if (on) {
            on.forEach(({onKey, onValue}) => fluid.applyOn(segs, shadow, el, onKey, onValue));
        }
    };

    /**
     * Binds a DOM event to a handler function defined in the component context.
     * Parses event modifiers and applies the appropriate event and behavior based on the directive key.
     *
     * @param {String[]} segs - Path in the configuration of this directive
     * @param {Shadow} shadow - The shadow record of the component, used to resolve context references.
     * @param {HTMLElement} el - The DOM element to which the event handler is to be attached.
     * @param {String} onKey - The directive key specifying the event name and any modifiers (e.g., 'click.ctrl.enter').
     * @param {String} onValue - The key in the component context that resolves to the event handler function.
     */
    fluid.applyOn = (segs, shadow, el, onKey, onValue) => {
        let {event, modifiers} = fluid.parseModifiers(onKey);

        const parsed = fluid.compactStringToRec(onValue);
        const method = fluid.expandMethodRecord(parsed, shadow, null, segs);

        // map modifiers
        if (event === "click") {
            if (modifiers?.right) {
                event = "contextmenu";
            }
            if (modifiers?.middle) {
                event = "mouseup";
            }
        }

        const handler = e => {
            if (modifiers) {
                if ("key" in e && !(fluid.hyphenate(e.key) in modifiers)) {
                    return;
                }
                for (const key in modifiers) {
                    const guard = modifierGuards[key];
                    if (guard && guard(e, modifiers)) {
                        return;
                    }
                }
            }
            return method(e);
        };

        el.addEventListener(event, handler, modifiers);
    };


    fluid.unavailableElement = fluid.unavailable("DOM element not available");


    fluid.allocateVNodeEffect = function (vnode, effectMaker) {
        vnode.elementSignal ||= signal(fluid.unavailableElement);
        const renderEffect = effectMaker(vnode);
        // TODO: Create generalised means to nullify all effects allocated by a component - somehow arrange for these to end up at an address
        fluid.pushArray(vnode, "renderEffects", renderEffect);
        return renderEffect;
    };

    /**
     * @callback DomApplyFunction
     * @param {HTMLElement} element - The DOM element to which the function applies changes.
     * @param {String|Number|Boolean} value - The rendered content to be applied.
     */

    /**
     * Binds a rendered signal or static value to a virtual DOM node and applies a function when the DOM element is available.
     *
     * @param {Effect[]} templateEffects - An array of effects to contribute any allocated effects to
     * @param {VNode} vnode - The virtual DOM node to bind to.
     * @param {Signal|String|Number|Boolean} rendered - A signal or static value representing the rendered content.
     * @param {DomApplyFunction} applyFunc - A function that applies the rendered content to the actual DOM element.
     */
    fluid.bindDomTokens = function (templateEffects, vnode, rendered, applyFunc) {
        if (fluid.isSignal(rendered)) {
            const templateEffect = fluid.allocateVNodeEffect(vnode, vnode => {
                const togo = fluid.effect( function (element, text) {
                    applyFunc(element, text);
                }, [vnode.elementSignal, rendered]);
                togo.$variety = "bindDomTokens";
                return togo;
            });
            templateEffects.push(templateEffect);
        }
    };

    /**
     * Return a function that conditionally negates its input based on the given flag.
     * @param {Boolean} negate - If `true`, returns a function that negates its input; otherwise, returns fluid.identity
     * @return {Function} A function that optionally negates its input.
     */
    fluid.liftNegate = negate => negate ? x => !x : fluid.identity;

    /**
     * Apply a transformation function to the value of a `Signal`, producing a new computed `Signal`. If the function is
     * `fluid.identity` the original signal is returned.
     * @param {Signal<any>} sig - The input signal to transform.
     * @param {Function} fun - The transformation function to apply to the signal's value.
     * @return {Signal<any>} A computed signal reflecting the transformed value.
     */
    fluid.mapSignal = (sig, fun) => fun === fluid.identity ? sig : fluid.computed( value => fun(value), [sig]);

    /**
     * Processes an attribute directive found on a virtual node.
     *
     * @param {VNode} vnode - The virtual node to which the attribute belongs.
     * @param {String} value - The attribute value, holding a directive through beginning with "v-"
     * @param {String} key - The name of the attribute.
     * @param {Shadow} shadow - The shadow for the component in whose context the attribute is processed.
     */
    fluid.processAttributeDirective = function (vnode, value, key, shadow) {
        if (key === "@id") {
            // This effect binds to the DOM node, when it is disposed, will empty the template definition.
            // We likely don't want to use this in practice since a template update is going to update this live and
            // we'd prefer to reuse whatever is in the DOM without tearing it down.
            fluid.allocateVNodeEffect(vnode, vnode => {
                const disposable = function () {
                    fluid.pushPotentia(shadow, value, [{mergeRecordType: "template"}]);
                };
                disposable.$variety = "$component";
                // Cheapest way to signal to fluid.patchChildren that it should not attempt to recurse on child nodes
                // by itself:
                delete vnode.children;
                const templateRecord = {
                    mergeRecordType: "template",
                    layer: {
                        $layers: "fluid.viewComponent",
                        container: vnode.elementSignal
                    }
                };

                fluid.pushPotentia(shadow, value, [templateRecord]);
                return disposable;
            });
        } else if (key === "@class") {
            const parts = value.split(",").map(part => part.trim());
            const clazz = Object.fromEntries(parts.map(part => {
                const [key, ref] = part.split(":");
                const negate = ref.startsWith("!");
                const effRef = negate ? ref.substring(1) : ref;
                const tokens = fluid.parseStringTemplate(effRef);
                const rendered = fluid.renderStringTemplate(tokens, shadow);
                const negMap = fluid.liftNegate(negate);
                // Unwrap the primitive token so it is more principled to check for falsy during parseTemplate
                const renderedPrim = fluid.isSignal(rendered) ? fluid.mapSignal(rendered.$tokens[0], negMap) : negMap(rendered);
                return [key, renderedPrim];
            }));
            vnode["class"] = clazz;
        }
    };

    // Simple utility to allow us to layer live signals on top of signal sources in a VTree
    fluid.getSignalSource = function (ref) {
        return fluid.isSignal(ref) ? ref.$source : ref;
    };

    /**
     * Parses a DOM element and processes its virtual node tree to replace template strings with rendered content.
     * It processes both text and attribute templates, binding the rendered values to the corresponding DOM elements.
     * The function recursively processes the virtual node tree, rendering and binding content as needed.
     *
     * @param {Element} element - The DOM element whose contents (including attributes and children) will be parsed and rendered.
     * @param {ComponentComputer} self - The component in the context of which template references are to be parsed
     * @return {VNode} The processed VNode with rendered text and attributes.
     */
    fluid.parseTemplate = function (element, self) {
        const shadow = self.shadow;
        const templateEffects = shadow.frameworkEffects.templateEffects = shadow.frameworkEffects.templateEffects || [];
        /**
         * Recursively processes a VNode by rendering any template strings found in its text or attributes
         * @param {VNode} vnode - The virtual node (vNode) to be processed.
         * @return {VNode} The processed VNode with rendered content in text and attributes.
         */
        function processVNode(vnode) {
            vnode.shadow = shadow;
            if (vnode.text !== undefined) {
                const tokens = fluid.parseStringTemplate(vnode.text);
                const rendered = fluid.renderStringTemplate(tokens, shadow);
                fluid.bindDomTokens(templateEffects, vnode, rendered, (node, text) => node.nodeValue = text);
                return Object.assign(vnode, {text: rendered});
            } else {
                fluid.each(vnode.attrs, (value, key) => {
                    const firstChar = key.charCodeAt(0);
                    if (firstChar === 64) { // @
                        if (key.startsWith("@on")) {
                            // These will be processed during patchChildren which calls fluid.applyOns
                            fluid.pushArray(vnode, "on", {onKey: key.slice(3).toLowerCase(), onValue: value});
                        } else {
                            fluid.processAttributeDirective(vnode, value, key, shadow);
                        }
                        delete vnode.attrs[key];
                    } else if (key !== "class") {
                        const tokens = fluid.parseStringTemplate(value);
                        const rendered = fluid.renderStringTemplate(tokens, shadow);
                        if (fluid.isSignal(rendered)) {
                            rendered.$source = value;
                            fluid.bindDomTokens(templateEffects, vnode, rendered, (node, text) => node.setAttribute(key, text));
                            vnode.attrs[key] = rendered; // Mark to reconciler that it is a signal so it should ignore it
                        }
                    }
                });
                if (vnode["class"]) {
                    // Grab a reference to any static source of classes before this node was signalised
                    const clazzSource = fluid.getSignalSource(vnode.attrs["class"]) || "";
                    const allClass = computed( () => {
                        const classes = Object.entries(vnode["class"]).map( ([key, value]) => [key, fluid.deSignal(value)])
                            .filter(([, value]) => value)
                            .map(([key]) => key);
                        return clazzSource + " " + classes;
                    });
                    allClass.$variety = "$allClass";
                    allClass.$source = clazzSource;
                    fluid.bindDomTokens(templateEffects, vnode, allClass, (node, text) => node.setAttribute("class", text));
                    vnode.attrs["class"] = allClass;
                }
                if (vnode.children !== undefined) {
                    vnode.children = vnode.children.map(processVNode);
                }
            }
            return vnode;
        }

        function parseTemplate(tree) {
            fluid.disposeEffects(templateEffects);
            const togo = processVNode(tree);
            templateEffects.forEach(effect => effect.$site = self);
            return togo;
        }

        const tree = fluid.domToVDom(element);
        const togo = parseTemplate(tree);
        return togo;
    };

    fluid.unbindDom = function (/*vnode, element*/) {
        // Try to remove event listeners and the like?
    };

    /**
     * Binds a DOM element to a virtual node (VNode), setting up necessary bindings or effect handling.
     * If the VNode contains a signal, it will update its value with the provided element.
     * If it contains a set of binding functions, those functions will be invoked with the element.
     *
     * @param {VNode} vnode - The virtual node to bind the element to.
     * @param {HTMLElement} element - The DOM element to bind to the virtual node.
     */
    fluid.bindDom = function (vnode, element) {
        if (vnode.elementSignal) {
            fluid.unbindDom(vnode, vnode.elementSignal.value);
            vnode.elementSignal.value = element;
        }
    };

    /**
     * Creates a DOM node from a virtual node (VNode), either a text node or an element node.
     *
     * @param {VNode} vnode - The virtual node to convert into a DOM node.
     * @return {Node} - A newly created DOM node corresponding to the VNode.
     */
    fluid.nodeFromVNode = function (vnode) {
        if (vnode.text) {
            return document.createTextNode(vnode.text);
        } else {
            return document.createElement(vnode.tag);
        }
    };

    /**
     * Checks whether a DOM node matches a given virtual node (VNode).
     *
     * @param {Node} node - The actual DOM node to compare.
     * @param {VNode} vnode - The virtual node to match against.
     * @return {Boolean} - `true` if the node matches the vnode, otherwise `false`.
     */
    fluid.matchNodeToVNode = function (node, vnode) {
        if (vnode.text) {
            return node.nodeType === Node.TEXT_NODE;
        } else {
            return node.nodeType === Node.ELEMENT_NODE && node.tagName.toLowerCase() === vnode.tag;
        }
    };

    /**
     * Cause the attributes of the supplied DOM node to agree with the `attrs` member of the supplied VNode
     *
     * @param {VNode} vnode - The VNode whose attributes are to be applied
     * @param {HTMLElement} element - The DOM node whose attributes are to be patched
     */
    fluid.patchAttrs = function (vnode, element) {
        for (let i = element.attributes.length - 1; i >= 0; i--) {
            const attrName = element.attributes[i].name;
            if (!(attrName in vnode.attrs)) {
                element.removeAttribute(attrName);
            }
        }
        for (const [key, value] of Object.entries(vnode.attrs)) {
            if (!fluid.isSignal(value) && element.getAttribute(key) !== value) {
                element.setAttribute(key, value);
            }
        }
    };

    fluid.vnodeToSegs = function (vnode) {
        // TODO: Extract path to root
        return ["$template", vnode.tag];
    };

    // Helpful comparison: https://lazamar.github.io/virtual-dom/#applying-a-diff
    /**
     * Updates the DOM to match the given virtual node (VNode) structure.
     *
     * This function ensures that the provided `element` correctly reflects the structure
     * of `vnode.children`, updating, replacing, or removing child elements as necessary.
     *
     * @param {VNode} vnode - The virtual node representing the desired DOM structure.
     * @param {Node} element - The actual DOM element to be patched.
     */
    fluid.patchChildren = function (vnode, element) {
        fluid.bindDom(vnode, element);
        if (vnode.text !== undefined) {
            element.textContent = vnode.text;
        }
        if (vnode.attrs !== undefined) {
            fluid.patchAttrs(vnode, element);
        }
        // It may be undefined because this is a joint to a subcomponent as applied in fluid.processAttributeDirective
        if (vnode.children !== undefined) {
            const vcount = vnode.children.length;
            for (let i = 0; i < vcount; ++i) {
                const vchild = vnode.children[i];
                let other = element.childNodes[i];
                if (!other || !fluid.matchNodeToVNode(other, vchild)) {
                    const fresh = fluid.nodeFromVNode(vchild);
                    fluid.applyOns(fluid.vnodeToSegs(vchild), vchild.shadow, fresh, vchild.on);
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

    /**
     * Renders a virtual DOM tree (VNode) into a container element.
     *
     * This function updates the container's contents to match the provided virtual tree.
     * If `elideParent` is true, the `vTree`'s children are grafted as children of the current container.
     *
     * @param {ComponentComputer} self - The component in the context of which template references are to be parsed
     * @param {HTMLElement} container - The target DOM element where the virtual tree should be rendered.
     * @param {VNode} vTree - The virtual node representing the desired DOM structure.
     * @param {boolean} [elideParent=false] - If true, renders `vTree` directly into the container.
     */
    fluid.renderView = function (self, container, vTree, elideParent) {
        let useTree = vTree;
        if (!elideParent) {
            useTree = fluid.elementToVNode(container);
            useTree.children = [vTree];
        }
        fluid.patchChildren(useTree, container);
    };

    fluid.def("fluid.viewComponent", {
        $layers: "fluid.component",
        elideParent: false,
        container: "$compute:fluid.unavailable(Container not specified)",
        // Some syntax for determining there should be a vTree? An unavailable value that nonetheless has a shape?
        render: "$effect:fluid.renderView({self}, {self}.container, {self}.vTree, {self}.elideParent)"
    });

    fluid.coOccurrenceRegistry.push({
        inputNames: ["fluid.viewComponent", "fluid.componentList"],
        outputNames: ["fluid.viewComponentList"]
    });

    fluid.def("fluid.viewComponentList", {
        $layers: "fluid.viewComponent",
        elideParent: true,
        vTree: "$compute:fluid.listViewTree({self}.list)"
    });

    fluid.listViewTree = function (list) {
        return fluid.computed(componentList => {
            const childTrees = componentList.map(entry => entry.value.vTree.value);
            return {
                tag: "template",
                children: childTrees
            };
        }, [list]);
    };

    fluid.def("fluid.templateViewComponent", {
        $layers: "fluid.viewComponent",
        templateDOM: "$compute:fluid.parseDOM({self}.template)",
        vTree: "$compute:fluid.parseTemplate({self}.templateDOM, {self})"
    });

};

if (typeof(fluid) !== "undefined") {
    fluidViewScope(fluid);
}
