---
name: release-announcement
description: >
  Generate a Hebrew release-announcement draft for f1-fantazy-bot users
  based on commits since a given commit SHA or ISO date. Use when the user
  says "draft release announcement", "announce changes since <sha>", "announce
  changes since <date>", "release notes for users", "בוא נכין הודעת שחרור",
  "כתוב הודעה למשתמשים על השינויים החדשים", "הודעת ריליס", or any similar
  request to communicate new bot features to end users. Walks the commits,
  lets the user pick which are significant, then produces a single Hebrew
  draft ready to be sent via /broadcast.
---

# Release Announcement Skill

Produces **a single Hebrew announcement draft** describing new user-visible
features in `f1-fantazy-bot`, based on commits since a starting point chosen
by the user. The skill never sends anything — it only produces text the
admin can copy into the bot's existing `/broadcast` admin command.

## Inputs

When invoked, the user provides **one** of:

- A commit SHA / ref / tag — e.g. `abc1234`, `v1.2.0`, `HEAD~10`.
- An ISO date — e.g. `2026-04-01` (interpreted as `--since=<date>`, author
  date inclusive).

If neither is supplied, immediately ask the user via `ask_user` (freeform
allowed) for the starting point before doing anything else. Example
question: _"From which commit SHA or date should I start collecting
commits?"_

## Workflow

Follow these steps in order. Do not skip steps. Do not invent extra steps.

### Step 1 — Validate input and collect commits

Run a single `bash` call to collect the candidate commits:

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

#### Hard rules

- **Hebrew only.** No English sentences. (Specific Telegram command names
  like `/best_teams` and brand names stay in English — that's expected.)
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

### Step 5 — Suggest next step

After the draft, print exactly one short Hebrew suggestion:

> "אפשר לשלוח את ההודעה דרך `/broadcast` בבוט."

**Do not** call `/broadcast`, do not modify any file, do not commit
anything. The skill's job ends at producing the draft.

## Constraints

- **Read-only on the repo.** Only `git log` / `git show` / `git rev-parse`
  are needed. Do not run `git checkout`, `git commit`, `git push`, etc.
- **No network calls.** Don't fetch external data; everything needed is in
  the local git history and the working tree.
- **Confirm before generating.** Always run Step 2's confirmation loop. Do
  not skip straight to the draft even if the user's initial request seems to
  imply "all commits".
- **Hebrew draft.** The draft itself is Hebrew. The markdown header
  (`### 📋 הודעת עדכון`) and the `/broadcast` suggestion line follow the
  spec above.

## Example interactions

- _"draft a release announcement since v1.4.0"_ → start at `v1.4.0`,
  follow the workflow.
- _"בוא נכין הודעת שחרור על השינויים מאז 2026-04-01"_ → date input,
  follow the workflow.
- _"announce changes since abc1234 — pick everything"_ → still run Step 2
  but accept `all` immediately when confirmed.
