## Code style

 - Plain JavaScript with JSDocs
 - All strings double-quoted
 - No one-line if or else blocks - e.g. always use
```
   if (condition) {
   ...
   } else {
   ...
   }
```
  - Do not return early from functions, use long if instead.
  - If possible, first branch of if statement condition should not be negated.
  - JSDocs using @return, with capitalised built-ins, e.g. String, Number, Any, with [] for array syntax
  - Do not use Void return type
  - Assume an eslint environment, and begin all node.js files with
```
   /* eslint-env node */
   "use strict";
```

## Testing instructions
 - Run npm test in node to run virtually all view tests
 - A couple of view-specific tests (e.g. verifying that CSS rules have applied) require manual test running by running
tests/framework-tests/core/html/*.html in the browser
 - Run, e.g. node tests/test-core/qunit/js/fqunit-cli.js tests/framework-tests/core/html/FluidILTests.html to run a single test file

## Code workflow
 - Agents do not commit code, all updates reviewed by humans
 - Don't issue commands changing git state

## Commit messages
 - Mention issue closed in form fluid-project/infusion-6#3 - this will be passed on as remin
