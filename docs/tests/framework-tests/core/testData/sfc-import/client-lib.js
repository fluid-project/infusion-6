"use strict";

// Payload for the browser alone, referred to with fluid-client - it is evaluated in a real browser, but not by a host
// mocking one, such as the node test runner
window.fluidTestsClientLibRuns = (window.fluidTestsClientLibRuns || 0) + 1;
