/**
 * GPTCaml - prompt construction.
 *
 * One template, three intents. The output contract is what makes the answer
 * machine-readable on the way back: prose first, then exactly one ```ocaml
 * block holding the whole corrected file.
 */
window.GPTCAML = window.GPTCAML || {};

(function (NS) {
    "use strict";

    var CONTRACT = [
        "Answer in two parts, in this order:",
        "",
        "1. **What went wrong** - explain in plain language what the error means and *why*",
        "   this particular code triggers it. Name the OCaml rule involved (typing, syntax,",
        "   pattern-matching exhaustiveness, ...) so I learn something, not just a patch.",
        "2. **Corrected code** - then give the complete corrected file inside a single",
        "   fenced block tagged ```ocaml. Include the whole file, not just the changed lines,",
        "   and no commentary inside the block."
    ].join("\n");

    function fence(code) {
        return "```ocaml\n" + code.replace(/\s+$/, "") + "\n```";
    }

    function header(ctx) {
        return "I am writing OCaml " + ctx.version + " in a browser toplevel (GPTCaml). " +
            "Everything runs in the js_of_ocaml interpreter, so Unix, Sys.command and " +
            "external libraries are not available.";
    }

    /**
     * @param {string} intent   "explain" | "fix" | "ask"
     * @param {object} ctx      {version, name, code, selection, error, question}
     * @return {string}
     */
    function build(intent, ctx) {
        var out = [header(ctx)];
        var prefs = (NS.settings && NS.settings.preferences_text()) || "";
        if (prefs) out.push(prefs);
        out.push("");

        if (intent === "ask") {
            out.push("Here is my file `" + ctx.name + "`:", "", fence(ctx.code), "");
            if (ctx.selection) {
                out.push("My question is about this part in particular:", "", fence(ctx.selection), "");
            }
            out.push("Question: " + (ctx.question || "Explain what this code does and how to improve it."), "");
            out.push(CONTRACT.replace("What went wrong", "Answer"));
            return out.join("\n");
        }

        out.push("This phrase:", "", fence(ctx.error && ctx.error.phrase ? ctx.error.phrase : ctx.code), "");
        out.push("produced this error in the toplevel:", "", "```", (ctx.error ? ctx.error.message : "(no error captured)"), "```", "");
        out.push("Here is the full file `" + ctx.name + "` it came from:", "", fence(ctx.code), "");

        if (intent === "fix") {
            out.push("Fix it.", "");
        }
        out.push(CONTRACT);
        return out.join("\n");
    }


    /**
     * Pull the answer apart along the contract above: the last fenced block is
     * the corrected file, everything before it is the explanation. Tolerant of
     * whatever prose the model wraps around it.
     * @return {{explanation: string, code: ?string}}
     */
    function parse_answer(text) {
        var fences = [];
        var re = /```[ \t]*([A-Za-z0-9_+-]*)[ \t]*\r?\n([\s\S]*?)```/g;
        var m;
        while ((m = re.exec(text)) !== null) {
            fences.push({lang: (m[1] || "").toLowerCase(), body: m[2], start: m.index, end: re.lastIndex});
        }
        if (!fences.length) return {explanation: text.trim(), code: null};

        // prefer the last block explicitly tagged as OCaml, else the last block
        var chosen = null;
        for (var i = fences.length - 1; i >= 0; i--) {
            if (fences[i].lang === "ocaml" || fences[i].lang === "ml") { chosen = fences[i]; break; }
        }
        if (!chosen) chosen = fences[fences.length - 1];

        var explanation = (text.slice(0, chosen.start) + "\n" + text.slice(chosen.end)).trim();
        return {explanation: explanation, code: chosen.body.replace(/\s+$/, "")};
    }

    NS.prompt = {build: build, fence: fence, parse_answer: parse_answer};
})(window.GPTCAML);
