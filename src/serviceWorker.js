/* GPTCaml service worker.
 *
 * The upstream list referenced files that no longer exist (css/bootstrap.css,
 * js/codemirror/sublime.min.js, toplevels/toplevel-5.1.1.js, ./favicon.ico),
 * and cache.addAll() is all-or-nothing - so the install always rejected and
 * nothing was ever precached. This list is generated from what src/ actually
 * contains. Bump CACHE_NAME whenever it changes. */

const CACHE_NAME = 'gptcaml-static-v4';

const staticAssets = [
    './manifest.json',
    './index.html',
    './css/ai.css?v=2',
    './css/icon.css',
    './css/index.css',
    './css/codemirror/codemirror.min.css',
    './css/codemirror/dialog.css',
    './css/codemirror/show-hint.css',
    './css/iconfont/MaterialIcons-Regular.eot',
    './css/iconfont/MaterialIcons-Regular.ttf',
    './css/iconfont/MaterialIcons-Regular.woff',
    './css/iconfont/MaterialIcons-Regular.woff2',
    './css/materialize/materialize.min.css',
    './css/theme/material.css',
    './css/theme/mdn-like.css',
    './css/theme/monokai.css',
    './css/theme/pycharm.css',
    './icon/favicon.ico',
    './icon/banner.png',
    './icon/android-icon-36x36.png',
    './icon/android-icon-48x48.png',
    './icon/android-icon-72x72.png',
    './icon/android-icon-96x96.png',
    './icon/android-icon-144x144.png',
    './icon/android-icon-192x192.png',
    './icon/apple-icon.png',
    './icon/apple-icon-57x57.png',
    './icon/apple-icon-60x60.png',
    './icon/apple-icon-72x72.png',
    './icon/apple-icon-76x76.png',
    './icon/apple-icon-114x114.png',
    './icon/apple-icon-120x120.png',
    './icon/apple-icon-144x144.png',
    './icon/apple-icon-152x152.png',
    './icon/apple-icon-180x180.png',
    './icon/favicon-16x16.png',
    './icon/favicon-32x32.png',
    './icon/favicon-96x96.png',
    './js/buttons.js',
    './js/editor_change.js',
    './js/jquery.min.js',
    './js/materialize.min.js',
    './js/resizer.js',
    './js/shortcuts.js',
    './js/ai/ai_settings.js',
    './js/ai/ai_context.js',
    './js/ai/ai_markdown.js',
    './js/ai/ai_prompt.js',
    './js/ai/ai_providers.js',
    './js/ai/ai_diff.js',
    './js/ai/ai_panel.js',
    './js/codemirror/annotatescrollbar.js',
    './js/codemirror/closebrackets.js',
    './js/codemirror/codemirror.js',
    './js/codemirror/dialog.js',
    './js/codemirror/jump-to-line.js',
    './js/codemirror/matchbrackets.min.js',
    './js/codemirror/matchesonscrollbar.js',
    './js/codemirror/mllike.js',
    './js/codemirror/search.js',
    './js/codemirror/searchcursor.js',
    './js/codemirror/show-hint.js',
    './toplevels/toplevel-5.3.0.js',
];

self.addEventListener('install', event => {
    // without skipWaiting a new worker sits idle until every tab of the app is
    // closed, so a deployed fix can go unseen for days
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(staticAssets))
    );
});

self.addEventListener('activate', event => {
    // drop every cache from previous versions, including the dynamic one -
    // a stale stylesheet served from it is exactly how a fix goes missing
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(networkFirst(event.request));
});

/* Network first, falling back to whatever we have cached: the toplevel is a
 * multi-megabyte bundle, so being able to work offline matters, but a stale
 * editor must never win over a freshly deployed one. */
async function networkFirst(req) {
    try {
        const res = await fetch(req);
        if (req.method === 'GET' && res && res.ok) {
            const cache = await caches.open('dynamic-cache');
            cache.put(req, res.clone());
        }
        return res;
    } catch (error) {
        const cached = await caches.match(req);
        if (cached) return cached;
        throw error;
    }
}
