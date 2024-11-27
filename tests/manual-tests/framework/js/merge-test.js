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

const chainPrototypes = function (targets, clear) {
    for (let i = 0; i < targets.length - 1; i++) {
        Object.setPrototypeOf(targets[i], clear ? null : targets[i + 1]);
    }
    return targets;
};

const targets = fluid.iota(10).map(newTarget);

const targetsChain = chainPrototypes(fluid.iota(10).map(newTarget));

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

const testChain = function (targetsChain) {
    const props = [];

    // chainPrototypes(targetsChain, null);
    chainPrototypes(targetsChain);

    for (let prop in targetsChain[0]) {
        props.push(prop);
    }
    return props;
};

const medianWithoutExtremes = function (results) {
    results.sort((a, b) => a - b);
    results.shift();
    results.pop();
    return results[Math.floor(results.length / 2)];
};

function runTests() {

    const results = [];
    const times = [];
    let acc = [];

    for (let j = 0; j < 10; ++j) {

        const now = Date.now();
        const its = 500000;

        for (let i = 0; i < its; ++i) {
//            acc = testSetCount(targets);
//            acc = testObjCount(targets);
              acc = testChain(targetsChain);
        }

        const delay = (Date.now() - now);
        const time = 1000 * (delay / its);

        results.push(its + " iterations concluded in " + delay + " ms: " + time + " us/it");
        times.push(time);
    }
    results.push("Median time: " + medianWithoutExtremes(results));

    results.push("Accumulated: " + acc.length);


    fluid.each(results, function (result) {
        document.querySelector(".results").append(
            Object.assign(document.createElement("li"), { textContent: result })
        );
    });
}




