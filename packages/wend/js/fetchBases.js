#!/usr/bin/env node

"use strict";

// Fetches the bases of a site which are held as git repositories - see `bases` in site.js - each at the commit which
// the site's wend.bases.lock.json records, into .wend/bases/<owner>/<name> beneath the site, where its build finds them.
// A base not yet recorded is fetched at the head of its branch, and recorded.
//
// Usage: node packages/wend/js/fetchBases.js [--update]
// The site is that in the current directory, or that named by WEND_SITE_DIR. With --update, each base is fetched at the
// head of its branch, and the lock file updated - e.g. by a scheduled run of the site's workflow, which rebuilds the site
// if any has moved on, or once an editing client commits a lock file naming newer commits. Each base's own bases are
// fetched in turn. It prints a line for each base, and ends "changed" if it changed the lock file, or "unchanged".
// Each repository is fetched from https://github.com/<owner>/<name>.git, or the URL formed by WEND_GIT_URL, in which
// "{repo}" stands for "<owner>/<name>" - e.g. a directory of repositories for testing. Bases are public repositories:
// they are fetched without credentials.

const fs = require("fs"),
    path = require("path"),
    childProcess = require("child_process");

const siteDir = path.resolve(process.env.WEND_SITE_DIR || process.cwd());
const basesDir = ".wend/bases";
const lockFile = "wend.bases.lock.json";
const update = process.argv.includes("--update");

/**
 * Form the URL from which a base's repository is fetched
 * @param {String} repo - The repository, "owner/name"
 * @return {String} Its URL
 */
const repoUrl = repo => (process.env.WEND_GIT_URL || "https://github.com/{repo}.git").replace("{repo}", repo);

/**
 * Run git, without any credential helper or prompt, since every base is public
 * @param {String[]} args - Its arguments
 * @param {String} [cwd] - The directory to run it in
 * @return {String} What it writes, trimmed
 */
const git = (args, cwd) => childProcess.execFileSync("git", ["-c", "credential.helper=", ...args],
    {cwd, encoding: "utf8", env: {...process.env, GIT_TERMINAL_PROMPT: "0"}, stdio: ["ignore", "pipe", "pipe"]}).trim();

/**
 * Find the commit at the head of a branch of a base's repository
 * @param {String} repo - The repository, "owner/name"
 * @param {String} branch - The branch
 * @return {String} The commit's sha
 */
const headOf = function (repo, branch) {
    const line = git(["ls-remote", repoUrl(repo), "refs/heads/" + branch]);
    if (!line) {
        throw new Error("The base " + repo + " has no branch " + branch);
    }
    return line.split(/\s+/)[0];
};

/**
 * Ensure a base's repository is checked out at a commit, fetching only that commit
 * @param {String} repo - The repository, "owner/name"
 * @param {String} sha - The commit
 * @return {String} The directory holding it
 */
const checkout = function (repo, sha) {
    const dir = path.join(siteDir, basesDir, ...repo.split("/"));
    const current = fs.existsSync(path.join(dir, ".git")) ? git(["rev-parse", "HEAD"], dir) : null;
    if (current !== sha) {
        fs.mkdirSync(dir, {recursive: true});
        if (!fs.existsSync(path.join(dir, ".git"))) {
            git(["init", "--quiet"], dir);
        }
        git(["fetch", "--quiet", "--depth", "1", repoUrl(repo), sha], dir);
        git(["checkout", "--quiet", "--force", "--detach", "FETCH_HEAD"], dir);
        git(["clean", "--quiet", "-dffx"], dir);
    }
    return dir;
};

/**
 * Normalise a base as written in a descriptor's `bases` - see site.js
 * @param {String|Object} base - The base
 * @param {String} dir - The directory of the site naming it
 * @return {Object} `{repo, branch}` or `{path}`, absolute
 */
const normaliseBase = function (base, dir) {
    const record = typeof(base) === "string" ? {repo: base} : base;
    return record.repo ? {repo: record.repo, branch: record.branch || "main"} : {path: path.resolve(dir, record.path)};
};

const main = function () {
    const lockPath = path.join(siteDir, lockFile);
    const previous = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath, "utf8")) : {};
    const lock = {};
    const visited = new Set();
    const visit = function (dir) {
        if (!visited.has(dir)) {
            visited.add(dir);
            const descriptor = JSON.parse(fs.readFileSync(path.join(dir, "wend.site.json"), "utf8"));
            (descriptor.bases || []).map(base => normaliseBase(base, dir)).forEach(base => {
                if (base.repo) {
                    const recorded = previous[base.repo];
                    const sha = lock[base.repo] ? lock[base.repo].sha : !update && recorded && recorded.branch === base.branch ? recorded.sha :
                        headOf(base.repo, base.branch);
                    lock[base.repo] = {branch: base.branch, sha};
                    const baseDir = checkout(base.repo, sha);
                    console.log(base.repo + "@" + base.branch + " " + sha + (recorded && recorded.sha !== sha ? " (was " + recorded.sha + ")" : ""));
                    visit(baseDir);
                } else {
                    visit(base.path);
                }
            });
        }
    };
    visit(siteDir);
    const sorted = Object.fromEntries(Object.keys(lock).sort().map(repo => [repo, lock[repo]]));
    const changed = JSON.stringify(sorted) !== JSON.stringify(previous);
    if (changed && Object.keys(sorted).length > 0) {
        fs.writeFileSync(lockPath, JSON.stringify(sorted, null, 4) + "\n");
    } else if (changed && fs.existsSync(lockPath)) {
        fs.rmSync(lockPath);
    }
    console.log(changed ? "changed" : "unchanged");
};

try {
    main();
} catch (error) {
    console.error(error.message + (error.stderr ? "\n" + error.stderr : ""));
    process.exitCode = 1;
}
