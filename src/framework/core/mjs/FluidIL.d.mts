export default fluid;
/**
 * A record mapping string keys to scope entries, each holding a Shadow value and its associated priority.
 */
export type ScopeRecord = {
    /**
     * - The component shadow associated with this key.
     */
    value: Shadow;
    /**
     * - The priority bitmask indicating how the key was applied (e.g., contextName, memberName, variableName).
     */
    priority: Integer;
};
export type Shadow = {
    /**
     * - The component for which this shadow is held
     */
    that: any;
    /**
     * - The principal allocated path (point of construction) of the component in the component tree.
     */
    path: string;
    /**
     * - The name of the component within its parent.
     */
    memberName: string;
    /**
     * - The shadow record associated with the parent component.
     */
    parentShadow: Shadow | null;
    /**
     * - A record of child components keyed by their member names.
     */
    childComponents: any;
    /**
     * - Cached layer scopes for the component.
     */
    ownScope: any;
    /**
     * - Cached layer scopes for the component.
     */
    childrenScope: any;
    /**
     * - A record of paths where this component has been injected, keyed by path.
     */
    injectedPaths?: any;
    /**
     * - The instantiator which allocated this component/shadow
     */
    instantiator: () => any;
    /**
     * - A possibly deep structure of effects allocated by the framework which
     * which need to be disposed when the component is destroyed. Any user effects are disposed as layers come and go.
     */
    frameworkEffects: any;
    /**
     * - Dynamic layer names supplied as direct arguments to the component
     */
    dynamicLayerNames: Signal<string[]>;
    /**
     * - Map of layers which are currently unavailable
     */
    unavailableLayers: Signal<any>;
    /**
     * - Whether this shadow's scope names will resolve globally
     */
    resolveRoot?: boolean;
};
export type DestroyRec = {
    /**
     * - The shadow record associated with the component being cleared
     */
    childShadow: Shadow;
    /**
     * - The name of the child component within its parent.
     */
    name: string;
    /**
     * - The shadow record associated with the parent component.
     */
    shadow: Shadow;
    /**
     * - The fully qualified path to the child component in the component tree.
     */
    childPath: string;
};
/**
 * Record encoding a function invocation - may encode materials for a $method, $compute or $effect record
 */
export type FuncRec = {
    /**
     * - The function name or reference.
     */
    func: string | Function;
    /**
     * - The arguments to the function, if any.
     */
    args?: Array<string>;
};
export type ShadowCursor = {
    /**
     * - The shadow record associated with the resolved site
     */
    shadow?: Shadow;
    /**
     * - The segments (path) within the shadow
     */
    segs?: string[];
    /**
     * - The shadow map record at the resolved location
     */
    shadowRec?: any;
    /**
     * - The final resolved value
     */
    value?: any;
};
export type FuncRecord = {
    /**
     * - A reference to a function, as an Infusion context reference string a global
     * function name to be resolved via `fluid.getGlobalValue` or as a direct function value.
     */
    func?: string | any;
    /**
     * - Optional arguments to be passed to the function. These may include context references or values.
     */
    args?: Array<any>;
};
export type ResolvedFuncRecord = {
    /**
     * - The resolved function signal.
     */
    func: Signal<Function>;
    /**
     * - The resolved arguments array.
     */
    resolvedArgs: any[];
};
export type HandlerRecord = {
    /**
     * - The type of element being processed, such as "$method", "$compute", "$effect", "$component", etc.
     */
    key: string;
    /**
     * - A function responsible for handling the record expansion, such as `fluid.expandMethodRecord`, `fluid.expandComputeRecord`, etc.
     */
    handler: Function;
    /**
     * - A flag indicating whether the handler is related to an effect, typically used for $effect records.
     */
    isEffect?: boolean;
};
export type Site = {
    /**
     * - The shadow record associated with the site.
     */
    shadow: Shadow;
    /**
     * - The path segments within the shadow's layer map.
     */
    segs?: string[];
};
export type ComponentComputer = any;
/**
 * Represents the potential state of a component, defining its layer-based configuration and merge records.
 */
export type Potentia = {
    /**
     * - An array of direct layer names applied to the component
     */
    layerNames: string[];
    /**
     * - An array of merge records representing the component's configuration.
     */
    mergeRecords: MergeRecord[];
    /**
     * - Optional component properties, typically including an `$id` field.
     */
    props?: any;
};
declare namespace fluid {
    function componentConstructor(): void;
    namespace componentConstructor {
        let name: string;
    }
    function shadow(): void;
    function isComponent(obj: any): boolean;
    function isShadow(obj: any): boolean;
    function freshComponent(props: any, shadow: any): any;
    function dumpLayerNames(that: any): string;
    function dumpThat(that: any): string;
    function dumpThatStack(thatStack: any): any;
    function dumpComponentPath(that: any): any;
    function dumpComponentAndPath(that: any): string;
    function visitComponentsForMatching(shadow: any, options: any, visitor: any): void;
    /**
     * Visit the child components of a given component, applying a visitor function to each.
     *
     * @param {Shadow} shadow - The parent component whose children are to be visited.
     * @param {Function} visitor - A function to be called for each child component.
     *     The function is invoked with the following arguments:
     *     - `component` (Object): The current child component being visited.
     *     - `name` (String): The name of the current child component.
     *     - `segs` (String[]): The array of segment names leading to the current child.
     *     - `depth` (Number): The depth of the current child in the traversal.
     * @param {Object} options - Options to control the traversal:
     *     - `visited` (Object): A map of already visited component IDs to avoid cycles.
     *     - `flat` (Boolean): If `true`, prevents recursive traversal into child components.
     * @param {String[]} [segs=[]] - The path segments leading to the current component, used internally for recursion.
     * @return {Boolean|undefined} Returns `true` if the traversal was terminated early by the visitor function, otherwise `undefined`.
     */
    function visitComponentChildren(shadow: Shadow, visitor: Function, options: any, segs?: string[]): boolean | undefined;
    /** Query for all components matching a selector in a particular tree
     * @param {Component} root - The root component at which to start the search
     * @param {String} selector - An IoCSS selector, in form of a string. Note that since selectors supplied to this function implicitly
     * match downwards, they do not contain the "head context" followed by whitespace required in the distributeOptions form. E.g.
     * simply <code>"fluid.viewComponent"</code> will match all viewComponents below the root.
     * @param {Boolean} [flat] - <code>true</code> if the search should just be performed at top level of the component tree
     * Note that with <code>flat=false</code> this search will scan every component below the root and may well be very slow.
     * @return {Unavailable|Component[]} An array holding all components matching the selector, or an unavailable value if any
     * unavailable components were traversed
     */
    function queryILSelector(root: Component, selector: string, flat?: boolean): Unavailable | Component[];
    /** Query for all components matching a selector in a particular tree, returning a live computed collection
     * @param {Component} root - The root component at which to start the search
     * @param {String} selector - An IoCSS selector, in form of a string. Note that since selectors supplied to this function implicitly
     * match downwards, they do not contain the "head context" followed by whitespace required in the distributeOptions form. E.g.
     * simply <code>"fluid.viewComponent"</code> will match all viewComponents below the root.
     * @param {Boolean} [flat] - <code>true</code> if the search should just be performed at top level of the component tree
     * Note that with <code>flat=false</code> this search will scan every component below the root and may well be very slow.
     * @return {Unavailable|Component[]} An array holding all components matching the selector, or an unavailable value if any
     * unavailable components were traversed
     */
    function liveQueryILSelector(root: Component, selector: string, flat?: boolean): Unavailable | Component[];
    /** Match a parsed IL selector against a selection of data structures representing a component's tree context.
     * @param {ParsedSelector} selector - A parsed selector structure as returned from `fluid.parseSelector`.
     * @param {Shadow[]} shadowStack - An array of components ascending up the tree from the component being matched,
     * which will be held in the last position.
     * @param {Object[]} scopes - An array of own scope records as cached in the component's shadows
     * @param {Number} i - One plus the index of the IoCSS head component within `thatStack` - all components before this
     * index will be ignored for matching. Will have value `1` in the queryIoCSelector route.
     * @return {Boolean} `true` if the selector matches the leaf component at the end of `thatStack`
     */
    function matchILSelector(selector: ParsedSelector, shadowStack: Shadow[], scopes: any[], i: number): boolean;
    let contextName: number;
    let memberName: number;
    /**
     * @typedef {Object} ScopeRecord
     * A record mapping string keys to scope entries, each holding a Shadow value and its associated priority.
     * @property {Shadow} value - The component shadow associated with this key.
     * @property {Integer} priority - The priority bitmask indicating how the key was applied (e.g., contextName, memberName, variableName).
     */
    /**
     * Converts an array of layer names into a hash object where each name and its nickname are mapped to a context type.
     * @param {Object<String, ScopeRecord>} targetScope - The scope to be destructively updated from the supplied layer names and shadow
     * @param {String[]} layerNames - An array of layer names to be processed.
     * @param {Shadow} shadow - The shadow to be placed into scope
     * @return {Object<String, ScopeRecord>} The updated scope object where:
     *   - Each full layer name is a key, mapped to the number `fluid.contextName`.
     *   - Each nickname of a valid layer name (computed using `fluid.computeNickName`) is also a key, mapped to the number `fluid.contextName`.
     *   - Names that are references or expanders are ignored.
     */
    function layerNamesToScope(targetScope: any, layerNames: string[], shadow: Shadow): any;
    /**
     * Applies a shadow record to a scope under a given key, respecting the precedence of disposition flags.
     * The scope stores a record for each key with the shape `{value, priority}`.
     * A new value is assigned only if any existing priority is lower than the supplied one
     *
     * @param {Object<String, ScopeRecord>} scope - The scope to update.
     * @param {String} key - The name under which the shadow will be stored.
     * @param {Shadow} shadow - The shadow record to assign.
     * @param {Integer} priority - A bitmask indicating the strength of the claim (i.e. member > context).
     */
    function applyToScope(scope: any, key: string, shadow: Shadow, priority: Integer): void;
    function cacheLayerScopes(parentShadow: any, shadow: any): any;
    function clearScope(parentShadow: any, childShadow: any): void;
    /**
     * @typedef {Object} Shadow
     * @property {Object} that - The component for which this shadow is held
     * @property {String} path - The principal allocated path (point of construction) of the component in the component tree.
     * @property {String} memberName - The name of the component within its parent.
     * @property {Shadow|null} parentShadow - The shadow record associated with the parent component.
     * @property {Object<String, Shadow>} childComponents - A record of child components keyed by their member names.
     * @property {Object<String, ScopeRecord>} ownScope - Cached layer scopes for the component.
     * @property {Object<String, ScopeRecord>} childrenScope - Cached layer scopes for the component.
     * @property {Object} [injectedPaths] - A record of paths where this component has been injected, keyed by path.
     * @property {fluid.instantiator} instantiator - The instantiator which allocated this component/shadow
     * @property {Object} frameworkEffects - A possibly deep structure of effects allocated by the framework which
     * which need to be disposed when the component is destroyed. Any user effects are disposed as layers come and go.
     * @property {Signal<String[]>} dynamicLayerNames - Dynamic layer names supplied as direct arguments to the component
     * @property {Signal<Object<String, Unavailable>>} unavailableLayers - Map of layers which are currently unavailable
     * @property {Boolean} [resolveRoot] - Whether this shadow's scope names will resolve globally
     */
    /**
     * @typedef {Object} DestroyRec
     * @property {Shadow} childShadow - The shadow record associated with the component being cleared
     * @property {String} name - The name of the child component within its parent.
     * @property {Shadow} shadow - The shadow record associated with the parent component.
     * @property {String} childPath - The fully qualified path to the child component in the component tree.
     */
    /** Clear indexes held of the location of an injected or concrete component.
     * @param {fluid.instantiator} instantiator - The instantiator holding records to be cleared
     * @param {DestroyRec} destroyRec - A "destroy record" as allocated within instantiator.clearComponent
     */
    function clearComponentIndexes(instantiator: () => any, destroyRec: DestroyRec): void;
    /** Operate the process of destroying a concrete component, as encoded in a `DestroyRec` structure. This takes the
     * following sequence:
     *  - Other injected sites of this component are cleared
     *  - The path and scope records of the component are cleared
     *  - Listeners registered by this component's construction are removed
     *  - Events and appliers are destroyed
     *  - The `afterDestroy` event is fired on the component
     *  - We remove the lookup of this component's id in instantiator.idToShadow
     * @param {fluid.instantiator} instantiator - The instantiator holding records to be cleared
     * @param {DestroyRec} destroyRec - A "destroy record" as allocated within instantiator.clearComponent
     */
    function doDestroy(instantiator: () => any, destroyRec: DestroyRec): void;
    function rapidDispose(shadow: any): void;
    function instantiator(): any;
    let globalInstantiator: any;
    function constructRootComponents(instantiator: any): void;
    function computeNickName(layerName: any): any;
    function isDestroyedShadow(shadow: any, strict: any): boolean;
    /** Returns <code>true</code> if the supplied reference holds a component which has been destroyed or for which destruction has started
     * @param {fluid.component|Shadow} that - A reference to a component or a proxy to one, or its shadow record
     * @param {Boolean} [strict] - If `true`, the test will only check whether the component has been fully destroyed
     * @return {Boolean} `true` if the reference is to a component which has been destroyed
     **/
    function isDestroyed(that: fluid.component | Shadow, strict?: boolean): boolean;
    function computeGlobalMemberName(layerName: any, id: any): string;
    /**
     * Upgrades an element of an IL record which designates a function to prepare for a {func, args} representation.
     *
     * @param {any} rec - The record to be upgraded. If an object will be returned unchanged. Otherwise it may be a function
     * object or an IL reference to one.
     * @param {String} key - The key in the returned record to hold the function, this will default to `funcName` if `rec` is a `string` *not*
     * holding an IL reference, or `func` otherwise
     * @return {Object} The original `rec` if it was not of primitive type, else a record holding { key : rec } if it was of primitive type.
     */
    function upgradePrimitiveFunc(rec: any, key: string): any;
    /**
     * Record encoding a function invocation - may encode materials for a $method, $compute or $effect record
     * @typedef {Object} FuncRec
     * @property {String|Function} func - The function name or reference.
     * @property {Array<String>} [args] - The arguments to the function, if any.
     */
    /**
     * Converts a compact string representation of a function or method call into a structured record object.
     *
     * This function parses strings of the form "funcName(arg1, arg2, ...)" into an object with a `func` property
     * and an `args` array. If the string does not contain parentheses and the type is "$method" or "$compute",
     * it returns an object with a `func` property set to the string. Otherwise, it throws an error for malformed input.
     *
     * @param {String} string - The compact string to parse, e.g., "myFunc(1, "a", true)".
     * @param {String} type - The type of record being parsed, such as "$method" or "$compute".
     * @return {FuncRec} The parsed record object, typically with `func` and `args` properties.
     * @throws Will throw an error if the string is not well-formed or if the type is unrecognized.
     */
    function compactStringToRec(string: string, type: string): FuncRec;
    function fetchContextReferenceSoft(context: any, segs: any, shadow: any): any;
    /**
     * Resolves a given context string to its corresponding component or scope within the component tree.
     *
     * @param {String} context - The context name to resolve. Special values:
     *   - `"self"` resolves to the current component
     *   - `"/"` resolves to the root component.
     *   - Other values resolve to named scopes in the target component's scope chain.
     * @param {Shadow} shadow - The component site from which resolution starts.
     * @param {Function} [resolver] - A function dynamically resolving a context name to a local context
     * @return {signal<Component|any>} Signal for the resolved component or scope. Returns:
     *   - The target component if `context` is `"self"`.
     *   - The root component if `context` is `"/"`.
     *   - The component or scope corresponding to `context` in the target component's scope chain, if found.
     *   - An unavailable value if the context cannot be resolved.
     */
    function resolveContext(context: string, shadow: Shadow, resolver?: Function): any;
    /**
     * Retrieves a signal for a value at a path within a component.
     *
     * @param {Shadow} shadow - The shadow record of the component.
     * @param {String|String[]} path - The path to resolve within the component's shadow.
     * @return {Signal<any>} A signal representing the value at the specified path.
     */
    function getForComponent(shadow: Shadow, path: string | string[]): Signal<any>;
    function pathToLive(shadow: any, path: any): any;
    /**
     * Set a value for a component at a specified path, via immutable application if the path is nested below a reactive root.
     * @param {Object} component - The component holding the path to be modified
     * @param {String|Array<String>} path - The path at which to set the value, as a string or array of segments.
     * @param {any} value - The value to set at the specified path.
     * @return {signal<Object>} Signal for the value at the updated path, which will now have been raised into the live layer
     */
    function setForComponent(component: any, path: string | Array<string>, value: any): any;
    /**
     * Creates a writable live signal for a given reference within a component.
     * The signal dynamically tracks the value located at the specified path and allows updates to it.
     *
     * @param {String} ref - A context reference string
     * @return {Signal<any>} A writable, disposable signal representing the resolved value.
     */
    function fetchWriteableLiveSignal(ref: string): Signal<any>;
    /**
     * Resolves a context reference into a signal that dynamically tracks the value located at a path within another component or context.
     *
     * @param {String|Object} ref - A context reference string or parsed reference object. If a String, it will be parsed via `fluid.parseContextReference`.
     * @param {Shadow} shadow - The shadow context of the component from which the reference is being resolved.
     * @param {String[]} [segs] - Array of path segments where this reference appears in component configuration
     * @param {Function} [resolver] - An optional custom resolver function used for resolving context names.
     * @return {Signal<any>} A signal representing the resolved reference value. It includes metadata: the parsed reference, the resolving site, and a `$variety` tag.
     */
    function fetchContextReference(ref: string | any, shadow: Shadow, segs?: string[], resolver?: Function): Signal<any>;
    /**
     * Renders a parsed string template against the local component tree by replacing tokens with their corresponding values.
     * Tokens that are primitives remain unchanged, while signal tokens are resolved and then the resulting token
     * string concatenated.
     *
     * @param {Array<string|ParsedContext>} tokens - An array of tokens, where each token is either a string
     *        or an object with a `key` property indicating a path in the source.
     * @param {Shadow} shadow - The shadow record of the component where the reference is held
     * @return {String|Signal<string>} A computed signal representing the resolved string.
     */
    function renderComputedStringTemplate(tokens: Array<string | ParsedContext>, shadow: Shadow): string | Signal<string>;
    /**
     * @typedef {Object} ShadowCursor
     * @property {Shadow} [shadow] - The shadow record associated with the resolved site
     * @property {String[]} [segs] - The segments (path) within the shadow
     * @property {Object} [shadowRec] - The shadow map record at the resolved location
     * @property {any} [value] - The final resolved value
     */
    /**
     * Traverse into signalised material to resolve a "sited value" - as well as any finally resolved concrete value,
     * also return metadata around it in the form of a ShadowCursor that references the shadowMap at the target site
     * and the shadow which holds it.
     *
     * @param {any} ref - The value to resolve. May be a `Signal` or a plain value.
     * @param {ShadowCursor} shadowCursor - Cursor into the shadow where original reference was found
     * @return {ShadowCursor} Including the resolved value if `ref` is a `Signal`, or the original value if it is not.
     */
    function deSignalToSite(ref: any, shadowCursor: ShadowCursor): ShadowCursor;
    /**
     * Traverses a structured `shadowMap` along the provided path segments to detect if any point is marked as a reactive root.
     * At each segment, it checks if the special property `reactiveRoot` is present in the corresponding `$m` record.
     * If a `reactiveRoot` is found at any level, returns array of path segments to that point, else null.
     *
     * @param {Object} shadowMap - A structured map representing a component's shadow hierarchy.
     * @param {String[]} segs - An array of path segments to traverse within the `shadowMap`.
     * @return {String[]|null} Path to any reactive root found
     */
    function findReactiveRoot(shadowMap: any, segs: string[]): string[] | null;
    /**
     * Recursively transfer a shadow map structure based on a corresponding layer map.
     * @param {Object} shadowMap - The shadow map to be populated.
     * @param {Object} layerMap - The layer map providing the structure and reactive root indicators.
     */
    function transferShadowMap(shadowMap: any, layerMap: any): void;
    /**
     * Recursively traverse a data structure, resolving any `Signal` values to their underlying values.
     * @param {any|Signal<any>} root - The root data structure to process.
     * @param {String} strategy - Strategy to be used
     * @param {Object} [shadowRecIn] - Section of a shadow map we are traversing - when we run off the end of this, we must stop flattening.
     * This argument arises through recursive calls if we flatten structured arguments
     * @return {any} The processed data structure with all `Signal` values resolved and flattened into primitive values where applicable.
     */
    function flattenSignals(root: any | Signal<any>, strategy: string, shadowRecIn?: any): any;
    /**
     * Resolve material intended for compute and method arguments - this only expands {} references, possibly into
     * a local context
     * @param {any} material - The material to be expanded
     * @param {Shadow} shadow - Component from whose point of view the material is to be expanded
     * @param {String[]} segs - Path segments within shadow where material was found
     * @param {Function} [resolver] - A function dynamically resolving a context name to a local context
     * @return {any} The expanded material, with signals in place of any references discovered
     */
    function resolveArgMaterial(material: any, shadow: Shadow, segs: string[], resolver?: Function): any;
    function makeArgResolver(): {
        backing: any[];
        resolve: (context: any) => any;
    };
    /**
     * Expands a method record and returns a function that can be called with arguments. The function dispatches the invocation
     * of the resolved method (either directly or with computed arguments).
     *
     * If the method record contains arguments (`args`), it first resolves them and then returns a function that applies the
     * resolved arguments to the resolved function. If no arguments are provided, a direct method dispatch is returned.
     *
     * @param {FuncRecord} record - The method record to expand. It contains a `func` (the function to call) and optional `args`
     * that define the arguments to be resolved for the method.
     * @param {Shadow} shadow - The shadow context in which the method is being expanded, providing access to the component and its state.
     * @param {String[]} segs - The path where this method record appears in its component
     * @return {Function} A function that can be invoked with arguments, dispatching the resolved method with the provided arguments.
     */
    function expandMethodRecord(record: FuncRecord, shadow: Shadow, segs: string[]): Function;
    /**
     * @typedef {Object} FuncRecord
     * @property {String|any} [func] - A reference to a function, as an Infusion context reference string a global
     * function name to be resolved via `fluid.getGlobalValue` or as a direct function value.
     * @property {Array<any>} [args] - Optional arguments to be passed to the function. These may include context references or values.
     */
    /**
     * Resolves a function reference from a `FuncRecord`, which may refer to a global function name, a context reference, or a direct function.
     *
     * @param {FuncRecord} rec - A function record containing one of `funcName` or `func` to resolve.
     * @param {Shadow} shadow - The shadow context used for resolving context references.
     * @param {String[]} segs - The path where this reference appears in component configuration
     * @return {Signal<Function>} Signal for the resolved function.
     */
    function resolveFuncReference(rec: FuncRecord, shadow: Shadow, segs: string[]): Signal<Function>;
    /**
     * @typedef {Object} ResolvedFuncRecord
     * @property {Signal<Function>} func - The resolved function signal.
     * @property {any[]} resolvedArgs - The resolved arguments array.
     */
    /**
     * Resolves a function reference and its arguments from a function record.
     *
     * This function takes a function record, resolves the function reference using `fluid.resolveFuncReference`,
     * converts the `args` property to an array, and resolves each argument using `fluid.resolveArgMaterial`.
     *
     * @param {FuncRecord} rec - The function record containing a function reference and optional arguments.
     * @param {Shadow} shadow - The shadow context used for resolving context references.
     * @param {String[]} segs - The path where this reference appears in component configuration.
     * @return {ResolvedFuncRecord} An object containing the resolved function signal and the resolved arguments array.
     */
    function resolveFuncRecord(rec: FuncRecord, shadow: Shadow, segs: string[]): ResolvedFuncRecord;
    /**
     * Expands a compute-style function record into a computed signal.
     * The function and its arguments are resolved from the record, and a signal is returned that tracks their computed value.
     *
     * @param {FuncRecord} record - The record describing the compute-style function. Must include either `func` or `funcName`, and optionally `args`.
     * @param {Shadow} shadow - The current component's shadow record used for resolving context references within the arguments.
     * @param {String[]} segs - The path where this record appears in its component
     * @return {Signal<any>} A computed signal representing the result of invoking the resolved function with the resolved arguments.
     *     Includes a `$variety` property set to `"$compute"`.
     */
    function expandComputeRecord(record: FuncRecord, shadow: Shadow, segs: string[]): Signal<any>;
    function expandCompactSubelement(subel: any): any;
    /**
     * Expands a bindable function record, with properties bind and optionally unbind, into a value that will be eagerly
     * computed as soon as the arguments to bind become available. If an unbind record is supplied, it will be invoked
     * with the computed value either if any argument becomes unavailable or when this entire record is disposed.
     *
     * @param {FuncRecord} record - The record describing the bindable function. Must include either `func` or `funcName`, and optionally `args`.
     * @param {Shadow} shadow - The current component's shadow record used for resolving context references within the arguments.
     * @param {String[]} segs - The path where this record appears in its component
     * @return {Signal<any>} A computed signal representing the result of invoking the resolved function with the resolved arguments.
     *     Includes a `$variety` property set to `"$bindable"`.
     */
    function expandBindableRecord(record: FuncRecord, shadow: Shadow, segs: string[]): Signal<any>;
    /**
     * Expands an effect-style function record into a reactive effect.
     * The function and its arguments are resolved from the record, and an effect is created that runs in response to changes.
     *
     * @param {FuncRecord} record - The record describing the effect-style function. Must include either `func` or `funcName`, and optionally `args`.
     * @param {Shadow} shadow - The current component's shadow record used for resolving context references within the arguments.
     * @param {String[]} segs - The path where this effect record appears in its component
     * @return {Function} A disposer function for the created effect. The function object includes a `$variety` property set to `"$effect"`.
     */
    function expandEffectRecord(record: FuncRecord, shadow: Shadow, segs: string[]): Function;
    /**
     * Expands an effect-style function record into a reactive effect.
     * The function and its arguments are resolved from the record, and an effect is created that runs in response to changes.
     *
     * @param {LayerLinkageRecord} record - A linkage record holding one or more entries including inputLayers/outputLayers
     * @param {Shadow} shadow - The current component's shadow record used for resolving context references within the arguments.
     * @param {String[]} segs - The path where this effect record appears in its component
     * @return {Function} A disposer function for the created effect. The function object includes a `$variety` property set to `"$effect"`.
     */
    function expandLinkageRecord(record: LayerLinkageRecord, shadow: Shadow, segs: string[]): Function;
    /**
     * Expands a reactive record into a part of the component tree marked as reactive data.
     * If `record` is a String, it is interpreted as a context reference.
     *
     * @param {any|String} record - The data to be made reactive, or a context reference String.
     * @param {Shadow} shadow - The component's shadow record
     * @param {String[]} segs - The path where this record appears in its component
     * @return {Signal<any>} A computed signal representing the reactive data for the specified record.
     */
    function expandReactiveRecord(record: any | string, shadow: Shadow, segs: string[]): Signal<any>;
    /**
     * Pushes the potentia (potential definition) for a subcomponent into the system by constructing
     * a `subcomponent` layer record and invoking `fluid.pushPotentia`. This supports instantiating
     * nested subcomponents from within a parent component's definition.
     *
     * @param {Shadow} shadow - The shadow record representing the parent component into which the subcomponent is being added.
     * @param {String} memberName - The member name of the subcomponent within the parent component.
     * @param {Object} expanded - The expanded component definition for the subcomponent, expected to contain a `$layers` field.
     * @param {ScopeRecord|null} [scope] - The scope record tracking references and their resolution priorities during expansion.
     * @param {String} [source] - The layer name in which this subcomponent definition appeared
     * @return {ComponentComputer} The result of invoking `fluid.pushPotentia`, representing the effect or pending instantiation of the subcomponent.
     */
    function pushSubcomponentPotentia(shadow: Shadow, memberName: string, expanded: any, scope?: ScopeRecord | null, source?: string): ComponentComputer;
    /**
     * Expands a subcomponent-style function record into a component instantiation.
     * Produces a `subcomponent`-type layer record and pushes it into the component tree at the given `key` under the `shadow`.
     *
     * @param {FuncRecord} record - The component-style function record to be expanded. Expected to contain `func`, `funcName`, and/or `args`, along with `$layers`.
     * @param {Shadow} shadow - The parent component's shadow record under which the subcomponent will be allocated.
     * @param {String[]} segs - The path in the parent shadow holding this record
     * @param {String} key - The member name at which the subcomponent will be instantiated.
     * @return {ComponentComputer} A reactive signal representing the component instance.
     */
    function expandComponentRecord(record: FuncRecord, shadow: Shadow, segs: string[], key: string): ComponentComputer;
    /**
     * @typedef {Object} HandlerRecord
     * @property {String} key - The type of element being processed, such as "$method", "$compute", "$effect", "$component", etc.
     * @property {Function} handler - A function responsible for handling the record expansion, such as `fluid.expandMethodRecord`, `fluid.expandComputeRecord`, etc.
     * @property {Boolean} [isEffect=false] - A flag indicating whether the handler is related to an effect, typically used for $effect records.
     */
    function elementExpanderRecord(): void;
    let expandElementTypes: HandlerRecord[];
    /**
     * @typedef {Object} Site
     * @property {Shadow} shadow - The shadow record associated with the site.
     * @property {String[]} [segs] - The path segments within the shadow's layer map.
     */
    /**
     * Retrieves the layer associated with a specific site in the component tree.
     * The site is defined by a shadow record and a set of path segments.
     *
     * @param {Site} site - The site object containing the shadow and path segments.
     * @return {String} The layer associated with the specified site, or `undefined` if not found.
     */
    function layerForSite(site: Site): string;
    /**
     * Apply a site address to a signalised product in the form of members `site, segs`
     * @param {signal|computed|effect} signal - A signalised product to be assigned a site address
     * @param {Shadow} shadow - The shadow for the component where the signal is sited
     * @param {String[]} segs - The path segments where the signal is sited within its component
     * @return {signal|computed|effect} The now sited signal
     */
    function siteSignal(signal: any | any | any, shadow: Shadow, segs: string[]): any | any | any;
    /**
     * Converts a site locator into a unique string identifier.
     * The identifier is constructed by combining the shadow's path and the composed segments of the site's path.
     * @param {Site} site - The site object to convert.
     * @return {String} A unique string identifier for the site in the format `{shadow.path}.segments`.
     */
    function renderSite(site: Site): string;
    function renderLayerRef(layerName: any, segs: any): string;
    /**
     * Parses a site identifier into its corresponding shadow and path within the component tree.
     * The site identifier is expected to be a context reference string that includes a context and an optional path.
     *
     * @param {String} id - The site identifier to parse. It should be a context reference string.
     * @return {Site} The resolved site
     */
    function parseSite(id: string): Site;
    /**
     * Mounts a signal-producing record into a component's shadow map at the specified path.
     * If an identical record already exists in the previous shadow map, it is reused to preserve reactivity.
     * Otherwise, the provided `handler` from the `handlerRecord` is invoked to produce the signal or effect.
     *
     * @param {HandlerRecord} handlerRecord - A handler metadata record containing a `handler` function and an `isEffect` flag.
     * @param {FuncRecord} record - The signal-producing record that will be mounted. Typically includes fields like `func`, `args`, etc.
     * @param {Shadow} shadow - The component shadow in which to mount the record.
     * @param {String[]} segs - The path segments at which to mount the signal within the shadow structure
     * @return {any|undefined} The signal or computed product that results from the mounting operation.
     */
    function mountSignalRecord(handlerRecord: HandlerRecord, record: FuncRecord, shadow: Shadow, segs: string[]): any | undefined;
    function expandElement(shadow: any, element: any, segs: any): any;
    let expansionCache: any;
    function expandCompactElementImpl(element: any): {
        [x: number]: FuncRec;
    };
    function expandCompactElement(element: any): any;
    /**
     * Marks a sequence of segments in the `shadowMap` as signalised, indicating to consumers such as
     * `flattenSignals` and the proxy that the corresponding paths should be cloned and expanded due to
     * the presence of signal-bearing content further down the path.
     * @param {Object} shadowMap - The root of the shadow map structure to annotate.
     * @param {String[]} segs - The sequence of path segments to follow and mark.
     * @param {Integer} [uncess=1] - The number of trailing segments to exclude from marking as signal-bearing parents.
     */
    function markSignalised(shadowMap: any, segs: string[], uncess?: Integer): void;
    function isUnexpandablePath(segs: any): boolean;
    function expandLayer(target: any, flatMerged: any, shadow: any, segs: any): void;
    /**
     * Return the "effective unavailable" value of a component if it should be so for user purposes by checking
     * for any entries in shadow.unavailableLayers.
     *
     * @param {Shadow} shadow - The shadow record of the component to check.
     * @return {Unavailable|undefined} Returns a merged unavailable value if any layers are unavailable, otherwise undefined
     */
    function checkUnavailableComponent(shadow: Shadow): Unavailable | undefined;
    /**
     * Records an unavailable value for a given layer in the component's shadow.
     * @param {Shadow} shadow - The shadow record of the component being updated.
     * @param {String} layerName - The name of the layer to mark as unavailable.
     * @param {Unavailable} value - The value or reason indicating why the layer is unavailable.
     */
    function noteUnavailableLayer(shadow: Shadow, layerName: string, value: Unavailable): void;
    /**
     * Performs a flattened resolution of the merged hierarchy for a component, optionally constructing
     * a synthetic layer if multiple layer names are provided.
     *
     * @param {Shadow} shadow - The shadow record of the component which is merging.
     * @param {fluid.HierarchyResolver} hierarchyResolver - The resolver used to store and resolve layered definitions.
     * @param {String[]} layerNames - An array of layer names to be merged and resolved.
     * @return {LayerDef} The resolved merged definition for the computed instance
     */
    function flatMergedRound(shadow: Shadow, hierarchyResolver: fluid.HierarchyResolver, layerNames: string[]): LayerDef;
    function upgradeDynamicLayers(resolvedMergeRecords: any, dynamicMergeRecord: any): void;
    function ensureImportsLoaded(): void;
    function flatMergedComputer(shadow: any): any;
    let unavailableComponent: any;
    /**
     * Computes an instance for a given potentia and returns the associated component computer signal.
     * @param {Potentia} potentia - The potentia (potential component configuration).
     * @param {Shadow} parentShadow - The shadow record associated with the parent component.
     * @param {String} memberName - The name of the member for this component in the parent.
     * @param {Object} [variableScope] - Local scope values to be applied, perhaps through iteration
     * @return {ComponentComputer} - The computed instance as a signal with shadow and $variety properties.
     */
    function computeInstance(potentia: Potentia, parentShadow: Shadow, memberName: string, variableScope?: any): ComponentComputer;
    let effectGuardDepth: number;
    let scheduleEffectsQueue: any[];
    function queueScheduleEffects(shadow: any): void;
    function possiblyRenderError(x: any): any;
    function scheduleEffects(shadow: any): void;
    function disposeLayerEffects(shadow: any): void;
    /**
     * Replaces all entries in the target scope with those from the new scope.
     * This performs a shallow overwrite, first clearing the existing properties on the target.
     *
     * @param {Object} target - The target scope object to be updated.
     * @param {Object} newScope - The new scope whose properties will replace those in the target.
     */
    function applyScope(target: any, newScope: any): void;
    /**
     * @typedef {signal<fluid.component>} ComponentComputer
     * @property {fluid.component} value - The component value associated with the signal.
     * @property {Shadow} shadow - The shadow record associated with the component.
     * @property {"$component"} $variety - A string indicating the type of the signal, which should be "$component".
     */
    /**
     * Represents the potential state of a component, defining its layer-based configuration and merge records.
     *
     * @typedef {Object} Potentia
     * @property {String[]} layerNames - An array of direct layer names applied to the component
     * @property {MergeRecord[]} mergeRecords - An array of merge records representing the component's configuration.
     * @property {Object} [props] - Optional component properties, typically including an `$id` field.
     */
    /**
     * Updates or initializes a component's potentia by merging new records and layer names.
     * If a potentia already exists, it filters out old merge records that belong to layers being updated.
     * Otherwise, it computes a new instance.
     *
     * @param {Shadow} parentShadow - The shadow record of the parent component.
     * @param {String} memberName - The name of the component within its parent.
     * @param {MergeRecord[]} mergeRecords - An array of merge records representing the component's configuration.
     * @param {String[]} [layerNames] - An array of direct layer names applied to the component
     * @param {Object} [variableScope] - A record of scope values to be applied as a result of structural iteration
     * @return {ComponentComputer} The updated or newly computed component.
     */
    function pushPotentia(parentShadow: Shadow, memberName: string, mergeRecords: MergeRecord[], layerNames?: string[], variableScope?: any): ComponentComputer;
    let busyUnavailable: any;
    let isIdle: any;
    let unavailableComponentMap: any;
    let unavailableComponents: any;
    function trackComponentAvailability(shadow: any): any;
    function expectLiveAccess(shadow: any, prop: any): void;
    function getPenThroughSignals(target: any, segs: any): any;
    let mutatingArrayMethods: {
        [k: string]: boolean;
    };
    /**
     * Construct a proxy wrapper for a supplied component from its computer - reads will be designalised, and writes
     * will be upgraded into a live layer, allocating a fresh property in the layer if required.
     *
     * @param {any} inTarget - The target value to be proxied
     * @param {Shadow} shadow - The shadow record of the target component.
     * @param {Array<string>} segs - The path segments representing the location within the component structure.
     * @return {Proxy<fluid.component>} The retrieved or newly created metadata record.
     */
    function proxyMat(inTarget: any, shadow: Shadow, segs: Array<string>): ProxyConstructor;
    function unwrapProxy(maybeProxy: any): any;
    function initFreeComponent(componentName: any, ...initArgs: any[]): ProxyConstructor;
    /** Destroys a component held at the specified path. The parent path must represent a component, although the component itself may be nonexistent
     * @param {String|String[]} path - Path where the new component is to be destroyed, represented as a string or array of string segments
     * @param {fluid.instantiator} [instantiator] - [optional] The instantiator holding the component to be destroyed - if blank, the global instantiator will be used.
     */
    function destroy(path: string | string[], instantiator?: () => any): void;
    let emptyPotentia: Readonly<{
        layerNames: any[];
        mergeRecords: any[];
    }>;
    /**
     * Determines whether a given Potentia object is empty, meaning it has no associated layers or merge records.
     * @param {Potentia} potentia - The Potentia object to check.
     * @return {Boolean} `true` if the Potentia object is empty; otherwise, `false`.
     */
    function isEmptyPotentia(potentia: Potentia): boolean;
    /**
     * Destroys a component by resetting its Potentia, removing all layer names and merge records.
     * @param {ComponentComputer} proxy - The component to be destroyed.
     */
    function destroyComponent(proxy: ComponentComputer): void;
}
//# sourceMappingURL=FluidIL.d.mts.map