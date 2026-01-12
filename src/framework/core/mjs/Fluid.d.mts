export default fluid;
/**
 * An integer number (whole number without fractional part).
 * This is a semantic alias indicating the expected value should be an integer.
 */
export type Integer = number;
export type LayerDef = {
    /**
     * - Any parent layers of this layer
     */
    $layers?: string | string[];
    /**
     * - If this layer is a core framework or auxiliary (from the editing
     * UI system) layer
     */
    $variety?: "framework" | "frameworkAux";
};
export type RawLayer = {
    /**
     * - Any parent layers of this layer
     */
    raw: LayerDef;
    /**
     * - If this layer has been demanded by the implementation of a component
     */
    demanded: boolean;
};
/**
 * - A structured map of paths to the names of the layers contributing values at those paths, with records held at key `$m`
 */
export type LayerMap = any;
export type MergeRecord = {
    /**
     * - The type of the merge record (e.g., "def", "defParents").
     */
    mergeRecordType: string;
    /**
     * - Name of the merge record holding a layer, expected to be unique
     */
    mergeRecordName?: string;
    /**
     * - The layer definition object to be merged.
     */
    layer?: any;
    /**
     * - The priority of the layer, used for determining merge order.
     */
    priority?: number;
};
export type MergedHierarchyResolution = {
    /**
     * - The array of merge records representing the merged layers and their priorities.
     */
    mergeRecords: MergeRecord[];
    /**
     * - The final merged object representing the composite component definition.
     */
    merged: LayerDef;
    /**
     * - A map of all paths in the merged object to their source layers.
     */
    layerMap: LayerMap;
};
export type LayerLinkageRecord = {
    /**
     * - An array of layer names that must be present together to trigger the linkage.
     */
    inputLayers: string[];
    /**
     * - An array of layer names that should be applied when the inputLayers co-occur.
     */
    outputLayers: string[];
};
export type SelectorParseStrategy = {
    /**
     * - A regular expression to match selector components.
     */
    regexp: RegExp;
    /**
     * - A mapping of prefix characters (e.g., ".", "#") to predicate types.
     */
    charToTag: any;
};
export type ParsedSelector = {
    /**
     * - The type of the selector component (e.g., "tag", "id", "clazz").
     */
    tag: string;
    /**
     * - The value of the selector component (e.g., "div", "class", "id").
     */
    value: string;
    /**
     * - Whether the component is a direct child selector (">").
     */
    child: boolean;
};
export type ParsedContext = {
    /**
     * - The context portion of the reference
     */
    context: string;
    /**
     * - The path portion of the reference
     */
    path: string;
    /**
     * - An optional colon-delimited name parsed from the reference
     */
    name?: string;
    /**
     * - An optional selector to query down the tree from the resolved context
     */
    selector: any;
};
import fluid from "./FluidCore.mjs";
//# sourceMappingURL=Fluid.d.mts.map