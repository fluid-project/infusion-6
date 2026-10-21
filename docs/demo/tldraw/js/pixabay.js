"use strict";

// Image search through the Pixabay API, used by the image widget to find an image matching its prompt.
// See https://pixabay.com/api/docs/ - in return for free use, Pixabay asks that its images are credited wherever they
// are displayed, that requests are cached for 24 hours, and that its image URLs, which expire after 24 hours, are only
// used to display results rather than being stored permanently.
// The API key is embedded here so that the published demos can search Pixabay - like any key used from a browser,
// it is visible to anyone using the page.

fluid.registerNamespace("fluid.demos.pixabay");

fluid.demos.pixabay.endpoint = "https://pixabay.com/api/";

fluid.demos.pixabay.apiKey = "58157703-99293e2070e383ef816376524";

// The longest query which the API accepts
fluid.demos.pixabay.maxQueryLength = 100;

// How long the results of a request are cached, as the API's terms require
fluid.demos.pixabay.cacheLifetime = 24 * 60 * 60 * 1000;

/**
 * @typedef {Object} PixabayImage
 * @property {Number} id - Pixabay's id for the image, from which an expired URL can be refreshed
 * @property {String} url - The URL of the image, at most 640px wide, which expires after 24 hours
 * @property {Number} width - The image's width at this URL
 * @property {Number} height - The image's height at this URL
 * @property {String} tags - Pixabay's comma-separated keywords for the image, suitable as its alternative text
 * @property {String} pageURL - The image's page on Pixabay
 * @property {String} user - The name of the image's contributor
 * @property {String} userURL - The contributor's profile page on Pixabay
 */

/**
 * Convert a hit returned by the Pixabay API into the record of an image held by a widget
 * @param {Object} hit - A member of the `hits` of a Pixabay API response
 * @return {PixabayImage} The image record
 */
fluid.demos.pixabay.hitToImage = function (hit) {
    return {
        id: hit.id,
        url: hit.webformatURL,
        width: hit.webformatWidth,
        height: hit.webformatHeight,
        tags: hit.tags,
        pageURL: hit.pageURL,
        user: hit.user,
        userURL: `https://pixabay.com/users/${encodeURIComponent(hit.user)}-${hit.user_id}/`
    };
};

/**
 * Fetch a resource - held here so that it may be replaced in tests
 * @param {String} url - The URL of the resource
 * @return {Promise<Response>} A promise for the response
 */
fluid.demos.pixabay.fetch = url => fetch(url);

// Responses to recent requests, keyed by the request's parameters, each as {time, images}
fluid.demos.pixabay.cache = new Map();

/**
 * Make a request of the Pixabay API, answering it from the cache if it was made within the last 24 hours
 * @param {Object<String, String>} params - The request's parameters, other than the API key
 * @return {Promise<PixabayImage[]>} A promise for the images found
 */
fluid.demos.pixabay.request = async function (params) {
    const cacheKey = new URLSearchParams(params).toString();
    const cached = fluid.demos.pixabay.cache.get(cacheKey);
    let togo;
    if (cached && Date.now() - cached.time < fluid.demos.pixabay.cacheLifetime) {
        togo = cached.images;
    } else {
        const response = await fluid.demos.pixabay.fetch(fluid.demos.pixabay.endpoint + "?" + new URLSearchParams({key: fluid.demos.pixabay.apiKey, ...params}));
        if (response.ok) {
            const payload = await response.json();
            togo = payload.hits.map(fluid.demos.pixabay.hitToImage);
            fluid.demos.pixabay.cache.set(cacheKey, {time: Date.now(), images: togo});
        } else if (response.status === 429) {
            throw new Error("Too many images have been requested from Pixabay - please wait a minute and try again");
        } else {
            throw new Error(`Pixabay responded ${response.status} ${response.statusText}: ${(await response.text()).substring(0, 200)}`);
        }
    }
    return togo;
};

/**
 * Search for images matching some text
 * @param {String} text - The text to search for, which is truncated to the longest query the API accepts
 * @return {Promise<PixabayImage[]>} A promise for the images found, most popular first
 */
fluid.demos.pixabay.search = function (text) {
    return fluid.demos.pixabay.request({
        q: text.trim().substring(0, fluid.demos.pixabay.maxQueryLength),
        safesearch: "true",
        per_page: "20"
    });
};

/**
 * Look up an image by its Pixabay id, e.g. to refresh its URL once this has expired
 * @param {Number} id - Pixabay's id for the image
 * @return {Promise<PixabayImage|undefined>} A promise for the image, or `undefined` if it no longer exists
 */
fluid.demos.pixabay.lookup = function (id) {
    return fluid.demos.pixabay.request({id: String(id)}).then(images => images[0]);
};
