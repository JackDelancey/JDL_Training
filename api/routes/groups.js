"use strict";

const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const { requireAuth, requireGroupMember } = require("../middleware");
const {
  makeJoinCode,
  parseISODate,
  parseISODateLocal,
  toISODateLocal,
  normalizeExerciseName,
  parseLoadNumber,
  e1rmEpley,
  safeDateLabel,
  scoreWindowStart,
  rankRows,
  buildMetricRowsFromEntries,
  bestExerciseMetricFromDailyRows,
  sumExerciseVolumeFromDailyRows,
  countCompletedSessions,
  buildE1rmHistory,
  isDayCompleted,
  isNonEmpty,
  safeJsonArray,
  daysBetweenLocal,
} = require("../utils");

// ─── Shared helpers ───────────────────────────────────────────────────

async function getGroupBasic(groupId) {
  const q = await pool.query(
    `select g.id, g.name, g.join_code as code, g.is_private, g.owner_user_id, g.created_at,
            (select count(*)::int from public.group_members gm where gm.group_id = g.id) as members_count
     from public.groups g where g.id = $1`,
    [groupId]
  );
  return q.rows[0] || null;
}

async function getGroupMemberIds(groupId) {
  const q = await pool.query(
    `select user_id from public.group_members where group_id = $1`,
    [groupId]
  );
  return q.rows.map((r) => r.group_id ? r.user_id : r.user_id);
}

async function logGroupEvent(groupId, userId, eventType, payload = {}) {
  await pool.query(
    `insert into public.group_events (group_id, user_id, event_type, payload)
     values ($1,$2,$3,$4::jsonb)`,
    [groupId, userId || null, eventType, JSON.stringify(payload || {})]
  );
}

async function getDailyRowsForUsers(userIds, fromDate = null) {
  if (!userIds.length) return [];
  const params = [userIds];
  let sql = `select user_id, entry_date, entries, bodyweight, is_completed
             from public.daily_entries_app where user_id = any($1)`;
  if (fromDate) { params.push(fromDate); sql += ` and entry_date >= $2::date`; }
  sql += ` order by entry_date asc`;
  const q = await pool.query(sql, params);
  return q.rows;
}

function wilksScore(bodyweight, total, isMale = true) {
  if (!Number.isFinite(bodyweight) || !Number.isFinite(total) || bodyweight <= 0 || total <= 0) return null;
  // Wilks coefficients (male)
  const a = isMale
    ? [-216.0475144, 16.2606339, -0.002388645, -0.00113732, 7.01863e-6, -1.291e-8]
    : [-594.31747775582, 27.23842536447, 0.82112226871, -0.00930733913, 4.731582e-5, -9.054e-8];
  const bw = bodyweight;
  const denom = a[0] + a[1]*bw + a[2]*bw**2 + a[3]*bw**3 + a[4]*bw**4 + a[5]*bw**5;
  if (!Number.isFinite(denom) || denom === 0) return null;
  return Math.round((500 / denom) * total * 100) / 100;
}


// ─── GET my groups ────────────────────────────────────────────────────

router.get("/groups", requireAuth, async (req, res) => {
  try {
    const q = await pool.query(
      `select g.id, g.name, g.join_code as code, g.is_private, g.owner_user_id, g.created_at,
              (select count(*)::int from public.group_members gm2 where gm2.group_id = g.id) as members_count
       from public.groups g
       join public.group_members gm on gm.group_id = g.id
       where gm.user_id = $1
       order by g.created_at desc`,
      [req.user.id]
    );
    res.json({ groups: q.rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── POST create group ────────────────────────────────────────────────

router.post("/groups", requireAuth, async (req, res) => {
  try {
    const name = (req.body?.name || "My group").toString().slice(0, 60);
    let joinCode = makeJoinCode(8);
    for (let i = 0; i < 5; i++) {
      const exists = await pool.query(`select 1 from public.groups where join_code=$1`, [joinCode]);
      if (exists.rowCount === 0) break;
      joinCode = makeJoinCode(8);
    }
    const g = await pool.query(
      `insert into public.groups (owner_user_id, name, join_code, is_private)
       values ($1,$2,$3,true)
       returning id, name, join_code as code, is_private, owner_user_id, created_at`,
      [req.user.id, name, joinCode]
    );
    await pool.query(
      `insert into public.group_members (group_id, user_id, role) values ($1,$2,'owner') on conflict do nothing`,
      [g.rows[0].id, req.user.id]
    );
    res.json({ group: { ...g.rows[0], members_count: 1 } });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── POST join group ──────────────────────────────────────────────────

router.post("/groups/join", requireAuth, async (req, res) => {
  try {
    const code = (req.body?.code || "").toString().trim().toUpperCase();
    if (!code) return res.status(400).json({ error: "code required" });

    const g = await pool.query(
      `select id, name, join_code as code, is_private, owner_user_id, created_at
       from public.groups where join_code = $1`,
      [code]
    );
    if (g.rowCount === 0) return res.status(404).json({ error: "Group not found" });

    await pool.query(
      `insert into public.group_members (group_id, user_id, role) values ($1,$2,'member') on conflict do nothing`,
      [g.rows[0].id, req.user.id]
    );
    await logGroupEvent(g.rows[0].id, req.user.id, "member_joined", { group_name: g.rows[0].name });

    res.json({ group: g.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── DELETE group ─────────────────────────────────────────────────────

router.delete("/groups/:id", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const q = await pool.query(`select id, owner_user_id from public.groups where id=$1`, [groupId]);
    if (q.rowCount === 0) return res.status(404).json({ error: "Group not found" });
    if (String(q.rows[0].owner_user_id) !== String(req.user.id)) {
      return res.status(403).json({ error: "Only the group owner can delete this group" });
    }
    await pool.query(`delete from public.groups where id=$1`, [groupId]);
    res.json({ ok: true, deleted_group_id: groupId });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── POST leave group ─────────────────────────────────────────────────

router.post("/groups/:id/leave", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const q = await pool.query(`select id, owner_user_id from public.groups where id=$1`, [groupId]);
    if (q.rowCount === 0) return res.status(404).json({ error: "Group not found" });
    if (String(q.rows[0].owner_user_id) === String(req.user.id)) {
      return res.status(400).json({ error: "Group owner cannot leave. Delete the group instead." });
    }
    const del = await pool.query(
      `delete from public.group_members where group_id=$1 and user_id=$2`,
      [groupId, req.user.id]
    );
    if (del.rowCount === 0) return res.status(404).json({ error: "You are not a member of this group" });
    await logGroupEvent(groupId, req.user.id, "member_left", {});
    res.json({ ok: true, left_group_id: groupId });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── GET group detail ─────────────────────────────────────────────────

router.get("/groups/:id", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const membership = await requireGroupMember(groupId, req.user.id);
    if (!membership) return res.status(403).json({ error: "Not a member of this group" });

    const group = await getGroupBasic(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });

    res.json({ group: { ...group, my_role: membership.role } });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── GET feed ─────────────────────────────────────────────────────────

router.get("/groups/:id/feed", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    if (!await requireGroupMember(groupId, req.user.id)) {
      return res.status(403).json({ error: "Not a member of this group" });
    }
    const q = await pool.query(
      `select ge.id, ge.group_id, ge.user_id, ge.event_type, ge.payload, ge.created_at,
              au.name, au.email
       from public.group_events ge
       left join public.app_users au on au.id = ge.user_id
       where ge.group_id = $1
       order by ge.created_at desc limit 100`,
      [groupId]
    );
    res.json({
      events: q.rows.map((r) => ({
        ...r,
        user: { user_id: r.user_id, name: r.name || r.email || null, email: r.email || null },
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── GET members ──────────────────────────────────────────────────────

router.get("/groups/:id/members", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    if (!await requireGroupMember(groupId, req.user.id)) {
      return res.status(403).json({ error: "Not a member of this group" });
    }
    const membersQ = await pool.query(
      `select gm.user_id, gm.role, gm.joined_at, au.email, au.name
       from public.group_members gm
       join public.app_users au on au.id = gm.user_id
       where gm.group_id = $1
       order by coalesce(au.name, au.email) asc`,
      [groupId]
    );
    const userIds = membersQ.rows.map((m) => m.user_id);

    const latestWeeklyQ = userIds.length ? await pool.query(
      `select we.user_id, we.week_number, we.entries
       from public.weekly_entries_app we
       join (select user_id, max(week_number) as max_week from public.weekly_entries_app where user_id = any($1) group by user_id) mx
         on mx.user_id = we.user_id and mx.max_week = we.week_number`,
      [userIds]
    ) : { rows: [] };

    const latestDailyQ = userIds.length ? await pool.query(
      `select d.user_id, d.entry_date
       from public.daily_entries_app d
       join (select user_id, max(entry_date) as max_date from public.daily_entries_app where user_id = any($1) group by user_id) mx
         on mx.user_id = d.user_id and mx.max_date = d.entry_date`,
      [userIds]
    ) : { rows: [] };

    const latestWeeklyByUser = new Map(latestWeeklyQ.rows.map((r) => [r.user_id, r]));
    const latestDailyByUser = new Map(latestDailyQ.rows.map((r) => [r.user_id, r]));

    res.json({
      members: membersQ.rows.map((m) => {
        const lw = latestWeeklyByUser.get(m.user_id);
        const entries = safeJsonArray(lw?.entries);
        const metrics = {};
        for (const e of entries) {
          const ex = String(e?.exercise || "").trim();
          if (!ex) continue;
          const val = e1rmEpley(e?.top, e?.reps);
          if (!Number.isFinite(val)) continue;
          if (!Number.isFinite(metrics[ex]) || val > metrics[ex]) metrics[ex] = val;
        }
        return {
          user_id: m.user_id, email: m.email, name: m.name || m.email,
          role: m.role, joined_at: m.joined_at,
          latest_week: lw?.week_number ?? null,
          latest_session_date: latestDailyByUser.get(m.user_id)?.entry_date ?? null,
          metrics,
        };
      }),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});



// ─── GET leaderboard ──────────────────────────────────────────────────

router.get("/groups/:id/leaderboard", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    if (!await requireGroupMember(groupId, req.user.id)) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    const type = String(req.query?.type || "strength").toLowerCase();
    const exercise = String(req.query?.exercise || "Bench").trim();
    const window = String(req.query?.window || "all").toLowerCase();
    const exNorm = normalizeExerciseName(exercise);

    const membersQ = await pool.query(
      `select au.id as user_id, au.email, au.name
       from public.group_members gm
       join public.app_users au on au.id = gm.user_id
       where gm.group_id = $1
       order by coalesce(au.name, au.email) asc`,
      [groupId]
    );
    const members = membersQ.rows || [];
    if (!members.length) return res.json({ type, exercise, window, rows: [] });

    const fromISO = scoreWindowStart(window);
    const userIds = members.map((m) => m.user_id);
    const dailyRows = await getDailyRowsForUsers(userIds, fromISO);

    const weeklyQ = await pool.query(
      `select user_id, week_number, entries from public.weekly_entries_app where user_id = any($1) order by week_number asc`,
      [userIds]
    );

    const rowsByUser = new Map();
    for (const r of dailyRows) {
      if (!rowsByUser.has(r.user_id)) rowsByUser.set(r.user_id, []);
      rowsByUser.get(r.user_id).push(r);
    }
    // Add this BEFORE the rows.map() in GET /groups/:id/leaderboard:
const latestBwByUser = new Map();
for (const row of dailyRows) {
  const bw = Number(row.bodyweight);
  if (!Number.isFinite(bw) || bw <= 0) continue;
  const existing = latestBwByUser.get(String(row.user_id));
  if (!existing || String(row.entry_date) > String(existing.date)) {
    latestBwByUser.set(String(row.user_id), { bw, date: String(row.entry_date) });
  }
}
    const rows = members.map((m) => {
      const userDailyRows = rowsByUser.get(m.user_id) || [];
      const userWeekly = weeklyQ.rows.filter((r) => String(r.user_id) === String(m.user_id));
      let result = null;

      if (type === "strength") {
  let best = null;
  for (const row of userDailyRows) {
    const bwData = latestBwByUser.get(String(m.user_id));
    const bwClean = bwData?.bw ?? null;
    for (const mt of buildMetricRowsFromEntries(row.entries)) {
      if (normalizeExerciseName(mt.exercise) !== exNorm) continue;
      if (!Number.isFinite(mt.e1rm)) continue;
      if (!best || mt.e1rm > best.score) {
        best = {
          score: mt.e1rm,
          meta: {
            date: safeDateLabel(row.entry_date),
            bodyweight: bwClean,
            wilks: bwClean ? wilksScore(bwClean, mt.e1rm) : null,
          },
        };
      }
    }
  }
        for (const row of userWeekly) {
          for (const e of safeJsonArray(row.entries)) {
            if (normalizeExerciseName(e?.exercise) !== exNorm) continue;
            const top = parseLoadNumber(e?.actual?.top ?? e?.top);
            const reps = parseLoadNumber(e?.reps ?? e?.actual?.reps);
            const val = e1rmEpley(top, reps);
            if (!Number.isFinite(val)) continue;
            if (!best || val > best.score) best = { score: val, meta: { week: row.week_number } };
          }
        }
        result = best;
      } else if (type === "improvement") {
        const vals = [];
        for (const row of userDailyRows) {
          for (const mt of buildMetricRowsFromEntries(row.entries)) {
            if (normalizeExerciseName(mt.exercise) !== exNorm) continue;
            if (Number.isFinite(mt.e1rm)) vals.push({ value: mt.e1rm, date: safeDateLabel(row.entry_date) });
          }
        }
        if (vals.length >= 2) {
          vals.sort((a, b) => String(a.date).localeCompare(String(b.date)));
          result = { score: vals[vals.length - 1].value - vals[0].value, meta: { note: `${vals[0].value} → ${vals[vals.length - 1].value}` } };
        }
      } else if (type === "relative_strength") {
        let best = null;
        for (const row of userDailyRows) {
          const bw = Number(row.bodyweight);
          if (!Number.isFinite(bw) || bw <= 0) continue;
          for (const mt of buildMetricRowsFromEntries(row.entries)) {
            if (normalizeExerciseName(mt.exercise) !== exNorm) continue;
            if (!Number.isFinite(mt.e1rm)) continue;
            const score = mt.e1rm / bw;
            if (!best || score > best.score) best = { score, meta: { date: safeDateLabel(row.entry_date) } };
          }
        }
        result = best;
      } else if (type === "volume") {
        const total = sumExerciseVolumeFromDailyRows(userDailyRows, exercise);
        result = total > 0 ? { score: total, meta: {} } : null;
      } else if (type === "adherence") {
        const completed = countCompletedSessions(userDailyRows);
        result = userDailyRows.length ? { score: userDailyRows.length ? (completed / userDailyRows.length) * 100 : null, meta: { note: `${completed}/${userDailyRows.length} logged` } } : null;
      } else if (type === "streak") {
        const dates = userDailyRows.filter((r) => r.is_completed === true || isDayCompleted(r)).map((r) => safeDateLabel(r.entry_date)).filter(Boolean).sort();
        if (dates.length) {
          let best = 1, cur = 1;
          for (let i = 1; i < dates.length; i++) {
            const diff = Math.round((new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000);
            if (diff === 1) cur++;
            else if (diff > 1) cur = 1;
            if (cur > best) best = cur;
          }
          result = { score: best, meta: {} };
        }
      }

      return { user_id: m.user_id, name: m.name || m.email, email: m.email, score: result?.score ?? null, meta: result?.meta ?? {} };
    });

    const ranked = rankRows(
      rows.filter((r) => Number.isFinite(Number(r.score))).sort((a, b) => Number(b.score) - Number(a.score))
    );
    res.json({ type, exercise, window, rows: ranked });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── GET compare ──────────────────────────────────────────────────────

router.get("/groups/:id/compare", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    if (!await requireGroupMember(groupId, req.user.id)) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    const userA = String(req.query?.user_a || "").trim();
    const userB = String(req.query?.user_b || "").trim();
    const exercise = String(req.query?.exercise || "Bench").trim();
    if (!userA || !userB) return res.status(400).json({ error: "user_a and user_b required" });

    const membersQ = await pool.query(
      `select gm.user_id, au.name, au.email
       from public.group_members gm
       join public.app_users au on au.id = gm.user_id
       where gm.group_id = $1 and gm.user_id = any($2)`,
      [groupId, [userA, userB]]
    );
    const memberMap = new Map(membersQ.rows.map((r) => [r.user_id, r]));
    if (!memberMap.has(userA) || !memberMap.has(userB)) {
      return res.status(400).json({ error: "Both users must belong to the group" });
    }

    const dailyRows = await getDailyRowsForUsers([userA, userB], null);
    const rowsByUser = new Map();
    for (const r of dailyRows) {
      if (!rowsByUser.has(r.user_id)) rowsByUser.set(r.user_id, []);
      rowsByUser.get(r.user_id).push(r);
    }

    const makeUserResult = (userId) => {
      const rows = rowsByUser.get(userId) || [];
      const history = buildE1rmHistory(rows, exercise);
      const best = history.length ? Math.max(...history.map((x) => x.e1rm)) : null;
      const u = memberMap.get(userId);
      return { user_id: userId, name: u?.name || u?.email || "Member", email: u?.email || null, best_e1rm: best, history };
    };

    res.json({ exercise, user_a: makeUserResult(userA), user_b: makeUserResult(userB) });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── Programs (group shared) ──────────────────────────────────────────

router.get("/groups/:id/programs", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    if (!await requireGroupMember(groupId, req.user.id)) {
      return res.status(403).json({ error: "Not a member of this group" });
    }
    const q = await pool.query(
      `select gsp.id, gsp.group_id, gsp.program_id, coalesce(gsp.title, p.name) as title,
              gsp.notes, gsp.created_at, p.name, p.days_per_week, p.total_weeks,
              au.name as created_by_name, au.email as created_by_email
       from public.group_shared_programs gsp
       join public.programs_app p on p.id = gsp.program_id
       join public.app_users au on au.id = gsp.shared_by_user_id
       where gsp.group_id = $1
       order by gsp.created_at desc`,
      [groupId]
    );
    res.json({ programs: q.rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.post("/groups/:id/programs", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    if (!await requireGroupMember(groupId, req.user.id)) {
      return res.status(403).json({ error: "Not a member of this group" });
    }
    const programId = String(req.body?.program_id || "").trim();
    const title = req.body?.title ? String(req.body.title).trim() : null;
    const notes = req.body?.notes ? String(req.body.notes).trim() : null;
    if (!programId) return res.status(400).json({ error: "program_id required" });

    const own = await pool.query(
      `select id, name from public.programs_app where id=$1 and user_id=$2`,
      [programId, req.user.id]
    );
    if (own.rowCount === 0) return res.status(404).json({ error: "Program not found" });

    const q = await pool.query(
      `insert into public.group_shared_programs (group_id, program_id, shared_by_user_id, title, notes)
       values ($1,$2,$3,$4,$5)
       on conflict (group_id, program_id) do update
         set title = coalesce(excluded.title, public.group_shared_programs.title),
             notes = coalesce(excluded.notes, public.group_shared_programs.notes)
       returning id, group_id, program_id, title, notes, created_at`,
      [groupId, programId, req.user.id, title, notes]
    );
    await logGroupEvent(groupId, req.user.id, "program_published", { title: title || own.rows[0].name, program_id: programId });
    res.json({ shared_program: q.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── Challenges ───────────────────────────────────────────────────────

router.get("/groups/:id/challenges", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    if (!await requireGroupMember(groupId, req.user.id)) {
      return res.status(403).json({ error: "Not a member of this group" });
    }
    const q = await pool.query(
      `select gc.* from public.group_challenges gc where gc.group_id = $1 order by gc.created_at desc`,
      [groupId]
    );
    res.json({ challenges: q.rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.post("/groups/:id/challenges", requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    if (!await requireGroupMember(groupId, req.user.id)) {
      return res.status(403).json({ error: "Not a member of this group" });
    }
    const name = String(req.body?.name || "").trim();
    const description = req.body?.description ? String(req.body.description).trim() : null;
    const metric_type = String(req.body?.metric_type || "").trim();
    const exercise = req.body?.exercise ? String(req.body.exercise).trim() : null;
    const scoring_type = String(req.body?.scoring_type || "max").trim();
    const start_date = String(req.body?.start_date || "").trim();
    const end_date = String(req.body?.end_date || "").trim();

    if (!name || !metric_type || !start_date || !end_date) {
      return res.status(400).json({ error: "name, metric_type, start_date, end_date required" });
    }
    if (!parseISODateLocal(start_date) || !parseISODateLocal(end_date)) {
      return res.status(400).json({ error: "start_date/end_date must be YYYY-MM-DD" });
    }

    const q = await pool.query(
      `insert into public.group_challenges
        (group_id, created_by, name, description, metric_type, exercise, scoring_type, start_date, end_date)
       values ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::date)
       returning *`,
      [groupId, req.user.id, name, description, metric_type, exercise, scoring_type, start_date, end_date]
    );
    await logGroupEvent(groupId, req.user.id, "challenge_joined", { name, challenge_id: q.rows[0].id });
    res.json({ challenge: q.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.get("/groups/:id/challenges/:challengeId/leaderboard", requireAuth, async (req, res) => {
  try {
    const { id: groupId, challengeId } = req.params;
    if (!await requireGroupMember(groupId, req.user.id)) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    const cq = await pool.query(
      `select * from public.group_challenges where id=$1 and group_id=$2`,
      [challengeId, groupId]
    );
    if (cq.rowCount === 0) return res.status(404).json({ error: "Challenge not found" });
    const challenge = cq.rows[0];

    const membersQ = await pool.query(
      `select au.id as user_id, au.email, au.name
       from public.group_members gm
       join public.app_users au on au.id = gm.user_id
       where gm.group_id = $1`,
      [groupId]
    );
    const userIds = membersQ.rows.map((m) => m.user_id);

    const dailyQ = await pool.query(
      `select user_id, entry_date, entries, bodyweight, is_completed
       from public.daily_entries_app
       where user_id = any($1) and entry_date between $2::date and $3::date
       order by entry_date asc`,
      [userIds, challenge.start_date, challenge.end_date]
    );

    const rowsByUser = new Map();
    for (const r of dailyQ.rows) {
      if (!rowsByUser.has(r.user_id)) rowsByUser.set(r.user_id, []);
      rowsByUser.get(r.user_id).push(r);
    }

    let rows = membersQ.rows.map((m) => {
      const userRows = rowsByUser.get(m.user_id) || [];
      let score = null;

      if (challenge.metric_type === "e1rm") {
        score = bestExerciseMetricFromDailyRows(userRows, challenge.exercise)?.e1rm ?? null;
      } else if (challenge.metric_type === "relative_strength") {
        const best = bestExerciseMetricFromDailyRows(userRows, challenge.exercise);
        if (best && Number.isFinite(best.e1rm) && Number.isFinite(best.bodyweight) && best.bodyweight > 0) {
          score = Math.round((best.e1rm / best.bodyweight) * 1000) / 1000;
        }
      } else if (challenge.metric_type === "volume") {
        score = sumExerciseVolumeFromDailyRows(userRows, challenge.exercise);
      } else if (challenge.metric_type === "streak") {
        score = countCompletedSessions(userRows);
      } else if (challenge.metric_type === "adherence") {
        const completed = countCompletedSessions(userRows);
        const span = Math.max(1, daysBetweenLocal(String(challenge.start_date), String(challenge.end_date)) + 1);
        score = Math.round((completed / Math.max(1, Math.round(span / 2))) * 1000) / 10;
      }

      return { user_id: m.user_id, email: m.email, name: m.name || m.email, score: Number.isFinite(Number(score)) ? Number(score) : null };
    });

    rows = rankRows(rows.filter((r) => Number.isFinite(Number(r.score))).sort((a, b) => Number(b.score) - Number(a.score)));
    res.json({ challenge, rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
