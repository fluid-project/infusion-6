"use strict";

// A mock of the parts of GitHub which the "Edit in Infusion" extension and a site's publishing depend on, for scenario
// tests of the whole cycle of editing a statically published site in place - see a-scratch/reports/0-live-static-editing.md
// in Infusion 6. It holds:
//  - a repository: a scratch copy of the site's working tree, whose files are read and written through
//  - the Contents API, under /__github/ - reading a file with its blob sha, and writing it only if the sha given is still
//    the file's (409 otherwise), as GitHub does, so that the extension's optimistic concurrency is exercised
//  - the Git Data API's refs, commits, trees and blobs - enough to commit several files at once, as the extension
//    commits a changeset: the branch moves to a new commit only if that commit's parent is still its head (422 otherwise)
//  - Actions: each commit queues a run which, after a delay, rebuilds the site from the repository, as the site's
//    workflow does - runs never overlap, and a run builds the repository as it stands when it begins
//  - Pages: the built site, served at the root
// What builds the site is supplied by the test, so that the mock serves any site.

const fs = require("fs"),
    os = require("os"),
    path = require("path"),
    http = require("http"),
    crypto = require("crypto");

const mockGitHub = {};

/**
 * Compute the blob sha of a file's content, as git does
 * @param {Buffer} content - The content
 * @return {String} The sha, as hex
 */
mockGitHub.blobSha = function (content) {
    return crypto.createHash("sha1").update(Buffer.concat([Buffer.from("blob " + content.length + "\0"), content])).digest("hex");
};

/**
 * Copy a site's working tree into a scratch repository, leaving out what is not its source - its git directory, its
 * published site, and its installed packages, which are linked rather than copied
 * @param {String} from - The site's working tree
 * @param {String} to - The directory of the scratch repository, which is created
 * @param {String[]} [omit] - Names, at the root, which are left out, beyond .git, docs and node_modules
 */
mockGitHub.copyTree = function (from, to, omit = []) {
    const left = new Set([".git", "docs", "node_modules", ...omit]);
    fs.mkdirSync(to, {recursive: true});
    fs.readdirSync(from).filter(name => !left.has(name)).forEach(name => {
        fs.cpSync(path.join(from, name), path.join(to, name), {recursive: true});
    });
    if (fs.existsSync(path.join(from, "node_modules"))) {
        fs.symlinkSync(path.join(from, "node_modules"), path.join(to, "node_modules"));
    }
};

/**
 * @typedef {Object} MockCommit
 * @property {String} sha - The commit's sha
 * @property {String} path - The file it wrote - for a commit of several, the first
 * @property {String[]} paths - Every file it wrote or removed
 * @property {String} message - Its message
 * @property {String} blobSha - The sha of the file as written - for a commit of several, of the first written
 */

/**
 * @typedef {Object} MockRun
 * @property {Number} id - The run's number
 * @property {String} commit - The sha of the commit which queued it
 * @property {String} status - "queued", "in_progress" or "completed"
 * @property {String|null} conclusion - "success" or "failure" once completed
 */

/**
 * Create a mock GitHub hosting one site
 * @param {Object} options - The mock's configuration
 * @param {String} options.siteDir - The site's working tree, copied into the scratch repository
 * @param {String} options.repo - The repository's name, "owner/name", as the site's pages name it
 * @param {String} options.branch - The branch which is written and built
 * @param {Function} options.build - Builds the site: receives the scratch repository's directory, the directory into
 * which to publish, and the sha of the commit built, and returns a promise which resolves once it has built
 * @param {Number} [options.buildDelay] - How long, in ms, a run waits before it begins, as an Action queues
 * @param {Function} [options.prepare] - Receives the scratch repository's directory once it is copied, e.g. to write a
 * moduleOverrides.json5 naming checkouts by absolute paths
 * @param {String} [options.reusePages] - A site already built from the same tree, copied rather than built afresh
 * @return {Object} The mock - call `start` to build the site and begin serving it
 */
mockGitHub.create = function (options) {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mock-github-"));
    const repoDir = path.join(workDir, "repo");
    const pagesDir = path.join(workDir, "pages");
    const mock = {
        repoDir,
        pagesDir,
        commits: [],
        runs: [],
        requests: [],
        // The branch's head - every commit, by either API, moves it - and the objects posted to the Git Data API
        head: crypto.createHash("sha1").update("initial").digest("hex"),
        blobs: new Map(),
        trees: new Map(),
        gitCommits: new Map(),
        server: null,
        url: null,
        queue: Promise.resolve()
    };

    /**
     * Resolve a path within the repository, refusing one which would leave it
     * @param {String} filePath - The path, relative to the repository's root
     * @return {String|null} The absolute path, or null if it lies outside the repository
     */
    const inRepo = filePath => {
        const resolved = path.resolve(repoDir, filePath);
        return resolved.startsWith(repoDir + path.sep) ? resolved : null;
    };

    /**
     * Queue a run of the site's build, as a push triggers the site's workflow
     * @param {String} commit - The sha of the commit which queues it
     * @return {MockRun} The run
     */
    mock.queueRun = function (commit) {
        const run = {id: mock.runs.length + 1, commit, status: "queued", conclusion: null};
        mock.runs.push(run);
        mock.queue = mock.queue.then(async () => {
            await new Promise(resolve => setTimeout(resolve, options.buildDelay ?? 0));
            run.status = "in_progress";
            try {
                await options.build(repoDir, pagesDir, commit);
                run.conclusion = "success";
            } catch (error) {
                run.conclusion = "failure";
                run.error = String(error && error.message || error);
            }
            run.status = "completed";
        });
        return run;
    };

    /**
     * Resolve once every run queued has completed
     * @return {Promise} Resolves once the Actions are idle
     */
    mock.idle = () => mock.queue;

    const reply = (res, status, body, headers = {}) => {
        res.writeHead(status, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...headers});
        res.end(JSON.stringify(body));
    };

    /**
     * Read the JSON body of a request
     * @param {http.IncomingMessage} req - The request
     * @return {Promise<Object>} The parsed body
     */
    const readBody = async function (req) {
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(chunk);
        }
        return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    };

    /**
     * Make a sha for an object of the mock's own, as git names objects by the hash of their content
     * @param {String} kind - The kind of object, e.g. "tree"
     * @param {Any} content - What it holds
     * @return {String} The sha, as hex
     */
    const objectSha = (kind, content) => crypto.createHash("sha1").update(kind + " " + JSON.stringify(content)).digest("hex");

    // The sha of the tree of a commit made at the head - the repository's tree as it stands
    const headTree = () => objectSha("tree", mock.head);

    /**
     * List every file of the repository as it stands, with its blob sha, as a recursive read of the head's tree does
     * @return {Object[]} An entry `{path, mode, type, sha}` for each file
     */
    const listTree = function () {
        const walk = (dir, prefix) => fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
            const rel = prefix ? prefix + "/" + entry.name : entry.name;
            return entry.isSymbolicLink() || entry.name === ".git" ? [] : entry.isDirectory() ? walk(path.join(dir, entry.name), rel) :
                [{path: rel, mode: "100644", type: "blob", sha: mockGitHub.blobSha(fs.readFileSync(path.join(dir, entry.name)))}];
        });
        return walk(repoDir, "");
    };

    /**
     * Record a commit which has moved the head, and queue the run it triggers
     * @param {String} sha - The commit's sha
     * @param {String[]} paths - The files it wrote or removed
     * @param {String} message - Its message
     * @param {String|null} blobSha - The sha of the first file written
     * @return {MockCommit} The commit
     */
    const recordCommit = function (sha, paths, message, blobSha) {
        const commit = {sha, path: paths[0], paths, message, blobSha};
        mock.commits.push(commit);
        mock.head = sha;
        mock.queueRun(sha);
        return commit;
    };

    /**
     * Handle a request of the Git Data API, beneath /__github/repos/{owner}/{name}/git/
     * @param {http.IncomingMessage} req - The request
     * @param {http.ServerResponse} res - The response
     * @param {String} gitPath - The path beneath git/, e.g. "ref/heads/main"
     * @param {URLSearchParams} query - The request's query
     */
    const handleGit = async function (req, res, gitPath, query) {
        const refMatch = gitPath.match(/^refs?\/heads\/(.+)$/);
        const objectMatch = gitPath.match(/^(commits|trees)\/([0-9a-f]+)$/);
        mock.requests.push({method: req.method, path: "git/" + gitPath});
        if (!req.headers.authorization && req.method !== "GET") {
            reply(res, 401, {message: "Requires authentication"});
        } else if (refMatch && refMatch[1] !== options.branch) {
            reply(res, 404, {message: "Not Found"});
        } else if (refMatch && req.method === "GET") {
            reply(res, 200, {ref: "refs/heads/" + options.branch, object: {type: "commit", sha: mock.head}});
        } else if (refMatch && req.method === "PATCH") {
            const body = await readBody(req);
            const commit = mock.gitCommits.get(body.sha);
            const tree = commit ? mock.trees.get(commit.tree) : null;
            if (!commit || !tree) {
                reply(res, 422, {message: "Object does not exist"});
            } else if (commit.parents[0] !== mock.head || tree.base !== headTree()) {
                reply(res, 422, {message: "Update is not a fast forward"});
            } else {
                // The tree is applied to the repository's working tree, which is what the Action builds
                tree.entries.forEach(entry => {
                    const file = inRepo(entry.path);
                    if (entry.sha === null) {
                        fs.rmSync(file, {force: true});
                    } else {
                        fs.mkdirSync(path.dirname(file), {recursive: true});
                        fs.writeFileSync(file, mock.blobs.get(entry.sha));
                    }
                });
                const written = tree.entries.find(entry => entry.sha !== null);
                recordCommit(body.sha, tree.entries.map(entry => entry.path), commit.message, written ? written.sha : null);
                reply(res, 200, {ref: "refs/heads/" + options.branch, object: {type: "commit", sha: body.sha}});
            }
        } else if (objectMatch && req.method === "GET" && objectMatch[1] === "commits") {
            const commit = objectMatch[2] === mock.head ? {tree: headTree(), parents: []} : mock.gitCommits.get(objectMatch[2]);
            if (commit) {
                reply(res, 200, {sha: objectMatch[2], tree: {sha: commit.tree}, parents: commit.parents.map(sha => ({sha}))});
            } else {
                reply(res, 404, {message: "Not Found"});
            }
        } else if (objectMatch && req.method === "GET" && objectMatch[1] === "trees") {
            // Only the head's tree may be read, and only whole - as the extension reads it, to check its bases
            if (objectMatch[2] === headTree() && query.get("recursive")) {
                reply(res, 200, {sha: objectMatch[2], tree: listTree(), truncated: false});
            } else {
                reply(res, 404, {message: "Not Found"});
            }
        } else if (gitPath === "blobs" && req.method === "POST") {
            const content = Buffer.from((await readBody(req)).content, "base64");
            const sha = mockGitHub.blobSha(content);
            mock.blobs.set(sha, content);
            reply(res, 201, {sha});
        } else if (gitPath === "trees" && req.method === "POST") {
            const body = await readBody(req);
            const unknown = body.tree.find(entry => entry.sha !== null && !mock.blobs.has(entry.sha));
            if (body.base_tree !== headTree() || unknown || body.tree.some(entry => !inRepo(entry.path))) {
                reply(res, 422, {message: unknown ? "Blob " + unknown.sha + " does not exist" : "Invalid tree"});
            } else {
                const tree = {base: body.base_tree, entries: body.tree};
                const sha = objectSha("tree", tree);
                mock.trees.set(sha, tree);
                reply(res, 201, {sha});
            }
        } else if (gitPath === "commits" && req.method === "POST") {
            const body = await readBody(req);
            const commit = {tree: body.tree, parents: body.parents, message: body.message};
            const sha = objectSha("commit", commit);
            mock.gitCommits.set(sha, commit);
            reply(res, 201, {sha, tree: {sha: body.tree}});
        } else {
            reply(res, 404, {message: "Not Found"});
        }
    };

    /**
     * Handle a request of the Contents API - GET and PUT of /__github/repos/{owner}/{name}/contents/{path}
     * @param {http.IncomingMessage} req - The request
     * @param {http.ServerResponse} res - The response
     * @param {String} apiPath - The path of the request beneath /__github
     * @param {URLSearchParams} query - The request's query
     */
    const handleApi = async function (req, res, apiPath, query) {
        const gitMatch = apiPath.match(/^\/repos\/([^/]+\/[^/]+)\/git\/(.+)$/);
        const match = apiPath.match(/^\/repos\/([^/]+\/[^/]+)\/contents\/(.+)$/);
        const filePath = match ? match[2].split("/").map(decodeURIComponent).join("/") : null;
        const file = filePath ? inRepo(filePath) : null;
        mock.requests.push({method: req.method, path: filePath});
        if (req.method === "OPTIONS") {
            res.writeHead(204, {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, PUT, POST, PATCH, OPTIONS",
                "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, X-GitHub-Api-Version"});
            res.end();
        } else if (gitMatch && gitMatch[1] === options.repo) {
            await handleGit(req, res, gitMatch[2].split("/").map(decodeURIComponent).join("/"), query);
        } else if (!match || match[1] !== options.repo || !file) {
            reply(res, 404, {message: "Not Found"});
        } else if (req.method === "GET") {
            if (fs.existsSync(file)) {
                const content = fs.readFileSync(file);
                reply(res, 200, {type: "file", path: filePath, sha: mockGitHub.blobSha(content), encoding: "base64",
                    content: content.toString("base64").replace(/.{60}/g, "$&\n")});
            } else {
                reply(res, 404, {message: "Not Found"});
            }
        } else if (req.method === "PUT") {
            const body = await readBody(req);
            const exists = fs.existsSync(file);
            const currentSha = exists ? mockGitHub.blobSha(fs.readFileSync(file)) : null;
            if (!req.headers.authorization) {
                reply(res, 401, {message: "Requires authentication"});
            } else if (body.branch && body.branch !== options.branch) {
                reply(res, 404, {message: "Branch not found"});
            } else if (exists && !body.sha) {
                reply(res, 422, {message: "Invalid request. \"sha\" wasn't supplied."});
            } else if (exists && body.sha !== currentSha) {
                reply(res, 409, {message: `${filePath} does not match ${body.sha}`});
            } else if (!exists && body.sha) {
                reply(res, 409, {message: `${filePath} does not exist`});
            } else {
                const content = Buffer.from(body.content, "base64");
                fs.mkdirSync(path.dirname(file), {recursive: true});
                fs.writeFileSync(file, content);
                const blobSha = mockGitHub.blobSha(content);
                const commit = recordCommit(crypto.createHash("sha1").update("commit " + mock.commits.length + " " + blobSha).digest("hex"),
                    [filePath], body.message, blobSha);
                reply(res, exists ? 200 : 201, {content: {path: filePath, sha: blobSha}, commit: {sha: commit.sha}});
            }
        } else {
            reply(res, 405, {message: "Method not allowed"});
        }
    };

    const types = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
        ".vue": "text/plain", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2"};

    /**
     * Serve a file of the published site, as Pages does
     * @param {http.ServerResponse} res - The response
     * @param {String} urlPath - The path requested
     */
    const handlePages = function (res, urlPath) {
        let file = path.resolve(pagesDir, "." + urlPath);
        if (file.startsWith(pagesDir) && fs.existsSync(file) && fs.statSync(file).isDirectory()) {
            file = path.join(file, "index.html");
        }
        if (file.startsWith(pagesDir) && fs.existsSync(file) && fs.statSync(file).isFile()) {
            res.writeHead(200, {"Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store"});
            res.end(fs.readFileSync(file));
        } else {
            res.writeHead(404, {"Content-Type": "text/plain"});
            res.end("Not found");
        }
    };

    /**
     * Copy the site into the scratch repository, build it once, and begin serving the API and the site
     * @return {Promise<Object>} The mock, once serving - `url` is that of the published site, and `apiUrl` that of the API
     */
    mock.start = async function () {
        mockGitHub.copyTree(options.siteDir, repoDir);
        if (options.prepare) {
            await options.prepare(repoDir);
        }
        // A site already built from the same tree may be reused, to save a build while developing a scenario
        if (options.reusePages && fs.existsSync(options.reusePages)) {
            fs.cpSync(options.reusePages, pagesDir, {recursive: true});
        } else {
            await options.build(repoDir, pagesDir, "initial");
        }
        mock.server = http.createServer((req, res) => {
            const url = new URL(req.url, "http://localhost");
            const urlPath = decodeURIComponent(url.pathname);
            if (urlPath.startsWith("/__github/")) {
                handleApi(req, res, urlPath.substring("/__github".length), url.searchParams).catch(error => reply(res, 500, {message: String(error)}));
            } else {
                handlePages(res, urlPath);
            }
        });
        await new Promise(resolve => mock.server.listen(0, "127.0.0.1", resolve));
        mock.url = "http://127.0.0.1:" + mock.server.address().port + "/";
        mock.apiUrl = mock.url + "__github";
        return mock;
    };

    /**
     * Stop serving, once every run has completed, and remove the scratch repository and site
     * @return {Promise} Resolves once stopped
     */
    mock.stop = async function () {
        await mock.idle();
        await new Promise(resolve => mock.server ? mock.server.close(resolve) : resolve());
        fs.rmSync(workDir, {recursive: true, force: true});
    };

    return mock;
};

module.exports = mockGitHub;
