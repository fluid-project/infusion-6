/* global computed */

"use strict";

const $fluidViewBrowserScope = function (fluid) {
    const $t = fluid.proxySymbol;

    // Currently disused
    /**
     * Parses an HTML string into a DOM element.
     *
     * @param {String} template - The HTML string to parse.
     * @return {HTMLElement|null} The first element in the parsed DOM fragment, or null if none exists.
     */
    fluid.parseDOM = function (template) {
        const fragment = document.createRange().createContextualFragment(template);
        return fragment.firstElementChild || fluid.unavailable("Unable to parse template as HTML");
    };

    fluid.shadowForElement = element => {
        const shadow = fluid.viewContainerRegistry.get(element);
        return shadow && !/^fullPageEditor-\d+\.inspectOverlay$/.test(shadow.path) ? shadow : null;
    };

    fluid.shadowForElementParent = element => {
        while (element) {
            const shadow = fluid.shadowForElement(element);
            if (shadow) {
                return {shadow, container: element};
            }
            element = element.parentElement;
        }
    };

    /**
     * Traverses the list of DOM elements lying at a point until it finds the first parent
     * that exists within `fluid.viewContainerRegistry`. Returns an object containing the container
     * and its associated shadow, or `null` if no such parent is found.
     *
     * @param {MouseEvent} mouseEvent - The mouse event at the point to be queried
     * @return {Shadow|null} The shadow, or `null` if not found.
     */
    fluid.shadowForMouseEvent = function (mouseEvent) {
        const elements = document.elementsFromPoint(mouseEvent.clientX, mouseEvent.clientY);
        const container = elements.find(fluid.shadowForElement);
        return container ? fluid.viewContainerRegistry.get(container) : null;
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

    fluid.applyOns = function (vnode, shadow, el, on, vTreeRec) {
        if (on) {
            on.forEach(({onKey, onValue}) => fluid.applyOn(vnode, shadow, el, onKey, onValue, vTreeRec));
        }
    };

    /**
     * Binds a DOM event to a handler function defined in the component context.
     * Parses event modifiers and applies the appropriate event and behavior based on the directive key.
     *
     * @param {VNode} vnode - The virtual DOM node associated with the event.
     * @param {Shadow} shadow - The shadow record of the component, used to resolve context references.
     * @param {HTMLElement} el - The DOM element to which the event handler is to be attached.
     * @param {String} onKey - The directive key specifying the event name and any modifiers (e.g., 'click.ctrl.enter').
     * @param {String} onValue - The key in the component context that resolves to the event handler function.
     * @param {Array} vTreeRec - Array of registered event handler records for later deregistration
     */
    fluid.applyOn = (vnode, shadow, el, onKey, onValue, vTreeRec) => {
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
            let rvalue, rvalueSignal;
            let negate = rh.startsWith("!");
            const useRH = negate ? rh.substring(1) : rh;
            if (fluid.isILReference(useRH)) {
                const parsedRH = fluid.parseContextReference(useRH);
                rvalueSignal = fluid.fetchContextReference(parsedRH, shadow);
            } else {
                rvalue = fluid.coerceToPrimitive(rh);
            }
            handler = () => {
                if (rvalueSignal) {
                    rvalue = fluid.deSignal(rvalueSignal);
                }
                if (negate) {
                    rvalue = !rvalue;
                }
                fluid.setForComponent(target.value, parsedLH.path, rvalue);
            };
        } else {
            const parsed = fluid.compactStringToRec(onValue, "DOMEventBind");
            handler = fluid.expandMethodRecord(parsed, shadow, fluid.vnodeToSegs(vnode));
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

        // console.log(`Bound handler to ${event} for vnode ${vnode._id} for DOM element ${el.flDomId} `, el);
        el.addEventListener(event, rawHandler, modifiers);
        vTreeRec.push({el, event, rawHandler, modifiers, vnodeId: vnode._id});
    };

    fluid.applyOnLoad = function (func) {
        if (document.readyState === "complete") {
            func();
        } else {
            document.addEventListener("DOMContentLoaded", func);
        }
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
            const upcoming = Array.from(context.querySelectorAll(selector));
            if (!fluid.arrayEqual(togo.value, upcoming)) {
                togo.value = upcoming;
            }
        };

        const observer = new MutationObserver(() => {
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
        fluid.applyOnLoad(init);

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

    fluid.applyOnLoad(() => {
        fluid.acquireUrlBases(document.documentElement);
        fluid.acquireImports(document, document.documentElement);
    });

    // Many thanks to Hugo Daniel https://hugodaniel.com/pages/boredom/ for inspiration for this concept
    fluid.selfBootQuery = fluid.liveQuery("*[fluid-layers]");

    fluid.selfBootEffect = effect( () => {
        const elements = fluid.selfBootQuery.value;
        elements.forEach(element => {
            const existing = fluid.viewContainerRegistry.get(element);
            if (!existing) {
                const layers = element.getAttribute("fluid-layers").split(" ").map(layer => layer.trim());
                const [firstLayer, ...restLayers] = layers;
                const instance = fluid.initFreeComponent(firstLayer, {
                    $layers: restLayers,
                    container: element
                });
                // Put this in early in case instantiation fails - TODO standardise access to shadow
                fluid.viewContainerRegistry.set(element, instance[$t].shadow);
            }
        });
    });

    fluid.globalDismissalSignal = signal(0);

    fluid.def("fluid.globalDismissal", {
        $layers: ["fluid.resolveRoot", "fluid.viewComponent"],
        container: document,
        clicked: 0,
        register: {
            $effect: {
                func: (self) => {
                    self.container.addEventListener("click", (e) => {
                        const noDismiss = e.target.closest(".fl-no-dismiss");
                        if (!noDismiss) {
                            ++fluid.globalDismissalSignal.value;
                        }
                    });
                },
                args: "{self}"
            }
        },
        $variety: "frameworkAux"
    });

    fluid.globalDismissalInstance = fluid.globalDismissal();

};

if (typeof(fluid) !== "undefined") {
    $fluidViewBrowserScope(fluid);
}
