"use strict";

// Stubs standing in for the helpers which my-story-time.js imported from "#Agents .widget-helpers" in its original
// host environment. Image generation is faked by a delay, and the resulting image shape is swapped for a placeholder.

fluid.registerNamespace("fluid.demos.agents");

fluid.demos.agents.stubAssetPrefix = "asset:stub-";

/**
 * Stub for generateImageAsset - waits a little, then returns a fake asset id
 * @param {String} prompt - The description of the image to generate
 * @param {Object} options - Generation options, e.g. `width` and `height` - ignored
 * @return {Promise<String>} A promise for the id of the "generated" asset
 */
fluid.demos.agents.generateImageAsset = function (prompt, options) {
    console.log("Stub generateImageAsset for prompt ", prompt, " with options ", options);
    return new Promise(resolve => {
        setTimeout(() => resolve(fluid.demos.agents.stubAssetPrefix + Date.now()), 1500);
    });
};

/**
 * Stub for convertAndValidateShapes - image shapes referring to stub assets, which do not exist in the store, are
 * converted to dashed rectangles of the same size. Other drafts pass through unvalidated.
 * @param {Object[]} drafts - Draft shape records
 * @return {Object} `validatedShapes` holding the converted shapes, and an always empty `errors` array
 */
fluid.demos.agents.convertAndValidateShapes = function (drafts) {
    const validatedShapes = drafts.map(draft => {
        let togo;
        if (draft.type === "image" && draft.props.assetId.startsWith(fluid.demos.agents.stubAssetPrefix)) {
            togo = {
                type: "geo",
                x: draft.x,
                y: draft.y,
                props: {
                    geo: "rectangle",
                    dash: "dashed",
                    w: draft.props.w,
                    h: draft.props.h
                }
            };
        } else {
            togo = draft;
        }
        return togo;
    });
    return {validatedShapes, errors: []};
};
