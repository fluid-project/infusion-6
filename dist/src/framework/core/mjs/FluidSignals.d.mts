export default fluid;
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
import fluid from "./FluidCore.mjs";
//# sourceMappingURL=FluidSignals.d.mts.map