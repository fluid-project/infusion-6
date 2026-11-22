"use strict";

// Loaded by bridge.js into the page's own world once Infusion has been booted there - see item 13 of
// a-scratch/reports/0-live-static-editing.md in Infusion 6. It defines:
//  - `fluid.withEditing`, the mixin layer which makes a component rendering a block of content editable: what it renders
//    in place of its `html`, e.g. that of `wend.content`, is the rendering of `editSource` - the text of a claim - by
//    the site's own markdown pipeline, or, with no claim, its own `html`;
//  - `fluid.editRoot`, the root of the page's editing, which holds the `$linkage` broadcasting `fluid.withEditing`
//    onto every component bearing the layers of the page's blocks, as its linkage record names them.
// The editing affordances are therefore just layers contributed to the site's own components, rather than an editor
// bolted on beside the page: Infusion renders the edited block, its shortcode islands and its site-relative URLs,
// exactly as the build did.

fluid.def("fluid.withEditing", {
    // The text of the claim on the block's source, or null if there is none
    editSource: null,
    // The name of the global holding the site's markdown pipeline - see ponder's infusion/js/markdown.js
    renderer: "ponderMarkdown",
    // The block's own `html` is left as its layers compute it, e.g. from the model - what is rendered in its place is
    // the rendering of the claim, when there is one. Since the component is adapted rather than replaced, its islands,
    // e.g. a shortcode's widget, are left as they are
    editedHtml: "$compute:fluid.withEditing.html({self}.html, {self}.editSource, {self}.renderer)",
    view: {
        $component: {
            template: "{$parent}.editedHtml"
        }
    }
});

// The site's markdown renderers, made once each, keyed by the name of the global holding the pipeline
fluid.withEditing.renderers = {};

/**
 * Compute the HTML of an editable block - its claim's text rendered by the site's own markdown pipeline, or its own HTML
 * if it has no claim
 * @param {String} ownHtml - The block's own HTML, as its layers compute it
 * @param {String|null} editSource - The text of the claim on the block's source, front matter and all, or null
 * @param {String} rendererName - The name of the global holding the site's markdown pipeline
 * @return {String} The block's HTML
 */
fluid.withEditing.html = function (ownHtml, editSource, rendererName) {
    let togo = ownHtml;
    if (editSource !== null) {
        const pipeline = window[rendererName];
        fluid.withEditing.renderers[rendererName] = fluid.withEditing.renderers[rendererName] || pipeline.make(pipeline.browserLibs(window));
        togo = pipeline.renderSource(fluid.withEditing.renderers[rendererName], editSource);
    }
    return togo;
};

// The root of the page's editing. Created by bridge.js with the `$linkage` naming the layers of the page's blocks, as
// its linkage record names them - each component bearing them gains fluid.withEditing - e.g.
//     fluid.editRoot({withEditing: {$linkage: {inputLayers: ["wend.content"], outputLayers: "fluid.withEditing"}}})
// The layers are given literally, since a linkage's layers are not resolved as references.
fluid.def("fluid.editRoot", {
    $layers: "fluid.component"
});
