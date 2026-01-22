"use strict";

// import fluid from "./FluidCore.js"

const $fluidSignalsScope = function (fluid) {

    /** Implementation taken from Reactively at https://github.com/milomg/reactively/blob/main/packages/core/src/core.ts
     *
     * Nodes for constructing a reactive graph of reactive values and reactive computations.
     *
     * We call input nodes 'roots' and the output nodes 'leaves' of the graph here in discussion,
     * but the distinction is based on the use of the graph, all nodes have the same internal structure.
     * Changes flow from roots to leaves. It would be effective but inefficient to immediately propagate
     * all changes from a root through the graph to descendant leaves. Instead we defer change
     * most change progogation computation until a leaf is accessed. This allows us to coalesce computations
     * and skip altogether recalculating unused sections of the graph.
     *
     * Each reactive node tracks its sources and its observers (observers are other
     * elements that have this node as a source). Source and observer links are updated automatically
     * as observer reactive computations re-evaluate and call get() on their sources.
     *
     * Each node stores a cache state to support the change propogation algorithm: 'clean', 'check', or 'dirty'
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
    /** current capture context for identifying reactive elements
     * - active while evaluating a reactive function body  */
    // The current Edge whose _fn is in execution
    fluid.CurrentReaction = null;
    // Becomes set if the _fn begins to demand a source which is out of step with any of its previously recorded ones
    fluid.CurrentGets = null;
    // Tracks along the current array of sources as _fn executes and demands dependents - stores the last index at which
    // demands agree with previous execution
    fluid.CurrentGetsIndex = 0;

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
     * @typedef {Object} Cell
     *
     * @property {function(): any} get - Retrieves the current value of the cell.
     * @property {function(any): void} set - Sets a new value for the cell.
     * @property {function(Function, Array<Cell>, ComputedProps=): Cell} computed - Sets up or tears down a reactive computation for the cell.
     * @property {function(Function, Array<Cell>, ComputedProps=): Cell} asyncComputed - Sets up or tears down an asynchyronous reactive computation for the cell.
     *
     * @property {Any} _value - The current value stored in the cell.
     * @property {String|undefined} [name] - A name or address for the cell.
     * @property {CacheState} _state - The cache state of the cell (clean, check, or dirty).
     * @property {Cell|null} _dirtyFrom - Cell from along which we were dirtied
     * @property {Cell[]|null} _observers - Cells that have us as sources (out links)
     * @property {Edge[]|null} _inEdges - Array of incoming edges which could update this node
     * @property {Cell[]|null} _consumedSources - Sources from which arcs have been traversed during this fit
     * @property {CellUpdateRecord|null} _updateRecord - Record of any update for the cell which is currently in progress
     * @property {Boolean} _isEffect - Is this an effect node
     * @property {Boolean} _isQueued - If an effect, are we queued?
     * @property {Error} _error - Error received evaluating the cell
     */

    /**
     * @typedef {Object} ComputedProps
     * @property {Boolean} isAsync - Indicates if the computation is asynchronous.
     * @property {Boolean} isFree - Indicates if this is a "free" computation that will deliver unavailable values
     */

    /** @typedef {Object} Edge
     * @property {Cell} target - The cell that we are the edge to (a computer for)
     * @property {Cell|null} key - The key for the edge, either the first staticSource or null if there are not any
     * @property {Cell[]|null} sources - Sources in reference order, not deduplicated (in links)
     * @property {Cell[]|null} staticSources - Static sources supplied
     * @property {Function} fn - The function to be called to compute the value
     * @property {Boolean} isAsync - Indicates if the edge's computation is asynchronous.
     * @property {Boolean} isFree - Indicates if the edge's computation should be invoked on unavailable values
     */

    /**
     * @typedef {Object} CellUpdateRecord
     * @property {any} oldValue - The previous value of the cell before the update.
     * @property {Edge|null} prevReaction - The previous global reaction context.
     * @property {Cell[]|null} prevGets - The previous list of demanded source cells.
     * @property {Number} prevIndex - The previous index in the sources array.
     * @property {Edge} inEdge - The edge representing the computation or dependency being updated.
     */

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
     * @param {Any} totest - The value to test
     * @return {Boolean} `true` if the value can be used as a promise
     */
    fluid.isPromise = function (totest) {
        return totest && typeof(totest.then) === "function";
    };

    fluid.CurrentFit = {
        /** @type {Cell[]} An array of cells for which the _consumedSources member has been set during this fit */
        targetsConsumed: []
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
     * Creates a new reactive cell for managing state and computations.
     *
     * @param {Any|undefined} [initialValue] - The initial value to store in the cell.
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
        cell._consumedEdge = null;
        cell._error = null;

        cell._state = CacheClean;
        cell._updateRecord = null;

        return cell;
    };

    /** End the current "fit" (transaction) which is updating the reactive graph by resetting all the arcs which
     * have been marked as consumed by one leg of bidirectional update arcs.
     */
    fluid.cell.endFit = function () {
        fluid.CurrentFit.targetsConsumed.forEach(target => target._consumedSources = null);
        fluid.CurrentFit.targetsConsumed.length = 0;
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
        const currentEdge = fluid.CurrentReaction;
        const useTarget = inTarget || currentEdge?.target;
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

    /**
     * Adds the given sources to the list of culled sources for a specific target cell. This signals that one
     * leg of a bidirectional arc has been travelled and that the reverse arc should be ignored for this fit.
     *
     * @param {Cell} target - The target cell for which sources are being culled.
     * @param {Array[Cell]} inSources - The array of source cells to be added to the culled sources list.
     */
    fluid.cell.consumeSources = function (target, inSources) {
        const sources = target._consumedSources || [];
        Array.prototype.push.apply(sources, inSources);
        target._consumedSources = sources;
        fluid.CurrentFit.targetsConsumed.push(target);
    };

    fluid.cell.initialUnavailable = Object.freeze(fluid.unavailable({
        staleValue: undefined
    }, "config"));

    // Separately capture this so that calls to fluid.cell can be wrapped
    fluid.cellPrototype = fluid.cell.prototype;

    fluid.cell.equals = fluid.defaultEquality;

    /**
     * Reactively evaluate the current cell, ensuring its value is up to date with respect to all computed dependents,
     * within the current reactive context
     *
     * @return {any} The evaluated cell value
     * @this {Cell}
     */
    fluid.cell.prototype.get = function () {
        // Track this get in the current reaction context
        if (fluid.CurrentReaction) {
            if (
                !fluid.CurrentGets &&
                fluid.CurrentReaction.sources &&
                fluid.CurrentReaction.sources[fluid.CurrentGetsIndex] === this
            ) {
                // No divergence with previous _sources and none is requested - simply step along the array of _sources
                fluid.CurrentGetsIndex++;
            } else {
                // Divergence needs to begin - allocate a fresh array and record this source as demanded
                if (!fluid.CurrentGets) {
                    fluid.CurrentGets = [this];
                }
                else {
                    // Divergence in progress, record this source as demanded
                    fluid.CurrentGets.push(this);
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
     * Update the value of this writeable cell.
     *
     * @param {Any} value - The new cell value
     * @this {Cell}
     */
    fluid.cell.prototype.set = function (value) {

        if (!fluid.cell.equals(this._value, value)) {
            this._value = value;

            // Mark observers as dirty
            if (this._observers) {
                const markedSources = [this];
                for (let i = 0; i < this._observers.length; i++) {
                    const observer = this._observers[i];
                    fluid.cell.markStale(observer, CacheDirty, markedSources, this);
                }
            }

            if (!fluid.isUnavailable(value)) {
                // Why did we stabilize in this branch and not in updateComplete? (now we do)
                fluid.cell.stabilize();
            }
        }
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
        let inEdge = inEdgeIndex === -1 ? null : this._inEdges[inEdgeIndex];

        if (!fn) {
            // Remove computation - part of middle block of Milo's .set
            if (inEdge) {
                fluid.cell.removeParentObservers(this, inEdge, 0);
                fluid.removeAtIndex(this._inEdges, inEdgeIndex);
            }
            return this;
        } else {
            const oldFn = inEdge?._fn;
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

            if (oldFn && fn !== oldFn || fluid.isUnavailable(this._value)) {
                // Note in this case we don't mark a _dirtyFrom, all incoming edges are in play?
                fluid.cell.markStale(this, CacheDirty, []);
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

    /**
     * Marks a cell and its observers as stale, updating their cache state.
     *
     * @param {Cell} cell - The reactive cell to mark as stale.
     * @param {CacheState} state - The new cache state to assign (e.g., CacheDirty or CacheCheck).
     * @param {Cell[]} markedSources - Array of sources which have already been marked dirty on this stack
     * @param {Cell} [dirtyFrom] - A cell joined by an edge responsible for dirtiness
     * @param {Boolean} [availChange] - `true` if a cell availability change is responsible for this marking
     */
    fluid.cell.markStale = function (cell, state, markedSources, dirtyFrom, availChange) {
        console.log("markStale for " + cell.name, " state ", state);
        // If we were previously clean, then we know that we may need to update to get the new value
        if (cell._isEffect && !cell._isQueued) {
            console.log("Pushing effect " + cell.name);
            cell._isQueued = true;
            fluid.EffectQueue.push(cell);
        }

        if (cell._state < state || availChange) {
            cell._state = state;
            cell._dirtyFrom = dirtyFrom;
            markedSources.push(cell);
            if (cell._observers) {
                const consumedSources = cell._consumedSources;
                for (let i = 0; i < cell._observers.length; i++) {
                    const observer = cell._observers[i];
                    if (!consumedSources?.includes(observer) && !markedSources.includes(observer)) {
                        fluid.cell.markStale(observer, CacheCheck, markedSources, cell, availChange);
                    }

                }
            }
        }
    };

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
        const updateRecord = {
            oldValue: cell._value,
            prevReaction: fluid.CurrentReaction,
            prevGets: fluid.CurrentGets,
            prevIndex: fluid.CurrentGetsIndex,
            inEdge
        };
        cell._updateRecord = updateRecord;
        fluid.CurrentReaction = inEdge;
        fluid.CurrentGets = null;
        fluid.CurrentGetsIndex = 0;
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
    fluid.cell.updateDependencies = function (cell, inEdge) {
        // Update sources if they changed during execution -     // if the sources have changed, update source & observer links
        if (fluid.CurrentGets) {
            // We diverged, inherit the unchanged portion of sources array up to CurrentGetsIndex and then splice in the excess
            fluid.cell.removeParentObservers(cell, inEdge, fluid.CurrentGetsIndex);
            if (inEdge.sources && fluid.CurrentGetsIndex > 0) {
                inEdge.sources.length = fluid.CurrentGetsIndex + fluid.CurrentGets.length;
                for (let i = 0; i < fluid.CurrentGets.length; i++) {
                    inEdge.sources[fluid.CurrentGetsIndex + i] = fluid.CurrentGets[i];
                }
            } else {
                inEdge.sources = fluid.CurrentGets;
            }

            for (let i = fluid.CurrentGetsIndex; i < inEdge.sources.length; i++) {
                // Add ourselves to the end of the parent .observers array
                const source = inEdge.sources[i];
                if (!source._observers) {
                    source._observers = [cell];
                } else {
                    source._observers.push(cell);
                }
            }
        } else if (inEdge.sources && fluid.CurrentGetsIndex < inEdge.sources.length) {
            // We didn't diverge but demanded strictly fewer sources than our predecessor, trim the excess
            fluid.cell.removeParentObservers(cell, inEdge, fluid.CurrentGetsIndex);
            inEdge.sources.length = fluid.CurrentGetsIndex;
        }
    };

    /**
     * Ends the update process for a reactive cell by restoring the previous update context.
     * Restores the global reaction state, resets the cell's update record, and marks the cell as clean.
     * If the cell's value has changed and it has observers, marks its observers as dirty.
     * If there is no current reaction after ending the update, ends the current fit (transaction).
     *
     * @param {Cell} cell - The reactive cell whose update is being ended.
     * @param {Boolean} syncUpdate - Was this a synchronous update
     */
    fluid.cell.endTracking = function (cell, syncUpdate) {
        const updateRecord = cell._updateRecord;
        if (syncUpdate) {
            cell._updateRecord = null;
        }

        fluid.CurrentGets = updateRecord.prevGets;
        fluid.CurrentReaction = updateRecord.prevReaction;
        fluid.CurrentGetsIndex = updateRecord.prevIndex;
        cell._state = CacheClean;
        // cell._dirtyFrom = null;

        if (fluid.CurrentReaction === null) {
            fluid.cell.endFit();
        }
    };

    /**
     * Executes a function in an "untracked" context, temporarily suspending the current reactive tracking.
     * This allows code to run without capturing dependencies or affecting the reactive graph.
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
            fluid.cell.endTracking(stateCell, true);
        }
    };

    /**
     * Completes the update process for a reactive cell by setting its new value and updating its state.
     * If the value has changed, marks all observers (children) as dirty so they will reevaluate.
     * Handles availability transitions and ensures that downstream effects are stabilized if necessary.
     *
     * @param {Any} newValue - The new value to assign to the cell.
     * @param {Cell} cell - The reactive cell being updated.
     * @param {Boolean} syncUpdate - Indicates if the update is synchronous.
     */
    fluid.cell.updateComplete = function (newValue, cell, syncUpdate) {
        const availChange = !fluid.isUnavailable(newValue) && fluid.isUnavailable(cell._value);

        cell._value = newValue;

        const updateRecord = cell._updateRecord;
        if (!syncUpdate) {
            cell._updateRecord = null;
        }

        // Don't mark ourselves as clean if value is not available since it may be computable from another relation
        if (!fluid.isUnavailable(newValue)) {
            console.log("Update complete for " + cell.name + ", marking clean");
            cell._state = CacheClean;
        }

        // Misleading original comment:
        // handles diamond dependencies if we're the parent of a diamond.
        if (!fluid.cell.equals(updateRecord.oldValue, cell._value) && cell._observers) {
            const consumedSources = cell._consumedSources;
            // We've changed value, so mark our children as dirty so they'll reevaluate
            for (let i = 0; i < cell._observers.length; i++) {
                const observer = cell._observers[i];
                if (!consumedSources?.includes(observer)) {
                    // Milo's implementation for some reason did this directly rather than recursively
                    fluid.cell.markStale(observer, CacheDirty, [], cell, availChange);
                    // Note that markStale also sets _dirtyFrom
                    // observer._state = CacheDirty;
                    // observer._dirtyFrom = cell;
                }
            }
            if (!fluid.isUnavailable(newValue)) {
                fluid.cell.stabilize();
            }
        }
    };

    fluid.cell.bindIterable = function (cell, inEdge, iterable) {
        // Guide at https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function*#declaring_an_async_generator_function
        const bindIterable = nextIt => {
            // TODO: Presumably set to undefined here to mark as unavailable
            nextIt.then(res => {
                // Misuse syncUpdate flag to preserve cell._updateRecord in the case iteration is not done
                fluid.cell.updateComplete(res.value, cell, !res.done);
                if (!res.done) {
                    cell._updateRecord.oldValue = res.value;
                    const nextIt = iterable.next();
                    bindIterable(nextIt);
                }
            }, e => {
                cell._error = e;
            });
        };
        const nextIt = iterable.next();
        bindIterable(nextIt);
    };

    /**
     * Updates the value of a reactive cell by re-evaluating its computation function and updating any changed dynamic dependencies.
     * @param {Cell} cell - The reactive cell to update.
     * @param {Edge} inEdge - The edge along which we should update
     */
    fluid.cell.update = function (cell, inEdge) {
        if (cell._updateRecord || !cell._inEdges) {
            return;
        }

        fluid.cell.beginTracking(cell, inEdge);

        let syncUpdate = !inEdge.isAsync;

        if (!syncUpdate) {
            // Mark the cell as unavailable/stale whilst it is updating
            cell.set(fluid.pending(cell._value, cell.name));
        }

        try {
            const args = inEdge.staticSources ? inEdge.staticSources.map(s => s.get()) : [];
            fluid.cell.consumeSources(cell, inEdge.sources);

            const result = inEdge.fn.apply(null, args);

            if (!syncUpdate) {
                if (fluid.isPromise(result)) {
                    result.then(newValue => {
                        console.log("Async update for value of cell ", cell.name);
                        fluid.cell.updateComplete(newValue, cell, false);
                    },
                    e => cell._error = e);
                } else if (result[Symbol.asyncIterator]) {
                    fluid.cell.bindIterable(cell, inEdge, result);
                } else { // Unexpected plain return from async edge
                    syncUpdate = true;
                }
            }
            if (syncUpdate) {
                // It was a plain value, update now
                fluid.cell.updateComplete(result, cell, true);
            }
        } catch (e) {
            cell._error = e;
        } finally {
            fluid.cell.updateDependencies(cell, inEdge);
            fluid.cell.endTracking(cell, syncUpdate);
        }
    };

    /**
     * Determine which compute edge should be activated in order to update a dirty cell. Either the one
     * which leads to a cell from which an edge originally marked us as dirty, or one with no unavailable
     * values.
     * @param {Cell} cell - The reactive cell to update if necessary.
     * @return {Edge} edge - The edge to be activated
     */
    fluid.cell.findDirtyEdge = function (cell) {
        let bestCandidate;
        for (let i = 0; i < cell._inEdges.length; ++i) {
            const edge = cell._inEdges[i];
            if (edge.isFree || !edge.sources?.some(source => fluid.isUnavailable(source._value) || source._state !== CacheClean) ) {
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
                        if (cell._state === CacheDirty) {
                            dirtyEdge = fluid.cell.findDirtyEdge(cell);
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
            dirtyEdge = fluid.cell.findDirtyEdge(cell);
        }

        if (dirtyEdge) {
            fluid.cell.update(cell, dirtyEdge);
        }
        // TODO: If we are dirty, and all sources of all edges are unavailable, produce an unavailable value reporting this
        // but only if there is a free effect upstream
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

    // Effect implementation
    fluid.cell.disposableEffect = function (config) {
        const effect = fluid.cell();
        effect._isEffect = true;
        effect._isQueued = false;
        effect._isDisposed = false;
        effect.name = config?.name;

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

        const {fn, staticSources} = config.bind;

        // Wrap the user's supplied function to short-circuit if any arguments are unavailable if effect is not marked "free"
        const computeFn = config.isFree ? fn : function () {
            if (effect._isDisposed) {
                return;
            }
            const args = staticSources.map(s => s.get());

            fn.apply(effect, args);
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
     * @return {Cell} The created effect cell.
     */
    fluid.cell.effect = function (fn, staticSources, props) {
        return fluid.cell.disposableEffect({
            bind: {fn, staticSources},
            unbind: {fn: props?.onDispose},
            isFree: props?.isFree,
            name: props?.name
        });
    };

    // Stabilize function to process effect queue
    fluid.cell.stabilize = function () {
        while (fluid.EffectQueue.length > 0) {
            const queue = fluid.EffectQueue.slice();
            fluid.EffectQueue.length = 0;

            for (let i = 0; i < queue.length; i++) {
                const effect = queue[i];
                effect.get();
                effect._isQueued = false;
                console.log("Effect " + effect.name + " unqueued");
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
            }, [valSignal], {name: "Resolution effect for cell " + valSignal.name});
        });
    };
};

// Signal to a global environment compositor what path this scope function should be applied to
$fluidSignalsScope.$fluidScopePath = "fluid";

// If there is a namespace in the global, bind to it
if (typeof(fluid) !== "undefined") {
    $fluidSignalsScope(fluid);
}

// Note: for ES6 support, transform this to a file with coda:
// export $fluidSignalsScope
// Client then needs to do compositing of its own global namespace
