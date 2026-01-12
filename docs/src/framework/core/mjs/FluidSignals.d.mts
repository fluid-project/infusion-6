export default fluid;
export type CacheState = number;
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
    _value: Any;
    /**
     * - A name or address for the cell.
     */
    name?: string | undefined;
    /**
     * - The cache state of the cell (clean, check, or dirty).
     */
    _state: CacheState;
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
     * - Record of any update for the cell which is currently in progress
     */
    _updateRecord: CellUpdateRecord | null;
    /**
     * - Is this an effect node
     */
    _isEffect: boolean;
    /**
     * - If an effect, are we queued?
     */
    _isQueued: boolean;
    /**
     * - Error received evaluating the cell
     */
    _error: Error;
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
};
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
};
export type CellUpdateRecord = {
    /**
     * - The previous value of the cell before the update.
     */
    oldValue: any;
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
    /**
     * - The edge representing the computation or dependency being updated.
     */
    inEdge: Edge;
};
declare namespace fluid {
    /**
     * *
     */
    type CacheClean = number;
}
import fluid from "./FluidCore.mjs";
//# sourceMappingURL=FluidSignals.d.mts.map