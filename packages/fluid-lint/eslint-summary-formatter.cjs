/* eslint-env node */
"use strict";

// A formatter for ESLint: ESLint's own "stylish" report of the problems found, followed by a count of the files linted
// free of problems, e.g. "312/312 files lint free". Infusion's `npm run lint` uses it, and any project linting with
// ESLint 8 or later may, as `eslint --format ./node_modules/fluid-lint/eslint-summary-formatter.cjs ...` - it uses the
// project's own ESLint. CommonJS, since ESLint loads a formatter by `require`

const {ESLint} = require("eslint");

/**
 * Format the results of linting - ESLint's "stylish" report, and a count of the files with no errors or warnings
 * @param {Object[]} results - ESLint's result for each file linted
 * @return {Promise<String>} The report
 */
module.exports = async function (results) {
    const stylish = await new ESLint().loadFormatter("stylish");
    const report = await stylish.format(results);
    const clean = results.filter(result => result.errorCount + result.warningCount === 0).length;
    return (report ? report + "\n" : "") + clean + "/" + results.length + " files lint free";
};
