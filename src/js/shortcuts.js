/**
 * GPTCaml - global shortcut routing.
 *
 * CodeMirror already owns Ctrl+F / Ctrl+H while the editor has focus (see the
 * extraKeys map in editor_change.js). This file only covers the rest of the
 * page: pressing Ctrl+F with focus on the nav bar, a modal or nowhere in
 * particular should still search the code.
 *
 * Deliberate exception: inside the toplevel console (#userinput / #output) the
 * browser's own find is left alone - that is the pane you actually want to
 * search with the browser.
 */
(function () {
    "use strict";

    var SEARCH_KEYS = {
        f: "findPersistent",
        h: "replace"
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
        if (e.shiftKey) command = (key === "h") ? "replaceAll" : command;

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
