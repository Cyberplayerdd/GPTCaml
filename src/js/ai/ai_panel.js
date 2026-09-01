/**
 * GPTCaml - AI assistant panel.
 *
 * Flow: build a prompt from the editor + the toplevel error -> hand it to
 * Claude or ChatGPT (clipboard + new tab) -> paste the answer back here ->
 * review the explanation and the diff -> Apply.
 *
 * Nothing is ever written to the editor without the Apply click, and the
 * write happens in a single CodeMirror operation so one Ctrl+Z undoes it.
 */
window.GPTCAML = window.GPTCAML || {};

(function (NS) {
    "use strict";

    var state = {intent: "explain", prompt: "", editor: null, before: "", proposal: null};

    function $(id) { return document.getElementById(id); }

    function toast(msg) {
        if (window.M && M.toast) M.toast({html: msg});
        else console.log("[GPTCaml] " + msg);
    }

    function status(msg, kind) {
        var el = $("ai-status");
        if (!el) return;
        el.textContent = msg || "";
        el.className = "ai-status" + (kind ? " ai-status-" + kind : "");
    }

    var INTENT_LABEL = {
        explain: "Explain the last error",
        fix: "Fix the last error",
        ask: "Ask about my code"
    };

    /**
     * Fill the panel for an intent and open it.
     * @param {string} intent "explain" | "fix" | "ask"
     */
    /**
     * Assemble the prompt for an intent and remember what it was built from.
     * Touches no UI, so both the panel and the one-click buttons can use it.
     * @return {?string} the prompt, or null if there is no editor
     */
    function prepare(intent) {
        var ctx = NS.context.editor_state();
        if (!ctx) { toast("No editor is open."); return null; }

        var error = NS.context.last_error();
        if ((intent === "explain" || intent === "fix") && !error) {
            toast("No error in the console yet - asking about your code instead.");
            intent = "ask";
        }

        state.intent = intent;
        state.editor = ctx.editor;
        state.before = ctx.code;
        state.proposal = null;

        var question = $("ai-question");
        state.prompt = NS.prompt.build(intent, {
            version: NS.context.ocaml_version(),
            name: ctx.name,
            code: ctx.code,
            selection: ctx.selection,
            error: error,
            question: question ? question.value : ""
        });
        return state.prompt;
    }

    /** Fill the panel from the current state and show it. */
    function open(intent) {
        if (!prepare(intent)) return;

        var question = $("ai-question");
        if (question) question.parentElement.style.display = (state.intent === "ask") ? "" : "none";

        $("ai-intent-label").textContent = INTENT_LABEL[state.intent];
        $("ai-prompt").value = state.prompt;
        $("ai-answer").value = "";
        $("ai-result").style.display = "none";
        status("");
        hide_chip();

        var modal = M.Modal.getInstance($("ai-modal"));
        if (!modal.isOpen) modal.open();
        $("ai-modal").scrollTop = 0;
    }

    /** Rebuild the prompt in place (used when the question field changes). */
    function refresh() {
        if (state.intent === "ask") open("ask");
    }

    function send(provider_id, opts) {
        var provider = NS.providers.list[provider_id];
        if (!provider) return;
        status("Opening " + provider.label + " ...");
        provider.send($("ai-prompt").value, opts).then(function (res) {
            status(res.note, res.ok ? "ok" : "warn");
        }, function (err) {
            status("Could not open " + provider.label + ": " + err.message, "warn");
        });
    }

    function parse() {
        var raw = $("ai-answer").value;
        if (!raw.trim()) { status("Paste the assistant's answer first.", "warn"); return false; }

        var parsed = NS.prompt.parse_answer(raw);
        var explanation = $("ai-explanation");
        explanation.innerHTML = "";
        explanation.appendChild(NS.markdown.render(
            parsed.explanation || "(the answer contained no explanation)"));

        var summary = $("ai-diff");
        summary.innerHTML = "";
        var apply_btn = $("ai-apply");
        $("ai-result").style.display = "";

        if (!parsed.code) {
            state.proposal = null;
            hide_pane();
            apply_btn.classList.add("disabled");
            summary.innerHTML = '<div class="ai-diff-empty">No ```ocaml block found in the answer, so there is nothing to apply. The explanation is above.</div>';
            return false;
        }

        state.before = state.editor.getValue();
        // keep the file's trailing newline so it does not show up as a change
        state.proposal = (/\n$/.test(state.before) && !/\n$/.test(parsed.code))
            ? parsed.code + "\n" : parsed.code;

        var st = show_pane();
        apply_btn.classList.toggle("disabled", !st.changed);
        summary.innerHTML = '<div class="ai-diff-empty">+' + st.added + " / -" + st.removed +
            " lines - the changes are shown over the toplevel.</div>";
        status("+" + st.added + " / -" + st.removed + " lines proposed.", "ok");
        return st.changed;
    }

    /* ---- the proposed-changes pane, left of the editor -------------------- */

    /** Render the current proposal side by side and reveal the pane. */
    function show_pane() {
        var rendered = NS.diff.render_split(state.before, state.proposal);
        var body = $("ai-diff-pane-body");
        body.innerHTML = "";
        body.appendChild(rendered.node);

        $("ai-diff-pane-stats").textContent = "+" + rendered.stats.added + " / -" + rendered.stats.removed;
        $("ai-pane-apply").classList.toggle("disabled", !rendered.stats.changed);
        $("ai-diff-pane").style.display = "flex";
        return rendered.stats;
    }

    /** Put the toplevel back. */
    function hide_pane() {
        $("ai-diff-pane").style.display = "none";
    }

    /**
     * The nav-bar paste button: read the answer straight from the clipboard so
     * the round trip is one click, and fall back to the panel's paste box when
     * the browser will not hand it over.
     */
    function paste_answer() {
        if (!prepare(NS.settings.get("action"))) return;

        function consume(text) {
            if (!text || !text.trim()) {
                open(state.intent);
                status("The clipboard is empty - paste the answer here.", "warn");
                $("ai-answer").focus();
                return;
            }
            $("ai-answer").value = text;
            if (parse()) {
                M.Modal.getInstance($("ai-modal")).close();
                toast("Proposed changes shown over the toplevel.");
            } else {
                open_result();
            }
        }

        function manual() {
            open(state.intent);
            $("ai-answer").focus();
            status("Paste the answer here with Ctrl+V.", "warn");
        }

        if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard.readText().then(consume, manual);
        } else {
            manual();
        }
    }

    /** Show the panel with the review section already filled in. */
    function open_result() {
        var modal = M.Modal.getInstance($("ai-modal"));
        if (!modal.isOpen) modal.open();
        $("ai-result").style.display = "";
        $("ai-result").scrollIntoView({behavior: "smooth", block: "start"});
    }

    function apply() {
        if (!state.proposal || !state.editor) return;
        var ed = state.editor;
        var code = state.proposal;
        ed.operation(function () {
            var last = ed.lastLine();
            ed.replaceRange(code, {line: 0, ch: 0}, {line: last, ch: ed.getLine(last).length});
        });
        ed.is_saved = false;
        try { autosave_editor(ed.id); } catch (e) { /* autosave is best effort */ }
        ed.focus();
        hide_pane();
        M.Modal.getInstance($("ai-modal")).close();
        toast("Applied - press Ctrl+Z to undo.");
    }

    /**
     * One click, no ceremony: build the prompt for the action chosen in the AI
     * settings and hand it straight to the configured assistant. The panel
     * still opens behind it, ready for the answer to be pasted back.
     */
    function quick_ask() {
        var prefs = NS.settings.all();
        open(prefs.action);
        if (state.prompt && prefs.autolaunch) send(prefs.provider);
    }

    /**
     * Same as quick_ask, but never tries to pre-fill through the URL: it copies
     * the prompt and opens a plain chat window for you to paste into. The
     * pre-fill is best effort and silently does nothing when the assistant has
     * dropped the parameter or bounced you through a login, which leaves you
     * staring at an empty box - this route always works.
     */
    function quick_copy() {
        var prefs = NS.settings.all();
        var prompt = prepare(prefs.action);
        if (!prompt) return;

        var provider = NS.providers.list[prefs.provider];
        if (!provider) return;

        var intent = state.intent;
        provider.send(prompt, {prefill: false}).then(function (res) {
            // no panel: the whole point of this button is copy + open, nothing
            // else. The answer still needs somewhere to land, so the toast
            // offers the way back in.
            toast(res.note + " <a class=\"toast-action white-text\" onclick=\"GPTCAML.ai.open('" +
                intent + "')\">Paste answer</a>");
        });
    }

    /* ---- settings ------------------------------------------------------- */

    var SETTING_FIELDS = {
        "ai-set-provider": "provider",
        "ai-set-action": "action",
        "ai-set-level": "level",
        "ai-set-language": "language",
        "ai-set-extra": "extra",
        "ai-set-autolaunch": "autolaunch"
    };

    function load_settings_ui() {
        Object.keys(SETTING_FIELDS).forEach(function (id) {
            var el = $(id);
            if (!el) return;
            var value = NS.settings.get(SETTING_FIELDS[id]);
            if (el.type === "checkbox") el.checked = !!value;
            else el.value = value;
        });
        describe_quick_button();
    }

    function save_setting(id) {
        var el = $(id);
        if (!el) return;
        NS.settings.set(SETTING_FIELDS[id], el.type === "checkbox" ? el.checked : el.value);
        describe_quick_button();
    }

    /** Keep the lightbulb's tooltip honest about what it will do. */
    function describe_quick_button() {
        var button = $("ai-nav-button");
        if (!button) return;
        var prefs = NS.settings.all();
        var provider = NS.providers.list[prefs.provider];
        button.title = INTENT_LABEL[prefs.action] +
            (prefs.autolaunch && provider ? " with " + provider.label : " (prepare the prompt)") +
            " - Ctrl+Shift+E";
    }

    /* ---- the "an error just happened" chip ------------------------------ */

    function show_chip() {
        var chip = $("ai-error-chip");
        if (chip) chip.style.display = "";
    }

    function hide_chip() {
        var chip = $("ai-error-chip");
        if (chip) chip.style.display = "none";
    }

    function init() {
        NS.context.start();
        NS.context.on_error(show_chip);

        var bind = {
            "ai-copy": function () {
                NS.providers.copy($("ai-prompt").value).then(function () {
                    status("Prompt copied to the clipboard.", "ok");
                }, function () {
                    status("Could not reach the clipboard - select the prompt and copy it manually.", "warn");
                });
            },
            "ai-open-claude": function () { send("claude"); },
            "ai-open-chatgpt": function () { send("chatgpt"); },
            "ai-paste-claude": function () { send("claude", {prefill: false}); },
            "ai-paste-chatgpt": function () { send("chatgpt", {prefill: false}); },
            "ai-parse": parse,
            "ai-apply": apply,
            "ai-error-chip": function () { open("explain"); },
            "ai-pane-apply": apply,
            "ai-pane-explain": open_result,
            "ai-pane-close": function () {
                state.proposal = null;
                hide_pane();
            }
        };
        Object.keys(bind).forEach(function (id) {
            var el = $(id);
            if (el) el.addEventListener("click", bind[id]);
        });

        var question = $("ai-question");
        if (question) question.addEventListener("change", refresh);

        Object.keys(SETTING_FIELDS).forEach(function (id) {
            var el = $(id);
            if (!el) return;
            el.addEventListener("change", function () { save_setting(id); });
        });
        load_settings_ui();

        // parsing straight after a paste saves a click
        var answer = $("ai-answer");
        if (answer) answer.addEventListener("paste", function () { setTimeout(parse, 0); });

        hide_chip();
        hide_pane();
    }

    NS.ai = {open: open, quick_ask: quick_ask, quick_copy: quick_copy,
             paste_answer: paste_answer, parse: parse, apply: apply, init: init};

    document.addEventListener("DOMContentLoaded", init);
})(window.GPTCAML);

/* Called from the editor keymap and the nav bar. */
function ai_quick_ask() { window.GPTCAML.ai.quick_ask(); }
function ai_quick_copy() { window.GPTCAML.ai.quick_copy(); }
function ai_paste_answer() { window.GPTCAML.ai.paste_answer(); }
function ai_explain_last_error() { window.GPTCAML.ai.quick_ask(); }
function ai_fix_last_error() { window.GPTCAML.ai.open("fix"); }
function ai_ask_about_selection() { window.GPTCAML.ai.open("ask"); }
