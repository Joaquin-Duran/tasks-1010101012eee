# GoPrep Team Board

A single-page task board for the GoPrep team, built from `GoPrep_Project_Management3.xlsx`.
Tasks are split by **person**, **area**, and **objective (roadmap phase)**.

The board has four levels of altitude:

    impulse  ->  goal  ->  milestone  ->  task

and **six destinations**, every one a concrete noun a newcomer can guess the contents of.

| Tab | What is behind it |
|---|---|
| **My week** | What you personally owe. The landing page. Week/month/quarter, Just me / Everyone. Carries a one-line company strip and a "Handy" shelf of shortcuts. |
| **Where we are** | The company on one page: north star, health checks, every goal as a card. Click a goal to open it, its metric, milestones and tasks. |
| **Timeline** | The roadmap: the same work against a calendar, by goal (plan-vs-actual Gantt) or by phase (windows, verdicts, and a rescue for work stranded in a closed one). |
| **Marketing** | Strategy · Q1 plan · Buyer persona · Competitors · User journey · Value creation · Files. The two journeys are vertical node flows; every step is clickable and opens (or seeds) the task that would improve it. |
| **Subscriptions** | Every provider, cost, owner and access route. See *Credentials*. |
| **Company** | Start here · Handbook · Team · Activity. |
| **Ideas** | A creative board: sparks, resources, tools, inspiration and open questions. Anything can be promoted into a task. |

Two pages have no tab and are reached by drilling: **a goal** (from Where we are) and
**every task** (from My week; group by status, person, goal or area).

`pm_assets` is a registry, not storage, a static page cannot host files. Each entry
carries a link where one exists and an honest location where it does not.

## Brand assets

The brand material lives in **Azure Blob**, in the same storage account as the recipe
images (`goprepassets`), in a container called `brand` with blob-level public read:

    https://goprepassets.blob.core.windows.net/brand/
      logos/{byn,cmyk,rgb}/…   97 files, ~14 MB
      patterns/…
      fonts/…                  Murs Gothic Wide Dark · Poppins Italic
      hero-bg.png

Public read means these URLs work in a deck, an email or a browser with no login, and
the container itself cannot be listed. At 14 MB the storage cost is a rounding error on
the Azure bill that already exists.

Only material meant to be distributed goes in there. To upload, you need
**Storage Blob Data Contributor** on the storage account, control-plane Contributor is
not enough, which is a distinction Azure does not make obvious:

```bash
az storage blob upload-batch --account-name goprepassets --auth-mode login \
  --destination brand --source ./your-folder --overwrite
```

Blob CORS allows GET from any origin, which is what lets the Files view fetch the bytes and hand the browser a real save instead of opening an image in a tab. The blobs are public anyway, so CORS grants nothing new.

After uploading, re-index so the board sees them:

```bash
az storage blob list --account-name goprepassets --container-name brand \
  --auth-mode login --query "[].{n:name,s:properties.contentLength}" -o json
```

then upsert those rows into `pm_files`.

## Deploying to GitHub Pages

```bash
git init
git add .
git commit -m "GoPrep team board"
git branch -M main
git remote add origin git@github.com:<you>/goprep-board.git
git push -u origin main
```

Then in the repo: **Settings → Pages → Source: Deploy from a branch → `main` / `root` → Save**.
The board appears at `https://<you>.github.io/goprep-board/` within a minute or two.

`.nojekyll` is included so GitHub serves the files as-is.

## How access works

The page is public; the data is not.

Every read and write goes through Postgres functions (`pm_login`, `pm_bootstrap`,
`pm_save_task`, `pm_set_status`, `pm_delete_task`). The `pm_*` tables have row-level
security enabled with **zero policies** and all table grants revoked, so the API key
embedded in this page cannot read or write a single row on its own. It can only call
those functions, and every function except `pm_login` refuses without a session token.

`pm_login` takes the shared team passcode, checks it against a bcrypt hash, and issues
a token that lasts 30 days. The passcode itself is never in this repo.

Failed logins are rate limited per IP: 8 wrong attempts trigger a 15-minute lockout,
so the passcode cannot be ground down by brute force. Successful login clears the counter.

**The passcode is the only secret that matters.** Treat it like a door key: share it
directly, not in a public channel, and rotate it when someone leaves the team.

### Changing the passcode

In the Supabase SQL editor:

```sql
update public.pm_config
   set passcode_hash = extensions.crypt('the-new-passcode', extensions.gen_salt('bf', 10)),
       updated_at = now()
 where id = 1;

delete from public.pm_sessions;        -- signs everyone out
delete from public.pm_login_attempts;  -- clears any lockouts
```

### Adding or removing a team member

```sql
insert into public.pm_people (name, initials, color, role, sort_order)
values ('Lena', 'LE', '#3E8E9C', 'Design', 9);

update public.pm_people set active = false where name = 'Simon';  -- hide, keep history
```

That is the whole job, no code change and no redeploy. The board reads the roster from
`pm_people` on every load, so a new teammate shows up in the identity picker, the owner
checkboxes, the person filter and the By-person view as soon as anyone refreshes.

Pick a colour that isn't already taken; the current ones are listed in `pm_people.color`.

## Data model

| Table | What it holds |
|---|---|
| `pm_tasks` | Every task. Archived tasks stay in the table but leave the board. |
| `pm_people` | Roster: name, initials, avatar colour, role. |
| `pm_phases` | The roadmap phases used as objectives. |
| `pm_activity` | Append-only log of creates, edits, moves and archives. |
| `pm_config` | The bcrypt hash of the team passcode. |
| `pm_sessions` | Live session tokens with expiry. |
| `pm_login_attempts` | Failed-login counters driving the lockout. |
| `pm_goals` | Outcomes with a metric, a target, an owner and a health flag. |
| `pm_milestones` | Dated deliverables under a goal. Tasks hang off these. |
| `pm_metric_points` | One reading per goal per date. Drives the sparklines. |
| `pm_docs` | Handbook pages, stored as markdown. |
| `pm_providers` | Subscriptions and accounts. See *Credentials*. |
| `pm_assets` | Registry of logos, creatives, templates and source files. |
| `pm_files` | Flat index of the Azure `brand` container, 97 files, browsable and downloadable. |
| `pm_journey_steps` | Steps in the user journey and the value ladder, each optionally bound to a task. |
| `pm_ideas` | The creative board. |
| `pm_areas` | Area labels and colours, used to band the goals view. |

Goals carry a `horizon`: `north-star` (the one number), `quarter` and `year` (live work),
and `someday`, a destination with nothing scheduled against it. `someday` goals are kept
out of the Gantt, the Planner and the "nobody is working on this" warnings on purpose.

All of it lives in the existing **Goprep Pro** Supabase project, prefixed `pm_`. Nothing
references, triggers, or modifies the 22 tables the product itself uses.

## Credentials

`pm_providers` splits every account into one of two kinds, and the split is enforced by a
database constraint, not by convention:

- **low**: a password may be stored. It never leaves the database in `pm_bootstrap`; the
  page only learns `has_secret`. Reading it is a separate `pm_reveal_secret` call that
  writes a row to `pm_activity` naming whoever asked.
- **critical**: anything that can spend money or delete production. `pm_providers` carries
  a `check (sensitivity = 'low' or secret is null)`, so a critical row **cannot** hold a
  password even if the page sends one. It stores `vault_location` and `access_note` instead.

The reason is the shared passcode. One string opens this board for the whole team and cannot
be revoked for one person, so the blast radius of a leak must not include the ad accounts or
the production database.

## Onboarding a new person

1. Send them the passcode directly, not in a group channel.
2. Point them at **Company → Start here**. It walks through the handbook in reading order,
   tells them how to get access to the tools their role needs, and suggests a small overdue
   task to pick up.
3. Add them to `pm_people` (below) so they appear in the identity picker.

## Keeping the board honest

Three habits, all of which the Overview will nag about if you skip them:

- **Weekly**: clear the Icebox. Every item gets a goal and a date, or gets archived.
- **Weekly**: fix dates that have passed. An overdue column nobody clears stops meaning anything.
- **Monthly**: open each goal and log a metric reading. Without one, the health flags are opinion.

## Conventions carried over from the workbook

- **Priority**: P0 blocks launch · P1 within 4 weeks · P2 next quarter · P3 backlog
- **Effort**: S under a day · M 1–3 days · L 4–10 days · XL over 2 weeks
- **Status**: Not Started · In Progress · Blocked · Done

Six task IDs were duplicated in the spreadsheet (two different tasks each claiming
GP-028 through GP-033). The second set was renumbered to GP-035…GP-040; each of those
says so in its comments field.
