# GPTCaml

<https://github.com/Cyberplayerdd/GPTCaml>

A fork of [BetterOCaml](https://github.com/jbdoderlein/BetterOCaml) — the browser-based OCaml IDE whose
interpreter is compiled to JavaScript with `js_of_ocaml`, so nothing is ever sent to a server — with two
additions:

1. **Standard search shortcuts.** `Ctrl+F` and `Ctrl+H` do what they do in every other editor.
2. **An AI assistant** that takes a toplevel error, explains *why* it is an error, and proposes a corrected
   file you can apply with one click.

Everything upstream still works exactly as before, and the app is still a purely static, offline-capable PWA.
The original README is kept as [README.upstream.md](README.upstream.md).

---

## Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+F` | Search — the bar stays open while you cycle through matches |
| `Ctrl+G` / `Ctrl+Shift+G` | Find next / previous |
| `Ctrl+H` | Replace |
| `Ctrl+Shift+H` | Replace all |
| `Alt+G` | Jump to line |
| `Ctrl+Shift+E` | Explain the last error and propose a fix |
| `Ctrl+I` | Ask about the current file or selection |

Upstream's `Ctrl+Enter` (run the phrase under the cursor), `Ctrl+Shift+Enter` (run everything),
`Ctrl+Space` (autocomplete) and `Ctrl+S` (save) are unchanged.

Inside the toplevel console `Ctrl+F` is deliberately left to the browser — that pane is plain text and the
browser's own find is the better tool for it.

## The AI assistant

Free claude.ai and chatgpt.com have no API you can call without an account, and driving a logged-in session
from a web page is both against their terms and blocked in practice. So GPTCaml does not pretend to call
them: it does the two things around the model that are actually tedious.

1. **It writes the prompt.** Click the 💡 in the nav bar (or press `Ctrl+Shift+E`, or the *Explain this
   error* chip that appears when the toplevel prints an error) and GPTCaml assembles the OCaml version, the
   file, the exact phrase you ran, and the verbatim error — with a request to explain the underlying rule,
   not just hand back a patch.
2. **It reads the answer.** *Open in Claude* / *Open in ChatGPT* copies the prompt to your clipboard and
   opens a new tab. Paste the reply back into the panel and GPTCaml splits it into the explanation and the
   corrected code, shows a line diff, and offers **Apply to the editor**.

Nothing is sent anywhere on its own, nothing is applied without the click, and one `Ctrl+Z` undoes an applied
fix. There is no API key and no cost.

### Adding an automatic backend

`src/js/ai/ai_providers.js` is a registry of `{id, label, mode, send(prompt)}` objects. The two shipped
providers have `mode: "handoff"`. A provider that returns the answer itself (a local Ollama, an API key)
only has to resolve `send()` with the text — the panel, the prompt builder and the diff do not change.

## Files added or changed

| File | What |
|---|---|
| `src/js/editor_change.js` | `Ctrl+F` / `Ctrl+H` / `Ctrl+Shift+H` and the two AI bindings added to the CodeMirror keymap |
| `src/js/shortcuts.js` | routes `Ctrl+F` / `Ctrl+H` to the editor when focus is elsewhere on the page |
| `src/js/ai/ai_context.js` | watches `#output` and reconstructs the last error with the phrase that caused it |
| `src/js/ai/ai_prompt.js` | builds the prompt, parses the answer back into explanation + code |
| `src/js/ai/ai_providers.js` | Claude / ChatGPT hand-off, clipboard with a non-secure-origin fallback |
| `src/js/ai/ai_diff.js` | LCS line diff, no dependency |
| `src/js/ai/ai_panel.js` | the panel, and the apply-in-one-undo-step logic |
| `src/css/ai.css` | panel styling |
| `src/css/index.css` | search dialog styling (Materialize was overriding CodeMirror's dialog input) |
| `src/serviceWorker.js` | the precache list referenced four files that no longer exist, and `cache.addAll` is all-or-nothing, so the install always failed and nothing was ever precached |

## Running it

It is a static site — serve `src/` with anything:

```bash
python -m http.server 8000 --directory src
```

Then open <http://localhost:8000/?version=5.3.0>. Service workers need `http://localhost` or HTTPS, not
`file://`.

## Credits and license

GPTCaml is a fork of [BetterOCaml](https://github.com/jbdoderlein/BetterOCaml) by
[@jbdoderlein](https://github.com/jbdoderlein) and its
[contributors](https://github.com/jbdoderlein/BetterOCaml/graphs/contributors), which is built on
[js_of_ocaml](https://ocsigen.org/js_of_ocaml/latest/manual/overview), [CodeMirror](https://codemirror.net/)
and [Materialize](https://materializecss.com/).

Released, like upstream, under the [Apache 2.0](LICENSE) license. The files listed in the table above have
been modified or added relative to upstream.
