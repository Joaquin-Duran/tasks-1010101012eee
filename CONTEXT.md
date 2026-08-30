# GoPrep Team Board, working context

Everything a new session needs to pick this up. Read this first; the README covers
what the board *is*, this covers how to *work on it*.

Last updated 29 Aug 2026.

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
through a new `SECURITY DEFINER` function that requires the token.

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

Full column list in `docs/schema.md`, regenerated from the database.
| `pm_people`, `pm_activity`, `pm_config`, `pm_sessions`, `pm_login_attempts` | As before |

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

### A file that is not in the container

`pm_assets` is the curated pointer list: things that live in Drive, on a laptop,
or behind someone's login. Add one from the Files view with **+ Elsewhere**.

---

## 7. Navigation

Seven destinations. Two have a second row. **Company is first, and the board always
opens there**: every load lands on Start here, whatever was open last.

```
Company        Start here · Handbook · Team · Activity. The landing destination
My week        tiles expand, buckets fold
Where we are   mission + health checks + goals by area, cards expand in place
Timeline       the roadmap: by goal (Gantt) or by phase
Marketing      Strategy · Q1 plan · Buyer persona · Competitors ·
               User journey · Value creation · Files
Subscriptions  providers, infrastructure first
Ideas          the creative board
```

Two pages have no tab and are reached by drilling: **a goal** (from Where we are) and
**every task** (from My week). Clicking a roster card on Team opens **a person**.

A **focus sprint** runs on top of any destination: a countdown against one task, started
from the task modal, from your own roster card, or from Focus in the header. Opened with
no task it offers a random open task or a pick from the list. The deadline is an absolute
timestamp in `localStorage` under `gp_sprint`, so it survives a reload and a re-render.
Starting one sets the task to In Progress. Nothing else is written, so sprint *history*
does not exist yet: that needs a table.

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

## 9. Verified state, 30 Aug 2026

Checked against the live database and the deployed page, not from memory.

- `pm_sessions` holds 6 rows, all 30-day logins from 20 to 26 Aug. No test tokens
  survive. Cleanup after temporary sessions has held.
- The page ships **0 em dashes**. The rule in section 8 is about what users read;
  the markdown in this repo had drifted from it and has now been brought in line.
- Orange: the board uses `#EF6E45` in 6 places and `#E8693A` in none. There is no
  conflict inside the board. The unresolved conflict is between two source
  documents, the marketing workbook and the UI brief, and it concerns the product
  rather than this page.
- `p_actor` is supplied by the caller on every write, so `pm_activity` records a
  claimed identity, not a verified one. This is a consequence of the single shared
  passcode, not a patchable bug: there is no server-side identity to check against
  until per-person accounts exist. Treat the activity log as an honest record among
  colleagues, not an audit trail.
- A Supabase branch costs `$0.01344` per hour, about `$9.70` a month left running. That
  does not earn a standing test branch. Spin one up for a risky migration and delete it
  afterwards. Section 4 stands as written: ordinary work goes straight to production.
- `pm_sprints` is on hold until **13 Sep 2026**. Build it only if focus sprints are
  being used by then. Until that date there is no sprint history by choice, not by
  oversight.

### One thing not to delete

`Start here` contains the line "Ask Joaquin for the team passcode. Do not paste it
in a group chat." That line holds no secret, is only readable by somebody who is
already inside, and tells a new joiner the right procedure while naming the wrong
one. Removing it makes onboarding worse, not safer.

---

## 10. Where the project actually stands

**Healthy:** zero overdue tasks, every open task attached to a goal, 7 live goals,
214 brand files browsable and downloadable, 15 handbook pages with no dead links.

**The one thing blocking everything else:** nothing is measured. 7 of 9 goals have a
metric that has never been read, and there is exactly **1 metric reading** in the whole
database. Google Analytics is not connected. `GP-041` unblocks this and should be
treated as the highest-leverage open task.

**Open, in rough priority order:**

1. **GP-041** instrument the funnel. Until this lands every health flag is opinion.
2. **MS-22** the onboarding cut, under *First 50 recurring users*. GP-043 carries a
   proposed cut list and a blocking note about allergens that needs a human decision.
3. **9 open tasks have no date**, all icebox. Weekly triage is the intended habit.
4. **15 of 16 journey steps have no screenshot.** They sit behind a login; each step's
   editor takes a link once someone captures them.
5. **Two brand conflicts unresolved:** orange is `#EF6E45` in the marketing workbook and
   `#E8693A` in the UI brief. (Typography was settled by the font files: Murs Gothic
   Wide Dark and Poppins Italic.)
6. **Roster vs pillars:** the pitch describes five people in three pillars; the board has
   eight. Simon, Seba and Benja are in neither.
7. **Onboarding deck and five screenshots** are deliberately not uploaded, the container
   is world-readable and nobody has confirmed what is in them.

**Known distribution problem:** Joaquin owns most open tasks. The board surfaces it on
Where we are rather than hiding it.

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
