# Linting in browser editors - hand-written rules, ESLint, and where it runs

Context: Infusion's layer editor, `src/framework/edit/sfc/fluid-codemirror.vue`, has just moved to CodeMirror 6 through
the `fluid.codemirror6` bundle of `packages/fluid-lint`. Errors, shown red, are fluid-lint's own checks: syntax errors,
and Infusion configuration it can't read. Stylistic warnings, shown orange, were then added as hand-written rules in
`packages/fluid-lint/src/fluidLint.js`: `lintJsStyle`, `lintCss` and `lintMarkup`.

## User

Are these warnings all being implemented ad hoc rather than with respect to any codified linting configuration operated
by some package such as eslint?

## Claude

Yes. Every orange warning is written by hand in `fluidLint.js`, by walking lezer's syntax trees, and none of them is
read from a lint configuration. The red errors are a separate matter: they check Infusion syntax that no off-the-shelf
linter knows.

That matters because the repository already has a codified style: `.eslintrc.json` extends `eslint-config-fluid`
2.1.1, whose rules live in `.eslintrc-fluid.json`. The hand-written rules overlap it, but not exactly:

| Hand-written warning     | eslint-config-fluid                                                                                    |
|--------------------------|--------------------------------------------------------------------------------------------------------|
| Single-quoted String     | `quotes: double`. The repo also sets `allowTemplateLiterals` and `avoidEscape`, which the hand-written rule ignores. |
| `==` / `!=`              | `eqeqeq: ["error", "allow-null"]`. The hand-written rule wrongly flags `x == null`.                    |
| `var`                    | No such rule. This one was invented.                                                                    |
| Unbraced if/else body    | `curly: all`, which also covers loops.                                                                  |
| Missing semicolon        | `semi: always`                                                                                          |
| Trailing comma           | `comma-dangle: never`                                                                                   |

The editor misses everything else in the config, for example `indent: 4`, `no-unused-vars`, `no-undef`,
`space-infix-ops`, `keyword-spacing`, `no-trailing-spaces`, `eol-last` and `space-before-function-paren`.

For CSS and markup there is no house configuration at all. Stylelint and HTMLHint are the obvious tools; HTMLHint was
among the dependencies deleted along with CodeMirror 5.

The faithful fix is to run ESLint itself in the editor with the house config. ESLint's `Linter` class runs in a
browser, and `eslint-linter-browserify` packages it. Each ESLint message would become a warning, and ESLint's fixes
would become quick fixes. fluid-lint would keep its red errors. The cost is roughly a megabyte of bundle, and some rules
need care in a fragment such as an SFC's `<script>`: `no-undef` needs its globals declared, and `no-unused-vars` may
need turning off.

## User

It's true that ESLint is pretty huge. Are there any established idioms for such things amongst Cloud IDEs? Do they tend
to just take the bundle hit, or might they instead run linting as a separate cloud service - can you do a quick survey?

## Claude

*(First answered from memory; the claims were then checked by web search. Below is the checked version, with each
claim marked by how well the search supported it.)*

The split follows from whether the IDE has a server behind it.

### 1. IDEs with a server run ESLint there, as an ordinary Node process

- **The VS Code ESLint extension needs a workspace host.** This is verified. Its `package.json` declares only a
  `main` entry point, with no `browser` entry, and sets `"extensionKind": ["workspace"]` ([microsoft/vscode-eslint
  package.json](https://raw.githubusercontent.com/microsoft/vscode-eslint/main/package.json)). VS Code's docs say "When
  in a remote workspace or when using Codespaces, Workspace Extensions run on the remote machine / environment"
  ([Supporting Remote Development](https://code.visualstudio.com/api/advanced-topics/remote-extensions)). In GitHub
  Codespaces, and other hosts built on VS Code's remote server such as Gitpod and Coder, ESLint therefore runs in the
  container, and its diagnostics are sent to the browser over the language-server protocol.
- **It doesn't run in VS Code for the Web without a backend.** This is inferred. Only extensions declaring a `browser`
  entry run in vscode.dev and github.dev ([Web Extensions](https://code.visualstudio.com/api/extension-guides/web-extensions)),
  and vscode-eslint declares none. No source said in so many words that it is unavailable there.
- **Replit lints in the project's container**, and only if ESLint is installed in the project. The source is a
  third-party tutorial, not Replit's docs ([rapidevelopers](https://www.rapidevelopers.com/md/replit-tutorial/how-to-enforce-code-quality-by-setting-up-linting-in-replit)).
- **Linting on a server was proposed for CodeMirror** in the CodeMirror forum, as the answer to bundle size. The case
  made was no bundle cost, however many linters, and linters updated without waiting on npm. The cost is a dependency on
  a server ([How to actually use eslint in CodeMirror 6](https://discuss.codemirror.net/t/how-to-actually-use-eslint-in-codemirror-6/4184)).

### 2. Editors without a server take the hit, but off the main thread, and only when editing

- **WebComponents.dev**, a cloud IDE, does exactly this, and is verified: "ESLint is running as web-worker to avoid
  impacting our performance and your experience". It uses `eslint/lib/linter/Linter` and reads the project's
  `.eslintrc.json` ([WebComponents.dev - ESLint](https://webcomponents.dev/docs/eslint)).
- **Solid's playground** uses `eslint-solid-standalone`, "a bundle with ESLint, eslint-plugin-solid, and necessary
  tooling that can be used on the web or in a web worker" ([socket.dev](https://socket.dev/npm/package/eslint-solid-standalone)).
- **The React docs' Sandpack editors** (Sandpack is CodeSandbox's toolkit) run TypeScript's tsserver in a web worker,
  because "without a worker it's janky" ([reactjs.org PR #4720](https://github.com/reactjs/reactjs.org/pull/4720)). The
  bargain is the same, with a heavier library.
- **CodeMirror's own advice** is to wrap a browser build of `Linter`, such as `eslint4b-prebuilt` or
  `eslint-linter-browserify`, with `esLint()` from `@codemirror/lang-javascript` and pass it to `linter()` (same forum
  thread). The thread doesn't discuss workers.
- **CodeSandbox's original browser sandbox** linted in a web worker, from memory. This is not verified, and the search
  found nothing either way.
- **eslint.org/play** was not verified either. Its source lives in [eslint/playground](https://github.com/eslint/playground),
  but the search didn't establish whether it lints in a worker.

### 3. The extreme: a whole Node runtime in the tab

- **StackBlitz's WebContainers** run Node.js in the browser through WebAssembly
  ([Introducing WebContainers](https://blog.stackblitz.com/posts/introducing-webcontainers/)), so unmodified Node
  tooling runs client-side.
- **ota-meshi's ESLint playground** is verified to use them: "This playground works by calling ESLint in a Node.js process
  launched inside the browser using WebContainers", so that real plugins work
  ([eslint-online-playground](https://github.com/ota-meshi/eslint-online-playground)).
- **Whether StackBlitz's own editor runs an ESLint language server this way** was not established by the search.

### 4. Linters compiled to WebAssembly - not the shortcut first suggested

- **Biome's WASM build is larger than ESLint, not smaller.** `@biomejs/wasm-web` 1.7.2 is about 9.6 MB unpacked
  ([npm](https://www.npmjs.com/package/@biomejs/wasm-web)), though its online playground does run on it.
- **Oxlint has no official browser package for its linter.** Its playground runs a WASM build, but an issue found no
  published package ([oxc#3197](https://www.github.com/oxc-project/oxc/issues/3197)). Only the parser is published, as
  `@oxc-parser/wasm`, and it is experimental.
- **Neither tool runs an ESLint config.** Oxlint migrates one through `@oxlint/migrate`, and comments out the rules it
  doesn't support ([Migrate from ESLint](https://oxc.rs/docs/guide/usage/linter/migrate-from-eslint)). The rules would
  then live in a second configuration, liable to drift from `npm run lint`.

### Sizes

- **`eslint-linter-browserify` 9.31.0:** `linter.min.js` is **1,349,063 bytes** (1.35 MB), from the jsDelivr file
  listing ([jsDelivr](https://www.jsdelivr.com/package/npm/eslint-linter-browserify)). The unminified `linter.js` is
  4.16 MB. Gzipped transfer was not measured, but would be several times smaller.
- **`@biomejs/wasm-web` 1.7.2:** about 9.6 MB unpacked, as above.

### What this suggests for Infusion

A statically published site has no server, so Infusion falls into idiom 2. A server for linting would be the one
stateful service that statically hosted editing has so far done without. Idiom 2 would work out as follows:

- **Keep the `fluid.codemirror6` bundle as it is.** fluid-lint's checks of Infusion syntax, the red errors, stay
  always-on and cheap.
- **Ship ESLint as a separate chunk.** It would be `eslint-linter-browserify`, configured with eslint-config-fluid's
  rules, built for example as `src/lib/fluid-lint/eslint-worker.js`.
- **Load the chunk only when the editing panel first opens**, and run it in a web worker. Readers never fetch it. An
  editor pays about 1.35 MB once, then cached, without typing being blocked.
- **Replace the hand-written JS style rules with ESLint's messages**, so that the editor agrees with `npm run lint`.
  Fragments still need their globals declared, and `no-unused-vars` may need to be off for an SFC's `<script>`.
- **Treat ESLint as an extra.** If the worker fails to load, the red errors still work.
- **Keep the hand-written CSS and markup checks**, since there is no house config for either, and mark them as such in
  `fluidLint.js`.
- **Don't run ESLint in the extension's background process.** That is possible, but it would leave the panel's editor
  and the documentation's live examples without it.

## Sources

- [microsoft/vscode-eslint package.json](https://raw.githubusercontent.com/microsoft/vscode-eslint/main/package.json)
- [VS Code - Supporting Remote Development](https://code.visualstudio.com/api/advanced-topics/remote-extensions)
- [VS Code - Web Extensions](https://code.visualstudio.com/api/extension-guides/web-extensions)
- [WebComponents.dev - ESLint](https://webcomponents.dev/docs/eslint)
- [CodeMirror forum - How to actually use eslint in CodeMirror 6](https://discuss.codemirror.net/t/how-to-actually-use-eslint-in-codemirror-6/4184)
- [eslint-solid-standalone](https://socket.dev/npm/package/eslint-solid-standalone)
- [reactjs.org PR #4720 - tsserver in a web worker](https://github.com/reactjs/reactjs.org/pull/4720)
- [eslint-linter-browserify on jsDelivr](https://www.jsdelivr.com/package/npm/eslint-linter-browserify)
- [eslint/playground](https://github.com/eslint/playground)
- [ota-meshi/eslint-online-playground](https://github.com/ota-meshi/eslint-online-playground)
- [Introducing WebContainers](https://blog.stackblitz.com/posts/introducing-webcontainers/)
- [@biomejs/wasm-web on npm](https://www.npmjs.com/package/@biomejs/wasm-web)
- [oxc-project/oxc#3197](https://www.github.com/oxc-project/oxc/issues/3197)
- [@oxc-parser/wasm](https://www.npmjs.com/package/@oxc-parser/wasm)
- [Oxlint - Migrate from ESLint](https://oxc.rs/docs/guide/usage/linter/migrate-from-eslint)
- [Replit linting (third-party tutorial)](https://www.rapidevelopers.com/md/replit-tutorial/how-to-enforce-code-quality-by-setting-up-linting-in-replit)
