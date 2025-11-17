/*!
Infusion Module System

Copyright The Infusion copyright holders
See the AUTHORS.md file at the top-level directory of this distribution and at
https://github.com/fluid-project/infusion/raw/main/AUTHORS.md.

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/main/Infusion-LICENSE.txt
*/

/* eslint-env node */
/* eslint strict: ["error", "global"] */

"use strict";

// An extremely simple base for the module system that just has the functionality of
// tracking base directories for loaded modules, and the ability to interpolate paths
// of the form %module/further-path

fluid.registerNamespace("fluid.module");

// A mapping of module name to a structure containing elements
//    path {String} The slash-terminated filesystem or URL path of the base directory of the module

fluid.module.modules = {};

/* Canonicalise a path by replacing all backslashes with forward slashes,
 * (such paths are always valid when supplied to Windows APIs) - except for any initial
 * "\\" beginning a UNC path - since this will defeat the simpleminded "// -> /" normalisation which is done in
 * fluid.module.resolvePath, kettle.dataSource.file.handle and similar locations.
 * JavaScript regexes don't support lookbehind assertions, so this is a reasonable strategy to achieve this.
 */
fluid.module.canonPath = function (path) {
    return path.replace(/\\/g, "/").replace(/^\/\//, "\\\\");
};

/*
 * A module which has just loaded will call this API to register itself into
 * the Fluid module loader's records. The call will generally take the form:
 * <code>fluid.module.register("my-module", __dirname, require)</code>
 */
fluid.module.register = function (name, path) {
    fluid.log(fluid.logLevel.WARN, "Registering module " + name + " from path " + path);
    fluid.module.modules[name] = {
        path: fluid.module.canonPath(path)
    };
};


/**
 * Resolve a path expression which may begin with a module reference of the form,
 * say, %moduleName, into an absolute path relative to that module, using the
 * database of base directories registered previously with fluid.module.register.
 * If the path does not begin with such a module reference, it is returned unchanged.
 */

fluid.module.resolvePath = function (path) {
    const terms = fluid.getMembers(fluid.module.modules, "path");
    return fluid.percStringTemplate(path, terms).replace("//", "/");
};
