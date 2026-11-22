"use strict";

// Claims - edits held in this browser until the published site has caught up with them, in the manner of bioReportR's
// curation claims (notes/community-curation-design.md). Kept in IndexedDB on the extension's own origin, by the
// service worker, so that the pages edited can neither read nor alter them. See
// a-scratch/reports/0-live-static-editing.md in Infusion 6, section 3.2.

/**
 * A claim on one source file of a site's repository.
 * @typedef {Object} Claim
 * @property {String} id - The claim's key, "<repo>:<path>"
 * @property {String} repo - The repository, "owner/name"
 * @property {String} branch - The branch edited
 * @property {String} path - The path of the file within the repository
 * @property {String} page - The site-relative URL of the page showing it
 * @property {String} baseHash - The trace's hash of the file the edit was based on
 * @property {String} baseSha - The git blob sha of that file, the expected base of the commit
 * @property {String} text - The edited text of the whole file
 * @property {String} hash - The hash of `text`, as the trace records hashes
 * @property {String} state - "uncommitted", "committed" or "conflict"
 * @property {String} [commitSha] - The commit made of it, once committed
 * @property {String} [message] - A description of the claim's state, e.g. of a conflict
 * @property {Object<String, ClaimFile>} [files] - Further files edited with this one, by path, committed with it as one
 * changeset - e.g. an image dropped into a post, or an SFC of a widget inserted into it
 * @property {String[]} [conflicts] - The paths of the files found changed since their bases, once in conflict
 * @property {Number} updated - When the claim was last changed, in ms since the epoch
 */

/**
 * A further file of a claim's changeset
 * @typedef {Object} ClaimFile
 * @property {String|null} content - Its content as base64, or null for a file removed
 * @property {String} [baseSha] - The git blob sha of the file it replaces - absent for a file created
 * @property {String|null} hash - The hash of its content, as the trace records the hashes of static files in
 * `staticFiles`, or null for a file removed
 */

const fluidClaims = {
    dbName: "fluid-edit-claims",
    storeName: "claims",
    dbPromise: null
};

/**
 * Open the database of claims, creating it if absent
 * @return {Promise<IDBDatabase>} The database
 */
fluidClaims.open = function () {
    if (!fluidClaims.dbPromise) {
        fluidClaims.dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(fluidClaims.dbName, 1);
            request.onupgradeneeded = () => {
                request.result.createObjectStore(fluidClaims.storeName, {keyPath: "id"});
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    return fluidClaims.dbPromise;
};

/**
 * Run one request against the store of claims
 * @param {String} mode - "readonly" or "readwrite"
 * @param {Function} makeRequest - Receives the object store and returns an IDBRequest
 * @return {Promise<Any>} The request's result
 */
fluidClaims.request = async function (mode, makeRequest) {
    const db = await fluidClaims.open();
    return new Promise((resolve, reject) => {
        const request = makeRequest(db.transaction(fluidClaims.storeName, mode).objectStore(fluidClaims.storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

/**
 * Compute the key of the claim on a file
 * @param {String} repo - The repository
 * @param {String} path - The path of the file
 * @return {String} The key
 */
fluidClaims.idOf = (repo, path) => repo + ":" + path;

/**
 * Get the claim on a file, if any
 * @param {String} id - The claim's key
 * @return {Promise<Claim|undefined>} The claim
 */
fluidClaims.get = id => fluidClaims.request("readonly", store => store.get(id));

/**
 * Store a claim, replacing any of the same key
 * @param {Claim} claim - The claim
 * @return {Promise<Claim>} The claim as stored, with `updated` set
 */
fluidClaims.put = async function (claim) {
    const stored = {...claim, updated: Date.now()};
    await fluidClaims.request("readwrite", store => store.put(stored));
    return stored;
};

/**
 * Delete a claim
 * @param {String} id - The claim's key
 * @return {Promise} Resolves once it is deleted
 */
fluidClaims.remove = id => fluidClaims.request("readwrite", store => store.delete(id));

/**
 * List every claim
 * @return {Promise<Claim[]>} The claims
 */
fluidClaims.list = () => fluidClaims.request("readonly", store => store.getAll());
