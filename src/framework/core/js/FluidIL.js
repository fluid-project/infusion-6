"use strict";

// Listed in dependence order
fluid.frameworkGrades = ["fluid.component", "fluid.modelComponent", "fluid.viewComponent", "fluid.rendererComponent"];

fluid.filterBuiltinGrades = function (gradeNames) {
    return fluid.remove_if(fluid.makeArray(gradeNames), function (gradeName) {
        return fluid.frameworkGrades.indexOf(gradeName) !== -1;
    });
};

fluid.dumpGradeNames = function (that) {
    return that.options && that.options.gradeNames ?
        " gradeNames: " + JSON.stringify(fluid.filterBuiltinGrades(that.options.gradeNames)) : "";
};

fluid.dumpThat = function (that) {
    return "{ typeName: \"" + that.typeName + " id: " + that.id + "\"" + fluid.dumpGradeNames(that) + "}";
};

fluid.dumpThatStack = function (thatStack, instantiator) {
    const togo = fluid.transform(thatStack, function (that) {
        const path = instantiator.idToPath(that.id);
        return fluid.dumpThat(that) + (path ? (" - path: " + path) : "");
    });
    return togo.join("\n");
};

fluid.dumpComponentPath = function (that) {
    const path = fluid.pathForComponent(that);
    return path ? fluid.pathUtil.composeSegments.apply(null, path) : "** no path registered for component **";
};

fluid.dumpComponentAndPath = function (that) {
    return "component " + fluid.dumpThat(that) + " at path " + fluid.dumpComponentPath(that);
};
