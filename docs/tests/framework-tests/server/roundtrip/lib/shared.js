"use strict";

// Referred to by two SFCs by different relative paths - it should run once in a page, whether booted or hydrated
fluid.registerNamespace("fluid.tests.rt");
fluid.tests.rt.sharedRuns = (fluid.tests.rt.sharedRuns || 0) + 1;
fluid.tests.rt.title = "Round trip";
