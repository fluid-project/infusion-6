<script>
// DRAFT port of a-scratch/closest-node-finder.js - untested, an aid to thought

fluid.def("fluid.demos.closestNoteFinder", {
    preferredSize: {
        w: 260,
        h: 200
    },
    // Supplied by InfusionHost
    shapeId: null,
    // Where React subscribed with editor.store.listen in a useEffect, the subscription lives once, in tldrawHost, as a
    // $bindable bridging the tldraw store into a cell - this component just computes over it
    closest: "$compute:fluid.demos.closestNoteFinder.findClosest({tldrawHost}.shapes, {self}.shapeId)",
    noteText: "{self}.closest.text",
    distance: "{self}.closest.distance",
    distanceLine: {
        $component: {
            $layers: "fluid.templateViewComponent",
            // Long-form $if so that a distance of 0 still shows the line
            $if: {
                func: distance => distance !== null,
                args: "{closestNoteFinder}.distance"
            },
            template: `<div class="notefinder-distance">Distance: @{{closestNoteFinder}.distance}px</div>`
        }
    }
});

/**
 * Extract the plain text from a tldraw note's rich text, held as nested paragraph/text blocks
 * @param {Object} note - The note shape
 * @return {String} The concatenated text of the note
 */
fluid.demos.closestNoteFinder.extractText = function (note) {
    const blocks = note.props?.richText?.content || [];
    return blocks.flatMap(block => block.content || []).map(inline => inline.text || "").join("");
};

/**
 * @typedef {Object} ClosestNoteRec
 * @property {String} text - The text of the closest note, or a message if there is none
 * @property {Number|null} distance - The rounded distance to the closest note, or `null` if there is none
 */

/**
 * Find the sticky note closest to the widget's own shape
 * @param {Object[]} shapes - All shapes on the current page
 * @param {String} shapeId - The id of the widget's own shape
 * @return {ClosestNoteRec} Description of the closest note
 */
fluid.demos.closestNoteFinder.findClosest = function (shapes, shapeId) {
    const self = shapes.find(shape => shape.id === shapeId);
    const notes = shapes.filter(shape => shape.type === "note" && shape.id !== shapeId);
    let togo;
    if (self && notes.length > 0) {
        const withDistance = notes.map(note => ({note, distance: Math.hypot(note.x - self.x, note.y - self.y)}));
        const closest = withDistance.reduce((a, b) => b.distance < a.distance ? b : a);
        togo = {
            text: fluid.demos.closestNoteFinder.extractText(closest.note) || "Empty note",
            distance: Math.round(closest.distance)
        };
    } else {
        togo = {text: "No sticky notes found", distance: null};
    }
    return togo;
};
</script>

<template>
    <div class="notefinder">
        <h3 class="notefinder-title">Closest Sticky Note</h3>
        <div class="notefinder-text">@{noteText}</div>
        <div @id="distanceLine"></div>
    </div>
</template>

<style>
.notefinder {
    padding: 16px;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    background-color: #fffde7;
    font-family: sans-serif;
}

.notefinder-title {
    margin: 0 0 12px 0;
    font-size: 14px;
    color: #666;
}

.notefinder-text {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: bold;
    color: #333;
    text-align: center;
}

.notefinder-distance {
    font-size: 12px;
    color: #888;
    text-align: center;
    margin-top: 8px;
}
</style>
