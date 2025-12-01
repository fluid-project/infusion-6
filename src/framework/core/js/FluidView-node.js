/* global */

"use strict";

const $fluidViewNodeScope = function (fluid) {

    // Currently disused
    /**
     * Parses an HTML string into a DOM element.
     *
     * @param {String} template - The HTML string to parse.
     * @return {HTMLElement|null} The first element in the parsed DOM fragment, or null if none exists.
     */
    fluid.parseDOM = fluid.serverDocumentParser;

    // Noop stub to discard event handler registration on server
    fluid.applyOns = () => {};

    // On the server assume that the document is always ready - need to check MutationObserver behaviour in linkedom
    fluid.applyOnLoad = function (func) {
        func();
    };

};

if (typeof(fluid) !== "undefined") {
    $fluidViewNodeScope(fluid);
}
