"use strict";

// The window in which the user confirms a commit asked for by a page being edited - see fluidConfirm in background.js.
// It is the extension's own page, which no script of the page edited can reach, and lists what may be committed: the
// claim asked for, and with it every other uncommitted claim on the same branch - each with any further files, and
// the change to its file's text - of which the user chooses those to commit together, as one commit.

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
     * Show the change to a file's text, with two lines of context about each change
     * @param {Element} holder - The element to hold it
     * @param {String} baseText - The text it replaces
     * @param {String} text - The text committed
     */
    const showDiff = function (holder, baseText, text) {
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

    const boxes = () => Array.from(document.querySelectorAll(".claim input[type=checkbox]"));

    /**
     * Bring the summary of the files, and the button committing, into line with the claims chosen
     */
    const updateChosen = function () {
        const chosen = boxes().filter(box => box.checked);
        boxes().forEach(box => box.closest(".claim").classList.toggle("unchosen", !box.checked));
        document.getElementById("path").textContent = chosen.map(box => box.dataset.path).join(", ") || "(none chosen)";
        document.getElementById("approve").disabled = chosen.length === 0;
    };

    /**
     * Send the user's decision to the service worker, which closes this window
     * @param {Boolean} confirmed - Whether the user confirmed the commit of the claims chosen
     */
    const decide = function (confirmed) {
        document.getElementById("approve").disabled = true;
        const ids = confirmed ? boxes().filter(box => box.checked).map(box => box.value) : [];
        chrome.runtime.sendMessage({type: "confirm-decide", request, confirmed, ids});
    };

    /**
     * Show one claim which may be committed, chosen to be at first
     * @param {Object} review - `{claim, baseText}`
     * @param {Boolean} requested - Whether it is the claim whose commit was asked for
     */
    const showClaim = function (review, requested) {
        const claim = review.claim;
        const section = document.getElementById("claims").appendChild(document.createElement("section"));
        section.className = "claim";
        const label = section.appendChild(document.createElement("label"));
        const box = label.appendChild(document.createElement("input"));
        box.type = "checkbox";
        box.checked = true;
        box.value = claim.id;
        box.dataset.path = claim.path;
        box.addEventListener("change", updateChosen);
        const name = label.appendChild(document.createElement("span"));
        name.className = "claim-path";
        name.textContent = claim.path + (claim.baseSha ? "" : " (a new file)") + (requested ? "" : " - edited elsewhere");
        const page = section.appendChild(document.createElement("div"));
        page.className = "claim-page";
        page.textContent = claim.page ? "From " + claim.page : "";
        const further = Object.entries(claim.files || {});
        if (further.length > 0) {
            const list = section.appendChild(document.createElement("ul"));
            further.forEach(([path, file]) => {
                list.appendChild(document.createElement("li")).textContent = path + (file.hash === null ? " (removed)" : "");
            });
        }
        const diff = section.appendChild(document.createElement("div"));
        diff.className = "diff";
        showDiff(diff, review.baseText, claim.text);
    };

    document.getElementById("approve").addEventListener("click", () => decide(true));
    document.getElementById("decline").addEventListener("click", () => decide(false));

    chrome.runtime.sendMessage({type: "confirm-review", request}).then(reply => {
        const review = reply && reply.ok ? reply.result : null;
        if (review && review.claims.length > 0) {
            const first = review.claims[0].claim;
            document.getElementById("repo").textContent = first.repo;
            document.getElementById("branch").textContent = first.branch;
            review.claims.forEach((one, index) => showClaim(one, index === 0));
            updateChosen();
        } else {
            document.getElementById("status").textContent = "This request has already been decided, or has lapsed.";
        }
    });
})();
