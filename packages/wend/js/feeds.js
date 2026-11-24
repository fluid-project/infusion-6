
"use strict";

// Hugo's auxiliary outputs which are not HTML documents - RSS feeds and the sitemap - generated from the site model.
// These are outside the view layer.

const wend = {feeds: {}};

/**
 * Escape text for inclusion in XML
 * @param {String} text - The text
 * @return {String} The escaped text
 */
wend.feeds.escape = function (text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
};

/**
 * Format a date as RSS requires - RFC 822, as Hugo renders it
 * @param {String} isoDate - The date in ISO 8601 form
 * @return {String} The formatted date
 */
wend.feeds.rfc822 = function (isoDate) {
    return new Date(isoDate).toUTCString().replace("GMT", "+0000");
};

/**
 * Render the RSS feed of a list page - Hugo's rss.xml template
 * @param {Object} config - The site's configuration, as held by the site model
 * @param {Object} listPage - The record of the list page
 * @param {Object[]} items - The records of the pages it lists, newest first
 * @return {String} The text of the feed
 */
wend.feeds.rss = function (config, listPage, items) {
    const author = config.author ?? {};
    const managing = author.email ? `${author.email} (${author.name})` : "";
    const title = listPage.kind === "home" ? config.title : `${listPage.title} on ${config.title}`;
    const dated = items.filter(item => item.date);
    const itemText = items.map(item => `
    <item>
      <title>${wend.feeds.escape(item.title)}</title>
      <link>${item.permalink}</link>${item.date ? `
      <pubDate>${wend.feeds.rfc822(item.date)}</pubDate>` : ""}${managing ? `<author>${wend.feeds.escape(managing)}</author>` : ""}
      <guid>${item.permalink}</guid>
      <description>${wend.feeds.escape(item.summary)}</description>
    </item>`).join("");
    return `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${wend.feeds.escape(title)}</title>
    <link>${listPage.permalink}</link>
    <description>Recent content ${listPage.kind === "home" ? "" : "in " + wend.feeds.escape(listPage.title) + " "}on ${wend.feeds.escape(config.title)}</description>
    <generator>Infusion 6</generator>
    <language>${config.defaultContentLanguage}</language>${managing ? `
    <managingEditor>${wend.feeds.escape(managing)}</managingEditor>
    <webMaster>${wend.feeds.escape(managing)}</webMaster>` : ""}${dated.length > 0 ? `
    <lastBuildDate>${wend.feeds.rfc822(dated[0].date)}</lastBuildDate>` : ""}
    <atom:link href="${listPage.permalink}index.xml" rel="self" type="application/rss+xml" />${itemText}
  </channel>
</rss>
`;
};

/**
 * Render the sitemap - Hugo's sitemap.xml template
 * @param {Object[]} pages - The records of all the site's pages
 * @return {String} The text of the sitemap
 */
wend.feeds.sitemap = function (pages) {
    const entries = pages.filter(page => page.kind !== "404" && !(page.paginator?.pageNumber > 1)).map(page => `
  <url>
    <loc>${page.permalink}</loc>${page.lastmod || page.date ? `
    <lastmod>${new Date(page.lastmod || page.date).toISOString().replace(/\.\d+Z$/, "+00:00")}</lastmod>` : ""}
  </url>`).join("");
    return `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml">${entries}
</urlset>
`;
};

/**
 * Compute every feed of the site - one for the home page, and one for each section, taxonomy and term - as files to
 * be written, together with the sitemap
 * @param {Object} model - The site model, as loaded by siteModel.js
 * @return {Object<String, String>} The text of each file, keyed by its path relative to the publish directory
 */
wend.feeds.files = function (model) {
    const byPermalink = Object.fromEntries(model.pages.map(page => [page.relPermalink, page]));
    const regular = model.pages.filter(page => page.kind === "page");
    const feedOf = function (listPage) {
        // A feed lists all of a list's pages, not just its first page of them - the home page's, every regular page
        const members = listPage.kind === "home" ? regular : (listPage.paginator?.allPages ?? []).map(link => byPermalink[link]);
        return wend.feeds.rss(model.config, listPage, members.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")));
    };
    const lists = model.pages.filter(page => ["home", "section", "taxonomy", "term"].includes(page.kind) && !(page.paginator?.pageNumber > 1));
    return {
        ...Object.fromEntries(lists.map(listPage => [listPage.relPermalink + "index.xml", feedOf(listPage)])),
        "/sitemap.xml": wend.feeds.sitemap(model.pages)
    };
};

module.exports = wend.feeds;
