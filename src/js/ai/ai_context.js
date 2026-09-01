/**
 * GPTCaml - AI context capture.
 *
 * The js_of_ocaml toplevel appends one element per output chunk to #output,
 * tagged with the channel it came from:
 *   - "sharp"  : the phrase that was sent to the toplevel (echoed with a # prompt)
 *   - "caml"   : the value / type printed back by the toplevel
 *   - "stdout" : anything the program printed
 *   - "stderr" : compilation errors and runtime exceptions
 * (see toplevel_build/toplevel.ml, Sys_js.set_channel_flusher).
 *
 * We watch that element instead of hooking the toplevel, so commands typed
 * directly in the console are captured just like the ones run from the editor.
 */
window.GPTCAML = window.GPTCAML || {};

(function (NS) {
    "use strict";

    var MAX_HISTORY = 60;
    var history = [];
    var error_listeners = [];

    function is_error_entry(entry) {
        if (/(^|\s)stderr(\s|$)/.test(entry.cls)) return true;
        return /^\s*(Error|Exception|Runtime exception|Syntax error)\b/.test(entry.text);
    }

    function record(node) {
        if (!node || node.nodeType !== 1) return;
        var text = (node.textContent || "").replace(/\u00a0/g, " ");
        if (!text.replace(/\s/g, "")) return;
        var entry = {
            cls: (node.getAttribute && node.getAttribute("class")) || "",
            text: text,
            t: Date.now()
        };
        entry.is_error = is_error_entry(entry);
        history.push(entry);
        if (history.length > MAX_HISTORY) history.shift();
        if (entry.is_error) {
            error_listeners.forEach(function (fn) {
                try { fn(entry); } catch (e) { console.warn("GPTCaml error listener failed", e); }
            });
        }
    }

    function start() {
        var output = document.getElementById("output");
        if (!output) return;
        new MutationObserver(function (mutations) {
            mutations.forEach(function (m) {
                Array.prototype.forEach.call(m.addedNodes, record);
            });
        }).observe(output, {childList: true});
    }

    /** The phrase echoed on the "sharp" channel just before index `i`. */
    function phrase_before(i) {
        for (var j = i; j >= 0; j--) {
            if (/(^|\s)sharp(\s|$)/.test(history[j].cls)) {
                return history[j].text.replace(/^\s*#\s?/, "").trim();
            }
        }
        return null;
    }

    /**
     * Most recent error, with the phrase that produced it and any output
     * printed alongside it. The toplevel flushes a single error in several
     * chunks, so the whole trailing run of error entries is glued back
     * together.
     * @return {?{message: string, phrase: ?string, output: string, t: number}}
     */
    function last_error() {
        var last = -1;
        for (var i = history.length - 1; i >= 0; i--) {
            if (history[i].is_error) { last = i; break; }
        }
        if (last < 0) return null;

        var first = last;
        while (first > 0 && history[first - 1].is_error) first--;

        var message = history.slice(first, last + 1).map(function (e) { return e.text; }).join("");
        var before = history.slice(Math.max(0, first - 4), first).filter(function (e) {
            return !/(^|\s)sharp(\s|$)/.test(e.cls);
        });
        return {
            message: message.trim(),
            phrase: phrase_before(first),
            output: before.map(function (e) { return e.text; }).join("").trim(),
            t: history[last].t
        };
    }

    /** Everything the console currently shows, trimmed to the last `n` entries. */
    function transcript(n) {
        return history.slice(-(n || 12)).map(function (e) { return e.text; }).join("").trim();
    }

    function ocaml_version() {
        return new URLSearchParams(window.location.search).get("version") || "5.3.0";
    }

    /** The CodeMirror instance the user is currently editing, or null. */
    function active_editor() {
        try {
            return window.editors[window.current_editor()] || null;
        } catch (e) {
            return null;
        }
    }

    function editor_state() {
        var ed = active_editor();
        if (!ed) return null;
        return {
            editor: ed,
            name: ed.name || "untitled.ml",
            code: ed.getValue(),
            selection: ed.somethingSelected() ? ed.getSelection() : ""
        };
    }

    NS.context = {
        start: start,
        history: function () { return history.slice(); },
        last_error: last_error,
        transcript: transcript,
        ocaml_version: ocaml_version,
        active_editor: active_editor,
        editor_state: editor_state,
        on_error: function (fn) { error_listeners.push(fn); }
    };
})(window.GPTCAML);
