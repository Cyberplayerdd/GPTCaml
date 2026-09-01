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

    /* ---- block alignment -------------------------------------------------
     *
     * A plain line diff falls apart when the assistant reorders definitions:
     * LCS only sees lines, so it happily parks `supprimer_tas_min` opposite
     * `ajouter_tas_min` just because they occupy the same position. Splitting
     * the file into top-level definitions first, matching those by name, and
     * only then diffing line by line inside each pair keeps every function
     * opposite its own previous version - and a definition that merely moved
     * shows up as unchanged instead of as one big deletion and one big
     * addition somewhere else.
     */

    var BLOCK_START = /^(let|type|exception|module|open|include|external|class|val)\b/;

    /* `struct`, `sig`, `object` and `begin` open a body that runs to its `end`.
     * Without tracking that, a module whose contents are written flush against
     * the left margin - which is exactly what beginner OCaml looks like - gets
     * shredded into one "top-level definition" per line. */
    var OPENS = /\b(struct|sig|object|begin)\b/g;
    var CLOSES = /\bend\b/g;

    function nesting_delta(line) {
        var bare = line.replace(/\(\*[^*]*\*\)/g, " ").replace(/"[^"]*"/g, '""');
        return (bare.match(OPENS) || []).length - (bare.match(CLOSES) || []).length;
    }

    /** A stable identity for a top-level definition, e.g. "let ajouter_fin". */
    function block_key(line) {
        var m = line.match(/^(module|class)\s+type\s+([A-Za-z_][\w'.]*)/);
        if (m) return m[1] + " type " + m[2];
        // operators count: `let ( +: ) a b` must survive a reformat of the spaces
        m = line.match(/^let\s+(?:rec\s+)?(\([^)]*\)|[A-Za-z_][\w']*)/);
        if (m) return "let " + m[1].replace(/\s+/g, "");
        m = line.match(/^type\s+(?:\([^)]*\)\s+|(?:'[A-Za-z_][\w']*\s+)*)?([A-Za-z_][\w']*)/);
        if (m) return "type " + m[1];
        m = line.match(/^(exception|module|open|include|external|class|val)\s+([A-Za-z_][\w'.]*)/);
        if (m) return m[1] + " " + m[2];
        return line.trim().slice(0, 40);
    }

    /**
     * Cut a file into top-level definitions. A line starting at column 0 with a
     * definition keyword opens a block; `and`, indented lines, and anything
     * inside an unclosed struct/sig/object/begin belong to whatever is open.
     * @return {Array<{key: string, first: number, lines: Array<string>}>}
     */
    function split_blocks(text) {
        var lines = text.replace(/\r\n/g, "\n").split("\n");
        var blocks = [], current = null, seen = {}, depth = 0;

        lines.forEach(function (line, i) {
            if (depth <= 0 && BLOCK_START.test(line)) {
                if (current) blocks.push(current);
                var key = block_key(line);
                seen[key] = (seen[key] || 0) + 1;
                // two `let () = ...` in one file are different blocks
                current = {key: key + (seen[key] > 1 ? "#" + seen[key] : ""), first: i, lines: []};
            }
            if (!current) current = {key: "(preamble)", first: i, lines: []};
            current.lines.push(line);
            depth += nesting_delta(line);
            if (depth < 0) depth = 0;
        });
        if (current) blocks.push(current);
        return blocks;
    }

    function side(row, block, which) {
        return {
            text: row.text,
            a: which === "a" ? block.first + row.a : null,
            b: which === "b" ? block.first + row.b : null
        };
    }

    /** Side-by-side rows for one pair of blocks; either side may be missing. */
    function block_rows(a, b) {
        if (!a) {
            return b.lines.map(function (line, i) {
                return {left: null, right: {text: line, b: b.first + i + 1}, type: "add"};
            });
        }
        if (!b) {
            return a.lines.map(function (line, i) {
                return {left: {text: line, a: a.first + i + 1}, right: null, type: "del"};
            });
        }
        return pair(diff(a.lines.join("\n"), b.lines.join("\n"))).map(function (p) {
            return {
                left: p.left ? side(p.left, a, "a") : null,
                right: p.right ? side(p.right, b, "b") : null,
                type: p.type
            };
        });
    }

    /** Match definitions by name, then diff inside each match. */
    function align_blocks(before, after) {
        var A = split_blocks(before), B = split_blocks(after);
        var by_key = {};
        A.forEach(function (blk, i) { by_key[blk.key] = i; });

        var partner = {}, taken = {};
        B.forEach(function (blk, j) {
            var i = by_key[blk.key];
            if (i !== undefined && !taken[i]) { partner[j] = i; taken[i] = true; }
        });

        var rows = [], emitted = {};

        // Reordering means we cannot sweep A with a monotonic cursor - the next
        // match can sit before the last one. Scan from the start every time and
        // let `emitted` guarantee each dropped definition is shown exactly once.
        function drain_to(limit) {
            for (var k = 0; k < limit; k++) {
                if (taken[k] || emitted[k]) continue;
                rows = rows.concat(block_rows(A[k], null));
                emitted[k] = true;
            }
        }

        B.forEach(function (blk, j) {
            var i = partner[j];
            if (i === undefined) { rows = rows.concat(block_rows(null, blk)); return; }
            drain_to(i);                       // definitions dropped before this one
            rows = rows.concat(block_rows(A[i], blk));
        });
        drain_to(A.length);
        return rows;
    }

    /** Two aligned columns: what the file says now on the left, proposed on the right. */
    function render_split(before, after) {
        var pairs = align_blocks(before, after);
        var st = {added: 0, removed: 0};
        pairs.forEach(function (p) {
            if (p.type === "ctx") return;
            if (p.right) st.added++;
            if (p.left) st.removed++;
        });
        st.changed = (st.added + st.removed) > 0;

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

        collapse_pairs(pairs).forEach(function (p) {
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
