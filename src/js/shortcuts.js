/**
 * GPTCaml - search / replace shortcuts.
 *
 * Two things live here:
 *
 * 1. A replace dialog that shows "Replace" and "with" at the same time.
 *    CodeMirror's stock `replace` command asks for the search text, waits for
 *    Enter, and only then asks what to replace it with - one field at a time.
 *    This one puts both fields and the buttons on screen at once.
 *
 * 2. Global routing for Ctrl+F / Ctrl+H. CodeMirror owns those keys while the
 *    editor has focus (see the extraKeys map in editor_change.js); this covers
 *    the rest of the page. Deliberate exception: inside the toplevel console
 *    the browser's own find is left alone - that pane is plain text and the
 *    browser searches it better than we would.
 */
(function () {
    "use strict";

    /* ---- replace dialog -------------------------------------------------- */

    var DIALOG =
        '<span class="gpt-replace">' +
        '<span class="gpt-replace-label">Replace</span>' +
        '<input type="text" class="gpt-replace-find" placeholder="find" />' +
        '<span class="gpt-replace-label">with</span>' +
        '<input type="text" class="gpt-replace-with" placeholder="replace with" />' +
        '<button type="button" class="gpt-replace-one">Replace</button>' +
        '<button type="button" class="gpt-replace-next">Skip</button>' +
        '<button type="button" class="gpt-replace-all">All</button>' +
        '<button type="button" class="gpt-replace-done">Done</button>' +
        '</span>';

    /** CodeMirror's convention: a query typed in lower case searches case-insensitively. */
    function case_fold(query) {
        return query === query.toLowerCase();
    }

    function cursor_at(cm, query, pos) {
        return cm.getSearchCursor(query, pos, {caseFold: case_fold(query)});
    }

    /** Select the next match after the cursor, wrapping at the end. */
    function find_next(cm, query) {
        if (!query) return null;
        var cursor = cursor_at(cm, query, cm.getCursor("to"));
        if (!cursor.findNext()) {
            cursor = cursor_at(cm, query, {line: 0, ch: 0});
            if (!cursor.findNext()) return null;
        }
        cm.setSelection(cursor.from(), cursor.to());
        cm.scrollIntoView({from: cursor.from(), to: cursor.to()}, 40);
        return cursor;
    }

    /**
     * Replace the current selection if it is already a match, otherwise jump to
     * the next one. That is the usual find-and-replace rhythm: the first press
     * lands on a match, the second replaces it.
     */
    function replace_one(cm, query, replacement) {
        if (!query) return "no query";
        var selected = cm.getSelection();
        var matches = case_fold(query)
            ? selected.toLowerCase() === query.toLowerCase()
            : selected === query;
        if (matches) {
            cm.replaceSelection(replacement, "around");
            var after = find_next(cm, query);
            return after ? "replaced" : "replaced, no more matches";
        }
        return find_next(cm, query) ? "found" : "not found";
    }

    function replace_all(cm, query, replacement) {
        if (!query) return 0;
        var count = 0;
        cm.operation(function () {
            var cursor = cursor_at(cm, query, {line: 0, ch: 0});
            while (cursor.findNext()) {
                cursor.replace(replacement);
                count++;
            }
        });
        return count;
    }

    function open_replace_dialog(cm, all_by_default) {
        var close = cm.openDialog(DIALOG, null, {
            bottom: false,
            closeOnEnter: false,
            closeOnBlur: false      // focusout fires when tabbing between the two fields
        });

        var dialog = cm.getWrapperElement().querySelector(".CodeMirror-dialog");
        if (!dialog) return;

        var find = dialog.querySelector(".gpt-replace-find");
        var with_ = dialog.querySelector(".gpt-replace-with");

        function say(message) {
            var label = dialog.querySelector(".gpt-replace-status");
            if (!label) {
                label = document.createElement("span");
                label.className = "gpt-replace-status";
                dialog.querySelector(".gpt-replace").appendChild(label);
            }
            label.textContent = message;
        }

        function one() { say(replace_one(cm, find.value, with_.value)); }
        function skip() { say(find_next(cm, find.value) ? "" : "not found"); }
        function every() {
            var n = replace_all(cm, find.value, with_.value);
            say(n + " replaced");
        }

        dialog.querySelector(".gpt-replace-one").addEventListener("click", one);
        dialog.querySelector(".gpt-replace-next").addEventListener("click", skip);
        dialog.querySelector(".gpt-replace-all").addEventListener("click", every);
        dialog.querySelector(".gpt-replace-done").addEventListener("click", function () { close(); });

        [find, with_].forEach(function (input) {
            input.addEventListener("keydown", function (e) {
                if (e.keyCode === 27) {            // Esc
                    e.preventDefault();
                    close();
                } else if (e.keyCode === 13) {     // Enter
                    e.preventDefault();
                    if (e.shiftKey || all_by_default) every(); else one();
                }
            });
        });

        // start from whatever is selected, the way every other editor does
        var selection = cm.getSelection();
        if (selection && selection.indexOf("\n") === -1) find.value = selection;
        find.focus();
        find.select();
    }

    CodeMirror.commands.gptcamlReplace = function (cm) { open_replace_dialog(cm, false); };
    CodeMirror.commands.gptcamlReplaceAll = function (cm) { open_replace_dialog(cm, true); };

    /* ---- global routing -------------------------------------------------- */

    var SEARCH_KEYS = {
        f: "findPersistent",
        h: "gptcamlReplace"
    };

    function in_console(el) {
        return !!(el && el.closest && el.closest("#toplevel-container"));
    }

    function in_editor(el) {
        return !!(el && el.closest && el.closest(".CodeMirror") && !el.closest(".CodeMirror-dialog"));
    }

    function current_cm() {
        try {
            return window.editors[window.current_editor()] || null;
        } catch (e) {
            return null;
        }
    }

    document.addEventListener("keydown", function (e) {
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
        var key = (e.key || "").toLowerCase();
        var command = SEARCH_KEYS[key];
        if (!command) return;
        if (e.metaKey && key === "h") return;           // Cmd+H is "hide application" on macOS
        if (e.shiftKey && key === "h") command = "gptcamlReplaceAll";

        var target = e.target;
        if (in_console(target)) return;                 // let the browser search the console
        if (in_editor(target)) return;                  // CodeMirror already handled it

        var cm = current_cm();
        if (!cm) return;
        e.preventDefault();
        cm.focus();
        CodeMirror.commands[command](cm);
    });
})();
