"use strict";

// Referred to by both the parent and child SFCs, by different relative paths - it should be executed once
fluid.registerNamespace("fluid.tests.sfcImport");
fluid.tests.sfcImport.sharedRuns = (fluid.tests.sfcImport.sharedRuns || 0) + 1;
fluid.tests.sfcImport.sharedValue = "shared";
