"use strict";

// The service worker by which an editing client, e.g. the "Edit in Infusion" extension, shows the files of edits held in
// the browser - e.g. an image dropped into a post, or a widget's SFC - as if the site already published them, before it
// is rebuilt: the held files are the most specific layer of the site - see `bases` in site.js. wend's build publishes it
// at the root of the site, as wend-preview-sw.js. Only an editing client registers it; a visitor never has it.
// The client writes each held file into the Cache named for the worker's scope - see `previewImages` in the extension's
// bridge.js - at the URL the site will publish it at, and the worker answers any request in its scope which the Cache
// holds from there, and every other from the network, as if it were absent. An entry older than `maxAge` is ignored, so
// that one left behind, e.g. by an editor who has since removed the extension, can't stand for the site for long.

// The age, in ms, beyond which an entry of the Cache is ignored - it is written afresh whenever an edit is shown
const maxAge = 24 * 60 * 60 * 1000;
// The header of an entry recording when it was written, in ms since the epoch
const heldHeader = "X-Wend-Held";

/**
 * Name the Cache holding the files held for the site of a scope - a site's own, since several sites may share an
 * origin, e.g. the project sites of one owner on GitHub Pages
 * @param {String} scope - The worker's scope
 * @return {String} The Cache's name
 */
const cacheName = scope => "wend-preview " + scope;

/**
 * Answer a request from the files held, if they hold it, or else from the network
 * @param {Request} request - The request
 * @return {Promise<Response>} The response
 */
const answer = async function (request) {
    const cache = await caches.open(cacheName(self.registration.scope));
    const held = await cache.match(request.url, {ignoreSearch: true});
    const fresh = held && Date.now() - Number(held.headers.get(heldHeader) || 0) < maxAge;
    return fresh ? held : fetch(request);
};

self.addEventListener("install", () => self.skipWaiting());

// The pages of the site already open are taken under control at once, so that a file held is shown without reloading
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", event => {
    // Pages themselves are always the site's - only what they load may be held
    if (event.request.method === "GET" && event.request.mode !== "navigate") {
        event.respondWith(answer(event.request));
    }
});
