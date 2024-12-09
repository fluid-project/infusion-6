"use strict";

fluid.escapeSegment = function (toescape) {
    let togo = "";
    toescape = toescape.toString();
    for (let i = 0; i < toescape.length; ++i) {
        const c = toescape.charAt(i);
        if (c === "." || c === "\\" || c === "}") {
            togo += "\\";
        }
        togo += c;
    }
    return togo;
};

fluid.escapeSegmentRS = function (toescape) {
    return toescape.toString().replace(/[.\\}]/g, "\\$&");
};

const targets = fluid.iota(10).map(i => `{context${i}}`);

const testByChar = function () {
    return targets.map(fluid.escapeSegment);
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

    for (let j = 0; j < 10; ++j) {

        const now = Date.now();
        const its = 200000;

        for (let i = 0; i < its; ++i) {
            testByChar();
        }

        const delay = (Date.now() - now);
        const time = 1000 * (delay / its);

        results.push(its + " iterations concluded in " + delay + " ms: " + time + " us/it");
        times.push(time);
    }
    results.push("Median time: " + fluid.round(medianWithoutExtremes(times), 2) + " us/it");

    fluid.each(results, function (result) {
        document.querySelector(".results").append(
            Object.assign(document.createElement("li"), { textContent: result })
        );
    });
}
