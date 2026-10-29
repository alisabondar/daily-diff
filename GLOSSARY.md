# Daily Diff

A local-first daily briefing that turns many AI and tech feeds into one short, curated digest per day.

## Inputs

**Source**:
One feed the app reads from (an RSS/Atom feed or a Hacker News listing), with its own type and health.
_Avoid_: Feed (when you mean the configured entry), channel, publisher

**Pack**:
A named, curated bundle of sources that can be switched on or off together.
_Avoid_: Bundle, collection, preset

**Custom source**:
A source the user added by pasting a URL; it belongs to no pack.
_Avoid_: User feed, manual source

**Item**:
One fetched entry from a source, identified by its canonical URL.
_Avoid_: Article, post, entry, link

**Community reaction**:
Discussion text from Hacker News or Reddit attached to a story.
_Avoid_: Comments, sentiment

**Book pool**:
A fixed list of well-known concept names from selected books, used only to pick Learn concepts.
_Avoid_: Library, reading list

## Curation

**Story**:
A group of items reporting the same event or release; the unit the user reads, favorites and searches.
_Avoid_: Cluster, topic, article

**Category**:
What kind of thing a story is: model, tool, headline, video, long-read or podcast.
_Avoid_: Type (reserved for sources), tag

**Score**:
A story's 0–10 relevance to the user's profile.
_Avoid_: Rank, rating, priority

**Relevance threshold**:
The minimum score a story needs to be summarized and shown.
_Avoid_: Cutoff, filter

**Profile**:
The user's free-text description of who they are and what they care about.
_Avoid_: Preferences, persona

**Vendor-reported stat**:
A number quoted from a story's own source text, shown with a link to where it came from.
_Avoid_: Benchmark, metric

## Output

**Digest**:
The briefing for one local calendar date, covering everything first seen in its window.
_Avoid_: Issue, edition, newsletter, report

**Window**:
The time span a digest covers, from the previous digest's end to the moment of the build.
_Avoid_: Range, period

**Daily digest**:
A digest whose window is about a day.

**Catch-up digest**:
A digest covering a gap of more than about a day and a half (capped at 7 days), with a larger Highlights cap.
_Avoid_: Backfill, weekly

**Raw digest**:
A digest shown without AI curation (titles, links and excerpts) because the LLM was unavailable.
_Avoid_: Fallback digest, plain digest

**Build**:
One run of the pipeline that produces or resumes a digest.
_Avoid_: Job, refresh, sync

**Highlights**:
The short, ordered selection of the day's most important stories, in fixed sections.
_Avoid_: Top stories, headlines (which is one section)

**More**:
Every other summarized story, grouped as long reads, podcasts, videos or other.
_Avoid_: Rest, extras, overflow

**Learn item**:
One of the two daily teaching pieces tied to the day's stories: a concept or a quick start.
_Avoid_: Lesson, tip

**Concept**:
A learn item explaining an established idea a day's story depends on, with a 3-question quiz.

**Quick start**:
A learn item with about five minutes of hands-on steps for a tool mentioned that day.
_Avoid_: Tutorial, guide

## User actions

**Favorite**:
A story the user saved, with zero or more free-text tags.
_Avoid_: Bookmark, star, save

**Tag**:
A short lowercase label the user puts on a favorite.
_Avoid_: Folder, label, category

**Feedback**:
A recorded "less like this" signal on a story; stored but not yet used.
_Avoid_: Rating, dislike
