/*
Copyright The Infusion copyright holders
See the AUTHORS.md file at the top-level directory of this distribution and at
https://github.com/fluid-project/infusion/raw/main/AUTHORS.md.

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/main/Infusion-LICENSE.txt
*/

"use strict";

// An in-page agent which interprets the locators and expectations of a JSON demo script such as
// demo/compose-edit/demo-script.json. It depends only on the DOM, and not on Fluid or on any particular driver - a
// driver need only evaluate its functions in the page and deliver native input at the coordinates it reports.

/**
 * @typedef {Object} Locator
 * @property {String} selector - A CSS selector matching candidate elements
 * @property {Locator} [within] - A locator for an element within which candidates are sought, otherwise the document
 * @property {String} [text] - Candidates must have text content containing this string
 * @property {String} [exactText] - Candidates must have text content, with whitespace trimmed, equal to this string
 * @property {Number} [index] - Select the candidate at this index amongst those matching
 * @property {Boolean} [last] - Select the last candidate amongst those matching
 */

/**
 * @typedef {Object} Expectation
 * @property {String} [description] - A human-readable description of the expectation
 * @property {Locator} target - Locator for the elements the expectation is concerned with
 * @property {Object} [count] - Holding one of `equals`, `atLeast` or `increase`, constraining the number of matching
 * elements - `increase` is relative to the count measured before the step's action
 * @property {Object} [text] - Holding `equals`, a String, and/or `contains` and `notContains`, a String or String[],
 * constraining the text of the first matching element
 * @property {Boolean} [visible] - Whether the first matching element should be visible - a missing element is not
 * @property {String} [distinctStyle] - A CSS property whose computed value should differ amongst all matching elements
 * @property {Locator} [covers] - Locator for an element whose bounds the first matching element should coincide with
 * @property {Number} [tolerance] - The tolerance in pixels for `covers` - defaults to 2
 * @property {Object} [matchesStyle] - Holding a CSS `property` and a `target` locator - the computed value of the
 * property for the first matching element should equal its value for the element matched by `target`
 */

const fluidDemoAgent = {};

/**
 * Render a locator as a readable string for use in messages.
 * @param {Locator} locator - The locator to describe
 * @return {String} A description of the locator
 */
fluidDemoAgent.describe = function (locator) {
    const parts = [locator.selector];
    if (locator.text !== undefined) {
        parts.push(`containing "${locator.text}"`);
    }
    if (locator.exactText !== undefined) {
        parts.push(`with text "${locator.exactText}"`);
    }
    if (locator.index !== undefined) {
        parts.push(`at index ${locator.index}`);
    }
    if (locator.last) {
        parts.push("(last)");
    }
    if (locator.within) {
        parts.push(`within [${fluidDemoAgent.describe(locator.within)}]`);
    }
    return parts.join(" ");
};

/**
 * Find the CodeMirror 5 instance associated with an element, if any - either the element lies within a CodeMirror's
 * DOM, or contains one.
 * @param {Element} element - The element to search from
 * @return {Object|null} The CodeMirror instance, or `null` if there is none
 */
fluidDemoAgent.codeMirrorFor = function (element) {
    const cmElement = element.closest(".CodeMirror") || element.querySelector(".CodeMirror");
    return cmElement ? cmElement.CodeMirror : null;
};

/**
 * Read the text of an element with runs of whitespace collapsed. The text of a CodeMirror is read from its document,
 * since only the lines within its viewport are rendered.
 * @param {Element} element - The element whose text is to be read
 * @return {String} The element's text
 */
fluidDemoAgent.textOf = function (element) {
    const cm = fluidDemoAgent.codeMirrorFor(element);
    const text = cm ? cm.getValue() : element.textContent;
    return text.replace(/\s+/g, " ").trim();
};

/**
 * Find all elements matching a locator.
 * @param {Locator} locator - The locator to be resolved
 * @return {Element[]} The matching elements, in document order
 */
fluidDemoAgent.locateAll = function (locator) {
    const parents = locator.within ? fluidDemoAgent.locateAll(locator.within) : [document];
    const candidates = parents.flatMap(parent => [...parent.querySelectorAll(locator.selector)]);
    const matching = candidates.filter(element => {
        const text = fluidDemoAgent.textOf(element);
        return (locator.text === undefined || text.includes(locator.text))
            && (locator.exactText === undefined || text === locator.exactText);
    });
    let selected;
    if (locator.index !== undefined) {
        selected = matching.slice(locator.index, locator.index + 1);
    } else if (locator.last) {
        selected = matching.slice(-1);
    } else {
        selected = matching;
    }
    return selected;
};

/**
 * Find the single element matching a locator, which must match exactly one element.
 * @param {Locator} locator - The locator to be resolved
 * @return {Element} The matching element
 */
fluidDemoAgent.locate = function (locator) {
    const elements = fluidDemoAgent.locateAll(locator);
    if (elements.length !== 1) {
        throw new Error(`Locator [${fluidDemoAgent.describe(locator)}] matched ${elements.length} elements rather than 1`);
    }
    return elements[0];
};

/**
 * Determine whether an element is rendered visibly, i.e. has a non-empty layout box and is not hidden by style.
 * @param {Element} element - The element to test
 * @return {Boolean} `true` if the element is visible
 */
fluidDemoAgent.isVisible = function (element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
};

/**
 * Find a text node beneath an element containing a string, together with the offset of the string within it.
 * @param {Element} element - The element to search within
 * @param {String} find - The string to search for, which must lie within a single text node
 * @return {Object} A record holding the text `node` and the `offset` of the string within it
 */
fluidDemoAgent.findTextNode = function (element, find) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let found = null;
    while (!found && walker.nextNode()) {
        const offset = walker.currentNode.nodeValue.indexOf(find);
        if (offset !== -1) {
            found = {node: walker.currentNode, offset};
        }
    }
    if (!found) {
        throw new Error(`Could not find text "${find}" within a single text node of ${element.tagName}`);
    }
    return found;
};

/**
 * Compute the minimal edit transforming one string into another, as the lengths of their common prefix and suffix.
 * @param {String} find - The original string
 * @param {String} replace - The replacement string
 * @return {Object} A record holding `prefix` - the length of the common prefix, `remove` - the text of the original
 * to be removed after the prefix, and `insert` - the text to be inserted in its place
 */
fluidDemoAgent.minimalEdit = function (find, replace) {
    const limit = Math.min(find.length, replace.length);
    let prefix = 0;
    while (prefix < limit && find[prefix] === replace[prefix]) {
        ++prefix;
    }
    let suffix = 0;
    while (suffix < limit - prefix && find[find.length - 1 - suffix] === replace[replace.length - 1 - suffix]) {
        ++suffix;
    }
    return {
        prefix,
        remove: find.slice(prefix, find.length - suffix),
        insert: replace.slice(prefix, replace.length - suffix)
    };
};

/**
 * Compute the point in viewport coordinates at which a driver should deliver a pointer event to the element matched
 * by a locator, scrolling it into view only if it is not already in view, as a user would. If `find` is supplied, the
 * point lies over that text within the element.
 * The point is hit-tested, so that the driver can report a pointer event which would be intercepted by some other
 * element, as it would be for a real user.
 * @param {Locator} locator - The locator for the target element
 * @param {String} [find] - Text within the element over which the point should lie
 * @return {Object} A record holding `x` and `y` coordinates, `hit` - whether the target receives events at that
 * point, and `hitDescription` describing the element which does
 */
fluidDemoAgent.pointFor = function (locator, find) {
    const element = fluidDemoAgent.locate(locator);
    const cm = fluidDemoAgent.codeMirrorFor(element);
    let rect;
    if (find === undefined) {
        element.scrollIntoView({block: "nearest", inline: "nearest"});
        rect = element.getBoundingClientRect();
    } else if (cm) {
        const index = cm.getValue().indexOf(find);
        if (index === -1) {
            throw new Error(`Could not find text "${find}" within CodeMirror`);
        }
        const from = cm.posFromIndex(index), to = cm.posFromIndex(index + find.length);
        cm.scrollIntoView({from, to}, 50);
        const start = cm.charCoords(from, "window"), end = cm.charCoords(to, "window");
        rect = {left: start.left, top: start.top, width: end.left - start.left, height: start.bottom - start.top};
    } else {
        const {node, offset} = fluidDemoAgent.findTextNode(element, find);
        node.parentElement.scrollIntoView({block: "nearest", inline: "nearest"});
        const range = document.createRange();
        range.setStart(node, offset);
        range.setEnd(node, offset + find.length);
        rect = range.getBoundingClientRect();
    }
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const hitElement = document.elementFromPoint(x, y);
    return {
        x, y,
        hit: !!hitElement && (hitElement === element || element.contains(hitElement)),
        hitDescription: hitElement ? `${hitElement.tagName}.${[...hitElement.classList].join(".")}` : "nothing"
    };
};

/**
 * Select the part of some text within an element which must be replaced in order to transform it into a replacement,
 * as computed by `minimalEdit`, so that a driver can complete the edit by typing the inserted text, or by pressing
 * Backspace if there is none. The element should already have been focused, e.g. by a click at `pointFor`.
 * @param {Locator} locator - The locator for the element holding the text, either a contenteditable element or a
 * CodeMirror
 * @param {String} find - The original text
 * @param {String} replace - The replacement text
 * @return {Object} The minimal edit, holding `prefix`, `remove` and `insert`
 */
fluidDemoAgent.selectForEdit = function (locator, find, replace) {
    const element = fluidDemoAgent.locate(locator);
    const cm = fluidDemoAgent.codeMirrorFor(element);
    const edit = fluidDemoAgent.minimalEdit(find, replace);
    if (cm) {
        const index = cm.getValue().indexOf(find) + edit.prefix;
        cm.focus();
        cm.setSelection(cm.posFromIndex(index), cm.posFromIndex(index + edit.remove.length));
    } else {
        const {node, offset} = fluidDemoAgent.findTextNode(element, find);
        const range = document.createRange();
        range.setStart(node, offset + edit.prefix);
        range.setEnd(node, offset + edit.prefix + edit.remove.length);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }
    return edit;
};

/**
 * Measure the element counts of each expectation's target before a step's action, as a baseline for `increase`.
 * @param {Expectation[]} expectations - The step's expectations
 * @return {Number[]} The count of elements matched by each expectation's target
 */
fluidDemoAgent.measure = function (expectations) {
    return expectations.map(expectation => fluidDemoAgent.locateAll(expectation.target).length);
};

/**
 * Evaluate a single expectation against the current state of the document.
 * @param {Expectation} expectation - The expectation to evaluate
 * @param {Number} baseline - The count of the expectation's target measured before the step's action
 * @return {String[]} Messages describing each way in which the expectation failed - empty if it passed
 */
fluidDemoAgent.checkOne = function (expectation, baseline) {
    const failures = [];
    const elements = fluidDemoAgent.locateAll(expectation.target);
    const first = elements[0];
    const count = expectation.count;
    if (count) {
        if (count.equals !== undefined && elements.length !== count.equals) {
            failures.push(`expected ${count.equals} elements, found ${elements.length}`);
        }
        if (count.atLeast !== undefined && elements.length < count.atLeast) {
            failures.push(`expected at least ${count.atLeast} elements, found ${elements.length}`);
        }
        if (count.increase !== undefined && elements.length !== baseline + count.increase) {
            failures.push(`expected count to increase by ${count.increase} from ${baseline}, found ${elements.length}`);
        }
    }
    if (expectation.text) {
        if (first) {
            const text = fluidDemoAgent.textOf(first);
            if (expectation.text.equals !== undefined && text !== expectation.text.equals) {
                failures.push(`expected text to equal "${expectation.text.equals}", was "${text.slice(0, 200)}"`);
            }
            [].concat(expectation.text.contains ?? []).forEach(sought => {
                if (!text.includes(sought)) {
                    failures.push(`expected text to contain "${sought}", was "${text.slice(0, 200)}"`);
                }
            });
            [].concat(expectation.text.notContains ?? []).forEach(sought => {
                if (text.includes(sought)) {
                    failures.push(`expected text not to contain "${sought}"`);
                }
            });
        } else {
            failures.push("expected an element whose text could be checked, found none");
        }
    }
    if (expectation.visible !== undefined) {
        const visible = !!first && fluidDemoAgent.isVisible(first);
        if (visible !== expectation.visible) {
            failures.push(`expected element to be ${expectation.visible ? "visible" : "invisible"}`);
        }
    }
    if (expectation.covers) {
        if (first) {
            const rect = first.getBoundingClientRect();
            const coveredRect = fluidDemoAgent.locate(expectation.covers).getBoundingClientRect();
            const tolerance = expectation.tolerance ?? 2;
            const sides = ["left", "top", "width", "height"];
            const mismatched = sides.filter(side => Math.abs(rect[side] - coveredRect[side]) > tolerance);
            if (mismatched.length > 0) {
                const render = r => sides.map(side => Math.round(r[side])).join(", ");
                failures.push(`expected bounds to coincide with [${fluidDemoAgent.describe(expectation.covers)}] at (${render(coveredRect)}), were (${render(rect)})`);
            }
        } else {
            failures.push("expected an element whose bounds could be checked, found none");
        }
    }
    if (expectation.matchesStyle) {
        if (first) {
            const property = expectation.matchesStyle.property;
            const value = getComputedStyle(first)[property];
            const expected = getComputedStyle(fluidDemoAgent.locate(expectation.matchesStyle.target))[property];
            if (value !== expected) {
                failures.push(`expected ${property} to be ${expected}, was ${value}`);
            }
        } else {
            failures.push("expected an element whose style could be checked, found none");
        }
    }
    if (expectation.distinctStyle) {
        const values = elements.map(element => getComputedStyle(element)[expectation.distinctStyle]);
        const distinct = new Set(values).size;
        if (distinct !== values.length) {
            failures.push(`expected ${values.length} distinct values of ${expectation.distinctStyle}, found ${distinct}`);
        }
    }
    return failures;
};

/**
 * Evaluate a step's expectations against the current state of the document.
 * @param {Expectation[]} expectations - The expectations to evaluate
 * @param {Number[]} [baselines] - The counts measured by `measure` before the step's action
 * @return {Object} A record holding `passed` - whether all expectations passed, and `results` - one record per
 * expectation, holding its `description`, the `target` described, and its `failures`
 */
fluidDemoAgent.check = function (expectations, baselines) {
    const results = expectations.map((expectation, i) => {
        let failures;
        try {
            failures = fluidDemoAgent.checkOne(expectation, baselines ? baselines[i] : 0);
        } catch (error) {
            failures = [`error evaluating expectation: ${error.message}`];
        }
        return {
            description: expectation.description,
            target: fluidDemoAgent.describe(expectation.target),
            failures
        };
    });
    return {
        passed: results.every(result => result.failures.length === 0),
        results
    };
};

window.fluidDemoAgent = fluidDemoAgent;
