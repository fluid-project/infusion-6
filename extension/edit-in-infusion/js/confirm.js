"use strict";

// The window in which the user confirms a commit asked for by a page being edited - see fluidConfirm in background.js.
// It is the extension's own page, which no script of the page edited can reach, and shows what would be committed:
// the repository, branch and file, any further files, and the change to the file's text.

(function () {
    const request = new URLSearchParams(location.search).get("request");

    /**
     * Find the lines of two texts in common, by their longest common subsequence, and list each line of either as kept,
     * removed or added
     * @param {String[]} from - The lines before
     * @param {String[]} to - The lines after
     * @return {Object[]} `{kind, line}` for each, `kind` one of "keep", "del" and "add"
     */
    const diffLines = function (from, to) {
        const lengths = Array.from({length: from.length + 1}, () => new Array(to.length + 1).fill(0));
        for (let i = from.length - 1; i >= 0; i--) {
            for (let j = to.length - 1; j >= 0; j--) {
                lengths[i][j] = from[i] === to[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
            }
        }
        const togo = [];
        let i = 0, j = 0;
        while (i < from.length || j < to.length) {
            if (i < from.length && j < to.length && from[i] === to[j]) {
                togo.push({kind: "keep", line: from[i]});
                i++;
                j++;
            } else if (j < to.length && (i === from.length || lengths[i][j + 1] >= lengths[i + 1][j])) {
                togo.push({kind: "add", line: to[j]});
                j++;
            } else {
                togo.push({kind: "del", line: from[i]});
                i++;
            }
        }
        return togo;
    };

    /**
     * Show the change to the file's text, with two lines of context about each change
     * @param {String} baseText - The text it replaces
     * @param {String} text - The text committed
     */
    const showDiff = function (baseText, text) {
        const holder = document.getElementById("diff");
        const lines = diffLines(baseText === "" ? [] : baseText.split("\n"), text.split("\n"));
        const near = index => lines.slice(Math.max(0, index - 2), index + 3).some(line => line.kind !== "keep");
        let skipped = 0;
        const append = (kind, text) => {
            const div = holder.appendChild(document.createElement("div"));
            div.className = kind;
            div.textContent = text;
        };
        lines.forEach((line, index) => {
            if (line.kind === "keep" && !near(index)) {
                skipped++;
            } else {
                if (skipped > 0) {
                    append("skip", "... " + skipped + " unchanged line" + (skipped === 1 ? "" : "s"));
                    skipped = 0;
                }
                append(line.kind, (line.kind === "add" ? "+ " : line.kind === "del" ? "- " : "  ") + line.line);
            }
        });
        if (skipped > 0) {
            append("skip", "... " + skipped + " unchanged line" + (skipped === 1 ? "" : "s"));
        }
    };

    /**
     * Send the user's decision to the service worker, which closes this window
     * @param {Boolean} confirmed - Whether the user confirmed the commit
     */
    const decide = function (confirmed) {
        document.getElementById("approve").disabled = true;
        chrome.runtime.sendMessage({type: "confirm-decide", request, confirmed});
    };

    document.getElementById("approve").addEventListener("click", () => decide(true));
    document.getElementById("decline").addEventListener("click", () => decide(false));

    chrome.runtime.sendMessage({type: "confirm-review", request}).then(reply => {
        const review = reply && reply.ok ? reply.result : null;
        if (review) {
            const claim = review.claim;
            document.getElementById("repo").textContent = claim.repo;
            document.getElementById("branch").textContent = claim.branch;
            document.getElementById("path").textContent = claim.path + (claim.baseSha ? "" : " (a new file)");
            document.getElementById("page").textContent = claim.page || "";
            const further = Object.entries(claim.files || {});
            document.getElementById("further").hidden = further.length === 0;
            further.forEach(([path, file]) => {
                document.getElementById("files").appendChild(document.createElement("li")).textContent = path + (file.hash === null ? " (removed)" : "");
            });
            showDiff(review.baseText, claim.text);
            document.getElementById("approve").disabled = false;
        } else {
            document.getElementById("status").textContent = "This request has already been decided, or has lapsed.";
        }
    });
})();
