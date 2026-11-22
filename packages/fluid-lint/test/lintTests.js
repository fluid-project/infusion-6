/* eslint-env node */
// Tests of fluid-lint's linting of JavaScript, fragments of layer records and SFCs - run with: npm test, in this package.
// Each kind of malformation is checked for a diagnostic of the right severity, covering the right text, with a message
// naming what is wrong, and each correct style of writing is checked to lint clean. Texts holding several
// malformations are checked to report each, rather than only the first or a cascade of errors following it.

import {lint, isFragment} from "../src/fluidLint.js";

let passed = 0;
const failures = [];

/**
 * Assert a condition
 * @param {Boolean} condition - The condition
 * @param {String} message - What it asserts
 */
const expect = function (condition, message) {
    if (condition) {
        ++passed;
    } else {
        failures.push(message);
    }
    console.log((condition ? "ok - " : "not ok - ") + message);
};

/**
 * Lint a text, and render its diagnostics briefly, as "severity text: message"
 * @param {String} text - The text
 * @param {String} [kind] - "js" or "vue"
 * @return {String[]} The diagnostics, rendered
 */
const linted = (text, kind) => lint(text, kind).map(d => d.severity + " " + JSON.stringify(text.slice(d.from, d.to)) + ": " + d.message);

/**
 * Assert that a text lints clean
 * @param {String} text - The text
 * @param {String} message - What it asserts
 * @param {String} [kind] - "js" or "vue"
 */
const clean = function (text, message, kind) {
    const found = linted(text, kind);
    expect(found.length === 0, message + (found.length ? " - got " + found.join("; ") : ""));
};

/**
 * Assert that a text has exactly the diagnostics expected, in order of position - each of a severity, covering some
 * text, with a message matching a pattern
 * @param {String} text - The text
 * @param {Array[]} expected - The diagnostics expected, each as [severity, covered, pattern]
 * @param {String} message - What it asserts
 * @param {String} [kind] - "js" or "vue"
 */
const reports = function (text, expected, message, kind) {
    const found = lint(text, kind);
    const ok = found.length === expected.length && expected.every(([severity, covered, pattern], i) =>
        found[i].severity === severity && text.slice(found[i].from, found[i].to) === covered && pattern.test(found[i].message));
    expect(ok, message + (ok ? "" : " - got " + linted(text, kind).join("; ")));
};

/**
 * Assert that a text has one diagnostic
 * @param {String} text - The text
 * @param {String} severity - The severity expected
 * @param {String} covered - The text it should cover
 * @param {RegExp} pattern - A pattern its message should match
 * @param {String} message - What it asserts
 * @param {String} [kind] - "js" or "vue"
 */
const flags = function (text, severity, covered, pattern, message, kind) {
    reports(text, [[severity, covered, pattern]], message, kind);
};

/**
 * Write a configuration String as the value of a member of a layer record
 * @param {String} value - The String's interior, as written in source
 * @return {String} The JavaScript of the record
 */
const member = value => `fluid.def("my.a", {v: "${value}"});`;

/**
 * Assert that a configuration String, held as a member, lints clean
 * @param {String} value - The String's interior, as written in source
 * @param {String} message - What it asserts
 */
const cleanValue = function (value, message) {
    clean(member(value), message + ": " + value);
};

/**
 * Assert that a configuration String, held as a member, has one error
 * @param {String} value - The String's interior, as written in source
 * @param {String} covered - The text the error should cover
 * @param {RegExp} pattern - A pattern its message should match
 * @param {String} message - What it asserts
 */
const flagsValue = function (value, covered, pattern, message) {
    flags(member(value), "error", covered, pattern, message + ": " + value);
};

// ---- Correct styles of configuration String ----

cleanValue("{self}", "A bare reference");
cleanValue("{self}.width", "A reference with a path");
cleanValue("{self}.entries.0.title", "A reference whose path holds a numeric segment");
cleanValue("{$parent}.selection", "A reference to $parent");
cleanValue("{$oldValue}", "A reference to $oldValue");
cleanValue("{my.app.panel}.title", "A reference by a dotted layer name");
cleanValue("{todoList}.todos", "A reference by nickname");
cleanValue("{0}", "A reference to an argument");
cleanValue("{0}:query", "A reference to an argument with a label");
cleanValue("{self my.widget}.title", "A reference with a descendant selector");
cleanValue("{self > my.widget}", "A reference with a child selector");
cleanValue("{self &my.widget}", "A reference with a selector of a layer");
cleanValue("{self #main}", "A reference with a selector of a member");
cleanValue("{self my-component}.x", "A reference whose context holds a hyphen");
cleanValue("$compute:my.multiply({self}.width, {self}.height)", "A compact $compute");
cleanValue("$compute:my.f()", "A compact $compute of no arguments");
cleanValue("$compute:my.f(3, -2.5, true, false)", "A compact $compute of numbers and booleans");
cleanValue("$compute:my.f(plain, words here)", "A compact $compute of bare arguments");
cleanValue("$compute:my.f( {self}.a ,  {self}.b )", "A compact $compute with spaces around its arguments");
cleanValue("$compute:{self}.format({self}.value)", "A compact $compute calling a reference");
cleanValue("$method:my.describe", "A bare compact $method");
cleanValue("$method:my.lookup({self}.entries, {0}:query, {1}:max)", "A compact $method of labelled arguments");
cleanValue("$effect:my.log({self}.count)", "A compact $effect");
cleanValue("\\\\{\\\"a\\\": 1}", "An escaped literal beginning with a brace");
cleanValue("\\\\$5.00", "An escaped literal beginning with $");
cleanValue("C:\\\\temp", "A literal holding a backslash");
cleanValue("Hello, world", "A plain literal");
cleanValue("", "An empty String");
cleanValue("100%", "A literal holding no rune");
clean(`fluid.def("my.a", {v: 'single {self}.quoted'});`, "A single-quoted literal");
clean("fluid.def(\"my.a\", {v: `{self}.width`});", "A reference written as a template literal");

// ---- Malformed references ----

flagsValue("{self", "", /Unclosed reference - expected "}"/, "An unclosed reference");
flagsValue("{}.a", "}", /Empty context/, "An empty context");
flagsValue("{self}.", "", /name of a member after "\."/, "A path ending in a dot");
flagsValue("{self}..a", ".", /name of a member after "\."/, "A path with an empty segment");
flagsValue("{self}a", "a", /After a reference's "}", expected "\." before a path/, "A path without its dot");
flagsValue("{0}:", "", /label after ":"/, "A label left empty");
flagsValue("{self >}.x", ">", /child combinator ">" must be followed by the name of a context/, "A selector ending in a combinator");
flagsValue("{self}.a {self}.b", " {self}.b", /Unexpected text after the end of the reference/, "Two references in one String");

// ---- Malformed compact records ----

flagsValue("$comptue:my.f()", "$comptue", /Unknown compact directive \$comptue - did you mean \$compute\?/, "A misspelt directive");
flagsValue("$lens:my.f()", "$lens", /Unknown compact directive \$lens/, "A directive which has no compact form");
flagsValue("$5.00", "$5.00", /write "\\\\\$" for a literal "\$"/, "A literal beginning with $");
flagsValue("$:my.f()", "$:my.f()", /write "\\\\\$" for a literal "\$"/, "A $ without a directive's name");
flagsValue("$compute my.f()", " m", /Expected ":" after \$compute/, "A directive without its colon");
flagsValue("$compute:", "", /Expected a function after "\$compute:"/, "A directive without its function");
flagsValue("$compute:1f()", "1", /the global name of a function/, "A function name beginning with a digit");
flagsValue("$effect:my.log", "my.log", /must list its arguments/, "A compact $effect without arguments");
flags(member("$compute:my.join({self}.a, \\\"x\\\")"), "warning", "\\\"x\\\"", /not unquoted/, "A quoted compact argument is warned of");

// ---- Malformed calls ----

flagsValue("$compute:my.f(", "", /Unclosed call - expected "\)"/, "A call left open");
flagsValue("$compute:my.f({self}.a", "", /Unclosed call - expected "\)"/, "A call left open after an argument");
flagsValue("$compute:my.f({self}.a,)", ")", /Empty argument/, "A trailing comma");
flagsValue("$compute:my.f(,{self}.a)", ",", /Empty argument/, "A leading comma");
flagsValue("$compute:my.f({self}.a {self}.b)", "{", /Expected "," between arguments/, "Arguments without a comma between them");
flagsValue("$compute:my.f({self.a)", ")", /Unclosed reference - expected "}"/, "An unclosed reference as an argument");
flagsValue("$compute:my.f())", ")", /Unexpected text after the end of the compact record/, "A surplus parenthesis");
flagsValue("$compute:my.f() + 1", " + 1", /Unexpected text after the end of the compact record/, "An expression after a call");

// ---- Templates ----

clean(`fluid.def("my.a", {
    $layers: "fluid.templateViewComponent",
    template: \`<li class="item" @if="!position.first">@{todo.text} @{{todoList}.count} @{my.format({self}.todo)} @{ name } @@{literal} 50% @ home</li>\`
});`, "A template of paths, references, calls, spaces, escapes and plain text lints clean");
clean(`fluid.def("my.a", {partialTemplate: "<p>@{title}</p>"});`, "A partialTemplate is read as a template");
clean(`fluid.def("my.a", {template: "{self}.markup"});`, "A template given as a reference lints clean");
clean(`fluid.def("my.a", {template: "$compute:my.render({self}.data)"});`, "A template given as a compact record lints clean");
flags(`fluid.def("my.a", {template: "<p>@{name</p>"});`, "error", "<", /Unclosed interpolation - expected "}" to close "@\{"/,
    "An unclosed interpolation");
flags(`fluid.def("my.a", {template: "<p>@{}</p>"});`, "error", "}", /Empty interpolation/, "An empty interpolation");
flags(`fluid.def("my.a", {template: "<p>@{a b}</p>"});`, "error", "b", /Malformed interpolation/, "An interpolation of two words");
reports(`fluid.def("my.a", {template: "<p>@{{self}.a</p><p>@{ok}</p><p>@{my.f(}</p>"});`,
    [["error", "<", /Unclosed interpolation/], ["error", "}", /Unclosed call/]],
    "A template's interpolations are each checked, past a malformed one");

// ---- Event bindings of templates ----

const button = binding => `fluid.def("my.a", {template: \`<button @onclick="${binding}">+</button>\`});`;
clean(button("{self}.increment()"), "A binding calling a method lints clean");
clean(button("my.select({self}, {0})"), "A binding calling a global function with arguments lints clean");
clean(button("{self}.open = !{self}.open"), "An assigning binding lints clean");
flags(button("{self}.increment("), "error", "{self}.increment(", /Unclosed call/, "A binding's call left unclosed");
flags(button("{self.increment()"), "error", "{self", /Unclosed reference/, "A binding's context left unclosed");
flags(button("{self.open = true"), "error", "{self.open", /Unclosed reference/, "The target of an assigning binding left unclosed");
flags(button(""), "error", "@onclick=\"\"", /Empty event binding/, "An empty binding");
flags(`<script>
fluid.def("my.b", {$layers: "fluid.templateViewComponent"});
</script>
<template>
    <button @onclick="{self}.increment(">+</button>
</template>
`, "error", "{self}.increment(", /Unclosed call/, "Within an SFC, its template's event bindings are linted", "vue");

// ---- Directives of layer records ----

clean(`fluid.def("my.a", {
    $layers: ["fluid.viewComponent", "my.mixin"],
    $variety: "frameworkAux",
    $importMap: {"my.chart": "%my-app/src/chart.vue"},
    name: "x"
});`, "$layers as an Array, $variety and $importMap");
clean(`fluid.def("my.kind.404", {$layers: "{self}.chosenLayer"});`, "A layer named with a numeric segment, and $layers as a reference");
flags(`fluid.def("my.a", {$layers: "fluid component"});`, "error", "\"fluid component\"", /dotted path/, "A malformed layer name in $layers");
flags(`fluid.def("my.a", {$layers: 3});`, "error", "3", /\$layers holds a layer name/, "$layers holding a number");
flags(`fluid.def("my a", {});`, "error", "\"my a\"", /layer name is a dotted path/, "A malformed name of a layer");
flags(`fluid.def("my.a", "{self}.b");`, "error", "\"{self}.b\"", /second argument is a layer record/, "A String given as a layer record");
clean(`fluid.def("my.a", source.def);`, "A record computed elsewhere is not linted");
flags(`fluid.def("my.a", {$compute: "my.f()"});`, "error", "$compute",
    /\$compute is not a directive of a layer record - it is the single key of a member's record/, "A member directive at the level of the record");
flags(`fluid.def("my.a", {$for: {source: "{self}.items"}});`, "error", "$for", /belongs to the record of a \$component/,
    "$for in a layer record rather than a $component's");
flags(`fluid.def("my.a", {$layer: "fluid.component"});`, "error", "$layer", /Unknown directive \$layer in a layer record/,
    "A misspelt $layers");

// ---- Member directives in full form ----

clean(`fluid.def("my.a", {
    area: {$compute: {func: "my.multiply", args: ["{self}.width", "{self}.height"]}},
    viaRef: {$compute: {func: "{self}.multiplier", args: "{self}.width"}},
    inline: {$compute: {func: (a, b) => a + b, args: ["{self}.a", 3], equiv: "my.sameValue"}},
    ready: {$effect: {func: "my.ready", args: ["{self}.data"], debounce: 100, includeSource: "load"}},
    composite: {$effect: [{namespace: "load", func: "my.load", args: "{self}.url"}, {namespace: "style", priority: "after:load", func: "my.style", args: "{$payload}"}]},
    describe: {$method: {func: self => self.name, args: ["{self}"]}},
    bare: {$method: my.bareFn},
    range: {$lens: {source: "{filter}.state", path: "{self}.urlKey", forward: "my.toRange({0}, {self}.min)", backward: "my.toState({0})"}},
    controller: {$bindable: {bind: "my.bind({self}, {self}.container)", unbind: "my.unbind({boundValue})", onceOnly: true}},
    todos: {$reactiveRoot: [{text: "Write docs", done: false}]},
    linked: {$reactiveRoot: "{other}.state", query: "{finder}.foundText"},
    drag: {$transient: null, dispose: "clearInterval"},
    panes: {$componentList: []},
    darkTables: {$linkage: {inputLayers: ["my.table", "my.dark"], outputLayers: "my.darkTable"}},
    many: {$linkage: [{selector: "my.post > my.header", outputLayers: "my.header.post", scope: "{self}", $if: "{self}.adapt"}]}
});`, "Each member directive in its full form lints clean");
flags(`fluid.def("my.a", {area: {$compute: {func: "my.f", arg: ["{self}.a"]}}});`, "error", "arg", /Unknown key "arg" of a \$compute record - expected one of func, args, equiv/,
    "An unknown key of a function record");
flags(`fluid.def("my.a", {area: {$compute: {args: ["{self}.a"]}}});`, "error", "{args: [\"{self}.a\"]}", /names its function as `func`/,
    "A function record without func");
flags(`fluid.def("my.a", {area: {$compute: {func: "my f"}}});`, "error", "\"my f\"", /global name of a function/, "A malformed func");
flags(`fluid.def("my.a", {area: {$compute: "my.f({self}.a)"}});`, "error", "\"my.f({self}.a)\"", /or write the compact form "\$compute:fn\(args\)"/,
    "A full directive holding a String, suggesting the compact form");
flags(`fluid.def("my.a", {area: {$compute: 3}});`, "error", "3", /holds a function record/, "A full directive holding a number");
flags(`fluid.def("my.a", {area: {$computed: {func: "my.f"}}});`, "error", "$computed", /Unknown directive \$computed - a member's record holds one of/,
    "An unknown member directive");
flags(`fluid.def("my.a", {area: {$compute: {func: "my.f"}, $effect: {func: "my.g"}}});`, "error", "$compute", /holds a single directive, but this holds \$compute, \$effect/,
    "Two directives in a member's record");
flags(`fluid.def("my.a", {area: {$compute: {func: "my.f"}, cache: true}});`, "warning", "cache", /"cache" beside a directive is ignored/,
    "A key beside a directive");
flags(`fluid.def("my.a", {ready: {$effect: ["my.f"]}});`, "error", "\"my.f\"", /composite \$effect is an Array of listener records/,
    "A composite $effect holding a String");
flags(`fluid.def("my.a", {r: {$lens: {forward: "my.f({0})"}}});`, "error", "{forward: \"my.f({0})\"}", /\$lens names the site it views as its `source`/,
    "A $lens without its source");
flags(`fluid.def("my.a", {r: {$lens: {source: "{self}.a", forward: "my.f({0}"}}});`, "error", "", /Unclosed call/,
    "A $lens's forward is read as a call");
flags(`fluid.def("my.a", {r: {$lens: "{self}.a"}});`, "error", "\"{self}.a\"", /\$lens holds a record of source, path, forward, backward/,
    "A $lens holding a String");
flags(`fluid.def("my.a", {link: {$linkage: {inputLayer: "my.b"}}});`, "error", "inputLayer", /Unknown key "inputLayer" of a \$linkage/,
    "An unknown key of a $linkage");
flags(`fluid.def("my.a", {link: {$linkage: {inputLayers: "my b", outputLayers: "my.c"}}});`, "error", "\"my b\"", /dotted path/,
    "A malformed layer name in a $linkage");
flags(`fluid.def("my.a", {link: {$linkage: "my.b"}});`, "error", "\"my.b\"", /\$linkage holds a record/, "A $linkage holding a String");

// ---- $component, $for and $if ----

clean(`fluid.def("my.a", {
    items: {$reactiveRoot: []},
    kids: {
        $component: {
            $layers: "my.kid",
            $for: {source: "{a}.items", valueAs: "item", keyAs: "key", positionAs: "position", layerAs: "layer"},
            $if: "{self}.visible",
            label: "{item}.name",
            grandkid: {$component: {$layers: "my.grandkid", title: "$compute:my.title({kids}.label)"}}
        }
    },
    named: {$component: "{self}.chosen"},
    records: [{$layers: "my.handler", max: 5}, {title: "Status"}]
});`, "$component with $for, $if, nested $components, a referenced $component and layer records as elements");
flags(`fluid.def("my.a", {kids: {$component: {$layers: "my.kid", $for: {source: "{self}.items", sauce: "x"}}}});`, "error", "sauce",
    /Unknown key "sauce" of \$for - expected one of source, valueAs, keyAs, positionAs, layerAs/, "An unknown key of $for");
flags(`fluid.def("my.a", {kids: {$component: {$layers: "my.kid", $for: {valueAs: "item"}}}});`, "error", "{valueAs: \"item\"}", /as its `source`/,
    "A $for without source");
flags(`fluid.def("my.a", {kids: {$component: {$layers: "my.kid", $for: "{self}.items"}}});`, "error", "\"{self}.items\"",
    /\$for holds a record \{source, valueAs, keyAs, positionAs, layerAs\}/, "A $for holding a String");
flags(`fluid.def("my.a", {kids: {$component: 3}});`, "error", "3", /\$component holds a layer record/, "A $component holding a number");
flags(`fluid.def("my.a", {kids: {$component: {$layers: "my.kid", width: "{self.w"}}});`, "error", "", /Unclosed reference/,
    "A $component's members are linted in turn");
flags(`fluid.def("my.a", {kids: {$component: {$layers: "my.kid", $compute: "x"}}});`, "error", "$compute", /not a directive of a layer record/,
    "A member directive at the level of a $component's record");

// ---- Code is not configuration ----

clean(`fluid.def("fluid.UISelectView", {
    $layers: "fluid.viewComponent",
    templateTree: {
        $compute: {
            func: (selection, options) => ({
                tag: "select",
                attrs: {"@onchange": "{self}.updateSelection({0})", odd: "$notARune", partial: "{unclosed"}
            }),
            args: ["{$parent}.selection", "{$parent}.optionValues"]
        }
    },
    helper: function () {
        return "$5.00 {broken";
    }
});
const unrelated = {price: "$5", ref: "{self"};
console.log("{not configuration");`, "Strings within functions, and outside fluid.def, are code and are not linted");

// ---- Plain data within a record ----

clean(`fluid.def("my.a", {
    stylesheets: {main: {href: "main.css"}, print: {priority: "after:main", href: "print.css"}},
    matrix: [[1, 2], [3, 4]],
    nothing: null
});`, "Nested plain data lints clean");
flags(`fluid.def("my.a", {deep: {deeper: [{v: "{self"}]}});`, "error", "", /Unclosed reference/,
    "A String nested in plain data is linted as configuration");

// ---- Fragments of records ----

clean(`stylesheetLinks: {
    $component: {
        $layers: "fluid.component",
        $for: {source: "{page}.stylesheets", valueAs: "sheet"}
    }
}`, "A fragment of a record lints as one");
clean(`// A filter's state
filterState: {
    $lens: {source: "{hashManager}.hash", path: "{self}.urlKey", forward: "my.decode({0})", backward: "my.encode({0})"}
}`, "A fragment beginning with a comment lints as a fragment");
clean(`width: 3,
height: 4,
area: "$compute:my.multiply({self}.width, {self}.height)"`, "A fragment of several members lints as one");
flags(`view: {
    $component: {
        template: "$compute:fluid.render({$parent}, {$parent}.rootEntries"
    }
}`, "error", "", /Unclosed call/, "A fragment's errors are positioned within the fragment");
expect(isFragment("view: {$component: {$layers: \"my.v\"}}"), "A member is recognised as a fragment");
expect(!isFragment("fluid.def(\"my.a\", {});"), "A script is not a fragment");
expect(!isFragment("const a = 1;\nconsole.log(a);"), "Plain JavaScript is not a fragment");

// ---- JavaScript syntax ----

flags(`fluid.def("my.a", {a: 1 b: 2});`, "error", "1", /expected "," between the members of an object/, "A missing comma between members");
flags(`fluid.def("my.a", {a: [1 2]});`, "error", "1", /expected "," between the elements of an array/, "A missing comma between elements");
flags(`fluid.def("my.a", {
    a: 1,
    b: 2
);`, "error", ")", /expected "}" to close the "\{" on line 1 before this "\)"/, "A mismatched bracket names the one left open");
flags(`fluid.def("my.a", {
    a: (1,
    b: 2
});`, "error", ": 2", /the "\(" on line 2 is not closed before this member/, "A member after an unclosed parenthesis");
flags(`const a = ;`, "error", ";", /is incomplete before ";"/, "Other syntax errors are reported plainly");

// ---- Several malformations ----

reports(`fluid.def("my.a", {
    $layers: "fluid.component",
    width: 3,
    height: 4
    area: "$compute:my.multiply({self}.width, {self}.height)",
    bad: "{self.width",
    worse: "$comptue:my.f()",
    $compute: "x"
});`, [
    ["error", "4", /expected "," between the members/],
    ["error", "", /Unclosed reference/],
    ["error", "$comptue", /Unknown compact directive/],
    ["error", "$compute", /not a directive of a layer record/]
], "A missing comma does not hide the errors after it");

reports(`fluid.def("my.a", {
    a: 1
    b: [1 2]
    c: "{self}."
    d: 4
});`, [
    ["error", "1", /between the members/],
    ["error", "1", /between the elements/],
    ["error", "]", /between the members/],
    ["error", "", /name of a member after/],
    ["error", "\"", /between the members/]
], "Several missing commas are each repaired, and the Strings between them linted");

reports(`fluid.def("my.a", {
    area: "$compute:my.multiply({self}.width, {self}.height",
    view: {
        $component: {
            $layers: "fluid.templateViewComponent",
            template: "<p>@{name</p>",
            $for: {sauce: 1}
        }
    }
});
fluid.def("my.b", {
    price: "$5",
    m: {$method: {func: x => x, arg: 3}}
});`, [
    ["error", "", /Unclosed call/],
    ["error", "<", /Unclosed interpolation/],
    ["error", "{sauce: 1}", /as its `source`/],
    ["error", "sauce", /Unknown key "sauce" of \$for/],
    ["error", "$5", /write "\\\\\$"/],
    ["error", "arg", /Unknown key "arg" of a \$method record/]
], "Errors of runes and directives in two records are all reported");

reports(member("$compute:my.f({self}.a, {self.b, 3"), [
    ["error", ",", /Unclosed reference/],
    ["error", "", /Unclosed reference/]
], "Two malformations within one call are both reported");

reports(`fluid.def("my.a", {
    f: function (x) { return x +; },
    ref: "{self}.",
    ok: "{self}.y"
});
const x = ;
fluid.def("my.c", {bad: "{}.z"});`, [
    ["error", ";", /is incomplete before ";"/],
    ["error", "", /name of a member after/],
    ["error", ";", /is incomplete before ";"/],
    ["error", "}", /Empty context/]
], "Syntax errors within code do not hide the errors of configuration around them");

// ---- SFCs ----

clean(`<script>
fluid.def("fluid.demos.counter", {
    $layers: "fluid.viewComponent",
    count: 0,
    increment: "$method:fluid.demos.counter.increment({self})"
});
</script>

<template>
    <button class="counter-button" @onclick="{self}.increment()">Clicked @{count} times</button>
</template>

<style>
.counter-button { color: red; }
</style>
`, "An SFC lints clean", "vue");

clean(`<symbols>
    <symbol id="my-chevron" viewBox="0 0 16 16"><path d="M6 3l5 5-5 5" fill="none"/></symbol>
</symbols>
<placeholder name="records" type="application/json">[{"name": "Placeholder"}]</placeholder>
<template><button><svg><use href="#my-chevron"/></svg> More</button><script>const notLinted = "{self";</script></template>
`, "An SFC's self-closing elements, placeholders and a script within its template lint clean", "vue");

clean(`<script src="%my-app/src/thing.js"></script>
<template><p>@{title}</p></template>
`, "An SFC whose script is loaded from elsewhere lints clean", "vue");

flags(`<script>
fluid.def("fluid.demos.counter", {
    count: "$compute:fluid.demos.counter.double({self}.count"
});
</script>
<template><p>@{count}</p></template>
`, "error", "", /Unclosed call/, "Within an SFC, its script's errors are positioned in the SFC", "vue");

flags(`<script>
fluid.def("my.b", {$layers: "fluid.viewComponent"});
</script>
<template><p>@{count</p></template>
`, "error", "<", /Unclosed interpolation/, "Within an SFC, its template's interpolations are linted", "vue");

flags(`<!-- A counter -->
<script>
fluid.def("my.b", {
    a: 1,
    b: 2
);
</script>
`, "error", ")", /the "\{" on line 3 before/, "Within an SFC, lines are numbered as the SFC's", "vue");

reports(`<script>
fluid.def("my.b", {
    a: 1
    b: "{self"
});
</script>
<template><p>@{}</p></template>
`, [
    ["error", "1", /between the members/],
    ["error", "", /Unclosed reference/],
    ["error", "}", /Empty interpolation/]
], "Several malformations within an SFC's script and template are all reported", "vue");

// ---- Fixes proposed ----

/**
 * Apply a fix's changes to a text
 * @param {String} text - The text
 * @param {Fix} fix - The fix
 * @return {String} The text fixed
 */
const applyFix = function (text, fix) {
    let togo = text;
    fix.changes.slice().sort((a, b) => b.from - a.from).forEach(change => {
        togo = togo.slice(0, change.from) + change.insert + togo.slice(change.to);
    });
    return togo;
};

/**
 * Assert that the first diagnostic of a text proposes a fix, of a label, which gives an expected text, linting clean
 * @param {String} text - The text
 * @param {RegExp} label - A pattern the fix's label should match
 * @param {String} fixed - The text expected once fixed
 * @param {String} message - What it asserts
 * @param {String} [kind] - "js" or "vue"
 */
const fixes = function (text, label, fixed, message, kind) {
    const found = lint(text, kind);
    const fix = found[0] && found[0].fix;
    const result = fix ? applyFix(text, fix) : null;
    const remaining = result === null ? [] : linted(result, kind);
    const ok = !!fix && label.test(fix.label) && result === fixed && remaining.length === 0;
    expect(ok, message + (ok ? "" : " - got " + (fix ? JSON.stringify(fix.label) + " giving " + JSON.stringify(result) +
        (remaining.length ? ", which lints as " + remaining.join("; ") : "") : "no fix, for " + linted(text, kind).join("; "))));
};

/**
 * Assert that a configuration String, held as a member, is fixed as expected
 * @param {String} value - The String's interior, as written in source
 * @param {RegExp} label - A pattern the fix's label should match
 * @param {String} fixedValue - The interior expected once fixed
 * @param {String} message - What it asserts
 */
const fixesValue = function (value, label, fixedValue, message) {
    fixes(member(value), label, member(fixedValue), message + ": " + value);
};

fixesValue("{self", /Insert "}"/, "{self}", "An unclosed reference is closed");
fixesValue("{}.a", /Insert "self"/, "{self}.a", "An empty context is filled with self");
fixesValue("{self}..a", /Remove the extra "\."/, "{self}.a", "An empty segment is removed");
fixesValue("{self}.", /Remove the trailing "\."/, "{self}", "A trailing dot is removed");
fixesValue("{self}a", /Insert "\."/, "{self}.a", "A missing dot is inserted");
fixesValue("{0}:", /Remove the trailing ":"/, "{0}", "An empty label is removed");
fixesValue("{self}.a {self}.b", /Remove the text after it/, "{self}.a", "Text after a reference is removed");
fixesValue("$comptue:my.f()", /Change to \$compute/, "$compute:my.f()", "A misspelt compact directive is corrected");
fixesValue("$methd:my.f", /Change to \$method/, "$method:my.f", "Another misspelt compact directive is corrected");
fixesValue("$5.00", /Escape the "\$"/, "\\\\$5.00", "A literal $ is escaped");
fixesValue("$price", /Escape the "\$"/, "\\\\$price", "A literal $ with no near directive is escaped");
fixesValue("$compute my.f()", /Write "\$compute:"/, "$compute:my.f()", "A missing colon is written");
fixesValue("$compute:my.f(", /Insert "\)"/, "$compute:my.f()", "An unclosed call is closed");
fixesValue("$compute:my.f({self}.a", /Insert "\)"/, "$compute:my.f({self}.a)", "An unclosed call after an argument is closed");
fixesValue("$compute:my.f({self}.a,)", /Remove the trailing ","/, "$compute:my.f({self}.a)", "A trailing comma is removed");
fixesValue("$compute:my.f(,{self}.a)", /Remove the ","/, "$compute:my.f({self}.a)", "A leading comma is removed");
fixesValue("$compute:my.f({self}.a {self}.b)", /Insert ","/, "$compute:my.f({self}.a, {self}.b)", "A comma between arguments is inserted");
fixesValue("$compute:my.f({self.a)", /Insert "}"/, "$compute:my.f({self.a})", "An unclosed reference within a call is closed before the call's \")\"");
fixes(member("$compute:my.join({self}.a, \\\"x\\\")"), /Remove the quotes/, member("$compute:my.join({self}.a, x)"),
    "A quoted compact argument is unquoted");
fixes(`fluid.def("my.a", {template: "<p>@{name</p>"});`, /Insert "}"/, `fluid.def("my.a", {template: "<p>@{name}</p>"});`,
    "An unclosed interpolation is closed");
fixes(`fluid.def("my.a", {template: "<p>@{my.f({self}.a</p>"});`, /Insert "\)}"/, `fluid.def("my.a", {template: "<p>@{my.f({self}.a)}</p>"});`,
    "An unclosed call within an unclosed interpolation closes both");

fixes(`fluid.def("my.a", {area: {$compute: {func: "my.f", arg: ["{self}.a"]}}});`, /Change to args/,
    `fluid.def("my.a", {area: {$compute: {func: "my.f", args: ["{self}.a"]}}});`, "A misspelt key of a function record is corrected");
fixes(`fluid.def("my.a", {area: {$compute: {func: "my.f", "arg": ["{self}.a"]}}});`, /Change to args/,
    `fluid.def("my.a", {area: {$compute: {func: "my.f", "args": ["{self}.a"]}}});`, "A misspelt quoted key is corrected within its quotes");
fixes(`fluid.def("my.a", {area: {$computed: {func: "my.f"}}});`, /Change to \$compute/,
    `fluid.def("my.a", {area: {$compute: {func: "my.f"}}});`, "A misspelt member directive is corrected");
fixes(`fluid.def("my.a", {$layer: "fluid.component"});`, /Change to \$layers/,
    `fluid.def("my.a", {$layers: "fluid.component"});`, "A misspelt $layers is corrected");
fixes(`fluid.def("my.a", {kids: {$component: {$layers: "my.kid", $for: {source: "{self}.items", valuesAs: "x"}}}});`, /Change to valueAs/,
    `fluid.def("my.a", {kids: {$component: {$layers: "my.kid", $for: {source: "{self}.items", valueAs: "x"}}}});`, "A misspelt key of $for is corrected");
fixes(`fluid.def("my.a", {link: {$linkage: {inputLayer: "my.b", outputLayers: "my.c"}}});`, /Change to inputLayers/,
    `fluid.def("my.a", {link: {$linkage: {inputLayers: "my.b", outputLayers: "my.c"}}});`, "A misspelt key of a $linkage is corrected");
flags(`fluid.def("my.a", {area: {$compute: {func: "my.f", zebra: 1}}});`, "error", "zebra", /^Unknown key "zebra"/,
    "A key near no known key suggests nothing");

fixes(`fluid.def("my.a", {a: 1 b: 2});`, /Insert ","/, `fluid.def("my.a", {a: 1, b: 2});`, "A missing comma between members is inserted");
fixes(`fluid.def("my.a", {a: [1 2]});`, /Insert ","/, `fluid.def("my.a", {a: [1, 2]});`, "A missing comma between elements is inserted");
fixes(`fluid.def("my.a" {a: 1});`, /Insert ","/, `fluid.def("my.a", {a: 1});`, "A missing comma between arguments is inserted");
fixes(`fluid.def("my.a", {a: 1; b: 2});`, /Replace ";" with ","/, `fluid.def("my.a", {a: 1, b: 2});`, "A ; between members is replaced");
fixes(`fluid.def("my.a", {a = 1});`, /Replace "=" with ":"/, `fluid.def("my.a", {a: 1});`, "A = within an object is replaced");
fixes(`fluid.def("my.a", {a: "x});`, /Close the String/, `fluid.def("my.a", {a: "x"});`, "An unterminated String is closed");
fixes(`fluid.def("my.a", {a: 1}`, /Close the "\("/, `fluid.def("my.a", {a: 1})`, "An unclosed parenthesis is closed");
fixes(`fluid.def("my.a", {a: {b: 1}`, /Close the brackets left open/, `fluid.def("my.a", {a: {b: 1}})`, "Several unclosed brackets are closed");
fixes(`fluid.def("my.a", {a: 1}));`, /Remove the "\)"/, `fluid.def("my.a", {a: 1});`, "A surplus parenthesis is removed");
fixes(`fluid.def("my.a", {a: [1, 2});`, /Insert "]"/, `fluid.def("my.a", {a: [1, 2]});`, "A mismatched bracket is closed");
fixes(`fluid.def("my.a", {a: function (x { return x; }});`, /Insert "\)"/, `fluid.def("my.a", {a: function (x) { return x; }});`,
    "An unclosed list of parameters is closed");
fixes(`fluid.def("my.a", {a.b: 1});`, /Quote the key/, `fluid.def("my.a", {"a.b": 1});`, "A dotted key is quoted");
fixes(`let y == 2;`, /Write "="/, `let y = 2;`, "A == in a declaration is replaced");
flags(`fluid.def("my.a", {a: 1 + });`, "error", "}", /the expression ending in "\+" is incomplete before "}"/, "An incomplete expression is described");
flags(`const = 3;`, "error", "=", /a declaration names its variable/, "A declaration without its name is described");
flags(`fluid.def("my.a", {a: 1}) @`, "error", "@", /unexpected "@"/, "An unexpected character is named");
fixes(`view: {
    $component: {
        $layers: "my.v"
        n: 1
    }
}`, /Insert ","/, `view: {
    $component: {
        $layers: "my.v",
        n: 1
    }
}`, "A fix within a fragment is positioned within the fragment");
fixes(`<script>
fluid.def("my.b", {
    a: 1
    b: 2
});
</script>
`, /Insert ","/, `<script>
fluid.def("my.b", {
    a: 1,
    b: 2
});
</script>
`, "A fix within an SFC's script is positioned within the SFC", "vue");

console.log(`# ${passed} passed, ${failures.length} failed`);
process.exitCode = failures.length > 0 ? 1 : 0;
