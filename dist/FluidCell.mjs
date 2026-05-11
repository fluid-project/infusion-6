"use strict";

const fluid = {};



    fluid.version = "Infusion 6.0.0";

    fluid.global = fluid.global || typeof window !== "undefined" ?
        window : typeof self !== "undefined" ? self : {};

    /**
     * Check whether the argument is a primitive type
     *
     * @param {any} value - The value to be tested
     * @return {Boolean} `true` if the supplied value is a JavaScript (ES5) primitive
     */
    fluid.isPrimitive = function (value) {
        const valueType = typeof(value);
        return !value || valueType === "string" || valueType === "boolean" || valueType === "number" || valueType === "function";
    };

    /**
     * Converts the given argument into an array or shallow copies it.
     * - If the argument is `null` or `undefined`, returns an empty array.
     * - If the argument is a primitive value or not iterable, wraps it in a single-element array.
     * - If the argument is iterable, converts it into an array using the spread operator.
     * @param {any} arg - The value to be converted into an array.
     * @return {Array} An array representation of the input value.
     */
    fluid.makeArray = function (arg) {
        return arg === null || arg === undefined ? [] :
            fluid.isPrimitive(arg) || typeof arg[Symbol.iterator] !== "function" ? [arg] : [...arg];
    };

    /** Determines whether the supplied object can be treated as an array (primarily, by iterating over numeric keys bounded from 0 to length).
     * The strategy used is an optimised approach taken from an earlier version of jQuery - detecting whether the toString() version
     * of the object agrees with the textual form [object Array]
     *
     * @param {any} totest - The value to be tested
     * @return {Boolean} `true` if the supplied value is an array
     */
    fluid.isArrayable = function (totest) {
        return Boolean(totest) && (Object.prototype.toString.call(totest) === "[object Array]");
    };

    /**
     * Pushes an element or elements onto an array, initialising the array as a member of a holding object if it is
     * not already allocated.
     * @param {Array|Object} holder - The holding object whose member is to receive the pushed element(s).
     * @param {String} member - The member of the <code>holder</code> onto which the element(s) are to be pushed
     * @param {Array|any} topush - If an array, these elements will be added to the end of the array using Array.push.apply.
     * If a non-array, it will be pushed to the end of the array using Array.push.
     */
    fluid.pushArray = function (holder, member, topush) {
        const array = holder[member] ? holder[member] : (holder[member] = []);
        if (Array.isArray(topush)) {
            array.push.apply(array, topush);
        } else {
            array.push(topush);
        }
    };

    /* A special "marker object" representing that no value is present (where
     * signalling using the value "undefined" is not possible - e.g. the return value from a "strategy"). This
     * is intended for "ephemeral use", i.e. returned directly from strategies and transforms and should not be
     * stored in data structures */
    fluid.NoValue = Symbol("No Value");

    /**
     * Transforms the properties of an object or elements of an array by applying a provided function to each item.
     *
     * @param {Object} source - The object to transform. If `null` or `undefined`, the function returns the input as-is.
     * @param {Function} func - The transformation function to apply to each item. It is called with two arguments:
     *   - `value` (any): The value of the current property or element.
     *   - `key` (String): The key of the current property .
     * @return {Object} A new object or array with transformed values. If `source` is `null` or `undefined`, it is returned unchanged.
     */
    fluid.transform = function (source, func) {
        if (source) {
            const togo = {};
            for (const key in source) {
                const ret = func(source[key], key);
                if (ret !== fluid.NoValue) {
                    togo[key] = ret;
                }
            }
            return togo;
        } else {
            return source;
        }
    };

    fluid.invokeLater = function (func) {
        return setTimeout(func, 0);
    };

    /** Unavailable value support **/

    fluid.unavailablePriority = {
        "pending": 1,
        "config": 2,
        "error": 3
    };

    /** @typedef {Object} UnavailableCause
     * A record explaining the cause that a value is unavailable.
     * @property {String} message - A human-readable message describing the cause.
     * @property {String} variety - The variety assigned to the cause (e.g., "error", "config", "pending").
     * @property {String} [site] - An optional site associated with the cause of unavailability
     */

    /**
     * @typedef {UnavailableCause} Unavailable
     * A marker representing an "Unavailable" state.
     * @property {Any} staleValue - The most recently seen state of an unavailable value which is unavailable through
     *   depending on pending I/O
     */

    /** @typedef {Unavailable} CausedUnavailable
     * A marker representing an unavailable state which has multiple causes.
     * @property {UnavailableCause[]} causes - An array of cause records.
     */

    fluid.upgradeCause = function (cause, defaultVariety) {
        const upCause = typeof(cause) === "string" ? {message: cause} :
            cause instanceof Error ? {message: cause.message, error: cause, variety: "error"} : cause;
        if (!upCause.variety) {
            upCause.variety = defaultVariety;
        }
        return upCause;
    };

    /**
     * Formats an array of cause records into a human-readable string describing why a value is unavailable.
     * Each cause's message is included, separated by newlines.
     *
     * @param {UnavailableCause[]} causes - An array of cause records explaining the unavailability.
     * @return {string} A formatted string listing all cause messages.
     */
    fluid.formatCauses = function (causes) {
        return "Value is unavailable - causes are:\n" + causes.map(cause => cause.message).join("\n");
    };

    fluid.applyUnavailable = function (instance, cause = {}, variety = "error") {
        if (fluid.isArrayable(cause)) {
            instance.causes = cause.map(oneCause => fluid.upgradeCause(oneCause, variety));
            instance.variety = instance.causes.reduce((acc, {variety}) => {
                const priority = fluid.unavailablePriority[variety];
                return priority > acc.priority ? {variety, priority} : acc;
            }, {priority: -1}).variety;
            instance.message = fluid.formatCauses(instance.causes);
        } else {
            const upCause = fluid.upgradeCause(cause, variety);
            Object.assign(instance, upCause);
        }
        return instance;
    };

    /**
     * Create a marker representing an "Unavailable" state with an associated cause or list of causes, which each
     * contain an site address or external resource (e.g. URL) responsible for unavailability of this value.
     * The marker is mutable.
     *
     * @param {Object|Array<UnavailableCause>} [cause={}] - A list of dependencies or reasons for unavailability.
     * @param {String} [variety="error"] - The variety of unavailable value:
     * * "error" indicates a syntax or structural issue that needs design intervention.
     * * "config" indicates the value is not available because it has been configured away
     * * "I/O" indicates pending I/O - a stale value may be stored at `staleValue` representing a previous evaluation
     * @return {Unavailable} A marker of type "Unavailable".
     */
    fluid.unavailable = function (cause = {}, variety = "error") {
        const togo = Object.create(fluid.unavailable.prototype);
        fluid.applyUnavailable(togo, cause, variety);
        return togo;
    };

    /**
     * Creates an "Unavailable" marker representing a value that is pending due to I/O.
     * Sets the variety to "pending", provides a standard message, and records the site and stale value.
     *
     * @param {Any} staleValue - The most recently seen value before it became unavailable due to pending I/O.
     * @param {String} site - The site or resource (e.g. URL) responsible for the pending I/O.
     * @return {Unavailable} An object representing the unavailable state due to pending I/O.
     */
    fluid.pending = function (staleValue, site) {
        const togo = Object.create(fluid.unavailable.prototype);
        togo.variety = "pending";
        togo.message = "Value is unavailable due to pending I/O";
        togo.site = site;
        togo.staleValue = staleValue;
        return togo;
    };

    fluid.isPending = function (value) {
        return value instanceof fluid.unavailable && value.variety === "pending";
    };

    fluid.isConfigUnavailable = function (value) {
        return value instanceof fluid.unavailable && value.variety === "config";
    };

    /**
     * Check if an object is a marker of type "Unavailable"
     *
     * @param {Object} totest - The object to test.
     * @return {Boolean} `true` if the object is a marker of type "Unavailable", otherwise `false`.
     */
    fluid.isUnavailable = totest => totest instanceof fluid.unavailable;

    fluid.isErrorUnavailable = totest => fluid.isUnavailable(totest) && totest.variety === "error";

    // Patched in core framework to unproxy unavailable values
    fluid.deproxyUnavailable = target => target;

    /**
     * Extracts the array of causes from an "Unavailable" marker.
     * If the marker has a `causes` property, returns it; otherwise, returns an array containing the unwrapped marker itself.
     *
     * @param {Unavailable} unavailable - The "Unavailable" marker to extract causes from.
     * @return {UnavailableCause[]} An array of cause records explaining the unavailability.
     */
    fluid.unavailableToCauses = function (unavailable) {
        const unwrapped = fluid.deproxyUnavailable(unavailable);
        return unwrapped.causes ? unwrapped.causes : [unwrapped];
    };

    /**
     * Merge two "unavailable" markers into a single marker, combining their causes.
     * If the existing marker is `null` or `undefined`, the fresh marker is returned as-is.
     *
     * @param {Unavailable|null|undefined} existing - The existing "unavailable" marker, or `null`/`undefined` if none exists.
     * @param {Unavailable} fresh - The new "unavailable" marker to merge with the existing one.
     * @return {Unavailable} A combined "unavailable" marker with merged causes, or the fresh marker if no existing marker is provided.
     */
    fluid.mergeUnavailable = function (existing, fresh) {
        return !existing ? fresh : fluid.unavailable(fluid.unavailableToCauses(existing).concat(fluid.unavailableToCauses(fresh)));
    };

    fluid.missingPolicies = {
        unavailable: (root, path) => fluid.unavailable({
            message: `Path ${path} was not found`,
            // TODO: Upgrade incoming data so that it always comes with a full site cursor
            site: root
        }),
        error: (root, path) => fluid.fail("Path ", path, " was not found in model ", root)
    };

    /** Support for traversing substrate via string paths **/

    fluid.getPathSegmentImpl = function (accept, path, i) {
        let segment = "";
        let escaped = false;
        const limit = path.length;
        for (; i < limit; ++i) {
            const c = path.charAt(i);
            if (!escaped) {
                if (c === ".") {
                    break;
                } else if (c === "\\") {
                    escaped = true;
                } else {
                    segment += c;
                }
            } else {
                escaped = false;
                segment += c;
            }
        }
        accept[0] = segment;
        return i;
    };

    /** Parse an IL path separated by periods (.) into its component segments.
     * @param {String} path - The path expression to be split
     * @return {String[]} Path parsed into segments.
     */
    fluid.parsePath = function (path) {
        const togo = [], accept = [null];
        let index = 0;
        const limit = path.length;
        while (index < limit) {
            const firstdot = fluid.getPathSegmentImpl(accept, path, index);
            togo.push(accept[0]);
            index = firstdot + 1;
        }
        return togo;
    };

    /**
     * Optionally parse a path expression into its component segments.
     * If the input is a primitive value (e.g., a string), it is parsed into segments using `fluid.parsePath`.
     * If the input is already an array of segments, it is returned unchanged.
     *
     * @param {String|String[]} path - The path expression to be split into segments,
     *     or an array of path segments.
     * @return {String[]} The path represented as an array of segments.
     */
    fluid.pathToSegs = function (path) {
        return fluid.isPrimitive(path) ? fluid.parsePath(path) : path;
    };

    /**
     * Retrieve the value at a specified path within a nested object structure.
     * Traverses the object hierarchy based on the path segments.
     *
     * @param {Object} root - The root object to begin traversal from.
     * @param {String|String[]} path - The path to the desired value, specified as a string or an array of path segments.
     * @param {"unavailable"|"error"} [missingPolicy] - An optional policy from `fluid.missingPolicies` to be followed if a value is not found
     * @return {any} The value at the specified path, or `undefined` if the path traverses beyond defined objects.
     */
    fluid.get = function (root, path, missingPolicy) {
        const segs = fluid.pathToSegs(path);
        const limit = segs.length;
        for (let j = 0; j < limit; ++j) {
            root = root ? root[segs[j]] : undefined;
        }
        if (root === undefined && missingPolicy) {
            return fluid.missingPolicies[missingPolicy](root, path);
        } else {
            return root;
        }
    };


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

    /** Managing the global namespace **/

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
/**
     * Compares two values for equality, with special handling for numbers and NaN.
     * - For non-number types, uses strict equality (===).
     * - For numbers, considers them equal if:
     *   - They are strictly equal, or
     *   - Both are NaN, or
     *   - Their relative error is less than 1e-12 (to account for floating-point precision).
     *
     * @param {Any} a - The first value to compare.
     * @param {Any} b - The second value to compare.
     * @return {Boolean} `true` if the values are considered equal, `false` otherwise.
     */
    fluid.defaultEquality = function (a, b) {
        if (typeof(a) !== "number" || typeof(b) !== "number") {
            return a === b;
        } else {
            // Don't use isNaN because of https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/isNaN#Confusing_special-case_behavior
            if (a === b || a !== a && b !== b) { // Either the same concrete number or both NaN
                return true;
            } else {
                const relError = Math.abs((a - b) / b);
                return relError < 1e-12; // 64-bit floats have approx 16 digits accuracy, this should deal with most reasonable transforms
            }
        }
    };

    /** Any object with a member <code>then</code> of type <code>function</code> passes this test, essentially for
     * a "foreign thenable".
     * @param {any} totest - The value to test
     * @return {Boolean} `true` if the value can be used as a promise
     */
    fluid.isPromise = function (totest) {
        return totest && typeof(totest.then) === "function";
    };

    /**
     * Removes an element from an array at the specified index by replacing it with the last element,
     * then removing the last element. This is an efficient way to remove an item without preserving order.
     *
     * @param {Array} array - The array from which to remove the element.
     * @param {Number} index - The index of the element to remove.
     */
    fluid.removeAtIndex = function (array, index) {
        array[index] = array[array.length - 1];
        array.pop();
    };

    /**
     * Removes the first occurrence of a specified value from an array, if present.
     *
     * @param {Array} array - The array from which to remove the value.
     * @param {any} value - The value to remove from the array.
     */
    fluid.removeArrayElement = function (array, value) {
        const index = array.indexOf(value);
        if (index !== -1) {
            array.splice(index, 1);
        }
    };

    /** Implementation structure taken from Reactively at https://github.com/milomg/reactively/blob/main/packages/core/src/core.ts
     *
     * Nodes for constructing a reactive graph of reactive values and reactive computations.
     *
     * We call input nodes 'roots' and the output nodes 'leaves' of the graph here in discussion,
     * but the distinction is based on the use of the graph, all nodes have the same internal structure.
     * Changes flow from roots to leaves. It would be effective but inefficient to immediately propagate
     * all changes from a root through the graph to descendant leaves. Instead we defer change
     * most change propagation computation until a leaf is accessed. This allows us to coalesce computations
     * and skip altogether recalculating unused sections of the graph.
     *
     * Each reactive node tracks its sources and its observers (observers are other
     * elements that have this node as a source). Source and observer links are updated automatically
     * as observer reactive computations re-evaluate and call get() on their sources.
     *
     * Each node stores a cache state to support the change propagation algorithm: 'clean', 'check', or 'dirty'
     * In general, execution proceeds in three passes:
     *  1. set() propogates changes down the graph to the leaves
     *     direct children are marked as dirty and their deeper descendants marked as check
     *     (no reactive computations are evaluated)
     *  2. get() requests that parent nodes updateIfNecessary(), which proceeds recursively up the tree
     *     to decide whether the node is clean (parents unchanged) or dirty (parents changed)
     *  3. updateIfNecessary() evaluates the reactive computation if the node is dirty
     *     (the computations are executed in root to leaf order)
     */

    // Global state for tracking reactive context

    fluid.trackingVars = {
        /** current capture context for identifying reactive elements
        active while evaluating a reactive function body  */
        // The current Edge whose _fn is in execution
        CurrentReaction: null,
        // Becomes set if the _fn begins to demand a source which is out of step with any of its previously recorded ones
        CurrentGets: null,
        // Tracks along the current array of sources as _fn executes and demands dependents - stores the last index at which
        // demands agree with previous execution
        CurrentGetsIndex: 0
    };

    const $t = fluid.trackingVars;

    /** A list of non-clean 'effect' nodes that will be updated when stabilize() is called */
    fluid.EffectQueue = [];

    /**
     * @enum {Number}
     * @typedef {Number} CacheState
     * @property {Number} CacheClean - The cache is clean (no changes).
     * @property {Number} CacheCheck - The cache needs to be checked (potential changes).
     * @property {Number} CacheDirty - The cache is dirty (changes detected).
     */

    fluid.CacheClean = 0; // light blue
    fluid.CacheCheck = 1; // green
    fluid.CacheDirty = 2; // red

    const CacheClean = fluid.CacheClean,
        CacheCheck = fluid.CacheCheck,
        CacheDirty = fluid.CacheDirty;

    /**
     * A "fit" or connected region of updating graph
     * @typedef {Object} Fit
     * @property {Cell[]} targetsConsumed - An array of cells for which the _consumedSources member has been set during this fit.
     * @property {Cell[]} pendingEffects - An array of effects which have suspended because they depend on pending I/O.
     * @property {Boolean} isActive - Indicates if this fit is currently active.
     */

    /**
     * A reactive cell
     * @typedef {Object} Cell
     *
     * @property {function(): any} get - Retrieves the current value of the cell.
     * @property {function(any): void} set - Sets a new value for the cell.
     * @property {function(Function, Array<Cell>, ComputedProps=): Cell} computed - Sets up or tears down a reactive computation for the cell.
     * @property {function(Function, Array<Cell>, ComputedProps=): Cell} asyncComputed - Sets up or tears down an asynchyronous reactive computation for the cell.
     *
     * @property {any} _value - The current value stored in the cell.
     * @property {String|undefined} [name] - A name or address for the cell.
     * @property {CacheState} _state - The cache state of the cell (clean, check, or dirty).
     * @property {CacheState} _prePendingState - A "high watermark" of our _state at the point we went into a pending state
     * @property {Cell|null} _dirtyFrom - Cell from along which we were dirtied
     * @property {Cell[]|null} _observers - Cells that have us as sources (out links)
     * @property {Edge[]|null} _inEdges - Array of incoming edges which could update this node
     * @property {Cell[]|null} _consumedSources - Sources from which arcs have been traversed during this fit
     * @property {CellTrackingRecord|null} _trackingRecord - Captures dynamic dependency tracking information for an update which is in progress
     * @property {Boolean} _isEffect - Is this an effect node
     * @property {Boolean} _isQueued - If an effect, are we queued?
     * @property {Fit} _fit - The current update fit that the cell is enlisted in
     */

    /**
     * @typedef {Object} ComputedProps
     * @property {Boolean} isAsync - Indicates if the computation is asynchronous.
     * @property {Boolean} isFree - Indicates if this is a "free" computation that will deliver unavailable values
     */

    /** An edge between two reactive cells
     * @typedef {Object} Edge
     * @property {Cell} target - The cell that we are the edge to (a computer for)
     * @property {Cell|null} key - The key for the edge, either the first staticSource or null if there are not any
     * @property {Cell[]|null} sources - Sources in reference order, not deduplicated (in links)
     * @property {Cell[]|null} staticSources - Static sources supplied
     * @property {Function} fn - The function to be called to compute the value
     * @property {Boolean} isAsync - Indicates if the edge's computation is asynchronous.
     * @property {Boolean} isFree - Indicates if the edge's computation should be invoked on unavailable values
     */

    /**
     * @typedef {Object} CellTrackingRecord
     * @property {Edge|null} prevReaction - The previous global reaction context.
     * @property {Cell[]|null} prevGets - The previous list of demanded source cells.
     * @property {Number} prevIndex - The previous index in the sources array.
     */

    /**
     * Creates a new reactive cell for managing state and computations.
     *
     * @param {any|undefined} [initialValue] - The initial value to store in the cell.
     * @param {Object} [props] - Additional properties to contextualise the cell
     * @return {Cell} The newly created cell object.
     */
    fluid.cell = function (initialValue, props) {
        const cell = Object.create(fluid.cellPrototype);
        Object.assign(cell, props);

        cell._value = initialValue === undefined ? fluid.cell.initialUnavailable : initialValue;
        cell._dirtyFrom = null;
        cell._observers = null; // nodes that have us as sources (outgoing links)
        cell._inEdges = null;
        cell._consumedSources = null;
        cell._fit || (cell._fit = null);

        cell._state = CacheClean;
        cell._prePendingState = null;
        cell._trackingRecord = null;

        return cell;
    };

    // Separately capture this so that calls to fluid.cell can be wrapped
    fluid.cellPrototype = fluid.cell.prototype;

    fluid.cell.initialUnavailable = Object.freeze(fluid.unavailable({
        staleValue: undefined
    }, "config"));


    /** @type {Fit[]} Array of all currently active fits */
    fluid.CurrentFits = [];

    fluid.cell.fitId = 0;

    fluid.cell.makeFit = (staticFit) => ({
        targetsConsumed: [],
        pendingEffects: [],
        sources: [],
        isActive: true,
        fitId: fluid.cell.fitId++,
        staticFit
    });

    fluid.cell.frameworkFit = fluid.cell.makeFit(true);

    fluid.cell.idleSignal = fluid.cell(true, {name: "Global idle signal", _fit: fluid.cell.frameworkFit});

    /** Allocate a new fit
     * @return {Fit} A freshly allocated fit
     */
    fluid.cell.startFit = () => {
        const fit = fluid.cell.makeFit(false);
        fluid.CurrentFits.push(fit);
        fluid.cell.idleSignal.set(false);
        return fit;
    };

    /** End the current "fit" (transaction) which is updating the reactive graph by resetting all the arcs which
     * have been marked as consumed by one leg of bidirectional update arcs.
     * @param {Fit} fit - The fit to end
     * @param {Boolean} [coalesce] - If this fit is being coalesced into another
     */
    fluid.cell.endFit = function (fit, coalesce) {
        if (fit.isActive && !fit.staticFit) {
            fit.targetsConsumed.forEach(target => {
                target._consumedSources.length = 0;
                if (!coalesce) {
                    target._prePendingState = null;
                }
            });
            fit.targetsConsumed.length = 0;
            fit.isActive = false;
            fluid.removeArrayElement(fluid.CurrentFits, fit);
            if (fluid.CurrentFits.length === 0) {
                fluid.cell.idleSignal.set(true);
            }
        }
    };

    /** Report the cause of any reaction which has updated a given cell, or else the one that is currently
     * in progress, in the form of an array of nodes reaching back from the supplied cell to the one whose modification
     * triggered the reaction.
     * @param {Cell} [inTarget] - If supplied, the cell whose update cause should be reported. If absent, any current
     * reaction will be used instead.
     * @return {Cell[]|null} - An array of nodes starting with either [inTarget] or the one targetted by the current
     * reaction, reaching back to the node whose update caused the reaction, or else `null` if no valid target was supplied.
     */
    fluid.cell.findCause = function (inTarget) {
        const useTarget = inTarget || $t.CurrentReaction?.target;
        if (useTarget) {
            const cause = [];
            let target = useTarget;
            do {
                // Don't currently try to report cyclic causes
                if (!cause.includes(target)) {
                    cause.push(target);
                    target = target._dirtyFrom;
                } else {
                    target = null;
                }
            } while (target);
            return cause;
        } else {
            return null;
        }
    };

    fluid.cell.findAllCauses = function (inEdge) {
        const currentEdge = inEdge || $t.CurrentReaction;
        let allCauses = [];
        if (currentEdge.sources) {
            // Gather causes from each source
            const extraCauses = currentEdge.sources.flatMap(source => fluid.cell.findCause(source));
            allCauses = allCauses.concat(extraCauses);
        }
        return Array.from(new Set(allCauses));
    };

    /**
     * Adds the given sources to the list of culled sources for a specific target cell. This signals that one
     * leg of a bidirectional arc has been travelled and that the reverse arc should be ignored for this fit.
     *
     * @param {Cell} target - The target cell for which sources are being culled.
     * @param {Array[Cell]} inSources - The array of source cells to be added to the culled sources list.
     */
    fluid.cell.enlistInFit = function (target, inSources) {
        const sourceFits = [];
        if (inSources) {
            for (let i = 0; i < inSources.length; ++i) {
                const sourceFit = inSources[i]._fit;
                if (sourceFit !== null && !sourceFits.includes(sourceFit)) {
                    sourceFits.push(sourceFit);
                }
            }
        }
        let fit = null;
        if (sourceFits.length === 0) {
            fit = fluid.cell.startFit();
        } else {
            fit = sourceFits[0];
            for (let i = 1; i < sourceFits.length; ++i) {
                const extraFit = sourceFits[i];

                Array.prototype.push.apply(fit.targetsConsumed, extraFit.targetsConsumed);
                Array.prototype.push.apply(fit.pendingEffects, extraFit.pendingEffects);
                Array.prototype.push.apply(fit.sources, extraFit.sources);
                fluid.cell.endFit(extraFit, true);
            }
        }
        const targetsConsumed = fit.targetsConsumed;
        if (!targetsConsumed.includes(target)) {
            targetsConsumed.push(target);
        }

        const sources = target._consumedSources || [];
        Array.prototype.push.apply(sources, inSources);
        target._consumedSources = sources;

        target._fit = fit;
    };


    fluid.cell.equals = fluid.defaultEquality;

    // Dynamic dependency tracking logic

    /**
     * Begins the update process for a reactive cell by saving the current update context.
     * Stores the cell's previous value and the current global reaction state, then sets up
     * the new reaction context for the update. This function is used internally to manage
     * nested or recursive updates in the reactive graph.
     *
     * @param {Cell} cell - The reactive cell being updated.
     * @param {Edge|null} inEdge - The edge representing the computation or dependency being updated.
     */
    fluid.cell.beginTracking = function (cell, inEdge) {
        const trackingRecord = {
            prevReaction: $t.CurrentReaction,
            prevGets: $t.CurrentGets,
            prevIndex: $t.CurrentGetsIndex
        };
        cell._trackingRecord = trackingRecord;
        $t.CurrentReaction = inEdge;
        $t.CurrentGets = null;
        $t.CurrentGetsIndex = 0;
    };

    /**
     * Updates the dependency links for a reactive cell after its computation has been evaluated.
     * If the sources demanded during computation have diverged from the previous sources, this function
     * updates the edge's sources array and the observer links from the new sources to the cell.
     * If fewer sources are now demanded, removes the cell as an observer from the excess sources.
     *
     * @param {Cell} cell - The reactive cell whose dependencies are being updated.
     * @param {Edge} inEdge - The edge representing the computation or dependency being updated.
     */
    fluid.cell.updateDynamicDependencies = function (cell, inEdge) {
        // Update sources if they changed during execution -     // if the sources have changed, update source & observer links
        if ($t.CurrentGets) {
            // We diverged, inherit the unchanged portion of sources array up to CurrentGetsIndex and then splice in the excess
            fluid.cell.removeParentObservers(cell, inEdge, $t.CurrentGetsIndex);
            if (inEdge.sources && $t.CurrentGetsIndex > 0) {
                inEdge.sources.length = $t.CurrentGetsIndex + $t.CurrentGets.length;
                for (let i = 0; i < $t.CurrentGets.length; i++) {
                    inEdge.sources[$t.CurrentGetsIndex + i] = $t.CurrentGets[i];
                }
            } else {
                inEdge.sources = $t.CurrentGets;
            }

            for (let i = $t.CurrentGetsIndex; i < inEdge.sources.length; i++) {
                // Add ourselves to the end of the parent .observers array
                const source = inEdge.sources[i];
                if (!source._observers) {
                    source._observers = [cell];
                } else {
                    source._observers.push(cell);
                }
            }
        } else if (inEdge.sources && $t.CurrentGetsIndex < inEdge.sources.length) {
            // We didn't diverge but demanded strictly fewer sources than our predecessor, trim the excess
            fluid.cell.removeParentObservers(cell, inEdge, $t.CurrentGetsIndex);
            inEdge.sources.length = $t.CurrentGetsIndex;
        }
    };

    /**
     * Ends the update process for a reactive cell by restoring the previous update context.
     * Restores the global reaction state, resets the cell's update record, and marks the cell as clean.
     * If the cell's value has changed and it has observers, marks its observers as dirty.
     * If there is no current reaction after ending the update, ends the current fit (transaction).
     *
     * @param {Cell} cell - The reactive cell whose update is being ended.
     */
    fluid.cell.endTracking = function (cell) {
        const trackingRecord = cell._trackingRecord;
        cell._trackingRecord = null;

        $t.CurrentGets = trackingRecord.prevGets;
        $t.CurrentReaction = trackingRecord.prevReaction;
        $t.CurrentGetsIndex = trackingRecord.prevIndex;
    };

    /**
     * Executes a function in an "untracked" context, temporarily suspending the current reactive tracking.
     * This allows code to run without capturing dependencies.
     *
     * @param {Function} fn - The function to execute in an untracked context.
     */
    fluid.cell.untracked = function (fn) {
        // Create fake cell to hold reaction state
        const stateCell = {};
        fluid.cell.beginTracking(stateCell, null);
        try {
            fn();
        } finally {
            fluid.cell.endTracking(stateCell);
        }
    };

    /**
     * Reactively evaluate the current cell, ensuring its value is up to date with respect to all computed dependents,
     * within the current reactive context
     *
     * @return {any} The evaluated cell value
     * @this {Cell}
     */
    fluid.cell.prototype.get = function () {
        // Track this get in the current reaction context
        if ($t.CurrentReaction) {
            if (
                !$t.CurrentGets &&
                $t.CurrentReaction.sources &&
                $t.CurrentReaction.sources[$t.CurrentGetsIndex] === this
            ) {
                // No divergence with previous _sources and none is requested - simply step along the array of _sources
                $t.CurrentGetsIndex++;
            } else {
                // Divergence needs to begin - allocate a fresh array and record this source as demanded
                if (!$t.CurrentGets) {
                    $t.CurrentGets = [this];
                }
                else {
                    // Divergence in progress, record this source as demanded
                    $t.CurrentGets.push(this);
                }
            }
        }

        // Update if we have in edges and might be stale
        if (this._inEdges) {
            fluid.cell.updateIfNecessary(this);
        }

        return this._value;
    };

    /**
     * Establish a computed relation which will lazily and reactively compute this cell's value given the values of a number
     * of other cells with which the relationship is made, or tear down such relation. These relations are keyed by the first
     * member of any `staticSources` supplied as arguments of the relation, or `null` if there are no such sources.
     *
     * @param {Function|null} fn - The function which will reactively evaluate this cell's value, or null if an existing relation
     * is to be torn down.
     * @param {Cell[]} [staticSources] - Any statically known cell dependencies whose reactively evaluated arguments will be supplied
     * to `fn` when it is called.
     * @param {ComputedProps} [props] - Any additional properties to configure the relation
     * @return {Cell} This cell
     * @this {Cell}
     */
    fluid.cell.prototype.computed = function (fn, staticSources, props) {
        // The edge's key is either its first source or null
        const key = staticSources && staticSources[0] || null;
        if (!this._inEdges) {
            this._inEdges = [];
        }
        const inEdgeIndex = this._inEdges.findIndex(edge => edge.key === key);
        /** @type Edge **/
        let inEdge = inEdgeIndex === -1 ? null : this._inEdges[inEdgeIndex];

        if (!fn) {
            // Remove computation - part of middle block of Milo's .set
            if (inEdge) {
                fluid.cell.removeParentObservers(this, inEdge, 0);
                fluid.removeAtIndex(this._inEdges, inEdgeIndex);
            }
            return this;
        } else {
            const oldFn = inEdge?.fn;
            if (!inEdge) {
                inEdge = Object.create(null);
                inEdge.key = key;
            }

            inEdge.fn = fn;
            inEdge.staticSources = staticSources ? [...staticSources] : null;
            inEdge.sources = staticSources ? [...staticSources] : null;
            inEdge.target = this;
            inEdge.isAsync = props?.isAsync;
            inEdge.isFree = props?.isFree;
            inEdge.excludeSource = props?.excludeSource;
            this._inEdges.push(inEdge);

            // Set up observer links from static sources to this cell immediately - this is from new signature
            if (staticSources) {
                for (let i = 0; i < staticSources.length; i++) {
                    const source = staticSources[i];
                    if (!source._observers) {
                        source._observers = [this];
                    } else {
                        source._observers.push(this);
                    }
                }
            }

            if (fn === oldFn) {
                // No change, don't disturb anything
            } else if (oldFn) {
                // Case (a): replacing a live edge's fn.
                // Run the new edge directly; updateComplete's equals check handles
                // whether downstream propagation is needed.
                fluid.cell.update(this, inEdge);
            } else if (fluid.isUnavailable(this._value)) {
                // Case (b): first wiring on an unsettled cell. Mark stale so
                // updateIfNecessary will run this edge when the cell is next pulled.
                fluid.cell.markStale(this, CacheDirty, []);
            } else {
                // First wiring on a settled cell: trust the user's assertion of consistency.
                // No markStale. The cycle (if any) stays quiescent.
            }
            fluid.cell.stabilize();

            return this;
        }
    };

    /**
     * Establish an asynchronous computed relation which will lazily and reactively compute this cell's value given the values of a number
     * of other cells with which the relationship is made, or tear down such relation. These relations are keyed by the first
     * member of any `staticSources` supplied as arguments of the relation, or `null` if there are no such sources.
     *
     * @param {Function|null} fn - The async function which will reactively evaluate this cell's value, or null if an existing relation
     * is to be torn down. If a function is supplied, this should supply a promise for a value.
     * @param {Cell[]} [staticSources] - Any statically known cell dependencies whose reactively evaluated arguments will be supplied
     * to `fn` when it is called.
     * @param {ComputedProps} [props] - Any additional properties to configure the relation.
     * @return {Cell} This cell
     * @this {Cell}
     */
    fluid.cell.prototype.asyncComputed = function (fn, staticSources, props) {
        return this.computed(fn, staticSources, {...props, isAsync: true});
    };

    /**
     * Refreshes the value of the cell by re-evaluating its computation for the specified static sources.
     * Finds the incoming edge corresponding to the given static sources and triggers an update for this cell along that edge.
     *
     * @param {Cell[]} [staticSources] - An optional array of static source cells to identify the computation edge to be refreshed
     * @this {Cell} The cell for which an incoming edge is to be refreshed
     */
    fluid.cell.prototype.refresh = function (staticSources) {
        // The edge's key is either its first source or null
        if (this._inEdges) {
            const key = staticSources && staticSources[0] || null;
            const inEdge = this._inEdges.find(edge => edge.key === key);
            if (inEdge) {
                fluid.cell.update(this, inEdge);
            }
        }
    };

    fluid.cell.queueEffect = function (cell) {
        if (cell._isEffect && !cell._isQueued) {
            cell._isQueued = true;
            fluid.EffectQueue.push(cell);
        }
    };

    /**
     * Marks a cell and its observers as stale, updating their cache state, as well as queueing any effects found
     * downstream
     *
     * @param {Cell} cell - The reactive cell to mark as stale.
     * @param {CacheState} state - The new cache state to assign (e.g., CacheDirty or CacheCheck).
     * @param {Cell[]} markedSources - Array of sources which have already been marked dirty on this stack
     * @param {Cell} [dirtyFrom] - A cell joined by an edge responsible for dirtiness
     * @param {Boolean} toPending - Was caused by a transition to a pending value
     * @param {Boolean} fromPending - Was caused by a transition away from pending value
     * @param {Boolean} earlyCutoff - We are cleaning the graph in order to operate early cutoff for an unchanged pending value
     */
    fluid.cell.markStale = function (cell, state, markedSources, dirtyFrom, toPending, fromPending, earlyCutoff) {
        fluid.cell.queueEffect(cell);

        // If we were previously clean, then we know that we may need to update to get the new value
        // In early cutoff case we need to eagerly walk up the graph and trigger any effects on the unchanged values
        if (cell._state < state || earlyCutoff || toPending) {
            // We've resolved with a genuine concrete value, clear prePending since its scope has ended
            if (!toPending && !fromPending && cell._prePendingState && state === CacheDirty) {
                cell._prePendingState = null;
            }
            if (!earlyCutoff) {
                if (fromPending || toPending && cell._prePendingState === null) {
                    cell._prePendingState = state;
                }
                cell._state = state;
                cell._dirtyFrom = dirtyFrom;
            } else {
                cell._value = cell._value.staleValue;
                if (cell._isEffect) {
                    cell._state = CacheDirty;
                }
            }
            markedSources.push(cell);
            if (cell._observers) {
                const consumedSources = cell._consumedSources;
                for (let i = 0; i < cell._observers.length; i++) {
                    const observer = cell._observers[i];
                    if (!consumedSources?.includes(observer) && !markedSources.includes(observer)) {
                        fluid.cell.markStale(observer, CacheCheck, markedSources, cell, toPending, false, earlyCutoff);
                    }

                }
            }
        }
    };

    fluid.cell.notifiableChange = function (oldValue, newValue, prePendingState) {
        let equalValues = true;
        let earlyCutoff = false;
        const oldUnavail = fluid.isUnavailable(oldValue);
        const newUnavail = fluid.isUnavailable(newValue);

        const toPending = newUnavail && newValue.variety === "pending";
        const fromPending = oldUnavail && oldValue.variety === "pending";

        if (oldUnavail !== newUnavail) {
            equalValues = false;
            if (oldUnavail && oldValue.variety === "pending" && prePendingState) {
                earlyCutoff = fluid.cell.equals(oldValue.staleValue, newValue);
            }
        } else if (oldUnavail) {
            // Both unavailable: variety change is observable; otherwise treat as same
            equalValues = oldValue.variety === newValue.variety;
        } else {
            equalValues = fluid.cell.equals(oldValue, newValue);
        }
        return {toPending, fromPending, earlyCutoff, equalValues};
    };

    /**
     * Commits a new value to the given reactive cell.
     * @param {Cell} cell - The reactive cell to update.
     * @param {any} newValue - The new value to assign to the cell.
     */
    fluid.cell.commitValue = function (cell, newValue) {
        const oldValue = cell._value;
        cell._value = newValue;

        const {equalValues, toPending, fromPending, earlyCutoff} = fluid.cell.notifiableChange(oldValue, newValue, cell._prePendingState);

        if (!equalValues || earlyCutoff) {
            // Misleading original comment:
            // handles diamond dependencies if we're the parent of a diamond.
            if (cell._observers) {
                const consumedSources = cell._consumedSources;
                // We've changed value, so mark our children as dirty so they'll reevaluate
                for (let i = 0; i < cell._observers.length; i++) {
                    const observer = cell._observers[i];
                    if (!consumedSources?.includes(observer)) {
                        // Milo's implementation for some reason did this directly rather than recursively
                        fluid.cell.markStale(observer, CacheDirty, [cell], cell, toPending, fromPending, earlyCutoff);
                    }
                }
            }
        }

        // TODO: Need better guarding here to ensure global reentrancy but this basically makes idleSignal function
        if (!fluid.isConfigUnavailable(newValue) && !cell._fit.staticFit) {
            fluid.cell.stabilize();
        }

    };

    /**
     * Completes the update process for a reactive cell by setting its new value and updating its state.
     * If the value has changed, marks all observers (children) as dirty so they will reevaluate.
     * Handles availability transitions and ensures that downstream effects are stabilized if necessary.
     *
     * @param {any} newValue - The new value to assign to the cell.
     * @param {Cell} cell - The reactive cell being updated.
     */
    fluid.cell.updateComplete = function (newValue, cell) {
        // Don't mark ourselves as clean if value is not available since it may be computable from another relation
        if (!fluid.isConfigUnavailable(newValue)) {
            const newState = CacheClean;
            cell._state = newState;
        }

        fluid.cell.commitValue(cell, newValue);
    };

    /**
     * Update the value of this writeable cell.
     *
     * @param {any} value - The new cell value
     * @param {Object} options - Optional options to contextualise the update
     * @param {String} [options.source] - Optional source to mark the reactive propagation, accessible via effect's excludeSource
     * @this {Cell}
     */
    fluid.cell.prototype.set = function (value, options) {
        this._state = CacheClean;
        if (!fluid.cell.equals(this._value, value)) {
            if (!this._fit || !this._fit.isActive) {
                this._fit = fluid.cell.startFit();
            }
            const source = options?.source;
            if (source && !this._fit.sources.includes(source)) {
                this._fit.sources.push(source);
            }

            fluid.cell.commitValue(this, value);
        }
    };

    fluid.cell.bindIterable = function (cell, inEdge, iterable) {
        // Guide at https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function*#declaring_an_async_generator_function
        const bindIterable = nextIt => {
            fluid.cell.setPending(cell, cell._value);
            nextIt.then(res => {
                fluid.cell.updateComplete(res.value, cell);
                if (!res.done) {
                    const nextIt = iterable.next();
                    bindIterable(nextIt);
                }
            }, e => {
                fluid.cell.updateComplete(fluid.unavailable(e), cell);
            });
        };
        const nextIt = iterable.next();
        bindIterable(nextIt);
    };

    // Currently very plain compared to old core's processSignalArgs but may include flattening etc. again in future
    /**
     * Map an array of arguments, coalescing "unavailable" values if present.
     *
     * @param {Array|any} args - The array of arguments or single argument to process.
     *     Arguments may include `preactSignalsCore.Signal` instances or plain values.
     * @param {any} oldValue - Any previous value computed at the same site where arguments are being consumed
     * @return {Object} An object with the following properties:
     *     - `unavailable` (Object|null): The most "unavailable" value (if any) based on priority,
     *       or `null` if no unavailable values are found.
     */
    fluid.cell.mapSignalArgs = function (args, oldValue) {
        // Reuse a pending unavailable with its staleValue if there is one
        let unavailable = fluid.isPending(oldValue) ? oldValue : null;
        let causes = null;
        for (let i = 0; i < args.length; ++i) {
            let arg = args[i];
            if (fluid.isUnavailable(arg)) {
                if (causes === null) {
                    causes = [];
                }
                causes.push(arg);
            }
        }
        if (causes) {
            if (!unavailable) {
                unavailable = fluid.unavailable(causes);
            } else {
                fluid.applyUnavailable(unavailable, causes);
            }
        } else {
            unavailable = null;
        }
        return {unavailable};
    };

    /**
     * Sets the value of the given cell to a pending state, using the provided old value as the stale value.
     * Marks the cell's cache state as clean and commits the pending value.
     *
     * @param {Cell} cell - The reactive cell to set as pending.
     * @param {any} oldValue - The previous value to use as the stale value for the pending state.
     */
    fluid.cell.setPending = function (cell, oldValue) {
        const pendingValue = fluid.pending(oldValue, cell.name);
        cell._state = CacheClean;
        fluid.cell.commitValue(cell, pendingValue);
    };

    /**
     * Updates the value of a reactive cell by re-evaluating its computation function and updating any changed dynamic dependencies.
     * @param {Cell} cell - The reactive cell to update.
     * @param {Edge} inEdge - The edge along which we should update
     */
    fluid.cell.update = function (cell, inEdge) {
        if (cell._trackingRecord || !cell._inEdges) {
            return;
        }

        let syncUpdate = !inEdge.isAsync;
        let result;

        fluid.cell.beginTracking(cell, inEdge);

        fluid.cell.enlistInFit(cell, inEdge.sources);

        // Skip notification if the fit has an excluded source
        if (inEdge.excludeSource) {
            if (cell._fit.sources.includes(inEdge.excludeSource)) {
                return;
            }
        }

        if (!syncUpdate) {
            const oldValue = fluid.isUnavailable(cell._value) ? cell._value.staleValue : cell._value;
            // Mark the cell as unavailable/stale whilst it is updating and push old value into staleValue
            fluid.cell.setPending(cell, oldValue);
        }

        try {
            const args = inEdge.staticSources ? inEdge.staticSources.map(s => s.get()) : [];
            const {unavailable} = fluid.cell.mapSignalArgs(args, cell._value);

            result = unavailable && !inEdge.isFree ? unavailable : inEdge.fn.apply(null, args);
        } catch (e) {
            result = fluid.unavailable(e);
            syncUpdate = true;
        } finally {
            if (!syncUpdate) {
                if (fluid.isPromise(result)) {
                    result.then(newValue => {
                        fluid.cell.updateComplete(newValue, cell);
                    }).catch(e => {
                        fluid.cell.updateComplete(fluid.unavailable(e), cell);
                    }
                    );
                } else if (result[Symbol.asyncIterator]) {
                    fluid.cell.bindIterable(cell, inEdge, result);
                } else { // Unexpected plain return from async edge
                    syncUpdate = true;
                }
            }
            if (syncUpdate) {
                // It was a plain value, update now
                fluid.cell.updateComplete(result, cell);
            }

            fluid.cell.updateDynamicDependencies(cell, inEdge);
            fluid.cell.endTracking(cell);
        }
    };

    /**
     * Determine which compute edge should be activated in order to update a dirty cell. We can activate an edge if
     * all of its sources are either clean or pending unavailable
     * @param {Cell} cell - The reactive cell to update if necessary.
     * @param {CacheState} targetState - May be CacheCheck in the case we're trying to find a dirty edge for an effect, which
     * we might need to notify if it is free and requires notification of all transitions
     * @return {Edge} edge - The edge to be activated
     */
    fluid.cell.findDirtyEdge = function (cell, targetState) {
        let bestCandidate;
        for (let i = 0; i < cell._inEdges.length; ++i) {
            const edge = cell._inEdges[i];
            if (edge.isFree ||
                targetState === CacheDirty && !edge.sources?.some(source => fluid.isConfigUnavailable(source._value) || source._state !== CacheClean) ) {
                bestCandidate = edge;
                break;
            }
        }
        return bestCandidate;
    };

    /**
     * Ensures that a reactive cell is up to date by checking and updating its dependencies as needed.
     * @param {Cell} cell - The reactive cell to update if necessary.
     * @param {Cell[]} [visited] - Cells visited during recursive calls to updateIfNecessary
     */
    fluid.cell.updateIfNecessary = function (cell, visited) {
        let dirtyEdge = null;
        visited = visited || [];
        visited.push(cell);
        // If we are potentially dirty, see if we have a parent who has actually changed value
        // Difference from Milo's implementation - recurse fully into CacheDirty nodes to ensure that we don't schedule
        // a less nested one with an async dependency first
        if (cell._state !== CacheClean) {
            if (cell._inEdges) {
                for (const edge of cell._inEdges) {
                    if (edge.sources) {
                        for (const source of edge.sources) {
                            if (!visited.includes(source)) {
                                fluid.cell.updateIfNecessary(source, visited);  // updateIfNecessary() can change this.state
                            }
                        }
                        // Second leg of this test is necessary so that we notify free effects in all cases
                        if (cell._state === CacheDirty || cell._isEffect && cell._state === CacheCheck) {
                            dirtyEdge = fluid.cell.findDirtyEdge(cell, cell._state);
                            if (dirtyEdge) {
                                // Stop the loop here so we won't trigger updates on other parents unnecessarily
                                // If our computation changes to no longer use some sources, we don't
                                // want to update() a source we used last time, but now don't use.
                                break;
                            }
                        }
                    }
                }
            }
        }
        if (!dirtyEdge && cell._state === CacheDirty) {
            dirtyEdge = fluid.cell.findDirtyEdge(cell, cell._state);
        }

        if (dirtyEdge) {
            fluid.cell.update(cell, dirtyEdge);
        }
        cell._state = CacheClean;
    };

    /**
     * Removes this cell as an observer from its parent source cells starting at the given index of an edge's sources
     * @param {Cell} cell - The reactive cell to be removed as an observer
     * @param {Edge} edge - The edge whose sources should be removed
     * @param {Number} index - The starting index in the sources array from which to remove observer links.
     * @this {Cell}
     */
    fluid.cell.removeParentObservers = function (cell, edge, index) {
        if (!edge.sources) {
            return;
        }
        for (let i = index; i < edge.sources.length; i++) {
            // Misleading former comment:  // We don't actually delete sources here because we're replacing the entire array soon
            const source = edge.sources[i];
            if (!source._observers) {
                continue;
            }
            const ourIndex = source._observers.findIndex(v => v === cell);
            if (ourIndex !== -1) {
                fluid.removeAtIndex(source._observers, ourIndex);
            }
        }
    };

    /**
     * Creates a disposable reactive effect cell based on the provided configuration.
     * The effect cell runs the `bind.fn` function reactively when any of the `bind.staticSources` change.
     * The effect can be disposed, which will run the `unbind.fn` cleanup (if provided), remove the computation,
     * and detach all parent observers.
     *
     * @param {Object} config - Configuration object for the effect.
     * @param {Object} config.bind - Binding configuration.
     * @param {Function} config.bind.fn - The function to execute reactively.
     * @param {Cell[]} config.bind.staticSources - The array of source cells to observe.
     * @param {Object} [config.unbind] - Unbinding configuration.
     * @param {Function} [config.unbind.fn] - Cleanup function to run on disposal.
     * @param {Boolean} [config.isFree] - If true, the effect will run even if some sources are unavailable.
     * @param {String} [config.name] - Optional name for the effect.
     * @return {Cell} The created disposable effect cell.
     */
    fluid.cell.disposableEffect = function (config) {
        const effect = fluid.cell();
        effect._isEffect = true;
        effect._isQueued = false;
        effect._isDisposed = false;
        effect.name = config?.name;

        const {fn, staticSources} = config.bind;

        effect.dispose = function () {
            if (config?.unbind?.fn) {
                // TODO: resolve any staticSources here for effects which require contextualised disposal
                config.unbind.fn();
            }
            effect.computed(null, staticSources, config);
            effect._isDisposed = true;
            if (effect._inEdges) {
                effect._inEdges.forEach(edge => fluid.cell.removeParentObservers(effect, edge, 0));
                effect._inEdges = null;
            }
        };

        // Wrap user's function to track execution and neutering on disposal
        const computeFn = function () {
            if (!effect._isDisposed && effect._prePendingState !== CacheCheck) {
                fn.apply(effect, arguments);
            }
            return true;
        };

        // Set up "computation" which will invoke us
        effect.computed(computeFn, staticSources, config);
        // In original effect cell constructor there was stabilizeFn?.(this);
        // compute constructor will enqueue self since there has been a change in _fn and _state

        // Run immediately
        fluid.cell.updateIfNecessary(effect);

        return effect;
    };

    /**
     * Creates a reactive effect cell that runs the provided function when its dependencies change.
     * The effect is managed as a disposable resource, allowing for cleanup via the `onDispose` property in `props`.
     *
     * @param {Function} fn - The function to execute reactively when any of the staticSources change.
     * @param {Cell[]} staticSources - The array of source cells whose values are dependencies for the effect.
     * @param {Object}   [props] - Optional properties to configure the effect.
     * @param {Function} [props.onDispose] - Optional cleanup function to run when the effect is disposed.
     * @param {Boolean}  [props.isFree] - If true, the effect will run even if some sources are unavailable.
     * @param {String}   [props.name] - Optional name for the effect
     * @param {String}   [props.excludeSource] - Optional source name (as supplied as last argument to cell.set) that will have its notification skipped
     * @return {Cell} The created effect cell.
     */
    fluid.cell.effect = function (fn, staticSources, props) {
        return fluid.cell.disposableEffect({
            bind: {fn, staticSources},
            unbind: {fn: props?.onDispose},
            isFree: props?.isFree,
            name: props?.name,
            excludeSource: props?.excludeSource
        });
    };

    fluid.cell.stabilizeDepth = 0;

    // Stabilize function to process effect queue
    fluid.cell.stabilize = function () {
        const touchedFits = [];
        fluid.cell.stabilizeDepth++;
        try {
            while (fluid.EffectQueue.length > 0) {
                const queue = fluid.EffectQueue.slice();
                fluid.EffectQueue.length = 0;
                queue.map(effect => {
                    const result = effect.get();
                    const activeFit = effect._fit;
                    if (activeFit) { // Might be no fit if effect did not activate because of no valid inEdge
                        if (!touchedFits.includes(activeFit)) {
                            touchedFits.push(activeFit);
                        }
                        const pendingEffects = activeFit.pendingEffects;
                        if (fluid.isPending(result)) {
                            if (!effect._isPending) {
                                effect._isPending = true;
                                pendingEffects.push(effect);
                            }
                        } else {
                            if (effect._isPending) {
                                effect._isPending = false;
                                const index = pendingEffects.indexOf(effect);
                                if (index !== -1) {
                                    pendingEffects.splice(index, 1);
                                }
                            }
                        }
                    }
                    effect._isQueued = false;
                });
            }
        } finally {
            fluid.cell.stabilizeDepth--;
        }

        if (fluid.cell.stabilizeDepth === 0) {
            for (let i = fluid.CurrentFits.length - 1; i >= 0; --i) {
                const oneFit = fluid.CurrentFits[i];
                if (oneFit.pendingEffects.length === 0) {
                    fluid.cell.endFit(oneFit);
                }
            }
        }
    };

    /**
     * Converts a signal into a Promise that resolves when the signal's value changes to an
     * available value.
     *
     * @param {Cell<any>} valSignal - The signal to monitor.
     * @return {Promise<any>} A Promise that resolves with the signal's first available value.
     */
    fluid.cell.signalToPromise = function (valSignal) {
        return new Promise( (resolve) => {
            fluid.cell.effect(function (value) {
                resolve(value);
                this.dispose();
            }, [valSignal], {name: "Resolution effect for cell " + valSignal.name + "/" + fluid.cell.fitId});
        });
    };
export default fluid;
//# sourceMappingURL=FluidCell.mjs.map
