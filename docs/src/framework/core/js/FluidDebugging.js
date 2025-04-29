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

/** Render a timestamp from a Date object into a helpful fixed format for debug logs to millisecond accuracy
 * @param {Date} date - The date to be rendered
 * @return {String} - A string format consisting of hours:minutes:seconds.millis for the datestamp padded to fixed with
 */

fluid.renderTimestamp = function (date) {
    const zeropad = function (num, width) {
        if (!width) {
            width = 2;
        }
        const numstr = (num === undefined ? "" : num.toString());
        return "00000".substring(5 - width + numstr.length) + numstr;
    };
    return zeropad(date.getHours()) + ":" + zeropad(date.getMinutes()) + ":" + zeropad(date.getSeconds()) + "." + zeropad(date.getMilliseconds(), 3);
};


fluid.obtainException = function () {
    return new Error("Trace exception");
};

fluid.registerNamespace("fluid.exceptionDecoders");

fluid.decodeStack = function () {
    const e = fluid.obtainException();
    return fluid.exceptionDecoders.standard(e);
};

fluid.exceptionDecoders.standard = function (e) {
    const delimiter = "at ";
    const lines = e.stack.replace(/(?:\n@:0)?\s+$/m, "").replace(/^\(/gm, "{anonymous}(").split("\n");
    return fluid.transform(lines, function (line) {
        line = line.replace(/\)/g, "");
        const atind = line.indexOf(delimiter);
        return atind === -1 ? [line] : [line.substring(atind + delimiter.length), line.substring(0, atind)];
    });
};

// Main entry point for callers.
fluid.getCallerInfo = function (atDepth) {
    atDepth = (atDepth || 3);
    const stack = fluid.decodeStack();
    const element = stack && stack[atDepth] && stack[atDepth][0]; // TODO: Last guard is necessary on Safari, see FLUID-6482
    if (element) {
        let lastslash = element.lastIndexOf("/");
        if (lastslash === -1) {
            lastslash = 0;
        }
        const nextColon = element.indexOf(":", lastslash);
        return {
            path: element.substring(0, lastslash),
            filename: element.substring(lastslash + 1, nextColon),
            index: element.substring(nextColon + 1)
        };
    } else {
        return null;
    }
};