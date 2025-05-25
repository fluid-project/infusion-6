"use strict";


const parseTemplate = function (textSignal) {

    const parsedSignal = fluid.computed(rawText => {
        const tree = fluid.parseHTMLToTree(rawText, {fragment: true, skipWhitespace: true});
        return tree;

    }, textSignal);

    fluid.catch(parsedSignal, error => console.log("Error fetching text: ", error.causes));

    fluid.effect(tree => {
        console.log(tree);
    }, parsedSignal);
};

//const appSignal = fluid.fetchText("../../../../demo/todo-list-sfc/sfc/todo-app.vue");
//parseTokens(appSignal);

const listSignal = fluid.fetchText("../../../../demo/todo-list-sfc/sfc/todo-list.vue");
parseTemplate(listSignal);
