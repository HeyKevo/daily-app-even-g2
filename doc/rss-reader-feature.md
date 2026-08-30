# RSS Reader Feature

## 1. Goal and scope
The feature adds an RSS reader for EvenHub to the Daily App.

Included:
- Dashboard with a button list (`RSS Feeds`, `Shopping List`)
- RSS list with entries from the configured feeds
- RSS detail view with the full article body, manual paging and auto scroll

Not included:
- Opening external article links in a browser
- Interactive per-entry actions (no actions overlay)
- Persistent local storage beyond the runtime cache

## 2. User flow
1. The app starts on the dashboard.
2. `Click` on `RSS Feeds` opens the RSS list.
3. In the RSS list, `Click` opens the selected entry in the detail view.
4. `DoubleClick` in the detail view returns to the RSS list.

Input mapping:
- `Click`
  - Dashboard: opens the selected dashboard button
  - RSS list: opens the selected RSS entry
  - RSS detail: toggles auto scroll (start/stop)
- `DoubleClick`
  - RSS list: back to the dashboard
  - RSS detail: back to the RSS list
- `Up`
  - Dashboard/RSS list: move selection up
  - RSS detail: previous page of the current article; stays on page 1 at the top
- `Down`
  - Dashboard/RSS list: move selection down
  - RSS detail: next page of the current article; stays on the last page at the end

Long press is not delivered to the app, so the Even Realities system behavior stays untouched.

## 3. Decision list (ADR style)
- Multiple feeds are merged and sorted globally by `pubDate`, descending.
- RSS data is reloaded when the RSS list is opened.
- The RSS list shows `Title - summary snippet` as a single line per entry.
- `Click` in the detail view is reserved for auto scroll start/stop only.
- `Up`/`Down` in the detail view pages inside the current article and never switches articles.
- Auto scroll advances one article page every 2500 ms, stops on the final page and stays there.
- Auto scroll never starts by itself, only through an explicit `Click` toggle.
- Opening an article always starts on page 1; page state lives in the detail screen instance.

## 4. Data model
Feed config schema:
- `id: string`
- `title: string`
- `url: string`
- `maxEntries: number`

Initial feed configuration:
- `Tagesschau`
- URL: `https://www.tagesschau.de/infoservices/alle-meldungen-100~rss2.xml`
- `maxEntries: 50`

Internal RSS item schema:
- `id: string`
- `title: string`
- `summary: string` (short, clean text for the list)
- `snippet: string` (one truncated line for a list row)
- `content: string` (full readable article body)
- `pages: string[]` (paginated `content` for the detail view)
- `pubDateText?: string`
- `pubDateMs: number | null`
- `link?: string`
- `source: string`

## 5. Parsing and normalization
XML fields per RSS item, in priority order:
- `title`
- article body: `content:encoded`, `content`, `dc:content`, `description`, `summary`, `subtitle`
- list summary: `description`, `summary`, `subtitle`, `itunes:summary`
- `pubDate` / `published` / `updated` / `dc:date`
- `link` (Atom entries fall back to the `href` attribute of `<link rel="alternate">`)
- `guid` / `id`

Atom feeds are supported: when a document has no `<item>` elements, `<entry>` elements are used.

Normalization:
- HTML is converted to plain text without a DOM dependency: script/style/iframe blocks,
  images and tracking elements are dropped, block elements become paragraph breaks and
  `<br>` becomes a line break.
- HTML entities are decoded; typographic punctuation is folded to ASCII for the G2 font.
- Whitespace is collapsed per line and repeated blank lines are reduced to one.
- The list snippet is truncated to a fixed length; if a feed has no short summary the
  snippet is derived from the article body.
- The article body is segmented into detail pages that fit the G2 text container.

Handling of missing/invalid dates:
- `pubDate` is parsed into `pubDateMs`.
- Invalid date: `pubDateMs = null`.
- Sorting: entries without a valid date are placed after dated entries.

## 6. UI and SDK constraints
EvenHub rules that apply:
- At most 4 containers per page
- Exactly one container with `isEventCapture=1`

Container strategy for this feature:
- Dashboard: text containers in `dashboard-menu` layout
- RSS list: one `ListContainer` plus a page status text container
- RSS detail: title text, body text and two footer image halves

Rendering strategy:
- Initially: `createStartUpPageContainer`
- Afterwards: `rebuildPageContainer`
- Text updates only for text-only layouts via `textContainerUpgrade`

## 7. Error and fallback behavior
Feed load errors:
- If a cache exists: the last successful RSS list stays visible.
- If no cache exists: a status/error row is shown in the RSS list.

Parsing errors:
- Individual broken feed responses are ignored when other feeds succeed.
- If no feed data can be processed, an error status is shown.
- Malformed XML raises `Invalid RSS XML for <feed>` instead of crashing the parser.

Behavior with/without cache:
- With cache: stale data visible, hint in the list title.
- Without cache: no entries, status row instead.

## 8. Test matrix
Happy path:
1. Dashboard shows `RSS Feeds`.
2. `Click` opens the RSS list.
3. The RSS list refreshes on enter.
4. An entry shows `Title - snippet`.
5. `Click` opens the detail view on page 1.
6. `Click` in the detail view toggles auto scroll.
7. `DoubleClick` returns to the RSS list.

Navigation/edge cases:
1. `Up` on the first detail page stays on page 1.
2. `Down` on the last detail page stays on the last page.
3. Auto scroll stops on the last page and does not open the next article.
4. `Up`/`Down` in the list view stays inside the valid bounds.

Parsing cases:
1. `content:encoded` wins over a short `description`; the list keeps the short summary.
2. Without `content:encoded` the `description` becomes the readable body.
3. HTML markup becomes clean text with paragraph separation.
4. Empty, missing or malformed content does not crash the parser.

Error cases:
1. Network error without cache: error status in the list.
2. Network error with cache: last update stays visible.
3. XML parsing error: error status when no usable feed remains.

Build check:
- `npm --prefix daily-app run build` must succeed.
- `npm --prefix daily-app test` must succeed.
