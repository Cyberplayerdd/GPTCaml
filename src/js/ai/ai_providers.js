/**
 * GPTCaml - AI providers.
 *
 * Free claude.ai / chatgpt.com have no unauthenticated API, so the shipped
 * providers are "hand-off": GPTCaml puts the prompt on the clipboard and opens
 * the chat in a new tab; the answer comes back through the paste box.
 *
 * A provider is {id, label, icon, mode, send(prompt) -> Promise<{ok, note}>}.
 * `mode` is "handoff" (user pastes the answer back) or "direct" (send() resolves
 * with the answer text). Adding an automatic backend later - a local Ollama, an
 * API key - means adding one entry here; the panel does not need to change.
 */
window.GPTCAML = window.GPTCAML || {};

(function (NS) {
    "use strict";

    /** Longest prompt we are willing to push through a URL; beyond that, clipboard only. */
    var URL_PREFILL_LIMIT = 1500;

    /**
     * Copy synchronously, inside the click that asked for it.
     *
     * navigator.clipboard.writeText rejects with "Document is not focused" once
     * window.open has handed focus to the new tab, so the async API cannot be
     * used after opening - and it cannot be awaited before opening either,
     * because resolving a promise ends the user gesture and the popup blocker
     * then eats the tab. execCommand("copy") is deprecated but synchronous,
     * which is exactly what is needed here: copy, then open, one task, no race.
     *
     * @return {boolean} whether the text reached the clipboard
     */
    function copy_now(text) {
        var previous = document.activeElement;
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "0";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, text.length);   // iOS wants the explicit range
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
        document.body.removeChild(ta);
        if (previous && previous.focus) previous.focus();
        return ok;
    }

    /** Promise-shaped copy for callers that are not racing a window.open. */
    function copy(text) {
        if (copy_now(text)) return Promise.resolve();
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text);
        }
        return Promise.reject(new Error("clipboard unavailable"));
    }

    function handoff(id, label, icon, base, query_param) {
        return {
            id: id,
            label: label,
            icon: icon,
            mode: "handoff",
            /**
             * @param {string} prompt
             * @param {{prefill: boolean}} [opts] prefill:false skips the ?q=
             *        parameter entirely and just opens the site. The URL
             *        prefill is best effort - Claude may have dropped it, and
             *        both sites drop it when they bounce you through a login -
             *        so this is the reliable "paste it yourself" route.
             */
            send: function (prompt, opts) {
                var prefill = !(opts && opts.prefill === false);
                var short = prefill && prompt.length <= URL_PREFILL_LIMIT;
                var url = short ? base + "?" + query_param + "=" + encodeURIComponent(prompt) : base;

                // order matters: copy first (needs this document focused), then
                // open (needs to still be inside the user gesture)
                var copied = copy_now(prompt);
                var opened = window.open(url, "_blank", "noopener");

                var note = copied
                    ? (short
                        ? "Prompt copied and pre-filled. If the box is empty, just paste (Ctrl+V)."
                        : "Prompt copied - paste it (Ctrl+V) into " + label + ".")
                    : "Could not reach the clipboard - copy the prompt from the panel manually.";
                if (!opened) note = "Your browser blocked the new tab - open " + label + " yourself. " + note;

                if (copied) return Promise.resolve({ok: true, note: note});

                // last resort: the async API, which may still work if the new
                // tab did not take focus
                if (navigator.clipboard && window.isSecureContext) {
                    return navigator.clipboard.writeText(prompt).then(
                        function () { return {ok: true, note: "Prompt copied - paste it (Ctrl+V) into " + label + "."}; },
                        function () { return {ok: false, note: note}; }
                    );
                }
                return Promise.resolve({ok: false, note: note});
            }
        };
    }

    NS.providers = {
        copy: copy,
        copy_now: copy_now,
        list: {
            claude: handoff("claude", "Claude", "auto_awesome", "https://claude.ai/new", "q"),
            chatgpt: handoff("chatgpt", "ChatGPT", "chat", "https://chatgpt.com/", "q")
        }
    };
})(window.GPTCAML);
