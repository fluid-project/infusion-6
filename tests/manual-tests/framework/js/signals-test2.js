/* global preactSignalsCore */

"use strict";

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var {signal, computed} = preactSignalsCore;

const taxaSignal = signal([
    {id: 48460, name: "Life"},
    {id: 47126, name: "Plants", parentId: 48460},
    {id: 47567, name: "Willow family", parentId: 47126}
]);

const acceptTaxon = taxon => taxon.name.includes("Willow");

const indexTaxa = function (taxa) {
    const togo = {};
    taxa.forEach(row => togo[row.id] = row);
    return togo;
};

const taxaByIdSignal = fluid.computed(indexTaxa, taxaSignal);

const filterAccepted = function (taxa, taxaById) {
    const togo = {};
    const storeParents = function (id) {
        const row = taxaById[id];
        togo[id] = true;
        const parentId = row.parentId;
        if (parentId) {
            storeParents(parentId);
        }
    };
    taxa.filter(acceptTaxon).forEach(row => storeParents(row.id));
    return togo;
};

const acceptedTree = fluid.computed(filterAccepted, taxaSignal, taxaByIdSignal);

console.log(acceptedTree.value);
