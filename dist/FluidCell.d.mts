/**
 * A record explaining the cause that a value is unavailable.
 */
export type UnavailableCause = {
    /**
     * - A human-readable message describing the cause.
     */
    message: string;
    /**
     * - The variety assigned to the cause (e.g., "error", "config", "pending").
     */
    variety: string;
    /**
     * - An optional site associated with the cause of unavailability
     */
    site?: string;
};
/**
 * A marker representing an "Unavailable" state.
 */
export type Unavailable = UnavailableCause;
/**
 * A marker representing an unavailable state which has multiple causes.
 */
export type CausedUnavailable = Unavailable;
declare namespace fluid {
    let version: string;
    let Error: ErrorConstructor;
    let global: any;
    /**
     * Check whether the argument is a primitive type
     *
     * @param {any} value - The value to be tested
     * @return {Boolean} `true` if the supplied value is a JavaScript (ES5) primitive
     */
    function isPrimitive(value: any): boolean;
    /**
     * Converts the given argument into an array or shallow copies it.
     * - If the argument is `null` or `undefined`, returns an empty array.
     * - If the argument is a primitive value or not iterable, wraps it in a single-element array.
     * - If the argument is iterable, converts it into an array using the spread operator.
     * @param {any} arg - The value to be converted into an array.
     * @return {Array} An array representation of the input value.
     */
    function makeArray(arg: any): any[];
    /** Determines whether the supplied object can be treated as an array (primarily, by iterating over numeric keys bounded from 0 to length).
     * The strategy used is an optimised approach taken from an earlier version of jQuery - detecting whether the toString() version
     * of the object agrees with the textual form [object Array]
     *
     * @param {any} totest - The value to be tested
     * @return {Boolean} `true` if the supplied value is an array
     */
    function isArrayable(totest: any): boolean;
    /**
     * Compares two arrays for equality by checking if they have the same length
     * and if all elements at corresponding indices are strictly equal.
     *
     * @param {Array} array1 - The first array to compare.
     * @param {Array} array2 - The second array to compare.
     * @return {Boolean} `true` if the arrays are equal, `false` otherwise.
     */
    function arrayEqual(array1: any[], array2: any[]): boolean;
    /**
     * Pushes an element or elements onto an array, initialising the array as a member of a holding object if it is
     * not already allocated.
     * @param {Array|Object} holder - The holding object whose member is to receive the pushed element(s).
     * @param {String} member - The member of the <code>holder</code> onto which the element(s) are to be pushed
     * @param {Array|any} topush - If an array, these elements will be added to the end of the array using Array.push.apply.
     * If a non-array, it will be pushed to the end of the array using Array.push.
     */
    function pushArray(holder: any[] | any, member: string, topush: any[] | any): void;
    let NoValue: symbol;
    /**
     * Transforms the properties of an object or elements of an array by applying a provided function to each item.
     *
     * @param {Object} source - The object to transform. If `null` or `undefined`, the function returns the input as-is.
     * @param {Function} func - The transformation function to apply to each item. It is called with two arguments:
     *   - `value` (any): The value of the current property or element.
     *   - `key` (String): The key of the current property .
     * @return {Object} A new object or array with transformed values. If `source` is `null` or `undefined`, it is returned unchanged.
     */
    function transform(source: any, func: Function): any;
    function invokeLater(func: any): NodeJS.Timeout;
    namespace unavailablePriority {
        let pending: number;
        let config: number;
        let error: number;
    }
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
    /**
     * Upgrades a cause value into a standardized cause object.
     * @param {Object|String|Error} cause - The cause to upgrade. Can be a string, Error, or object.
     * @param {String} defaultVariety - The default variety to assign if not present.
     * @return {UnavailableCause} The upgraded cause object.
     */
    function upgradeCause(cause: any | string | Error, defaultVariety: string): UnavailableCause;
    /**
     * Formats an array of cause records into a human-readable string describing why a value is unavailable.
     * Each cause's message is included, separated by newlines.
     *
     * @param {UnavailableCause[]} causes - An array of cause records explaining the unavailability.
     * @return {string} A formatted string listing all cause messages.
     */
    function formatCauses(causes: UnavailableCause[]): string;
    /**
     * Applies a fresh set of causes and variety to an existing Unavailable instance. Single or multiple supplied
     * cause will be upgraded via fluid.upgradeCause.
     *
     * @param {Unavailable} instance - The object to annotate with unavailability information.
     * @param {Object|Array|String|Error} [cause={}] - The cause or array of causes for unavailability.
     *        Can be a string, Error, object, or array of these.
     * @param {String} [variety="error"] - The variety of unavailability (e.g., "error", "config", "pending").
     * @return {Unavailable} The annotated instance.
     */
    function applyUnavailable(instance: Unavailable, cause?: any | any[] | string | Error, variety?: string): Unavailable;
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
    function unavailable(cause?: any | Array<UnavailableCause>, variety?: string): Unavailable;
    /**
     * Creates an "Unavailable" marker representing a value that is pending due to I/O.
     * Sets the variety to "pending", provides a standard message, and records the site and stale value.
     *
     * @param {Any} staleValue - The most recently seen value before it became unavailable due to pending I/O.
     * @param {String} site - The site or resource (e.g. URL) responsible for the pending I/O.
     * @return {Unavailable} An object representing the unavailable state due to pending I/O.
     */
    function pending(staleValue: Any, site: string): Unavailable;
    function isPending(value: any): boolean;
    function isConfigUnavailable(value: any): boolean;
    /**
     * Check if an object is a marker of type "Unavailable"
     *
     * @param {Object} totest - The object to test.
     * @return {Boolean} `true` if the object is a marker of type "Unavailable", otherwise `false`.
     */
    function isUnavailable(totest: any): boolean;
    function isErrorUnavailable(totest: any): boolean;
    function deproxyUnavailable(target: any): any;
    /**
     * Extracts the array of causes from an "Unavailable" marker.
     * If the marker has a `causes` property, returns it; otherwise, returns an array containing the unwrapped marker itself.
     *
     * @param {Unavailable} unavailable - The "Unavailable" marker to extract causes from.
     * @return {UnavailableCause[]} An array of cause records explaining the unavailability.
     */
    function unavailableToCauses(unavailable: Unavailable): UnavailableCause[];
    /**
     * Merge two "unavailable" markers into a single marker, combining their causes.
     * If the existing marker is `null` or `undefined`, the fresh marker is returned as-is.
     *
     * @param {Unavailable|null|undefined} existing - The existing "unavailable" marker, or `null`/`undefined` if none exists.
     * @param {Unavailable} fresh - The new "unavailable" marker to merge with the existing one.
     * @return {Unavailable} A combined "unavailable" marker with merged causes, or the fresh marker if no existing marker is provided.
     */
    function mergeUnavailable(existing: Unavailable | null | undefined, fresh: Unavailable): Unavailable;
    namespace missingPolicies {
        export function unavailable(root: any, path: any): UnavailableCause;
        export function error_1(root: any, path: any): any;
        export { error_1 as error };
    }
    /** Support for traversing substrate via string paths **/
    function getPathSegmentImpl(accept: any, path: any, i: any): any;
    /** Parse an IL path separated by periods (.) into its component segments.
     * @param {String} path - The path expression to be split
     * @return {String[]} Path parsed into segments.
     */
    function parsePath(path: string): string[];
    /**
     * Optionally parse a path expression into its component segments.
     * If the input is a primitive value (e.g., a string), it is parsed into segments using `fluid.parsePath`.
     * If the input is already an array of segments, it is returned unchanged.
     *
     * @param {String|String[]} path - The path expression to be split into segments,
     *     or an array of path segments.
     * @return {String[]} The path represented as an array of segments.
     */
    function pathToSegs(path: string | string[]): string[];
    /**
     * Retrieve the value at a specified path within a nested object structure.
     * Traverses the object hierarchy based on the path segments.
     *
     * @param {Object} root - The root object to begin traversal from.
     * @param {String|String[]} path - The path to the desired value, specified as a string or an array of path segments.
     * @param {"unavailable"|"error"} [missingPolicy] - An optional policy from `fluid.missingPolicies` to be followed if a value is not found
     * @return {any} The value at the specified path, or `undefined` if the path traverses beyond defined objects.
     */
    function get(root: any, path: string | string[], missingPolicy?: "unavailable" | "error"): any;
    /**
     * Set a value at a specified path within a nested object structure.
     * Creates intermediate objects as needed to ensure the path exists.
     *
     * @param {Object} root - The root object to begin traversal from.
     * @param {String|String[]} path - The path to the location where the value should be set, specified as a string or an array of path segments.
     * @param {any} newValue - The value to set at the specified path.
     */
    function set(root: any, path: string | string[], newValue: any): void;
    /** Managing the global namespace **/
    /** Returns any value held at a particular global path. This may be an object or a function, depending on what has been stored there.
     * @param {String|String[]} path - The global path from which the value is to be fetched
     * @return {any} The value that was stored at the path, or a fluid.unavailable value if there is none.
     */
    function getGlobalValue(path: string | string[]): any;
    /**
     * Set a value in the global namespace at a specified path.
     * This uses `fluid.set` to traverse and create the necessary structure within `fluid.global`.
     * @param {String|String[]} path - The path in the global namespace where the value should be set, specified as a string or an array of path segments.
     * @param {any} value - The value to set at the specified global path.
     */
    function setGlobalValue(path: string | string[], value: any): void;
    /** Ensures that the supplied path has an object allocated in the global Infusion namespace, and retrieves the current value.
     * If no value is stored, a fresh {} will be assigned at the path, and to all currently empty paths leading to the global namespace root.
     * In a browser environment, the global Infusion namespace is rooted in the global `window`.
     * @param {String|String[]} path - The global path at which the namespace is to be allocated.
     * @return {any} Any current value held at the supplied path - or a freshly allocated {} to be held at that path if it was previously empty
     */
    function registerNamespace(path: string | string[]): any;
}
export type CacheState = number;
/**
 * A "fit" or connected region of updating graph
 */
export type Fit = {
    /**
     * - An array of cells for which the _consumedSources member has been set during this fit.
     */
    targetsConsumed: Cell[];
    /**
     * - An array of source names, supplied to fluid.set, with which this fit has been marked
     */
    sources: string[];
    /**
     * - Indicates if this fit is currently active.
     */
    isActive: boolean;
};
/**
 * A reactive cell
 */
export type Cell = {
    /**
     * - Retrieves the current value of the cell.
     */
    get: () => any;
    /**
     * - Sets a new value for the cell.
     */
    set: (arg0: any) => void;
    /**
     * - Sets up or tears down a reactive computation for the cell.
     */
    computed: (arg0: Function, arg1: Array<Cell>, arg2: ComputedProps | undefined) => Cell;
    /**
     * - Sets up or tears down an asynchyronous reactive computation for the cell.
     */
    asyncComputed: (arg0: Function, arg1: Array<Cell>, arg2: ComputedProps | undefined) => Cell;
    /**
     * - The current value stored in the cell.
     */
    _value: any;
    /**
     * - A name or address for the cell.
     */
    name?: string | undefined;
    /**
     * - The cache state of the cell (clean, check, or dirty).
     */
    _state: CacheState;
    /**
     * - A "high watermark" of our _state at the point we went into a pending state
     */
    _prePendingState: CacheState;
    /**
     * - Cell from along which we were dirtied
     */
    _dirtyFrom: Cell | null;
    /**
     * - Cells that have us as sources (out links)
     */
    _observers: Cell[] | null;
    /**
     * - Array of incoming edges which could update this node
     */
    _inEdges: Edge[] | null;
    /**
     * - Sources from which arcs have been traversed during this fit
     */
    _consumedSources: Cell[] | null;
    /**
     * - Captures dynamic dependency tracking information for an update which is in progress
     */
    _trackingRecord: CellTrackingRecord | null;
    /**
     * - Is this an effect node
     */
    _isEffect: boolean;
    /**
     * - If an effect, are we queued?
     */
    _isQueued: boolean;
    /**
     * - The current update fit that the cell is enlisted in
     */
    _fit: Fit | null;
};
export type ComputedProps = {
    /**
     * - Indicates if the computation is asynchronous.
     */
    isAsync: boolean;
    /**
     * - Indicates if this is a "free" computation that will deliver unavailable values
     */
    isFree: boolean;
    /**
     * - Optional function to map arguments supplied to computation
     */
    mapArg?: Function;
};
/**
 * An edge between two reactive cells
 */
export type Edge = {
    /**
     * - The cell that we are the edge to (a computer for)
     */
    target: Cell;
    /**
     * - The key for the edge, either the first staticSource or null if there are not any
     */
    key: Cell | null;
    /**
     * - Sources in reference order, not deduplicated (in links)
     */
    sources: Cell[] | null;
    /**
     * - Static sources supplied
     */
    staticSources: Cell[] | null;
    /**
     * - The function to be called to compute the value
     */
    fn: Function;
    /**
     * - Indicates if the edge's computation is asynchronous.
     */
    isAsync: boolean;
    /**
     * - Indicates if the edge's computation should be invoked on unavailable values
     */
    isFree: boolean;
    /**
     * - If an update with a particular source should not propagate across this edge
     */
    excludeSource: string;
    /**
     * - Optional function to be applied to map any arguments supplied to `fn`
     */
    mapArg: Function | null;
    /**
     * - Optional function to take charge of dispatch to `fn`
     */
    dispatcher: Function | null;
};
export type CellTrackingRecord = {
    /**
     * - The previous global reaction context.
     */
    prevReaction: Edge | null;
    /**
     * - The previous list of demanded source cells.
     */
    prevGets: Cell[] | null;
    /**
     * - The previous index in the sources array.
     */
    prevIndex: number;
};
declare namespace fluid {
    /**
     * *
     */
    type CacheClean = number;
}
export default fluid;
//# sourceMappingURL=FluidCell.d.mts.map
