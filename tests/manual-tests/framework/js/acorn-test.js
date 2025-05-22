"use strict";

/* global acorn */

const textSignal = fluid.fetchText("../../../demo/todo-list-sfc/sfc/todo-app.vue");

const parsedSignal = fluid.computed( text => {
    const parsed = acorn.loose.LooseParser.parse(text);

    return {tree: parsed};
}, textSignal);

fluid.catch(parsedSignal, error => console.log(error.causes));

fluid.effect( parsed => console.log(parsed.tree), parsedSignal);
