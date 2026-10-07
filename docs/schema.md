# pm_* schema

Generated from the live database. Regenerate after any migration:

```sql
select string_agg(format('%-22s %-28s %s%s', c.table_name, c.column_name,
         c.data_type, case when c.is_nullable='NO' then ' NOT NULL' else '' end),
       E'\n' order by c.table_name, c.ordinal_position)
from information_schema.columns c
join information_schema.tables t on t.table_schema=c.table_schema
 and t.table_name=c.table_name and t.table_type='BASE TABLE'
where c.table_schema='public' and c.table_name like 'pm\_%';
```

Read `CONTEXT.md` section 3 before touching any of it. Every table has RLS on
with zero policies; the page reaches all of it through `pm_bootstrap` and the
`pm_save_*` functions, never directly.

```
pm_activity            id, task_id, task_title, actor, action, detail, at, entity,
                       changes
pm_ad_notes            id, ad_id, campaign_id, author, body, at
pm_ad_shots            ad_id, data, bytes, updated_by, updated_at
pm_ads                 id, campaign_id, name, format, stage, headline, body, cta,
                       visual, link_url, ref_url, file_id, owner, author,
                       sort_order, archived, created_at, updated_at
pm_areas               key, label, color, sort_order
pm_assets              id, name, category, kind, url, location, description, owner,
                       sort_order, archived, created_at, updated_at, lang
pm_campaigns           id, name, platform, objective, audience, brief,
                       budget_amount, budget_currency, starts, ends, status,
                       owner, color, sort_order, archived, created_by,
                       created_at, updated_at
pm_config              id, passcode_hash, updated_at
pm_docs                id, key, title, section, icon, summary, body, sort_order,
                       archived, updated_by, created_at, updated_at
pm_files               id, path, name, folder, kind, url, bytes, sort_order,
                       archived, created_at, lang, thumb_url
pm_goals               id, key, name, area, statement, why, metric_name, metric_unit,
                       metric_baseline, metric_target, metric_current, horizon, owner,
                       status, starts, ends, color, sort_order, archived,
                       created_at, updated_at, lower_is_better
pm_ideas               id, title, body, kind, status, url, author, sort_order,
                       archived, created_at, updated_at
pm_journey_steps       id, journey, key, name, subtitle, description, step_no, branch,
                       status, note, task_code, goal_key, archived, created_at,
                       updated_at, shot_url
pm_login_attempts      ip, failures, first_at, last_at, locked_until
pm_metric_points       id, goal_id, on_date, value, note, entered_by, at
pm_milestones          id, goal_id, code, name, description, owner, status, starts,
                       ends, sort_order, archived, created_at, updated_at
pm_people              id, name, initials, color, role, active, sort_order, photo_url, bio
pm_phases              key, name, theme, starts, ends, success_criteria, color,
                       sort_order, verdict
pm_providers           id, name, category, purpose, url, plan, cost_amount,
                       cost_currency, cost_cycle, renewal_date, owner, account_email,
                       sensitivity, username, secret, vault_location, access_note,
                       notes, sort_order, archived, created_at, updated_at
pm_sessions            token, created_at, expires_at
pm_tasks               id, code, title, category, priority, effort, phase_key, status,
                       owners, target_date, description, notes, created_by, sort_order,
                       archived, created_at, updated_at, goal_id, milestone_id, start_date
```

## Constraints worth knowing

- `pm_providers` has `check (sensitivity = 'low' or secret is null)`. A critical
  account physically cannot hold a password.
- `pm_goals.horizon` is one of `impulse`, `someday`, `year`, `quarter`. The UI
  labels `impulse` as "Mission"; the stored value is unchanged.
- `pm_metric_points` is unique on `(goal_id, on_date)`, so a second reading on the
  same day updates rather than duplicates.
- `pm_files.path` is unique, which is what makes `pm_reindex_files` idempotent.
- `pm_ads.stage` is one of `idea`, `drafting`, `ready`, `live`, `killed`, and
  `pm_campaigns.status` one of `draft`, `live`, `paused`, `done`. Both are
  database check constraints, so a typo cannot create a sixth lane.
- `pm_ad_notes` must carry an `ad_id` or a `campaign_id`: a note with neither
  belongs to nothing and is refused.
- `pm_ad_shots` holds the reference picture of an ad, apart from the row.
  **`pm_bootstrap` deliberately does not return it**, only `has_shot`, so a
  wall of pictures does not land in every page load. `pm_ad_shots(p_ids)`
  fetches the ones a campaign needs in a single call. The setter refuses
  anything that is not a data URI image, and anything over 220kB.

## Functions the page calls

`pm_login`, `pm_bootstrap`, `pm_save_task`, `pm_set_status`, `pm_delete_task`,
`pm_save_goal`, `pm_delete_goal`, `pm_save_milestone`, `pm_delete_milestone`,
`pm_save_metric`, `pm_save_doc`, `pm_save_provider`, `pm_delete_provider`,
`pm_reveal_secret`, `pm_save_asset`, `pm_delete_asset`, `pm_save_phase`,
`pm_move_phase_tasks`, `pm_save_journey_step`, `pm_save_idea`, `pm_delete_idea`,
`pm_reindex_files`, `pm_save_campaign`, `pm_delete_campaign`, `pm_save_ad`,
`pm_set_ad_stage`, `pm_delete_ad`, `pm_set_ad_shot`, `pm_ad_shots`,
`pm_add_ad_note`, `pm_delete_ad_note`.

Every one calls `pm__require(p_token)` first.

## Who did what

`pm_activity.changes` holds the fields a save actually moved, as
`{field: {from, to}}`, built by `pm__diff(old, new, skip[])`. The page opens an
activity line to show it.

Two columns can never reach it, and the default skip list is what stops them:
`secret`, so a password cannot leak into a log that everyone with the passcode
can read, and `photo_url`, so a data URI does not bury the feed. A provider
password shows as changed and nothing more. `id`, `created_at`, `updated_at`
and `sort_order` are skipped as noise.

A save that writes a diff takes a snapshot of the row before it updates it.
**Any new `pm_save_*` function should do the same**: declare `v_before jsonb`,
`select to_jsonb(x) into v_before` before the update, and pass
`pm__diff(coalesce(v_before, '{}'::jsonb), to_jsonb(v_row))` into the activity
insert. Pass `'{}'` as the old row for a creation and the line records what it
was created with.
