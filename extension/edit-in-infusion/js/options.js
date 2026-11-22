"use strict";

const statusNode = document.getElementById("status");
const input = document.getElementById("token");

chrome.storage.local.get("githubToken").then(stored => {
    if (stored.githubToken) {
        statusNode.textContent = "A token is saved";
    }
});

document.getElementById("save").addEventListener("click", () => {
    chrome.storage.local.set({githubToken: input.value.trim()}).then(() => {
        input.value = "";
        statusNode.textContent = "Saved";
    });
});

document.getElementById("clear").addEventListener("click", () => {
    chrome.storage.local.remove("githubToken").then(() => {
        statusNode.textContent = "Forgotten";
    });
});

/**
 * List the enlisted sites, each with a button to forget it
 */
const listSites = async function () {
    const reply = await chrome.runtime.sendMessage({type: "sites-list"});
    const sites = reply && reply.ok ? reply.result : [];
    const list = document.getElementById("sites");
    list.textContent = "";
    sites.forEach(pattern => {
        const item = list.appendChild(document.createElement("li"));
        item.appendChild(document.createElement("code")).textContent = pattern.replace(/\/\*$/, "");
        const button = item.appendChild(document.createElement("button"));
        button.textContent = "Forget";
        button.addEventListener("click", async function () {
            await chrome.runtime.sendMessage({type: "site-forget", pattern});
            listSites();
        });
    });
    document.getElementById("no-sites").hidden = sites.length > 0;
};

listSites();
