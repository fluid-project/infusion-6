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
  - Assume an eslint environment, and begin all node.js files with
```
   /* eslint-env node */
   "use strict";
```

## Testing instructions
 - Run tests/framework-tests/core/html/*.html in the browser
