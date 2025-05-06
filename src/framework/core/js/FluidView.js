/* global signal, computed */

"use strict";

const fluidViewScope = function (fluid) {

    const $m = fluid.metadataSymbol;
    const $t = fluid.proxySymbol;

    /**
     * @typedef {Object} VNode
     * @property {String} [tag] - The tag name of the element (e.g., 'div', 'span').
     * @property {Object<String, String>} [attrs] - A key-value map of the element's attributes.
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

    fluid.importUrlResource = function (layerName, relPath) {
        return {
            url: fluid.importMap[layerName].urlBase + relPath,
            variety: "importUrlResource"
        };
    };

    // Regular expression to parse the first argument to `fluid.def` and the body up to the first instance of "\n})"
    const parseDefRegex = /fluid\.def\("([^"]+)",\s*({[\s\S]*?\n})\)/;

    // A convenient global to receive the parsed definition
    // noinspection ES6ConvertVarToLetConst
    fluid.$fluidParsedDef = null;
    /**
     * Loads a Single File Component (SFC) from a given URL and wraps its content in an `<sfc>` tag.
     * The function fetches the text content of the SFC, processes it into a DOM element, and returns a signal
     * containing the parsed DOM element.
     *
     * @param {String} layerName - The name of the layer associated with the SFC
     * @param {String} url - The URL from which to fetch the SFC content.
     * @return {Signal<any>} A signal containing the parsed DOM element wrapped in an `<sfc>` tag.
     */
    fluid.parseSFC = function (layerName, url) {
        const textSignal = fluid.fetchText(url);
        const applyValue = (target, key, value) => {
            if (value) {
                const trimmed = value.trim();
                if (trimmed) {
                    target[key] = trimmed;
                }
            }
        };
        return fluid.mapSignal(textSignal, text => {
            const sfc = fluid.parseDOM("<sfc>" + text + "</sfc>");
            // For some reason we don't get this parsed into nodes but actually we don't want them anyway, they will parse fine the next time round
            const template = sfc.querySelector("template")?.innerHTML;
            const scriptNode = sfc.querySelector("script");
            if (!scriptNode) {
                return {layerName, def: fluid.unavailable("No script node found in SFC for layer " + layerName)};
            }
            // Only the first script is matched up with template/css from the SFC. The rest are just collateral scripts put there for bundling.
            // Think of some more principled way to package tiny definitions, perhaps as a $def member of a real component?
            const script = scriptNode.innerText;
            const css = sfc.querySelector("style")?.innerText;

            const match = script.match(parseDefRegex);
            const foundLayerName = match[1];
            const defBody = match[2];
            if (foundLayerName !== layerName) {
                return {layerName, def: fluid.unavailable(`Error in SFC: Expected definition for layer ${layerName} but found ${foundLayerName} instead`)};
            }
            // Use the "indirect eval" strategy that is widely recommended to avoid inappropriate access to local scope - as if we care
            // eslint-disable-next-line no-eval
            eval?.("fluid.$fluidParsedDef = " + defBody);
            const def = fluid.$fluidParsedDef;
            applyValue(def, "template", template);
            applyValue(def, "css", css);
            return {layerName, def};
        });
    };

    /**
     * Creates an effect that registers a component definition (`def`) under the specified `layerName`.
     * This function listens to updates in the provided signal and applies the definition to the framework.
     * @param {Signal<Object>} defSignal - A signal containing the component definition, including the layer name and definition object.
     * @return {Effect} An effect that registers the component definition when the signal updates.
     */
    fluid.defEffect = function (defSignal) {
        return fluid.effect(({layerName, def}) => {
            fluid.def(layerName, def);
        }, [defSignal]);
    };

    /**
     * Loads a Single File Component (SFC) from a given URL and registers its definition.
     * This function parses the SFC content, extracts its definition, and creates an effect
     * that registers the component definition under the specified layer name.
     * @param {String} layerName - The name of the layer associated with the SFC.
     * @param {String} url - The URL from which to fetch the SFC content.
     * @return {Effect} An effect that registers the parsed SFC definition when the signal updates.
     */
    fluid.loadSFC = function (layerName, url) {
        return fluid.defEffect(fluid.parseSFC(layerName, url));
    };

    /**
     * Create a live `Signal` that tracks elements matching a CSS selector within a DOM subtree.
     * The signal updates whenever matching elements are added or removed.
     * @param {String} selector - The CSS selector to match elements.
     * @param {Element|null} [root=null] - The root element to observe; defaults to `document` if `null`.
     * @return {Signal<Array<Element>>} A signal containing the current list of matching elements.
     */
    fluid.liveQuery = function (selector, root = null) {
        const togo = signal([]);
        const context = root || document;

        const updateMatches = () => {
            togo.value = Array.from(context.querySelectorAll(selector));
        };

        const observer = new MutationObserver(() => {
            console.log("Observer update");
            // TODO: Could do better, I guess, by observing updates in a finegrained way but this is just fine for now
            updateMatches();
        });

        const init = () => {
            observer.observe(context, {
                childList: true,
                subtree: true
            });
            updateMatches();
        };

        // Despite widespread explanations to the contrary, MutationObserver will not register correctly before document is loaded
        if (document.readyState === "complete") {
            init();
        } else {
            document.addEventListener("DOMContentLoaded", init);
        }

        // TODO: Go with our wierd "Effect" contract for now, need to make a general "disposable" contract
        togo._dispose = () => observer.disconnect();
        return togo;
    };

    /**
     * Create a computed `Signal` that tracks the first element matching a CSS selector within a DOM subtree.
     * If no element matches, the signal yields an "unavailable" placeholder.
     * @param {String} selector - The CSS selector to match a single element.
     * @param {Element|null} [root=null] - The root element to observe; defaults to `document` if `null`.
     * @return {Signal<Element|Object>} A signal containing the first matching element or an "unavailable" placeholder.
     */
    fluid.liveQueryOne = function (selector, root = null) {
        const noElement = fluid.unavailable({cause: "No element matches selector " + selector, variety: "I/O"});
        const query = fluid.liveQuery(selector, root);
        const togo = computed( () => query.value.length === 0 ? noElement : query.value[0]);
        togo._dispose = query._dispose();
        return togo;
    };

    /**
     * Inserts a new element into the DOM based on the provided template, ensuring no duplicate
     * element with the same `data-fl-key` exists within the parent node. If a duplicate is found,
     * the existing element is returned instead of inserting a new one. It's assumed that reconciliation of the
     * remainder of the template will be done later via fluid.patchChildren or similar.
     *
     * The function supports four strategies for insertion:
     * - `first`: Inserts the new element as the first child of the parent node.
     * - `last`: Appends the new element as the last child of the parent node.
     * - `before`: Inserts the new element before the reference node.
     * - `after`: Inserts the new element after the reference node.
     *
     * @param {String} strategy - The insertion strategy, either "first", "last", "before", or "after".
     * @param {String} key - A unique key to identify the element. If a child with the same key exists, it will be reused.
     * @param {String} template - A template string of HTML from which the root tag will be extracted.
     * @param {Element} parentNode - The parent DOM node in which to insert the new node.
     * @param {Element} [referenceNode] - The node relative to which the new node will be inserted (used with "before" and "after").
     * @return {Element} The newly created or existing DOM element.
     */
    fluid.insertChildContainer = function (strategy, key, template, parentNode, referenceNode) {
        const tagMatch = template.match(/^\s*<(\S+)/);
        const tagName = tagMatch ? tagMatch[1] : null;

        if (!tagName) {
            return fluid.unavailable({cause: "Invalid template: Unable to determine tag name from " + template});
        }

        if (key) {
            const child = [...parentNode.children].find(child => child.getAttribute("data-fl-transient-key") === key);
            if (child) {
                return child;
            }
        }

        const newNode = document.createElement(tagName);
        if (strategy === "first") {
            parentNode.insertBefore(newNode, parentNode.firstChild);
        } else if (strategy === "last") {
            parentNode.appendChild(newNode);
        } else if (strategy === "before") {
            parentNode.insertBefore(newNode, referenceNode);
        } else if (strategy === "after") {
            parentNode.insertBefore(newNode, referenceNode.nextSibling);
        }
        newNode.setAttribute("data-fl-transient-key", key);
        return newNode;
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
            const text = node.nodeValue.trim();
            return text === "" ? null : {text};
        }
        if (node.nodeType === Node.ELEMENT_NODE) {
            const togo = fluid.elementToVNode(node);

            const children = [];
            for (let i = 0; i < node.childNodes.length; ++i) {
                const child = fluid.domToVDom(node.childNodes[i]);
                if (child !== null) {
                    children.push(child);
                }
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

        let handler;

        // TODO: Should implement some recognisable kind of parser here to ensure that = is at some kind of syntactic top level
        if (onValue.includes("=")) {
            const parts = onValue.split("=").map(part => part.trim());
            if (parts.length !== 2) {
                fluid.fail("Unrecognised event assignment binding without lefthand and righthand " + onValue);
            }
            const [lh, rh] = parts;
            const parsedLH = fluid.parseContextReference(lh);
            const target = fluid.resolveContext(parsedLH.context, shadow);
            const rvalue = fluid.coerceToPrimitive(rh);
            handler = () => fluid.setForComponent(target.value, parsedLH.path, rvalue);
        } else {
            const parsed = fluid.compactStringToRec(onValue, "DOMEventBind");
            handler = fluid.expandMethodRecord(parsed, shadow, null, segs);
        }

        // map modifiers
        if (event === "click") {
            if (modifiers?.right) {
                event = "contextmenu";
            }
            if (modifiers?.middle) {
                event = "mouseup";
            }
        }

        const rawHandler = e => {
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
            return handler(e);
        };

        el.addEventListener(event, rawHandler, modifiers);
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
                togo.$vnode = vnode;
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
                const rendered = fluid.renderComputedStringTemplate(tokens, shadow);
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
                const rendered = fluid.renderComputedStringTemplate(tokens, shadow);
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
                        const rendered = fluid.renderComputedStringTemplate(tokens, shadow);
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
        if (typeof(vnode) === "string") {
            return document.createTextNode(vnode);
        } else if (vnode.text) {
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
        if (typeof(vnode) === "string" || vnode.text) {
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
            if (!(attrName in vnode.attrs) && !attrName.startsWith("data-fl-transient")) {
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
        // TODO: Extract path to root of template
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
     * @param {Boolean} [maybeFreshRoot] - The DOM node may be a fresh container that could need events bound
     */
    fluid.patchChildren = function (vnode, element, maybeFreshRoot) {
        fluid.bindDom(vnode, element);
        if (vnode.text !== undefined) {
            element.textContent = vnode.text;
        }
        if (vnode.attrs !== undefined) {
            fluid.patchAttrs(vnode, element);
        }
        if (maybeFreshRoot && !element.dataset.flTransientEventsBound) {
            fluid.applyOns(fluid.vnodeToSegs(vnode), vnode.shadow, element, vnode.on);
            element.dataset.flTransientEventsBound = true;
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
     * Converts a virtual DOM node (VNode) into a real DOM node and applies its children.
     * This function creates the root DOM node from the given VNode and then recursively
     * patches its children to ensure the DOM structure matches the virtual DOM tree.
     * @param {VNode} vnode - The virtual DOM node to convert into a real DOM node.
     * @return {Node} The root DOM node corresponding to the VNode.
     */
    fluid.vNodeToDom = function (vnode) {
        const root = fluid.nodeFromVNode(vnode);
        fluid.patchChildren(vnode, root);
        return root;
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
        fluid.patchChildren(useTree, container, elideParent);
    };

    // Shared structure to store watchers of per-layer CSS (effects)
    const layerCssWatchers = {};

    fluid.cssInjectionStyles = {
        literal: {
            construct: () => ({
                tag: "style",
                attrs: {type: "text/css"},
                children: [""]
            }),
            update: (node, rec) => {
                node.firstChild.nodeValue = rec;
            }
        },
        link: {
            construct: () => ({
                tag: "link",
                attrs: {
                    rel: "stylesheet",
                    type: "text/css"
                }
            }),
            update: (node, rec) => {
                // It must be a fluid.importUrlResource
                node.setAttribute("href", rec.url);
            }
        }
    };

    fluid.injectCss = function (css, layerCssId) {
        const injStyle = typeof(css) === "string" ? "literal" : "link";
        const injRec = fluid.cssInjectionStyles[injStyle];
        let existing = document.getElementById(layerCssId);
        if (!existing) {
            existing = fluid.vNodeToDom(injRec.construct());
            existing.id = layerCssId;
            document.head.appendChild(existing);
        }
        injRec.update(existing, css);
    };

    fluid.renderCSS = function (self, css, cssPath) {
        const shadow = self[$t].shadow;
        const segs = fluid.pathToSegs(cssPath);
        // Look into our layer map to find the provenance of the css value
        const layerName = fluid.get(shadow.layerMap, [...segs, $m, "source"]);
        if (!layerCssWatchers[layerName]) {
            const layerCssId = "fl-css-" + layerName;
            const layerSig = fluid.readLayer(layerName);
            if (layerSig) {
                // Create just one watcher per layer, using our own css signal as an exemplar
                const cssSignal = fluid.get(shadow.that, segs);
                const watcher = fluid.effect((css) => {
                    fluid.injectCss(css, layerCssId);
                }, [cssSignal]);
                layerCssWatchers[layerName] = watcher;
                // In theory we would clear these up if the layer is destroyed and/or the last component referencing it is destroyed
            } else { // It is not from a layer, simply watch this individual component's CSS
                fluid.injectCss(css, layerCssId);
            }
        }
    };


    fluid.def("fluid.viewComponent", {
        $layers: "fluid.component",
        elideParent: true,
        container: "$compute:fluid.unavailable(Container not specified)",
        css: "$compute:fluid.unavailable(No CSS is configured)",
        vTree: fluid.unavailable({cause: "No virtual DOM tree is configured", variety: "config"}),
        renderView: "$effect:fluid.renderView({self}, {self}.container, {self}.vTree, {self}.elideParent)",
        renderCSS: "$effect:fluid.renderCSS({self}, {self}.css, css)"
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
