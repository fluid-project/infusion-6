<script>
// Port of a-scratch/react-originals/closest-node-finder.js

fluid.def("fluid.demos.closestNoteFinder", {
    $layers: "fluid.topLevelWidget",
    preferredSize: {
        w: 260,
        h: 200
    },
    // Where React subscribed with editor.store.listen to every document change, two fine-grained bridges are read -
    // our own bounds, as received by fluid.topLevelWidget from our tldraw view, which update only when our own shape
    // moves, and the notes, held once in tldrawHost, which update only when a note changes
    closest: "$compute:fluid.demos.closestNoteFinder.findClosest({tldrawHost}.notes, {self}.hostBounds)",
    noteText: "{self}.closest.text",
    distance: "{self}.closest.distance",
    distanceLine: {
        $component: {
            $layers: "fluid.component",
            // Long-form $if so that a distance of 0 still shows the line
            $if: {
                func: distance => distance !== null,
                args: "{closestNoteFinder}.distance"
            },
            view: {
                $component: {
                    $layers: "fluid.templateViewComponent",
                    template: `<div class="notefinder-distance">Distance: @{{closestNoteFinder}.distance}px</div>`
                }
            }
        }
    }
});

/**
 * @typedef {Object} ClosestNoteRec
 * @property {String} text - The text of the closest note, or a message if there is none
 * @property {Number|null} distance - The rounded distance to the closest note, or `null` if there is none
 */

/**
 * Find the sticky note closest to the widget, measuring, as the original did, between top left corners
 * @param {NoteRec[]} notes - The notes on the current page, as bridged by fluid.tldraw.bindNotes
 * @param {ShapeBounds|null} bounds - The bounds of the widget as hosted, or `null` if it is not hosted on a canvas
 * @return {ClosestNoteRec} Description of the closest note
 */
fluid.demos.closestNoteFinder.findClosest = function (notes, bounds) {
    let togo;
    if (bounds && notes.length > 0) {
        const withDistance = notes.map(note => ({note, distance: Math.hypot(note.x - bounds.x, note.y - bounds.y)}));
        const closest = withDistance.reduce((a, b) => b.distance < a.distance ? b : a);
        togo = {
            text: closest.note.text || "Empty note",
            distance: Math.round(closest.distance)
        };
    } else if (bounds) {
        togo = {text: "No sticky notes found", distance: null};
    } else {
        togo = {text: "Not placed on a canvas", distance: null};
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
