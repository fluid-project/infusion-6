/* eslint-env node */
"use strict";

const fs = require("fs");
const path = require("path");

const SRC_DIR = "src/framework/core/js";
const OUT_DIR = "src/framework/core/mjs";

fs.mkdirSync(OUT_DIR, { recursive: true });

const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith(".js"));

const scopeRE =
    /const\s+\$[A-Za-z0-9_]+Scope\s*=\s*function\s*\(\s*fluid\s*\)\s*\{/;

const commentedImportRE =
    /^\s*\/\/\s*import\s+(.+)$/gm;

for (const file of files) {
    const inPath = path.join(SRC_DIR, file);
    const outPath = path.join(
        OUT_DIR,
        file.replace(/\.js$/, ".mjs")
    );

    let src = fs.readFileSync(inPath, "utf8");

    const hasScope = scopeRE.test(src);

    /* -----------------------------------------------------------
     * 1. Collect commented imports
     * --------------------------------------------------------- */

    const imports = [];
    src = src.replace(commentedImportRE, (_, clause) => {
        // Rewrite .js -> .mjs inside import clause
        const rewritten = clause.replace(/(["'])(.+?)\.js\1/g, '$1$2.mjs$1');
        imports.push(`import ${rewritten};`);
        return "";
    });

    const importBlock = imports.length
        ? imports.join("\n") + "\n"
        : "";

    /* ===========================================================
     * MIXIN FILE (no file-scope closure)
     * ===========================================================
     */

    if (!hasScope) {
        let out = src.trimStart();

        if (importBlock) {
            out = out.replace(
                /^"use strict";\s*/m,
                `"use strict";\n\n${importBlock}\n`
            );
        }

        fs.writeFileSync(outPath, out, "utf8");
        continue;
    }

    /* ===========================================================
     * CORE / SCOPE FILE
     * ===========================================================
     */

    const scopeMatch = src.match(
        /const\s+\$[A-Za-z0-9_]+Scope\s*=\s*function\s*\(\s*fluid\s*\)\s*\{([\s\S]*?)\n\};/
    );

    if (!scopeMatch) {
        throw new Error(`Scope wrapper malformed in ${file}`);
    }

    const scopeBody = scopeMatch[1].trimEnd();

    // If no default import of fluid was provided, synthesize it
    const hasFluidImport = imports.some(line =>
        /^import\s+fluid\s+from\s+/.test(line)
    );

    const fluidPreamble = hasFluidImport
        ? importBlock
        : `const fluid = {};\n${importBlock}`;

    const out = [
        `"use strict";`,
        ``,
        fluidPreamble.trimEnd(),
        ``,
        scopeBody,
        ``,
        `export default fluid;`,
        ``
    ].join("\n");

    fs.writeFileSync(outPath, out, "utf8");
}
