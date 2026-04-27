---
name: release-announcement
description: >
  Generate two Hebrew release-announcement drafts for f1-fantazy-bot users
  based on commits since a given commit SHA or ISO date. Use when the user
  says "draft release announcement", "announce changes since <sha>", "announce
  changes since <date>", "release notes for users", "בוא נכין הודעת שחרור",
  "כתוב הודעה למשתמשים על השינויים החדשים", "הודעת ריליס", or any similar
  request to communicate new bot features to end users. Walks the commits,
  lets the user pick which are significant, then produces a standard draft
  and an amplified "wow" version ready to be sent via /broadcast.
---

# Release Announcement Skill

Produces **two Hebrew announcement drafts** — a standard version and an
amplified "wow" version — describing new user-visible features in
`f1-fantazy-bot`, based on commits since a starting point chosen by the
user. The skill never sends anything — it only produces text the admin can
copy into the bot's existing `/broadcast` admin command.

## Inputs

When invoked, the user provides **one** of:

- A commit SHA / ref / tag — e.g. `abc1234`, `v1.2.0`, `HEAD~10`.
- An ISO date — e.g. `2026-04-01` (interpreted as `--since=<date>`, author
  date inclusive).

If neither is supplied, **first** try to read `data/announcements.json` for
a previous `headCommit` to offer as default (see Step 1 below). Only if that
file is missing or empty, ask the user via `ask_user` (freeform allowed) for
the starting point. Example fallback question: _"From which commit SHA or
date should I start collecting commits?"_

## Workflow

Follow these steps in order. Do not skip steps. Do not invent extra steps.

### Step 1 — Validate input and collect commits

If the user did not provide a SHA or date, first try to derive a smart
default from `data/announcements.json` at the repo root (created by previous
runs of this skill — see Step 6 below):

- If the file exists and contains at least one entry, pick the entry with
  the highest `createdAt` and read its `headCommit`. Then ask the user via
  `ask_user` (choices `["Use <short-sha>", "Provide a different SHA/date"]`,
  freeform also allowed):
  > _"Last announcement covered up to `<short-sha>` (saved on
  > `<createdAt>`). Use it as the starting point, or supply another SHA/date?"_
  - "Use …" → use that `headCommit` as the SHA input.
  - Anything else → treat the reply as the new SHA/date input.
- If the file is missing, empty, or malformed, fall back to the original
  freeform prompt: _"From which commit SHA or date should I start collecting
  commits?"_

Once you have an input, run a single `bash` call to collect the candidate
commits:

- **SHA / ref input:**
  ```bash
  git log <ref>..HEAD --no-merges --pretty=format:'%H%x09%ad%x09%s' --date=short
  ```
- **Date input** (must look like `YYYY-MM-DD`):
  ```bash
  git log --since=<date> HEAD --no-merges --pretty=format:'%H%x09%ad%x09%s' --date=short
  ```

If the command errors (e.g. unknown ref) or returns zero lines, stop and
report this to the user in plain language. Do not try to invent commits.

For each line, parse:
- `sha` (full hash)
- `date`
- `subject`
- `type` — the conventional-commit prefix at the start of the subject when
  present: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `style`,
  `ci`, `build`, `perf`. If the subject does not match
  `^(<type>)(\(.+\))?!?:` treat type as `other`.

### Step 2 — Present the commit list and ask for confirmation

Render a numbered list. One commit per line:

```
[N] <short-sha> <date> <type?> <subject>
```

Mark **pre-selected** commits with `[x]` and unselected commits with `[ ]`.
**Pre-select only commits whose type is `feat` or `fix`.** All other types
(including `other`) are listed but unchecked.

After the list, summarise what's pre-selected (e.g. _"4 of 11 commits
pre-selected: feat/fix only"_) and use `ask_user` (freeform allowed, no
fixed choices required) with a question like:

> "Which commits should I include in the announcement? Reply with one of:
> `default` (keep pre-selection), `all`, `none`, or an explicit list like
> `1,3,5-8`."

Parse the reply:
- `default` (or empty / "ok" / "yes") → keep the pre-selection.
- `all` → select every commit.
- `none` → abort with a friendly Hebrew message and stop.
- A comma-/space-separated list of numbers and `start-end` ranges → use
  exactly those line numbers. Reject and re-ask if any number is out of
  range.

After parsing, **echo back the final selected list** (just the subjects, one
per line) so the user can spot mistakes, and ask for one final
confirmation (`ask_user`, choices: `["Yes, generate", "Let me re-pick"]`).
If the user re-picks, loop back to the selection prompt.

### Step 3 — Gather context per selected commit

For each selected commit, fetch a richer description with one batched
`bash` call (use a single command per commit or chain them; do not pull
full diffs):

```bash
git show -s --format='%H%n%s%n%b' <sha>
git show --stat --name-only --pretty=format: <sha>
```

This gives subject, body, and the list of changed paths. Use the changed
paths to reason about scope — e.g. files in `src/commandsHandler/` usually
mean a new or updated bot command, files under `src/utils/weatherApi.js`
mean weather behaviour, etc.

### Step 4 — Produce a Hebrew announcement draft

Generate **one draft** of the announcement in **Hebrew**. Output it inside a
single fenced markdown block so it can be copied cleanly:

```
### 📋 הודעת עדכון
<draft>
```

#### Tone & structure

The tone is **warm and engaging, with F1 personality** — like a passionate
fan talking to fellow fans. It should feel like a pit-wall radio message:
confident, a bit playful, and to the point. Think of it as sitting between
"concise bullet list" and "over-the-top comedy" — informative first,
personality second.

Follow this structure:

1. **Opening hook** — Start with an F1-themed catchphrase or metaphor as
   the first line, prefixed with a racing emoji (e.g. 🚦, 🏎️). This is
   the attention-grabber. Example pattern:
   `🚦 It's lights out and away we go: <one-liner about the update>!`
   One short paragraph after the hook sets the context — why this matters
   to the user.

2. **Features section** — Use an emoji header (e.g. 🛠️) followed by a
   bold section title. List each user-visible change as a bullet point
   with a bold label and a short explanation. Mention the actual
   `/command` name when relevant. Keep bullets concise — one or two
   sentences each.

3. **Closing / CTA** — Use a 🏁 emoji header. Write a short motivating
   paragraph that ties back to F1 (next race, strategy, timing). End
   with a clear call-to-action — e.g. "try the new command now". Add a
   trailing `🏎️💨` or similar for flair.

#### Emoji usage

- Use emojis for **section headers** (🚦, 🛠️, 🏁) — these are
  structural markers.
- One or two inline emojis (e.g. 🔄, ⚡) in the body are fine when they
  add clarity.
- Do **not** emoji-spam every sentence.

#### Hebrew quality

The Hebrew should be **polished and native** — the level of a sports columnist
or product blogger writing in Hebrew, not a translation from English. The
tone is set by the structure above; this section is about *language quality
underneath* both drafts.

**Do:**

- Prefer **short Hebrew clauses**. Break long English-style compound
  sentences into two or three Hebrew sentences.
- Use **natural Hebrew connectives** — `כש־`, `מעכשיו`, `כך`, `לכן`, `אז` —
  over literal English-isms.
- Use **active voice** and direct verbs.
- For "now you can…" phrasings, prefer `מעכשיו אפשר…` over
  `אתם יכולים עכשיו…`.
- Use **natural Hebrew word order** — the verb often comes earlier than in
  English; don't force English SVO order.

**Avoid (translation tells):**

- **Literal calques of English idioms.** Don't translate "game-changer" or
  "at the end of the day" word-for-word. Describe the actual benefit
  instead.
- **Overuse of `אנחנו` / `אנו`.** Hebrew product copy usually drops the
  pronoun; the verb form already carries it.
- **Translated marketing tropes** — `אנחנו שמחים להציג…`,
  `ברוכים הבאים ל…`, `קחו את ה־X שלכם לרמה הבאה`.
- **English-style passive constructions** where active works.
- **Anglicized prepositions** — e.g. `לעדכן את X ב־Y` when natural Hebrew
  would say `לעדכן ש־` or restructure the sentence.
- **Foreign loan words** when a clean Hebrew word exists. (Telegram
  `/commands` and brand names like `F1` stay English — that's already
  specified.)

**Self-edit pass — required before outputting the draft.**
Re-read each sentence and ask:

1. Would a native Hebrew speaker actually phrase it this way?
2. Could the same idea be said in fewer Hebrew words?
3. Is anything a literal translation of an English phrase? Replace it.
4. Does the rhythm feel like natural Hebrew, or like English wearing
   Hebrew clothes?

Fix issues before outputting.

#### Hard rules

- **Native-quality Hebrew.** Both drafts must read like native written
  Hebrew, not translated English — see the Hebrew quality subsection
  above. Telegram command names like `/best_teams` and brand names
  (`F1`, etc.) stay in English — that's expected.
- **User-visible focus.** Skip refactors, tests, CI, dependency bumps,
  docs-only changes, and anything internal — even if the user selected
  them, omit them when they have no observable user impact.
- **Use real bot commands** when relevant. Refer to the actual command
  strings used in the codebase (e.g. `/best_teams`, `/teams_tracker`,
  `/league_graphs`, `/deadline`, `/next_races`, `/select_team`,
  `/set_nickname`). When unsure whether a command name is real, check
  `src/constants.js` (the `COMMAND_*` exports are the source of truth).
- **No invented features.** Every claim must be traceable to one of the
  selected commits. If something is unclear from the commit message + file
  paths alone, leave it out rather than guess.
- **RTL-friendly punctuation.** Use Hebrew quotation marks and full stops
  appropriate for Hebrew text.
- **No version numbers** unless one of the selected commits is explicitly a
  version bump and the user chose to include it.
- **Group related changes.** If multiple commits touch the same feature
  area, merge them into a single bullet rather than listing each commit
  separately.

### Step 5 — Produce a "wow" version

Take the draft from Step 4 and **rewrite it** with dramatically amplified
energy. Same facts, same commands, same structure — but turned up to race-day
intensity. Output it in its own fenced block:

```
### 🔥 גרסת WOW
<wow draft>
```

#### Wow tone

Think of a breathless F1 commentator calling the final lap. The wow version
should feel like **the announcement itself is a podium celebration**:

- **Bigger metaphors** — championship-deciding language, pit-stop precision,
  DRS zones, safety-car restarts. Go beyond the standard F1 references.
- **Punchier sentences** — shorter, more urgent. Break long explanations into
  snappy fragments.
- **More emojis** — still purposeful (not every word), but noticeably more
  than the standard draft. Use racing emojis (🏆, ⚡, 🔥, 💥, 🚀) alongside
  the structural ones.
- **Drama and hype** — the opening hook should hit harder, the features
  should sound like game-changers, and the CTA should create real urgency.
- **Still honest** — do not exaggerate what a feature does. The excitement
  comes from *how* you describe it, not from inflating the scope.

All hard rules from Step 4 still apply (native-quality Hebrew, real
commands, no invented features, etc.). The wow tone is amplified — the
Hebrew language quality is not. Run the same self-edit pass before
outputting: replace any phrase that feels translated.

### Step 6 — Pick a version and save to the announcements file

After both drafts are printed, ask the user which one to keep using
`ask_user` with choices `["Standard", "WOW", "Don't save"]`:

> _"Which version should I save as the latest release announcement?
> (`/whats_new` will display whichever is saved.)"_

- **`Don't save`** → skip the file write entirely and continue to Step 7.
- **`Standard`** or **`WOW`** → append the chosen draft to
  `data/announcements.json`:
  1. Get the current head SHA: `git rev-parse HEAD`.
  2. Read `data/announcements.json` (treat missing or malformed file as
     `[]`).
  3. Build a new entry:
     ```json
     {
       "id": "<ISO-timestamp-slug, e.g. 2026-04-27T20-33-00Z>",
       "createdAt": "<ISO timestamp of now>",
       "version": "standard" | "wow",
       "sinceRef": "<the original SHA or date input>",
       "headCommit": "<output of git rev-parse HEAD>",
       "text": "<the chosen draft body, including its `### 📋 ...` or `### 🔥 ...` heading, but WITHOUT the surrounding ```` ``` ```` fences>"
     }
     ```
  4. **Prepend** the entry to the array (newest first) and write the file
     back with 2-space JSON indent + a trailing newline.
  5. Confirm to the user in Hebrew, naming the saved version and the file
     path, e.g.:
     > _"שמרתי את הגרסה ה־**WOW** ב־`data/announcements.json`. הפעלה של
     > `/whats_new` בבוט תציג אותה."_

This is the **only** file the skill is permitted to write.

### Step 7 — Suggest next step

After both drafts, print exactly one short Hebrew suggestion:

> "כשתבחר ניסוח — אפשר לשלוח אותו דרך `/broadcast` בבוט."

**Do not** call `/broadcast`, do not modify any file, do not commit
anything. The skill's job ends at producing the two drafts.

## Constraints

- **Read-only on the repo, with one exception.** Only `git log` /
  `git show` / `git rev-parse` are needed for git history. The **only**
  file the skill may write is `data/announcements.json` (see Step 6). Do
  not run `git checkout`, `git commit`, `git push`, etc.
- **No network calls.** Don't fetch external data; everything needed is in
  the local git history and the working tree.
- **Confirm before generating.** Always run Step 2's confirmation loop. Do
  not skip straight to drafts even if the user's initial request seems to
  imply "all commits".
- **Hebrew drafts.** Both drafts are Hebrew. The markdown headers
  (`### 📋 הודעת עדכון`, `### 🔥 גרסת WOW`) and the `/broadcast`
  suggestion line follow the spec above.

## Example interactions

- _"draft a release announcement since v1.4.0"_ → start at `v1.4.0`,
  follow the workflow.
- _"בוא נכין הודעת שחרור על השינויים מאז 2026-04-01"_ → date input,
  follow the workflow.
- _"announce changes since abc1234 — pick everything"_ → still run Step 2
  but accept `all` immediately when confirmed.
