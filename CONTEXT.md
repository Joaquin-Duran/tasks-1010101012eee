# GoPrep Team Board, working context

Everything a new session needs to pick this up. Read this first; the README covers
what the board *is*, this covers how to *work on it*.

Last updated 7 Oct 2026.

---

## 1. Where things live

| | |
|---|---|
| Repo | `github.com/Joaquin-Duran/tasks-1010101012eee`, branch `main` |
| Local | `~/Downloads/goprep-board_2` |
| Live | https://joaquin-duran.github.io/tasks-1010101012eee/ (GitHub Pages, from `main`) |
| Database | Supabase project **Goprep Pro**, ref `dpkfwiabwsvrzrihydcc`, tables prefixed `pm_` |
| Brand files | Azure Blob, storage account `goprepassets`, container `brand`, public read |

The Supabase project is **shared with the live product**. The 22 product tables are
off limits. Only touch `pm_*`.

---

## 2. Build

`index.html` is generated. **Do not edit it directly**: edit `src/` and run:

```bash
./build.sh
```

Twelve parts concatenate in order. `01` opens `<html><head>`, `03` opens `<body>` and
`<script>`, `12` closes everything. Parts 04–11 are plain JS in between.

The script refuses to write a broken file: it checks every part is non-empty, checks the
document structure, and runs `node --check` on the extracted script block. It warns on
em dashes (see house style below).

**This guard exists because it was needed.** A concatenation once silently dropped three
parts and shipped a file with no `<head>`.

---

## 3. Security model, do not break this

The page is public. The data is not.

- Every `pm_*` table has **RLS on with zero policies** and no grants to `anon`.
- All reads and writes go through `SECURITY DEFINER` functions that call
  `pm__require(p_token)` first and raise `unauthorized` without a live session token.
- The publishable key in the page source is public on purpose and useless alone.
- One shared team passcode, bcrypt-hashed in `pm_config`, 30-day sessions, rate-limited
  login with a 15-minute lockout after 8 failures.

**Adding a table means:** RLS on, zero policies, revoke from `anon`, and reach it only
through a new `SECURITY DEFINER` function that requires the token. Grant `execute` to
`anon` and revoke it from `public`, which is the tightest pattern already in use
(`pm_save_task`, `pm_bootstrap`). The four ad tables added in October follow it.

A save that writes to `pm_activity` should also record what it changed: see the rule at
the end of `docs/schema.md`.

**`p_actor` is a claimed identity, not a verified one.** It is supplied by the caller on
every write, `pm_reveal_secret` included, and the page sends `localStorage.gp_me`. That
follows from the single shared passcode: there is no server-side identity to check
against. See section 9. It is not a bug to patch, and the reveal log is an honest record
among colleagues rather than an audit trail.

A partial hardening exists short of full accounts: give `pm_sessions` a `person` column,
set it in an extended `pm_login`, and read the actor from the session rather than from
the argument. That stops one caller varying the claimed name from write to write, which
is the part a shared passcode can actually fix. It still records a claim, because
everyone signs in with the same secret.

### Credentials rule

`pm_providers.sensitivity` is `low` or `critical`.

- `low` may store a password. It never leaves the database in `pm_bootstrap`, the page
  only learns `has_secret`. Reading it is a separate `pm_reveal_secret` call that writes
  the reader's name to `pm_activity`.
- `critical` stores **no** password, enforced by
  `check (sensitivity = 'low' or secret is null)`. It stores `vault_location` and
  `access_note` instead.

The reason: one shared passcode cannot be revoked per person, so its blast radius must
not include ad spend or production.

---

## 4. Testing without the passcode

The passcode is not in the repo and nobody should be asked for it. To test, mint a
session directly.

**Never write a fixed token into this file.** The repo is public, and the page source
already carries the project URL and the publishable key. A token printed here is a
credential published on GitHub: for as long as that row exists, anyone who has read this
page can call `pm_bootstrap` and every `pm_save_*` and `pm_delete_*` function. A token
that was hardcoded in this section has been removed for exactly that reason.

Generate a fresh one each time and read it back:

```sql
insert into pm_sessions (token, expires_at)
values (gen_random_uuid(), now() + interval '30 minutes')
returning token;
```

Then in the browser console, using that value:

```js
localStorage.setItem('gp_token','<the token returned above>');
localStorage.setItem('gp_me','Joaquin');
location.reload();
```

**Delete the row when finished**, and use the local server rather than the live URL so
the token never lands in localStorage on a public origin:

```sql
delete from pm_sessions where token = '<the token>' or expires_at < now();
```

There is no test environment. This mints a real credential against the live database,
and anything saved during a test is saved for real. Until a branch exists, treat every
test as production.

Serve locally with `python3 -m http.server 8777 --directory ~/Downloads/goprep-board_2`.

---

## 5. Schema

| Table | Holds |
|---|---|
| `pm_tasks` | 45 tasks. `goal_id`, `milestone_id`, `start_date`, `target_date`, `phase_key` |
| `pm_goals` | 9 rows. `horizon` is `impulse` \| `quarter` \| `year` \| `someday`. `lower_is_better` for metrics that are wins when they fall |
| `pm_milestones` | 19. Dated deliverables under a goal |
| `pm_metric_points` | One reading per goal per date. Drives sparklines |
| `pm_phases` | Roadmap windows, with `verdict` written when one closes |
| `pm_docs` | 15 handbook pages, markdown |
| `pm_files` | 214 blobs in the Azure container, with `thumb_url` and `lang` |
| `pm_assets` | Curated pointers to things *not* in the container |
| `pm_providers` | 19 subscriptions and accounts |
| `pm_journey_steps` | 16 steps across two journeys, each optionally bound to a task |
| `pm_ideas` | The creative board |
| `pm_areas` | Area labels and colours |
| `pm_campaigns` | Ad campaigns. `status` is `draft`, `live`, `paused` or `done` |
| `pm_ads` | Cards on a campaign wall. `stage` is `idea`, `drafting`, `ready`, `live` or `killed` |
| `pm_ad_shots` | A card's reference picture, kept **out** of `pm_bootstrap` on purpose |
| `pm_ad_notes` | Signed, timed notes on a card or on a campaign |

Full column list in `docs/schema.md`, regenerated from the database.
| `pm_people` | The roster. `photo_url` holds a profile photo, usually a data URI. `bio` is the short self description |
| `pm_activity`, `pm_config`, `pm_sessions`, `pm_login_attempts` | As before |

`pm_bootstrap(p_token)` returns all of it in one call. **Adding a table means adding it
there too**: the page reads nothing else.

---

## 6. Adding files and images

Files live in Azure Blob and are *indexed* into `pm_files`. Both halves are
needed: uploading without indexing means the board cannot see the file, and
indexing without uploading gives a dead link.

One command does all of it:

```bash
./tools/add-files.py ~/Desktop/new-logos --folder logos/rgb
./tools/add-files.py ~/Desktop/deck.pdf  --folder decks
```

It stages the input with web-safe names (accents and spaces stripped, Spanish
folder names translated at index time), makes a 420px JPEG thumbnail for every
image, uploads originals and thumbnails, then writes `reindex.sql`.

**Run that SQL against Supabase.** The script deliberately does not touch the
database, so an upload can never half-apply. The statement is idempotent: it
upserts every row, derives English display names from the path, and sets the
language flag for anything under `/espanol/` or `/ingles/`.

Then hard-refresh the board. **Nothing needs deploying**: the page reads the
database at runtime.

If you uploaded through the Azure portal instead, catch the index up with:

```bash
./tools/add-files.py --reindex-only
```

### Folder names

The target `--folder` becomes the path prefix, and `pm__file_folder()` maps that
prefix to the label shown in the Files view. Existing prefixes: `logos/byn`,
`logos/cmyk`, `logos/rgb`, `patterns`, `fonts`, `competitors`, `brandboard`,
`social`, `stickers`, `merch`, `ads`, `plans`, `decks`. A new prefix falls back
to "Brand" until you add a case to that function.

### Permissions

Uploading needs **Storage Blob Data Contributor** on the storage account.
Subscription Contributor is *not* enough, it lets you create a container but
not write blobs, and the error does not make that obvious. Grant it with:

```bash
az role assignment create --role "Storage Blob Data Contributor" \
  --assignee-object-id $(az ad signed-in-user show --query id -o tsv) \
  --assignee-principal-type User \
  --scope $(az storage account show -n goprepassets -g gp_mvp --query id -o tsv)
```

RBAC takes about a minute to propagate; the script retries are not automatic, so
just run it again.

### Before you upload

The container is **world-readable**. Anything in it can be fetched by anyone with
the URL. That is correct for logos, patterns and creatives, whose purpose is to
be distributed. It is not correct for screenshots nobody has checked, contracts,
or anything with customer data in it. Two files are deliberately *not* uploaded
for this reason and are recorded in `pm_assets` with their local location
instead: the onboarding deck and five unchecked screenshots.

For things that should not be public, add a row to `pm_assets` with a
`location` and no `url`. The Files view lists those under "Elsewhere".

### A picture on an ad card

A card on the ad wall takes a reference picture, shrunk to 560px in the browser and kept
in `pm_ad_shots`. That is a thumbnail to think with, not an asset library: it is capped
at 220kB, it lives behind the passcode, and `pm_bootstrap` does not return it.

**A finished creative still goes in the Azure container**, through `tools/add-files.py`
above, and on to the card as a link. The card has two link fields for this: where the ad
points, and the asset or reference.

### A file that is not in the container

`pm_assets` is the curated pointer list: things that live in Drive, on a laptop,
or behind someone's login. Add one from the Files view with **+ Elsewhere**.

---

## 7. Navigation

Six destinations. Three have a second row. **Company is first, and the board always
opens there**: every load lands on Welcome, whatever was open last.

```
Company        Welcome · Handbook · Team · Activity. The landing destination
Tasks          My week · Where we are · Timeline · Every task
Marketing      Strategy · Q1 plan · Buyer persona · Competitors ·
               User journey · Value creation · Files
Ads            campaigns, and a wall of cards inside each one
Subscriptions  providers, infrastructure first
Ideas          the creative board
```

The four ways of reading the work are four ways of reading the *same* work, so they sit
behind one tab. The destination key is `tasks` and so is the view key of Every task:
different namespaces, and `VIEW_HOME` maps one to the other.

Two pages have no tab and are reached by drilling: **a goal** (from Where we are) and
**a campaign wall** (from Ads). Clicking a roster card on Team opens **a person**.

`PAGED` names the destinations whose second row is a reading order rather than four
views of one thing: Company and Marketing get **Next and Back**, top and bottom, drawn
by `pager()` in `render()` rather than by each view. Tasks deliberately does not.

**The button top right always makes a task.** It used to make whatever the current view
was about, which meant it meant nothing in particular. Every other thing that can be
created has its own button on the page that holds it, so nothing was lost.

**My week** is no longer Just me or Everyone. `UI.weekPeople` is a set of names and
empty means everybody, so several people's weeks can be read together. The area chips
filter by **the area of the goal a task serves**, not by `pm_tasks.category`: areas come
from `pm_areas` and are what band the goals on Where we are, while a category is a
smaller and different idea (Bug, Feature). `areaOfTask()` in part 06 is the one place
that decides this.

**The editor.** `mdField(id, value)` plus `wireMd(id)` gives a full-height editor with a
toolbar, the rendered page beside it, and a line naming what the cursor is standing in.
Used by the handbook and by a campaign brief. Modal option `tall` makes the dialog fill
the window; the last `.field` in the body is what flexes.

**An activity line opens.** `pm_activity.changes` holds the fields a save actually moved
and `openActivity()` shows them, before and after, with ids resolved to names. See
`docs/schema.md` for the rule every new `pm_save_*` has to follow, and for the two
columns that can never reach a log.

**Goals and milestones.** A goal form is five fields and a More fold; a milestone is a
name and a date, added in one line from the goal page. Goal health has an automatic
option that computes from the number against the window and **writes the answer**, so
`pm_goals.status` stays the single source of truth rather than becoming a second one.
The UI says This quarter, This year, Someday and Mission; the stored `horizon` values
are untouched. Read the rename gotcha in section 11 before changing that.

**Profile photos.** Anyone can put a photo on their own card. A pencil badge sits on the
picture, opens the file browser, and the page centre-crops the chosen file to a square,
shrinks it to 256px, encodes it as a JPEG data URI and sends it to `pm_set_photo`. It is stored in `pm_people.photo_url`, which means a photo
sits behind the passcode rather than in the world-readable container, and no upload or
deploy is involved. The function refuses anything over 200kB, and the browser cannot
open HEIC, so an iPhone photo has to be a JPEG first. The controls appear only on your
own card, which is a convention rather than a check: see the note on `p_actor` in
section 3. There is no fallback image: a person with no
`photo_url` gets the initials avatar, and no photo is committed to the repo.

**Editing a profile.** Edit profile on your own card sets `role` and `bio` through
`pm_save_profile`. The **name is deliberately not editable**: `pm_tasks.owners` is an
array of names and `pm_goals.owner` is a name, so a rename would orphan every task and
goal that person holds. Renaming somebody is a database job, done together with those
two columns. `pm_save_person` also exists and does allow a rename: do not wire it to a
text field for that reason.

A **focus sprint** takes over the whole screen: a dial, the time left, the time it
started from, four arrows for plus or minus one and five minutes, and pause. Minimise
drops it to a bar at the foot of the board so you can keep working, and Expand puts it
back. It starts from the task modal, from your own roster card, or from Focus in the
header. Opened with no task it offers a random open task or a pick from the list. The
deadline is an absolute timestamp in `localStorage` under `gp_sprint`, so it survives a
reload and a re-render. Starting one sets the task to In Progress. Nothing else is
written, so sprint *history* does not exist yet: see the hold in section 9.

The **Welcome** page is the doc keyed `start-here`. Its `pm_docs.title` now reads
"Welcome", so the heading is data driven like every other doc page.

---

## 8. House style

These were explicit requests. Keep them.

- **No em dashes.** Anywhere, content or UI strings. Use a colon, a full stop, a comma,
  or a middot as a separator. `build.sh` warns.
- **No AI attribution.** `pm_docs.updated_by` is null for anything not written by a
  person. Never write "Claude" into content.
- **"Mission"** is the term for the top-level goal. It replaced "impulse", which had
  replaced "north star". The *data* value of `pm_goals.horizon` is still `impulse`:
  only the label moved, deliberately, so no string literal in the page had to. Read the
  rename gotcha below before changing the data.
- Prose is plain and direct. Say the number, name the risk, avoid throat-clearing.

---

## 9. Verified state, 7 Oct 2026

Checked against the live database and the deployed page, not from memory.

- `pm_sessions` holds 3 rows, none expired: `pm__require` deletes expired rows on
  every call, so the August logins are gone. No test tokens survive.
- The page ships **0 em dashes**. `build.sh` warns, and the warning has stayed quiet.
- Orange: the board uses `#EF6E45` and `#E8693A` in none. There is no conflict inside
  the board. The unresolved conflict is between two source documents, the marketing
  workbook and the UI brief, and it concerns the product rather than this page.
- `p_actor` is supplied by the caller on every write, so `pm_activity` records a
  claimed identity, not a verified one. This is a consequence of the single shared
  passcode, not a patchable bug: there is no server-side identity to check against
  until per-person accounts exist. Treat the activity log as an honest record among
  colleagues, not an audit trail. **The new before-and-after does not change this.**
  It makes the *what* exact; the *who* is still a claim.
- A Supabase branch costs `$0.01344` per hour, about `$9.70` a month left running. That
  does not earn a standing test branch. Spin one up for a risky migration and delete it
  afterwards. Section 4 stands as written: ordinary work goes straight to production.
- **The `pm_sprints` hold expired on 13 Sep and nothing was built.** There is no
  evidence focus sprints are being used: zero activity rows mention one, and a sprint
  only ever writes a status change. Treat sprint history as declined rather than
  pending, and delete this line if somebody starts using the timer.
- `pm_activity.changes` is populated from 7 Oct onward. The rows before that date have
  none and say so when opened.

### One thing not to delete

`Start here` contains the line "Ask Joaquin for the team passcode. Do not paste it
in a group chat." That line holds no secret, is only readable by somebody who is
already inside, and tells a new joiner the right procedure while naming the wrong
one. Removing it makes onboarding worse, not safer.

---

## 10. Where the project actually stands

Counted 7 Oct 2026.

**Healthy:** 53 tasks, every one but 2 attached to a goal. 7 live goals, 19 milestones,
15 handbook pages with no dead links, 214 brand files browsable and downloadable,
19 providers with the credentials rule holding.

**The one thing blocking everything else:** nothing is measured. 7 of 9 goals have a
metric that has never been read, and there is still exactly **1 metric reading** in the
whole database. Google Analytics is not connected. `GP-041` unblocks this and should be
treated as the highest-leverage open task.

**Open, in rough priority order:**

1. **GP-041** instrument the funnel. Until this lands every health flag is opinion,
   including the automatic one the goal form now offers.
2. **9 open tasks are past their date**, and **2 milestones** with them. The board was
   last edited on 1 September, so this is a month of drift rather than a bad week.
3. **16 of 35 open tasks say In Progress**, most untouched since late August. A status
   that is never cleared stops meaning anything.
4. **10 open tasks have no date**, all icebox. Weekly triage is the intended habit.
5. **MS-22** the onboarding cut, under *First 50 recurring users*. GP-043 carries a
   proposed cut list and a blocking note about allergens that needs a human decision.
6. **15 of 16 journey steps have no screenshot.** They sit behind a login; each step's
   editor takes a link once someone captures them.
7. **Two brand conflicts unresolved:** orange is `#EF6E45` in the marketing workbook and
   `#E8693A` in the UI brief. (Typography was settled by the font files: Murs Gothic
   Wide Dark and Poppins Italic.)
8. **Roster vs pillars:** the pitch describes five people in three pillars; the board has
   eight. Simon, Seba and Benja are in neither.
9. **Onboarding deck and five screenshots** are deliberately not uploaded, the container
   is world-readable and nobody has confirmed what is in them.

**Known distribution problem:** Joaquin owns most open tasks. The board surfaces it on
Where we are rather than hiding it.

**The ad wall is empty on purpose.** One campaign shell exists, *Beta ads, first tests*,
holding the three tasks that have to land first and the stage-one copy rule. No ad cards
were invented to fill it: copy written by nobody, signed with somebody's name, is worse
than an empty wall.

---

## 11. Gotchas that have already bitten

- **zsh does not word-split unquoted variables.** `for f in $PARTS` silently iterates
  once over the whole string. Use arrays.
- **Dollar-quoted SQL does not process `''`.** Writing `brand''s` inside `$doc$…$doc$`
  stores two literal apostrophes.
- **A rename in the data is not a rename in the code.** Changing `horizon` from
  `north-star` to `impulse` in the database left six string literals in the page, and the
  impulse panel silently stopped rendering. Nothing errored. Grep the built file for the
  new term after any rename.
- **Content-hash dedup across folders is wrong for design assets.** A logo exported to
  RGB and CMYK can be byte-identical; a designer still expects to find both.
- **Full-size images make terrible thumbnails.** Every image in `pm_files` has a 420px
  JPEG in `thumbs/`; use `thumb_url` in grids.
- **Verifying "every view renders" catches crashes, not wrongness.** Check the deployed
  artifact for a string that *should* be there.
- **A screenshot of the preview can be a frame behind.** Twice during the October work a
  screenshot showed the state before the click that had already landed. Read the data
  back with `javascript_tool` before believing a picture.
- **Seeding a demo writes real rows under a real name.** Test cards, test notes and the
  activity they generate were deleted after the October work. Anything left behind would
  have read as a teammate's decision.

---

## 12. Deploying

```bash
./build.sh
git add -A && git commit -m "..." && git push origin main
```

GitHub Pages rebuilds in about 30 seconds. Confirm with:

```bash
curl -s -o /tmp/live.html -w "%{http_code}\n" https://joaquin-duran.github.io/tasks-1010101012eee/
diff -q /tmp/live.html index.html && echo "live matches local"
```

**Data changes need no deploy.** The page reads Supabase at runtime, so anything written
to `pm_*` is live immediately.

---

## 13. Source documents

In `~/Downloads` unless noted. Current: `GoPrep_Marketing.xlsx` (the strategy),
`GoPrep_Q1_Marketing_Plan.xlsx` (12-week plan, all 74 posts still unpublished),
`Goprep_Pitch.pptx`, `GoPrep_Roadmap_v2.md`, `GOPREP_UI_REFINEMENT_PROMPT.md`,
`Subscriptions_Accounts GOPREP_.docx`, `Todo Branding/`, and the brand identity folder at
`~/Desktop/Goprep Master Folder/Marketing:Identidad de Marca` (the colon renders as a
slash in Finder).

**Historical:** `ESTRATEGIA DE MARCA.pdf` describes the pre-pivot delivery business.

Two published audits are linked from the Reference library page: the frontend UI/UX logic
doc and the code survey. The survey's `MealPlan.tsx → i18n.py` edges are a resolver
artifact, not real calls.
