"use strict";

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
    // The current reaction whose _fn is in execution
    fluid.CurrentReaction = undefined;
    // Becomes set if the _fn begins to demand a source which is out of step with any of its previously recorded ones
    fluid.CurrentGets = null;
    // Tracks along the current array of _sources as _fn executes and demands dependents
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

    fluid.CacheClean = 0;
    fluid.CacheCheck = 1; // green
    fluid.CacheDirty = 2; // red

    const CacheClean = fluid.CacheClean,
        CacheCheck = fluid.CacheCheck,
        CacheDirty = fluid.CacheDirty;

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

    /**
     * @typedef {Object} Cell
     * @property {function(): any} get - Retrieves the current value of the cell.
     * @property {function(any): void} set - Sets a new value for the cell.
     * @property {function(Function, Array<Cell>): Cell} compute - Sets up a reactive computation for the cell.
     * @property {Any} _value - The current value stored in the cell.
     * @property {Boolean} _isEffect - Is this an effect node.
     * @property {CacheState} _state - The cache state of the cell (clean, check, or dirty).
     * @property {Cell[]|null} _observers - Cells that have us as sources (down links)
     * @property {Cell[]|null} _sources - Sources in reference order, not deduplicated (up links)
     */

    /**
     * Creates a new reactive cell for managing state and computations.
     *
     * @param {any} [initialValue] - The initial value to store in the cell.
     * @param {Object} [props] - Additional properties to contextualise the cell
     * @return {Cell} The newly created cell object.
     */
    fluid.cell = function (initialValue, props) {
        const cell = Object.create(fluid.cellPrototype);
        Object.assign(cell, props);

        // Initialize cell properties
        cell._value = initialValue;
        cell._fn = undefined;
        cell._observers = null; // nodes that have us as sources (down links)
        cell._sources = null; // sources in reference order, not deduplicated (up links)

        cell._state = CacheClean;
        cell._isEffect = false;
        // NEW
        cell._isUpdating = false;

        return cell;
    };

    // Separately capture this so that calls to fluid.cell can be wrapped
    fluid.cellPrototype = fluid.cell.prototype;

    fluid.cell.equals = fluid.defaultEquality;

    // Stopgap until we port in genuine unavailable
    fluid.cell.isUnavailable = val => val === undefined;

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
                fluid.CurrentReaction._sources &&
                fluid.CurrentReaction._sources[fluid.CurrentGetsIndex] === this
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

        // Update if we have a function and might be stale
        if (this._fn) {
            fluid.cell.updateIfNecessary(this);
        }

        return this._value;
    };

    /**
     * Update the value of this writeable cell
     *
     * @param {Any} value - The new cell value
     * @this {Cell}
     */
    fluid.cell.prototype.set = function (value) {

        if (!fluid.cell.equals(this._value, value)) {
            this._value = value;

            // Mark observers as dirty
            if (this._observers) {
                for (let i = 0; i < this._observers.length; i++) {
                    const observer = this._observers[i];
                    fluid.cell.markStale(observer, CacheDirty);
                }
            }
        }

        fluid.cell.stabilize();
    };

    /**
     * Mark this cell as holding a value computed from a set of other reactive cell values.
     *
     * @param {Function} fn - The function which will reactively evaluate this cell's value
     * @param {Cell[]} [staticSources] - Any statically known cell dependencies whose reactively evaluated arguments will be supplied
     * to `fn` when it is called.
     * @return {Cell} This cell
     * @this {Cell}
     */
    fluid.cell.prototype.compute = function (fn, staticSources) {
        if (!fn) {
            // Remove computation - part of middle block of original .set
            if (this._fn) {
                fluid.cell.removeParentObservers(this, 0);
                this._sources = null;
                this._fn = null;
            }
            return this;
        }

        const oldFn = this._fn;
        this._fn = fn;
        this._staticSources = staticSources ? [...staticSources] : null;

        // Set up observer links from sources to this cell - this is new signature
        if (staticSources) {
            for (let i = 0; i < staticSources.length; i++) {
                const source = staticSources[i];
                if (!source._observers) {
                    source._observers = [this];
                } else {
                    // Check if already observing to avoid duplicates
                    if (!source._observers.includes(this)) {
                        source._observers.push(this);
                    }
                }
            }
        }

        if (fn !== oldFn) {
            fluid.cell.markStale(this, CacheDirty);
        }

        fluid.cell.stabilize();

        return this;
    };

    /**
     * Marks a cell and its observers as stale, updating their cache state.
     *
     * @param {Cell} cell - The reactive cell to mark as stale.
     * @param {CacheState} state - The new cache state to assign (e.g., CacheDirty or CacheCheck).
     */
    fluid.cell.markStale = function (cell, state) {
        if (cell._state < state) {
            // If we were previously clean, then we know that we may need to update to get the new value
            if (cell._state === CacheClean && cell._isEffect) {
                fluid.EffectQueue.push(cell);
            }

            cell._state = state;
            if (cell._observers) {
                for (let i = 0; i < cell._observers.length; i++) {
                    fluid.cell.markStale(cell._observers[i], CacheCheck);
                }
            }
        }
    };

    /**
     * Updates the value of a reactive cell by re-evaluating its computation function and managing dependencies.
     * @param {Cell} cell - The reactive cell to update.
     */
    fluid.cell.update = function (cell) {
        // AI
        // Prevent infinite recursion in circular dependencies
        if (cell._isUpdating || !cell._fn) {
            return;
        }

        cell._isUpdating = true;
        // \AI
        const oldValue = cell._value;

        const prevReaction = fluid.CurrentReaction;
        const prevGets = fluid.CurrentGets;
        const prevIndex = fluid.CurrentGetsIndex;

        fluid.CurrentReaction = cell;
        fluid.CurrentGets = null;
        fluid.CurrentGetsIndex = 0;

        try {

            // new - dispatch values from static dependencies as arguments
            if (cell._staticSources) {
                const args = cell._staticSources.map(s => s.get());
                cell._value = cell._fn.apply(null, args);
            } else {
                cell._value = cell._fn();
            }
            //


            // Update sources if they changed during execution -     // if the sources have changed, update source & observer links
            if (fluid.CurrentGets) {
                // We diverged, inherit the unchanged portion of sources array up to CurrentGetsIndex and then splice in the excess
                fluid.cell.removeParentObservers(cell, fluid.CurrentGetsIndex);
                if (cell._sources && fluid.CurrentGetsIndex > 0) {
                    cell._sources.length = fluid.CurrentGetsIndex + fluid.CurrentGets.length;
                    for (let i = 0; i < fluid.CurrentGets.length; i++) {
                        cell._sources[fluid.CurrentGetsIndex + i] = fluid.CurrentGets[i];
                    }
                } else {
                    cell._sources = fluid.CurrentGets;
                }

                for (let i = fluid.CurrentGetsIndex; i < cell._sources.length; i++) {
                    const source = cell._sources[i];
                    if (!source._observers) {
                        source._observers = [cell];
                    } else if (!source._observers.includes(cell)) {
                        source._observers.push(cell);
                    }
                }
            } else if (cell._sources && fluid.CurrentGetsIndex < cell._sources.length) {
                // We didn't diverge but demanded strictly fewer sources than our predecessor, trim the excess
                fluid.cell.removeParentObservers(cell, fluid.CurrentGetsIndex);
                cell._sources.length = fluid.CurrentGetsIndex;
            }
        } finally {
            fluid.CurrentGets = prevGets;
            fluid.CurrentReaction = prevReaction;
            fluid.CurrentGetsIndex = prevIndex;
            cell._isUpdating = false;
        }

        // handles diamond dependencies if we're the parent of a diamond. - part of original impl
        if (!fluid.cell.equals(oldValue, cell._value) && cell._observers) {
            for (let i = 0; i < cell._observers.length; i++) {
                const observer = cell._observers[i];
                observer._state = CacheDirty;
            }
        }

        cell._state = CacheClean;
    };

    /**
     * Ensures that a reactive cell is up to date by checking and updating its dependencies as needed.
     * @param {Cell} cell - The reactive cell to update if necessary.
     */
    fluid.cell.updateIfNecessary = function (cell) {
        // If we are potentially dirty, see if we have a parent who has actually changed value
        if (cell._state === CacheCheck) {
            for (const source of cell._sources) {
                fluid.cell.updateIfNecessary(source);
                if (cell._state === CacheDirty) {
                    // Stop the loop here so we won't trigger updates on other parents unnecessarily
                    // If our computation changes to no longer use some sources, we don't
                    // want to update() a source we used last time, but now don't use.
                    break;
                }
            }
        }

        if (cell._state === CacheDirty) {
            fluid.cell.update(cell);
        }

        cell._state = CacheClean;

    };

    /**
     * Removes this cell as an observer from its parent source cells starting at the given index.
     * @param {Cell} cell - The cell whose parent observer links are to be removed.
     * @param {Number} index - The starting index in the sources array from which to remove observer links.
     * @this {Cell}
     */
    fluid.cell.removeParentObservers = function (cell, index) {
        if (!cell._sources) {
            return;
        }
        for (let i = index; i < cell._sources.length; i++) {
            const source = cell._sources[i]; // We don't actually delete sources here because we're replacing the entire array soon
            if (!source._observers) {
                continue;
            }
            const swap = source._observers.findIndex(v => v === this);
            if (swap !== -1) {
                source._observers[swap] = source.observers[source._observers.length - 1];
                source._observers.pop();
            }
        }
    };

    // Effect implementation
    fluid.effect = function (config, sources) {
        const effect = fluid.cell();
        effect._isEffect = true;
        effect._isDisposed = false;

        const fn = function () {
            if (effect._isDisposed) {
                return;
            }
            const args = sources.map(s => s.get());

            // Check if all sources are available
            const allAvailable = args.every(arg => !fluid.cell.isUnavailable(arg));
            if (!allAvailable) {
                return;
            }

            config.bind.apply(null, args);
        };

        effect.compute(fn, sources);
        // In original effect cell constructor there was stabilizeFn?.(this);
        // compute constructor will enqueue self since there has been a change in _fn and _state

        // Run immediately
        fluid.cell.updateIfNecessary(effect);

        effect.dispose = function () {
            effect._isDisposed = true;
            if (effect._sources) {
                fluid.cell.removeParentObservers(effect, 0);
                effect._sources = null;
            }
            effect._fn = undefined;
        };

        return effect;
    };

    // Stabilize function to process effect queue
    fluid.cell.stabilize = function () {
        while (fluid.EffectQueue.length > 0) {
            const queue = fluid.EffectQueue.slice();
            fluid.EffectQueue.length = 0;

            for (let i = 0; i < queue.length; i++) {
                queue[i].get();
            }
        }
    };
};

if (typeof(fluid) !== "undefined") {
    $fluidSignalsScope(fluid);
}
