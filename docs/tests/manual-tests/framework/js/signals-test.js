/* global preactSignalsCore */

"use strict";

// noinspection ES6ConvertVarToLetConst // otherwise this is a duplicate on minifying
var {signal, computed} = preactSignalsCore;

const testSelfPeek = function () {
    const source = signal(0);
    const derived = computed(() => {
        const oldValue = derived.v;
        console.log("Old value of derived was ", oldValue);
        return source.value + 1;
    });
    console.log("Derived value is ", derived.value);
    source.value = 1;
    console.log("Derived value is ", derived.value);
};

testSelfPeek();

const taxa = signal([
    {id: 48460, name: "Life"},
    {id: 47126, name: "Plants", parentId: 48460},
    {id: 47567, name: "Willow family", parentId: 47126}
]);

const acceptTaxon = taxon => taxon.name.includes("Willow");

const taxaById = computed( () => {
    const togo = {};
    taxa.value.forEach(row => togo[row.id] = row);
    return togo;
});

const acceptedTree = computed( () => {
    const togo = {};
    const storeParents = function (id) {
        const row = taxaById.value[id];
        togo[id] = true;
        const parentId = row.parentId;
        if (parentId) {
            storeParents(parentId);
        }
    };
    taxa.value.filter(acceptTaxon).forEach(row => storeParents(row.id));
    return togo;
});

console.log(acceptedTree.value);
