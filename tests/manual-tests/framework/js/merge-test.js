"use strict";

const props = fluid.iota(10).map(i => "prop" + i);

const newTarget = function () {
    const target = {};
    props.forEach(prop => {
        if (Math.random() > 0.5) {
            target[prop] = 1;
        }
    });
    return target;
};

const targets = fluid.iota(10).map(newTarget);

const testSetCount = function (targets) {
    const props = new Set();
    targets.forEach(target => {
        Object.keys(target).forEach(key => props.add(key));
    });
    return [...props.keys()];
};

const testObjCount = function (targets) {
    const props = {};
    targets.forEach(target => {
        Object.keys(target).forEach(key => props[key] = true);
    });
    return Object.keys(props);
};

function runTests() {

    const results = [];
    let acc = [];

    for (let j = 0; j < 5; ++j) {

        const now = Date.now();
        const its = 100000;

        for (let i = 0; i < its; ++i) {
//            acc = testSetCount(targets);
            acc = testObjCount(targets);
        }

        const delay = (Date.now() - now);

        results.push(its + " iterations concluded in " + delay + " ms: " + 1000 * (delay / its) + " us/it");
    }

    results.push("Accumulated: " + acc.length);

    fluid.each(results, function (result) {
        document.querySelector(".results").append(
            Object.assign(document.createElement("li"), { textContent: result })
        );
    });
}




