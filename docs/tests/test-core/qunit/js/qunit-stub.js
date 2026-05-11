/* global QUnit */

"use strict";

// Stub version of QUnit that simply assembles all tests in a global structure and provides stubs for the few methods
// which are used in our visual tests

// noinspection ES6ConvertVarToLetConst
var StubQUnit = {
    allTests: []
};

if (typeof(QUnit) === "undefined") {
    window.QUnit = {};
} else {
    fluid.oldQUnitTest = QUnit.test;
}

QUnit.test = function (testName, testFunc) {
    StubQUnit.allTests.push({testName, testText: testFunc.toString()});
    if (fluid.oldQUnitTest) {
        fluid.oldQUnitTest(testName, testFunc);
    }
};

// Equiv implementation cribbed from QUnit 2.x

const BOXABLE_TYPES = new Set(["boolean", "number", "string"]);

// Memory for previously seen containers (object, array, map, set).
// Used for recursion detection, and to avoid repeated comparison.
//
// Elements are { a: val, b: val }.
let memory = [];

const useStrictEquality = function (a, b) {
    return a === b;
};

const useObjectValueEquality = function (a, b) {
    return a === b || a.valueOf() === b.valueOf();
};

const compareConstructors = function (a, b) {
    // Comparing constructors is more strict than using `instanceof`
    return getConstructor(a) === getConstructor(b);
};

const getConstructor = function (obj) {
    const proto = Object.getPrototypeOf(obj);

    // If the obj prototype descends from a null constructor, treat it
    // as a null prototype.
    // Ref https://github.com/qunitjs/qunit/issues/851
    //
    // Allow objects with no prototype, from Object.create(null), to be equivalent to
    // plain objects that have Object as their constructor.
    return !proto || proto.constructor === null ? Object : obj.constructor;
};

const getRegExpFlags = function (regexp) {
    return "flags" in regexp ? regexp.flags : regexp.toString().match(/[gimuy]*$/)[0];
};

const objectType = function (obj) {
    if (typeof obj === "undefined") {
        return "undefined";
    }

    // Consider: typeof null === object
    if (obj === null) {
        return "null";
    }
    const match = toString.call(obj).match(/^\[object\s(.*)\]$/);
    const type = match && match[1];
    switch (type) {
    case "Number":
        if (isNaN(obj)) {
            return "nan";
        }
        return "number";
    case "String":
    case "Boolean":
    case "Array":
    case "Set":
    case "Map":
    case "Date":
    case "RegExp":
    case "Function":
    case "Symbol":
        return type.toLowerCase();
    default:
        return typeof(obj);
    }
};

// Specialised comparisons after entryTypeCallbacks.object, based on `objectType()`
const objTypeCallbacks = {
    undefined: useStrictEquality,
    null: useStrictEquality,
    // Handle boxed boolean
    boolean: useObjectValueEquality,
    number: function number(a, b) {
        // Handle NaN and boxed number
        return a === b || a.valueOf() === b.valueOf() || isNaN(a.valueOf()) && isNaN(b.valueOf());
    },
    // Handle boxed string
    string: useObjectValueEquality,
    symbol: useStrictEquality,
    date: useObjectValueEquality,
    nan: function nan() {
        return true;
    },
    regexp: function regexp(a, b) {
        return a.source === b.source &&
            // Include flags in the comparison
            getRegExpFlags(a) === getRegExpFlags(b);
    },
    // identical reference only
    function: useStrictEquality,
    array: function array(a, b) {
        if (a.length !== b.length) {
            // Safe and faster
            return false;
        }
        for (let i = 0; i < a.length; i++) {
            if (!typeEquiv(a[i], b[i])) {
                return false;
            }
        }
        return true;
    },
    // Define sets a and b to be equivalent if for each element aVal in a, there
    // is some element bVal in b such that aVal and bVal are equivalent. Element
    // repetitions are not counted, so these are equivalent:
    // a = new Set( [ X={}, Y=[], Y ] );
    // b = new Set( [ Y, X, X ] );
    set: function set(a, b) {
        if (a.size !== b.size) {
            // This optimization has certain quirks because of the lack of
            // repetition counting. For instance, adding the same
            // (reference-identical) element to two equivalent sets can
            // make them non-equivalent.
            return false;
        }
        let outerEq = true;
        a.forEach(function (aVal) {
            // Short-circuit if the result is already known. (Using for...of
            // with a break clause would be cleaner here, but it would cause
            // a syntax error on older JavaScript implementations even if
            // Set is unused)
            if (!outerEq) {
                return;
            }
            let innerEq = false;
            b.forEach(function (bVal) {
                // Likewise, short-circuit if the result is already known
                if (innerEq) {
                    return;
                }

                // Swap out the global memory, as nested typeEquiv() would clobber it
                const originalMemory = memory;
                memory = [];
                if (typeEquiv(bVal, aVal)) {
                    innerEq = true;
                }
                // Restore
                memory = originalMemory;
            });
            if (!innerEq) {
                outerEq = false;
            }
        });
        return outerEq;
    },
    // Define maps a and b to be equivalent if for each key-value pair (aKey, aVal)
    // in a, there is some key-value pair (bKey, bVal) in b such that
    // [ aKey, aVal ] and [ bKey, bVal ] are equivalent. Key repetitions are not
    // counted, so these are equivalent:
    // a = new Map( [ [ {}, 1 ], [ {}, 1 ], [ [], 1 ] ] );
    // b = new Map( [ [ {}, 1 ], [ [], 1 ], [ [], 1 ] ] );
    map: function map(a, b) {
        if (a.size !== b.size) {
            // This optimization has certain quirks because of the lack of
            // repetition counting. For instance, adding the same
            // (reference-identical) key-value pair to two equivalent maps
            // can make them non-equivalent.
            return false;
        }
        let outerEq = true;
        a.forEach(function (aVal, aKey) {
            // Short-circuit if the result is already known. (Using for...of
            // with a break clause would be cleaner here, but it would cause
            // a syntax error on older JavaScript implementations even if
            // Map is unused)
            if (!outerEq) {
                return;
            }
            let innerEq = false;
            b.forEach(function (bVal, bKey) {
                // Likewise, short-circuit if the result is already known
                if (innerEq) {
                    return;
                }

                // Swap out the global memory, as nested typeEquiv() would clobber it
                const originalMemory = memory;
                memory = [];
                if (objTypeCallbacks.array([bVal, bKey], [aVal, aKey])) {
                    innerEq = true;
                }
                // Restore
                memory = originalMemory;
            });
            if (!innerEq) {
                outerEq = false;
            }
        });
        return outerEq;
    }
};

// Entry points from typeEquiv, based on `typeof`
const entryTypeCallbacks = {
    undefined: useStrictEquality,
    null: useStrictEquality,
    boolean: useStrictEquality,
    number: function number(a, b) {
        // Handle NaN
        return a === b || isNaN(a) && isNaN(b);
    },
    string: useStrictEquality,
    symbol: useStrictEquality,
    function: useStrictEquality,
    object: function object(a, b) {
        // Handle memory (skip recursion)
        if (memory.some(function (pair) {
            return pair.a === a && pair.b === b;
        })) {
            return true;
        }
        memory.push({
            a: a,
            b: b
        });
        const aObjType = objectType(a);
        const bObjType = objectType(b);
        if (aObjType !== "object" || bObjType !== "object") {
            // Handle literal `null`
            // Handle: Array, Map/Set, Date, Regxp/Function, boxed primitives
            return aObjType === bObjType && objTypeCallbacks[aObjType](a, b);
        }

        // NOTE: Literal null must not make it here as it would throw
        if (compareConstructors(a, b) === false) {
            return false;
        }
        const aProperties = [];
        const bProperties = [];

        // Be strict and go deep, no filtering with hasOwnProperty.
        for (const i in a) {
            // Collect a"s properties
            aProperties.push(i);

            // Skip OOP methods that look the same
            if (a.constructor !== Object && typeof a.constructor !== "undefined" && typeof a[i] === "function" && typeof b[i] === "function" && a[i].toString() === b[i].toString()) {
                continue;
            }
            if (!StubQUnit.typeEquiv(a[i], b[i])) {
                return false;
            }
        }
        for (const _i in b) {
            // Collect b"s properties
            bProperties.push(_i);
        }
        return objTypeCallbacks.array(aProperties.sort(), bProperties.sort());
    }
};

const typeEquiv = function (a, b) {
    // Optimization: Only perform type-specific comparison when pairs are not strictly equal.
    if (a === b) {
        return true;
    }
    const aType = typeof(a);
    const bType = typeof(b);
    if (aType !== bType) {
        // Support comparing primitive to boxed primitives
        // Try again after possibly unwrapping one
        return (aType === "object" && BOXABLE_TYPES.has(objectType(a)) ? a.valueOf() : a) === (bType === "object" && BOXABLE_TYPES.has(objectType(b)) ? b.valueOf() : b);
    }
    return entryTypeCallbacks[aType](a, b);
};

const innerEquiv = function (a, b) {
    const res = typeEquiv(a, b);
    // Release any retained objects and reset recursion detection for next call
    memory = [];
    return res;
};

/**
 * Test any two types of JavaScript values for equality.
 *
 * @author Philippe Rathé <prathe@gmail.com>
 * @author David Chan <david@troi.org>
 */

StubQUnit.equiv = function (a, b) {
    return a === b || innerEquiv(a, b);
};

StubQUnit.makeAssert = function (callback) {
    return {
        ok() {},
        notOk() {},

        equal(actual, expected, message) {
            const pass = actual === expected;
            callback(pass, actual, expected, message);
        },
        notEqual() {},
        strictEqual() {},
        notStrictEqual() {},
        nearEqual(actual, expected, message) {
            const pass = fluid.defaultEquality(actual, expected);
            callback(pass, actual, expected, message);
        },
        deepEqual(actual, expected, message) {
            const pass = StubQUnit.equiv(actual, expected);
            callback(pass, actual, expected, message);
        },
        notDeepEqual() {},
        propEqual() {},
        notPropEqual() {},

        throws() {},
        rejects() {},
        doesNotThrow() {},


        pushResult() {},

        expect() {}
    };
};
