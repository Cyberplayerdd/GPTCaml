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

    function copy(text) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text);
        }
        // file:// and plain-http origins have no async clipboard
        return new Promise(function (resolve, reject) {
            var ta = document.createElement("textarea");
            ta.value = text;
            ta.setAttribute("readonly", "");
            ta.style.position = "fixed";
            ta.style.top = "-1000px";
            document.body.appendChild(ta);
            ta.select();
            var ok = false;
            try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
            document.body.removeChild(ta);
            ok ? resolve() : reject(new Error("clipboard unavailable"));
        });
    }

    function handoff(id, label, icon, base, query_param) {
        return {
            id: id,
            label: label,
            icon: icon,
            mode: "handoff",
            send: function (prompt) {
                var short = prompt.length <= URL_PREFILL_LIMIT;
                var url = short ? base + "?" + query_param + "=" + encodeURIComponent(prompt) : base;
                // opened synchronously: waiting for the clipboard promise first
                // loses the user gesture and the popup blocker eats the tab
                var opened = window.open(url, "_blank", "noopener");
                return copy(prompt).then(function () {
                    return {
                        ok: true,
                        note: (opened ? "" : "Your browser blocked the new tab - open " + label + " yourself. ") +
                            (short
                                ? "Prompt copied and pre-filled. If the box is empty, just paste (Ctrl+V)."
                                : "Prompt copied - it is too long to pre-fill, so paste it (Ctrl+V) into " + label + ".")
                    };
                }, function () {
                    return {
                        ok: false,
                        note: "Could not reach the clipboard - copy the prompt above manually."
                    };
                });
            }
        };
    }

    NS.providers = {
        copy: copy,
        list: {
            claude: handoff("claude", "Claude", "auto_awesome", "https://claude.ai/new", "q"),
            chatgpt: handoff("chatgpt", "ChatGPT", "chat", "https://chatgpt.com/", "q")
        }
    };
})(window.GPTCAML);
