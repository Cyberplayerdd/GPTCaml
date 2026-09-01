/**
 * GPTCaml - AI settings.
 *
 * These are the parameters the quick-ask button (the lightbulb) runs with, so
 * one click does the whole thing without opening the panel first. Stored under
 * gptcaml-ai-* keys, separate from upstream's betterocaml-* ones.
 */
window.GPTCAML = window.GPTCAML || {};

(function (NS) {
    "use strict";

    var PREFIX = "gptcaml-ai-";

    var DEFAULTS = {
        provider: "claude",     // which assistant the lightbulb opens
        action: "explain",      // explain | fix | ask
        level: "balanced",      // beginner | balanced | terse
        language: "auto",       // auto | English | Francais
        extra: "",              // free-text instructions appended to every prompt
        autolaunch: true        // open the assistant straight away, or just fill the panel
    };

    function get(key) {
        var raw = localStorage.getItem(PREFIX + key);
        if (raw === null) return DEFAULTS[key];
        if (typeof DEFAULTS[key] === "boolean") return raw === "true";
        return raw;
    }

    function set(key, value) {
        localStorage.setItem(PREFIX + key, String(value));
    }

    function all() {
        var out = {};
        Object.keys(DEFAULTS).forEach(function (k) { out[k] = get(k); });
        return out;
    }

    /** The sentences these preferences add to a prompt. */
    function preferences_text() {
        var s = all(), lines = [];
        if (s.level === "beginner") {
            lines.push("I am new to OCaml: keep the vocabulary simple and spell out the reasoning step by step.");
        } else if (s.level === "terse") {
            lines.push("Be brief: a short paragraph of explanation is enough.");
        }
        if (s.language && s.language !== "auto") {
            lines.push("Answer in " + (s.language === "Francais" ? "French" : s.language) + ".");
        }
        if (s.extra && s.extra.trim()) {
            lines.push(s.extra.trim());
        }
        return lines.join(" ");
    }

    NS.settings = {
        DEFAULTS: DEFAULTS,
        get: get,
        set: set,
        all: all,
        preferences_text: preferences_text
    };
})(window.GPTCAML);
