/**
 * GPTCaml - a small line diff, so a proposed fix can be reviewed before it is
 * applied. No dependency: the buffers here are single files, an O(n*m) LCS is
 * plenty (and we bail out to a coarse view on pathologically big ones).
 */
window.GPTCAML = window.GPTCAML || {};

(function (NS) {
    "use strict";

    var MAX_LINES = 1500;
    var CONTEXT = 3;

    function split(text) {
        return text.replace(/\r\n/g, "\n").split("\n");
    }

    /** @return {Array<{type: "ctx"|"add"|"del", text: string, a: ?number, b: ?number}>} */
    function diff(before, after) {
        var A = split(before), B = split(after);
        if (A.length > MAX_LINES || B.length > MAX_LINES) {
            return A.map(function (l, i) { return {type: "del", text: l, a: i + 1, b: null}; })
                .concat(B.map(function (l, i) { return {type: "add", text: l, a: null, b: i + 1}; }));
        }

        var n = A.length, m = B.length;
        var lcs = [];
        for (var i = 0; i <= n; i++) lcs.push(new Uint16Array(m + 1));
        for (i = n - 1; i >= 0; i--) {
            for (var j = m - 1; j >= 0; j--) {
                lcs[i][j] = A[i] === B[j] ? lcs[i + 1][j + 1] + 1
                    : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
            }
        }

        var rows = [];
        i = 0; j = 0;
        while (i < n && j < m) {
            if (A[i] === B[j]) {
                rows.push({type: "ctx", text: A[i], a: i + 1, b: j + 1});
                i++; j++;
            } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
                rows.push({type: "del", text: A[i], a: i + 1, b: null});
                i++;
            } else {
                rows.push({type: "add", text: B[j], a: null, b: j + 1});
                j++;
            }
        }
        while (i < n) { rows.push({type: "del", text: A[i], a: i + 1, b: null}); i++; }
        while (j < m) { rows.push({type: "add", text: B[j], a: null, b: j + 1}); j++; }
        return rows;
    }

    /** Drop runs of unchanged lines that are more than CONTEXT away from a change. */
    function collapse(rows) {
        var keep = new Array(rows.length);
        rows.forEach(function (r, i) {
            if (r.type === "ctx") return;
            for (var k = Math.max(0, i - CONTEXT); k <= Math.min(rows.length - 1, i + CONTEXT); k++) keep[k] = true;
        });
        var out = [], skipped = 0;
        rows.forEach(function (r, i) {
            if (keep[i]) {
                if (skipped) { out.push({type: "gap", text: "@@ " + skipped + " unchanged line" + (skipped > 1 ? "s" : "") + " @@"}); skipped = 0; }
                out.push(r);
            } else {
                skipped++;
            }
        });
        if (skipped) out.push({type: "gap", text: "@@ " + skipped + " unchanged line" + (skipped > 1 ? "s" : "") + " @@"});
        return out;
    }

    function stats(rows) {
        var added = 0, removed = 0;
        rows.forEach(function (r) {
            if (r.type === "add") added++;
            else if (r.type === "del") removed++;
        });
        return {added: added, removed: removed, changed: added + removed > 0};
    }

    /** Build the DOM for a diff; caller inserts it. */
    function render(before, after) {
        var rows = diff(before, after);
        var st = stats(rows);
        var pre = document.createElement("div");
        pre.className = "ai-diff";
        if (!st.changed) {
            pre.innerHTML = '<div class="ai-diff-empty">The proposed code is identical to what is already in the editor.</div>';
            return {node: pre, stats: st};
        }
        collapse(rows).forEach(function (r) {
            var line = document.createElement("div");
            line.className = "ai-diff-line ai-diff-" + r.type;
            var sign = r.type === "add" ? "+" : r.type === "del" ? "-" : r.type === "gap" ? "" : " ";
            line.textContent = sign + r.text;
            pre.appendChild(line);
        });
        return {node: pre, stats: st};
    }


    /**
     * Pair the unified rows into side-by-side ones: a run of deletions and the
     * run of additions that replaced it line up index by index, so a changed
     * line sits opposite the line it changed from instead of underneath it.
     */
    function pair(rows) {
        var out = [], dels = [], adds = [];

        function flush() {
            var n = Math.max(dels.length, adds.length);
            for (var i = 0; i < n; i++) {
                out.push({
                    left: dels[i] || null,
                    right: adds[i] || null,
                    type: (dels[i] && adds[i]) ? "change" : (dels[i] ? "del" : "add")
                });
            }
            dels = [];
            adds = [];
        }

        rows.forEach(function (r) {
            if (r.type === "del") { dels.push(r); return; }
            if (r.type === "add") { adds.push(r); return; }
            flush();
            out.push({left: r, right: r, type: "ctx"});
        });
        flush();
        return out;
    }

    function collapse_pairs(pairs) {
        var keep = new Array(pairs.length);
        pairs.forEach(function (p, i) {
            if (p.type === "ctx") return;
            for (var k = Math.max(0, i - CONTEXT); k <= Math.min(pairs.length - 1, i + CONTEXT); k++) keep[k] = true;
        });
        var out = [], skipped = 0;
        pairs.forEach(function (p, i) {
            if (keep[i]) {
                if (skipped) { out.push({type: "gap", skipped: skipped}); skipped = 0; }
                out.push(p);
            } else {
                skipped++;
            }
        });
        if (skipped) out.push({type: "gap", skipped: skipped});
        return out;
    }

    function cell(row, side) {
        var div = document.createElement("div");
        div.className = "ai-split-cell ai-split-" + side;
        if (!row) {
            div.classList.add("ai-split-blank");
            return div;
        }
        var num = document.createElement("span");
        num.className = "ai-split-num";
        num.textContent = (side === "left" ? row.a : row.b) || "";
        var text = document.createElement("span");
        text.className = "ai-split-text";
        text.textContent = row.text;
        div.appendChild(num);
        div.appendChild(text);
        return div;
    }

    /** Two aligned columns: what the file says now on the left, proposed on the right. */
    function render_split(before, after) {
        var rows = diff(before, after);
        var st = stats(rows);
        var host = document.createElement("div");
        host.className = "ai-split";

        if (!st.changed) {
            host.innerHTML = '<div class="ai-diff-empty">The proposed code is identical to what is already in the editor.</div>';
            return {node: host, stats: st};
        }

        var head = document.createElement("div");
        head.className = "ai-split-row ai-split-head";
        head.innerHTML = '<div class="ai-split-cell">Current</div><div class="ai-split-cell">Proposed</div>';
        host.appendChild(head);

        collapse_pairs(pair(rows)).forEach(function (p) {
            var row = document.createElement("div");
            row.className = "ai-split-row ai-split-" + p.type;
            if (p.type === "gap") {
                row.textContent = "\u22ef " + p.skipped + " unchanged line" + (p.skipped > 1 ? "s" : "");
                host.appendChild(row);
                return;
            }
            row.appendChild(cell(p.left, "left"));
            row.appendChild(cell(p.right, "right"));
            host.appendChild(row);
        });
        return {node: host, stats: st};
    }

    NS.diff = {diff: diff, render: render, render_split: render_split, stats: stats};
})(window.GPTCAML);
