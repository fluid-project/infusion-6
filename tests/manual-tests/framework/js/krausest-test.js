"use strict";

/* eslint-disable no-console */

const adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd", "unsightly", "adorable", "important", "inexpensive", "cheap", "expensive", "fancy"];
const colours = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"];
const nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie", "sandwich", "burger", "pizza", "mouse", "keyboard"];

const pick = dict => dict[Math.round(Math.random() * 1000) % dict.length];
const label = () => `${pick(adjectives)} ${pick(colours)} ${pick(nouns)}`;
const labelOf = r => r.firstChild.nextSibling.firstChild.firstChild;

let ID = 1, SEL, TMPL, SIZE;
const [[TABLE], [TBODY], [TROW], BUTTONS] = "table,tbody,#trow,button"
        .split(",").map(s => document.querySelectorAll(s)), ROWS = TBODY.children;

const {cloneNode, insertBefore} = Node.prototype;
const clone = n => cloneNode.call(n, true);
const insert = insertBefore.bind(TBODY);
// Original rendering method dealing with all actions by synthesizing DOM nodes
const create = (count, add) => {
    if (SIZE !== count) {
        TMPL = clone(TROW.content);
        [...Array((SIZE = count) / 50 - 1)].forEach(() => TMPL.appendChild(clone(TMPL.firstChild)));
    }
    !add && (clear(), TBODY.remove());
    while (count) {
        for (const r of TMPL.children) {
            (r.$id ??= r.firstChild.firstChild).nodeValue = "" + (ID++);
            (r.$label ??= labelOf(r)).nodeValue = label();
            count--;
        }
        insert(clone(TMPL), null);
    }
    !add && TABLE.appendChild(TBODY);
};

const rowText = function (ID, label) {
    return `<tr><td class="col-md-1">${ID}</td><td class="col-md-4"><a>${label}</a></td><td class="col-md-1"><a><span class="glyphicon glyphicon-remove" aria-hidden="true"></span></a></td><td class="col-md-6"></td></tr>`;
};

// Rendering method using bulk assignment to InnerHTML - only deals with "run" and "runlots" actions
const createString = (count) => {
    let text = "";
    while (count) {
        text += rowText(ID++, label());
        count--;
    };
    TBODY.innerHTML = text;
};


// eslint-disable-next-line no-sequences
const clear = () => (TBODY.textContent = "", SEL = null);

BUTTONS.forEach(function (b) { b.onclick = this[b.id]; }, {
    run() {
        const now = Date.now();
        const its = 1000;
        create(1000);
        //createString(1000);
        const delay = (Date.now() - now);
        const time = 1000 * (delay / its);


        console.log(its + " iterations concluded in " + delay + " ms: " + time + " us/it");
    },
    runlots() {
        const now = Date.now();
        const its = 10000;
        create(10000);
        //createString(10000);
        const delay = (Date.now() - now);
        const time = 1000 * (delay / its);

        console.log(its + " iterations concluded in " + delay + " ms: " + time + " us/it");
    },
    add() {
        create(1000, true);
    },
    clear,
    update() {
        // eslint-disable-next-line no-cond-assign
        for (let i = 0, r; r = ROWS[i]; i += 10) {
            labelOf(r).nodeValue += " !!!";
        }
    },
    swaprows() {
        const [, r1, r2] = ROWS, r998 = ROWS[998];
        r998 && (insert(r1, r998), insert(r998, r2));
    }
});

TBODY.onclick = e => {
    const t = e.target, n = t.tagName, r = t.closest("TR");
    e.stopPropagation();
    (n === "SPAN" || n === "A" && t.firstElementChild) ? r.remove() :
        n === "A" && (SEL && (SEL.className = ""), (SEL = r).className = "danger");
};
