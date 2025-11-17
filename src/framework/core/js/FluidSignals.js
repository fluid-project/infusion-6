"use strict";

const $fluidSignalsScope = function (fluid) {
    // Global state for tracking reactive context
    let CurrentReaction = undefined;
    let CurrentGets = null;
    let CurrentGetsIndex = 0;
    let EffectQueue = [];
    let UpdateDepth = 0;
    let StabilizeDepth = 0;
    const MAX_UPDATE_DEPTH = 100;

    // Cache states
    const CacheClean = 0;
    const CacheCheck = 1;
    const CacheDirty = 2;

    function defaultEquality(a, b) {
        return a === b;
    }

    // Main cell constructor
    fluid.cell = function (initialValue) {
        const cell = Object.create(fluid.cell.prototype);

        // Initialize cell properties
        cell._value = initialValue;
        cell.fn = undefined;
        cell.observers = null;
        cell.sources = null;
        cell.state = CacheClean;
        cell.effect = false;
        cell.cleanups = [];
        cell.equals = defaultEquality;
        cell.available = initialValue !== undefined;
        cell.updating = false;

        return cell;
    };

    fluid.cell.prototype.get = function () {
        // Track this get in the current reaction context
        if (CurrentReaction) {
            if (
                !CurrentGets &&
                CurrentReaction.sources &&
                CurrentReaction.sources[CurrentGetsIndex] === this
            ) {
                CurrentGetsIndex++;
            } else {
                if (!CurrentGets) CurrentGets = [this];
                else CurrentGets.push(this);
            }
        }

        // Update if we have a function and might be stale
        if (this.fn) this.updateIfNecessary();

        return this._value;
    };

    fluid.cell.prototype.set = function (value) {
        // If we had a function, remove it and its dependencies
        if (this.fn) {
            this.removeParentObservers(0);
            this.sources = null;
            this.fn = undefined;
        }

        if (!this.equals(this._value, value)) {
            this._value = value;
            this.available = true;

            // Mark observers as dirty
            if (this.observers) {
                for (let i = 0; i < this.observers.length; i++) {
                    const observer = this.observers[i];
                    observer.stale(CacheDirty);
                }
            }
        }

        // Process any effects that were queued (only at top level)
        if (StabilizeDepth === 0) {
            stabilize();
        }
    };

    fluid.cell.prototype.compute = function (fn, sources) {
        if (fn === null) {
            // Remove computation
            if (this.fn) {
                this.removeParentObservers(0);
                this.sources = null;
                this.fn = undefined;
            }
            return this;
        }

        // Remove old source observers before setting new ones
        if (this.sources) {
            this.removeParentObservers(0);
        }

        const oldFn = this.fn;
        this.fn = fn;
        this.sources = sources || null;

        // Set up observer links from sources to this cell
        if (sources) {
            for (let i = 0; i < sources.length; i++) {
                const source = sources[i];
                if (!source.observers) {
                    source.observers = [this];
                } else {
                    // Check if already observing to avoid duplicates
                    if (!source.observers.includes(this)) {
                        source.observers.push(this);
                    }
                }
            }
        }

        if (fn !== oldFn) {
            this.stale(CacheDirty);
        }

        // Immediately compute the value
        this.updateIfNecessary();

        return this;
    };

    fluid.cell.prototype.stale = function (state) {
        if (this.state < state) {
            if (this.state === CacheClean && this.effect) {
                EffectQueue.push(this);
            }

            this.state = state;
            if (this.observers) {
                for (let i = 0; i < this.observers.length; i++) {
                    this.observers[i].stale(CacheCheck);
                }
            }
        }
    };

    fluid.cell.prototype.update = function () {
        // Prevent infinite recursion in circular dependencies
        if (this.updating) {
            return;
        }

        this.updating = true;
        const oldValue = this._value;

        const prevReaction = CurrentReaction;
        const prevGets = CurrentGets;
        const prevIndex = CurrentGetsIndex;

        CurrentReaction = this;
        CurrentGets = null;
        CurrentGetsIndex = 0;

        try {
            if (this.cleanups.length) {
                this.cleanups.forEach(c => c(this._value));
                this.cleanups = [];
            }

            // Call the function with source values as arguments
            if (this.sources) {
                const args = this.sources.map(s => s.get());
                this._value = this.fn.apply(null, args);
            } else {
                this._value = this.fn();
            }

            this.available = true;

            // Update sources if they changed during execution
            if (CurrentGets) {
                this.removeParentObservers(CurrentGetsIndex);
                if (this.sources && CurrentGetsIndex > 0) {
                    this.sources.length = CurrentGetsIndex + CurrentGets.length;
                    for (let i = 0; i < CurrentGets.length; i++) {
                        this.sources[CurrentGetsIndex + i] = CurrentGets[i];
                    }
                } else {
                    this.sources = CurrentGets;
                }

                for (let i = CurrentGetsIndex; i < this.sources.length; i++) {
                    const source = this.sources[i];
                    if (!source.observers) {
                        source.observers = [this];
                    } else if (!source.observers.includes(this)) {
                        source.observers.push(this);
                    }
                }
            } else if (this.sources && CurrentGetsIndex < this.sources.length) {
                this.removeParentObservers(CurrentGetsIndex);
                this.sources.length = CurrentGetsIndex;
            }
        } finally {
            CurrentGets = prevGets;
            CurrentReaction = prevReaction;
            CurrentGetsIndex = prevIndex;
            this.updating = false;
        }

        // Handle diamond dependencies
        if (!this.equals(oldValue, this._value) && this.observers) {
            for (let i = 0; i < this.observers.length; i++) {
                const observer = this.observers[i];
                observer.state = CacheDirty;
            }
        }

        this.state = CacheClean;
    };

    fluid.cell.prototype.updateIfNecessary = function () {
        // Prevent stack overflow in circular dependencies
        UpdateDepth++;
        if (UpdateDepth > MAX_UPDATE_DEPTH) {
            UpdateDepth--;
            return;
        }

        try {
            if (this.state === CacheCheck) {
                for (const source of this.sources) {
                    source.updateIfNecessary();
                    if (this.state === CacheDirty) {
                        break;
                    }
                }
            }

            if (this.state === CacheDirty) {
                this.update();
            }

            this.state = CacheClean;
        } finally {
            UpdateDepth--;
        }
    };

    fluid.cell.prototype.removeParentObservers = function (index) {
        if (!this.sources) return;
        for (let i = index; i < this.sources.length; i++) {
            const source = this.sources[i];
            if (!source.observers) continue;
            const swap = source.observers.findIndex(v => v === this);
            if (swap !== -1) {
                source.observers[swap] = source.observers[source.observers.length - 1];
                source.observers.pop();
            }
        }
    };

    // Effect implementation
    fluid.effect = function (config, sources) {
        const effect = fluid.cell();
        effect.effect = true;
        effect.disposed = false;

        const fn = function () {
            if (effect.disposed) return;
            const args = sources.map(s => s.get());

            // Check if all sources are available
            const allAvailable = sources.every(s => s.available);
            if (!allAvailable) return;

            config.bind.apply(null, args);
        };

        effect.compute(fn, sources);
        effect.stale(CacheDirty);
        EffectQueue.push(effect);

        // Run immediately
        effect.updateIfNecessary();

        effect.dispose = function () {
            effect.disposed = true;
            if (effect.sources) {
                effect.removeParentObservers(0);
                effect.sources = null;
            }
            effect.fn = undefined;
        };

        return effect;
    };

    // Stabilize function to process effect queue
    function stabilize() {
        if (StabilizeDepth > 0) return;

        StabilizeDepth++;
        try {
            while (EffectQueue.length > 0) {
                const queue = EffectQueue.slice();
                EffectQueue.length = 0;

                for (let i = 0; i < queue.length; i++) {
                    queue[i].get();
                }
            }
        } finally {
            StabilizeDepth--;
        }
    }
};

if (typeof(fluid) !== "undefined") {
    $fluidSignalsScope(fluid);
}
