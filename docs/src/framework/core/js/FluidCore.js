"use strict";

const $fluidJSScope = function (scope) {

    const fluid = scope.fluid = (scope.fluid || {});

    fluid.version = "Infusion 6.0.0";

    // Export this for use in environments like node.js, where it is useful for configuring stack trace behaviour
    fluid.Error = Error;

    fluid.global = fluid.global || typeof window !== "undefined" ?
        window : typeof self !== "undefined" ? self : {};

    fluid.unavailablePriority = {
        "I/O": 1,
        "config": 2,
        "error": 3
    };

    /**
     * Create a marker representing an "Unavailable" state with an associated waitset.
     * The marker is mutable.
     *
     * @param {Object|Array} [cause={}] - A list of dependencies or reasons for unavailability.
     * @param {String} [variety="error"] - The variety of unavailable value:
     * * "error" indicates a syntax issue that needs design intervention.
     * * "config" indicates configuration designed to short-circuit evaluation which is not required.
     * * "I/O" indicates pending I/O
     * @return {fluid.marker} A marker of type "Unavailable".
     */
    fluid.unavailable = function (cause = {}, variety = "error") {
        const togo = Object.create(fluid.unavailable.prototype);
        togo.causes = fluid.makeArray(cause).map(oneCause => {
            if (typeof(oneCause) === "string") {
                oneCause = {message: oneCause};
            }
            if (!oneCause.variety) {
                oneCause.variety = variety;
            }
            return oneCause;
        });
        togo.variety = togo.causes.reduce((acc, {variety}) => {
            const priority = fluid.unavailablePriority[variety];
            return priority > acc.priority ? {variety, priority} : acc;
        }, {priority: -1}).variety;
        return togo;
    };

    fluid.formatUnavailable = function (unavailable) {
        return "Value is unavailable: causes are " + unavailable.causes.map(cause => cause.message).join("\n");
    };

    /**
     * Check if an object is a marker of type "Unavailable"
     *
     * @param {Object} totest - The object to test.
     * @return {Boolean} `true` if the object is a marker of type "Unavailable", otherwise `false`.
     */
    fluid.isUnavailable = totest => totest instanceof fluid.unavailable;

    fluid.isErrorUnavailable = totest => fluid.isUnavailable(totest) && totest.variety === "error";

    /**
     * Set a value at a specified path within a nested object structure.
     * Creates intermediate objects as needed to ensure the path exists.
     *
     * @param {Object} root - The root object to begin traversal from.
     * @param {String|String[]} path - The path to the location where the value should be set, specified as a string or an array of path segments.
     * @param {any} newValue - The value to set at the specified path.
     */
    fluid.set = function (root, path, newValue) {
        const segs = fluid.pathToSegs(path);
        for (let i = 0; i < segs.length - 1; ++i) {
            const seg = segs[i];
            if (!root[seg]) {
                root[seg] = Object.create(null);
            }
            root = root[seg];
        }
        root[segs[segs.length - 1]] = newValue;
    };

    /** Returns any value held at a particular global path. This may be an object or a function, depending on what has been stored there.
     * @param {String|String[]} path - The global path from which the value is to be fetched
     * @return {any} The value that was stored at the path, or a fluid.unavailable value if there is none.
     */
    fluid.getGlobalValue = path => {
        const value = fluid.get(fluid.global, path);
        return value === undefined ? fluid.unavailable({
            message: "Global value " + path + " is not defined",
            path
        }) : value;
    };

    /**
     * Set a value in the global namespace at a specified path.
     * This uses `fluid.set` to traverse and create the necessary structure within `fluid.global`.
     * @param {String|String[]} path - The path in the global namespace where the value should be set, specified as a string or an array of path segments.
     * @param {any} value - The value to set at the specified global path.
     */
    fluid.setGlobalValue = (path, value) => {
        fluid.set(fluid.global, path, value);
    };

    /** Ensures that the supplied path has an object allocated in the global Infusion namespace, and retrieves the current value.
     * If no value is stored, a fresh {} will be assigned at the path, and to all currently empty paths leading to the global namespace root.
     * In a browser environment, the global Infusion namespace is rooted in the global `window`.
     * @param {String|String[]} path - The global path at which the namespace is to be allocated.
     * @return {any} Any current value held at the supplied path - or a freshly allocated {} to be held at that path if it was previously empty
     */
    fluid.registerNamespace = function (path) {
        let existing = fluid.getGlobalValue(path);
        if (fluid.isUnavailable(existing)) {
            existing = Object.create(null);
            fluid.setGlobalValue(path, existing);
        }
        return existing;
    };
};

export {applyScope};
