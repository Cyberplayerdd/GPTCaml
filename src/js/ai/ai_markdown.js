/**
 * GPTCaml - a small Markdown renderer for assistant answers.
 *
 * Assistants answer in Markdown, and rendering it as flat text throws away
 * exactly the structure that makes an explanation readable: which words are
 * code, which lines are code, where one point ends and the next begins.
 *
 * Deliberately narrow: paragraphs, headings, bullet and numbered lists, fenced
 * and inline code, bold and italic. Everything else is left as text.
 *
 * The input is pasted from a third party, so nothing here ever goes near
 * innerHTML - every node is built with createElement and textContent.
 */
window.GPTCAML = window.GPTCAML || {};

(function (NS) {
    "use strict";

    var FENCE = /^\s*```+\s*([A-Za-z0-9_+-]*)\s*$/;
    var HEADING = /^(#{1,6})\s+(.*)$/;
    var BULLET = /^\s*[-*+]\s+(.*)$/;
    var NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;

    /**
     * Emphasis and inline code. Recurses so bold can contain code and vice
     * versa, which assistants do constantly ("**`ajouter_fin`**").
     */
    function inline(text, parent) {
        var re = /(`+)([\s\S]*?)\1|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\*([^*\n]+?)\*|(?:^|[\s(])_([^_\n]+?)_(?=[\s).,;:!?]|$)/g;
        var last = 0, m;
        while ((m = re.exec(text)) !== null) {
            if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
            var el;
            if (m[2] !== undefined) {
                el = document.createElement("code");
                el.textContent = m[2].replace(/^ | $/g, "");
            } else if (m[3] !== undefined || m[4] !== undefined) {
                el = document.createElement("strong");
                inline(m[3] !== undefined ? m[3] : m[4], el);
            } else {
                el = document.createElement("em");
                inline(m[5] !== undefined ? m[5] : m[6], el);
            }
            parent.appendChild(el);
            last = re.lastIndex;
        }
        if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
    }

    function para(lines) {
        var p = document.createElement("p");
        inline(lines.join("\n"), p);
        return p;
    }

    function code_block(lines, lang) {
        var pre = document.createElement("pre");
        pre.className = "ai-md-code";
        var code = document.createElement("code");
        if (lang) code.setAttribute("data-lang", lang);
        code.textContent = lines.join("\n");
        pre.appendChild(code);
        return pre;
    }

    /**
     * @param {string} text Markdown
     * @return {DocumentFragment}
     */
    function render(text) {
        var out = document.createDocumentFragment();
        var lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
        var buffer = [];
        var list = null;

        function flush_paragraph() {
            if (buffer.length) { out.appendChild(para(buffer)); buffer = []; }
        }
        function flush_list() {
            if (list) { out.appendChild(list.node); list = null; }
        }
        function flush() { flush_paragraph(); flush_list(); }

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var fence = line.match(FENCE);

            if (fence) {                                   // fenced code
                flush();
                var body = [];
                for (i++; i < lines.length && !FENCE.test(lines[i]); i++) body.push(lines[i]);
                out.appendChild(code_block(body, fence[1]));
                continue;
            }

            if (!line.trim()) { flush(); continue; }        // blank line

            var heading = line.match(HEADING);
            if (heading) {
                flush();
                // h1/h2 in an answer would dwarf the panel; start smaller
                var level = Math.min(6, heading[1].length + 3);
                var h = document.createElement("h" + level);
                h.className = "ai-md-heading";
                inline(heading[2], h);
                out.appendChild(h);
                continue;
            }

            var bullet = line.match(BULLET);
            var numbered = bullet ? null : line.match(NUMBERED);
            if (bullet || numbered) {
                flush_paragraph();
                var want = bullet ? "ul" : "ol";
                if (!list || list.type !== want) {
                    flush_list();
                    list = {type: want, node: document.createElement(want)};
                    list.node.className = "ai-md-list";
                }
                var li = document.createElement("li");
                inline(bullet ? bullet[1] : numbered[2], li);
                list.node.appendChild(li);
                continue;
            }

            if (list) {                                     // continuation of a list item
                inline(" " + line.trim(), list.node.lastChild);
                continue;
            }
            buffer.push(line);
        }
        flush();
        return out;
    }

    NS.markdown = {render: render};
})(window.GPTCAML);
