"use strict";

const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const { requireAuth } = require("../middleware");
const {
  toISODateLocal,
  parseISODateLocal,
  trainingSessionIndexLocal,
  findBlockForWeek,
  sumProgramWeeks,
  cloneProgramForUser,
} = require("../utils");

// ─── GET all programs ─────────────────────────────────────────────────

router.get("/programs", requireAuth, async (req, res) => {
  try {
    const p = await pool.query(
      `select id, name, days_per_week, blocks, total_weeks, start_date, training_days, created_at, updated_at
       from public.programs_app
       where user_id = $1
       order by created_at desc`,
      [req.user.id]
    );
    const u = await pool.query(
      `select active_program_id from public.app_users where id = $1`,
      [req.user.id]
    );
    res.json({
      programs: p.rows.map((r) => ({ ...r, blocks: Array.isArray(r.blocks) ? r.blocks : [] })),
      active_program_id: u.rows?.[0]?.active_program_id || null,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── POST create program ──────────────────────────────────────────────

router.post("/programs", requireAuth, async (req, res) => {
  try {
    const name = (req.body?.name || "New program").toString().slice(0, 80);
    const days = Number(req.body?.days_per_week || 4);

    let blocks = req.body?.blocks;
    if (!Array.isArray(blocks)) {
      const count = Math.max(1, Number(req.body?.blocks || 3));
      const weeksPer = Array.isArray(req.body?.weeks_per_block) ? req.body.weeks_per_block : [];
      blocks = Array.from({ length: count }, (_, i) => ({
        block_number: i + 1,
        title: `Block ${i + 1}`,
        intent: "",
        rpe_range: "",
        weeks: Number(weeksPer[i] || 4),
        days: Array.from({ length: Math.max(1, days) }, (_, di) => ({
          day_number: di + 1,
          title: `Day ${di + 1}`,
          rows: [],
        })),
      }));
    }

    const totalWeeks = sumProgramWeeks(blocks);
    const ins = await pool.query(
      `insert into public.programs_app (user_id, name, days_per_week, blocks, total_weeks, updated_at)
       values ($1,$2,$3,$4::jsonb,$5,now())
       returning id, name, days_per_week, blocks, total_weeks, start_date, training_days, created_at, updated_at`,
      [req.user.id, name, days, JSON.stringify(blocks), totalWeeks]
    );

    const u = await pool.query(
      `select active_program_id from public.app_users where id = $1`,
      [req.user.id]
    );
    if (!u.rows?.[0]?.active_program_id) {
      await pool.query(
        `update public.app_users set active_program_id = $2 where id = $1`,
        [req.user.id, ins.rows[0].id]
      );
    }

    res.json({ program: ins.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── PUT update program ───────────────────────────────────────────────

router.put("/programs/:id", requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const name = (req.body?.name || "Program").toString().slice(0, 80);
    const days = Number(req.body?.days_per_week || 4);
    const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : [];
    const totalWeeks = Number(req.body?.total_weeks || sumProgramWeeks(blocks));

    const up = await pool.query(
      `update public.programs_app
       set name=$1, days_per_week=$2, blocks=$3::jsonb, total_weeks=$4, updated_at=now()
       where id=$5 and user_id=$6
       returning id, name, days_per_week, blocks, total_weeks, start_date, training_days, created_at, updated_at`,
      [name, days, JSON.stringify(blocks), totalWeeks, id, req.user.id]
    );
    if (up.rowCount === 0) return res.status(404).json({ error: "Program not found" });
    res.json({ program: up.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── PATCH program schedule settings ─────────────────────────────────

router.patch("/programs/:id/settings", requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const start_date = req.body?.start_date ? String(req.body.start_date) : null;
    const training_days = Array.isArray(req.body?.training_days)
      ? req.body.training_days.map(Number) : null;

    if (start_date && !parseISODateLocal(start_date)) {
      return res.status(400).json({ error: "Invalid start_date (YYYY-MM-DD)" });
    }
    if (training_days) {
      if (!training_days.every((n) => Number.isInteger(n) && n >= 0 && n <= 6)) {
        return res.status(400).json({ error: "training_days must be int[] in range 0..6" });
      }
      if (!training_days.length) {
        return res.status(400).json({ error: "training_days cannot be empty" });
      }
    }

    const exists = await pool.query(
      `select 1 from public.programs_app where id = $1 and user_id = $2`,
      [id, req.user.id]
    );
    if (exists.rowCount === 0) return res.status(404).json({ error: "Program not found" });

    const q = await pool.query(
      `update public.programs_app
       set start_date = coalesce($1, start_date),
           training_days = coalesce($2, training_days),
           updated_at = now()
       where id = $3 and user_id = $4
       returning id, start_date, training_days`,
      [start_date, training_days, id, req.user.id]
    );
    res.json({ ok: true, program: q.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── GET active program ───────────────────────────────────────────────

router.get("/programs/active", requireAuth, async (req, res) => {
  try {
    const u = await pool.query(
      `select active_program_id from public.app_users where id = $1`,
      [req.user.id]
    );
    const activeId = u.rows?.[0]?.active_program_id || null;
    if (!activeId) return res.json({ program: null });

    const p = await pool.query(
      `select id, name, days_per_week, blocks, total_weeks, created_at, updated_at, start_date, training_days
       from public.programs_app
       where id = $1 and user_id = $2`,
      [activeId, req.user.id]
    );
    res.json({
      program: p.rows?.[0]
        ? { ...p.rows[0], blocks: Array.isArray(p.rows[0].blocks) ? p.rows[0].blocks : [] }
        : null,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── POST activate program ────────────────────────────────────────────

router.post("/programs/:id/activate", requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const p = await pool.query(
      `select 1 from public.programs_app where id = $1 and user_id = $2`,
      [id, req.user.id]
    );
    if (p.rowCount === 0) return res.status(404).json({ error: "Program not found" });
    await pool.query(
      `update public.app_users set active_program_id = $2 where id = $1`,
      [req.user.id, id]
    );
    res.json({ ok: true, active_program_id: id });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── DELETE program ───────────────────────────────────────────────────

router.delete("/programs/:id", requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const del = await pool.query(
      `delete from public.programs_app where id = $1 and user_id = $2`,
      [id, req.user.id]
    );
    if (del.rowCount === 0) return res.status(404).json({ error: "Program not found" });

    const u = await pool.query(
      `select active_program_id from public.app_users where id = $1`,
      [req.user.id]
    );
    let active = u.rows?.[0]?.active_program_id || null;
    if (active === id) {
      const latest = await pool.query(
        `select id from public.programs_app where user_id = $1 order by created_at desc limit 1`,
        [req.user.id]
      );
      active = latest.rows?.[0]?.id || null;
      await pool.query(
        `update public.app_users set active_program_id = $2 where id = $1`,
        [req.user.id, active]
      );
    }
    res.json({ ok: true, active_program_id: active });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── GET active program progress ──────────────────────────────────────

router.get("/programs/active/progress", requireAuth, async (req, res) => {
  try {
    const today = String(req.query?.date || toISODateLocal(new Date()));
    const u = await pool.query(
      `select active_program_id from public.app_users where id = $1`,
      [req.user.id]
    );
    const pid = u.rows?.[0]?.active_program_id || null;
    if (!pid) return res.json({ has_program: false });

    const p = await pool.query(
      `select id, name, days_per_week, blocks, total_weeks, start_date, training_days
       from public.programs_app
       where id = $1 and user_id = $2`,
      [pid, req.user.id]
    );
    if (p.rowCount === 0) return res.json({ has_program: false });

    const prog = p.rows[0];
    const startISO = prog.start_date ? toISODateLocal(new Date(prog.start_date)) : null;
    if (!startISO) return res.json({ has_program: true, program_name: prog.name, reason: "missing_start_date" });

    const daysPerWeek = Math.max(1, Number(prog.days_per_week || 4));
    const totalWeeks = Math.max(0, Number(prog.total_weeks || 0));
    const totalSessions = totalWeeks * daysPerWeek;
    const trainingDays = Array.isArray(prog.training_days) ? prog.training_days.map(Number) : [];
    const idx = trainingSessionIndexLocal(startISO, today, trainingDays);

    let current_week = null, current_day = null, progress_pct = null;
    if (idx != null && idx >= 0 && idx < totalSessions) {
      current_week = Math.floor(idx / daysPerWeek) + 1;
      current_day = (idx % daysPerWeek) + 1;
      progress_pct = ((idx + 1) / totalSessions) * 100;
    }

    const startD = parseISODateLocal(today);
    const next_training_date = (() => {
      for (let i = 0; i <= 28; i++) {
        const d = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate() + i);
        if (trainingDays.includes(d.getDay())) return toISODateLocal(d);
      }
      return null;
    })();

    res.json({
      has_program: true, program_id: prog.id, program_name: prog.name,
      start_date: startISO, total_weeks: totalWeeks, days_per_week: daysPerWeek,
      training_days: trainingDays, current_week, current_day, progress_pct, next_training_date,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── POST share program to connection ────────────────────────────────

router.post("/programs/:id/share-to-connection", requireAuth, async (req, res) => {
  try {
    const programId = String(req.params.id || "").trim();
    const connectionId = String(req.body?.connection_id || "").trim();
    const message = String(req.body?.message || "").trim() || null;

    if (!connectionId) return res.status(400).json({ error: "connection_id is required" });

    const programQ = await pool.query(
      `select id, user_id, name from public.programs_app where id = $1 and user_id = $2 limit 1`,
      [programId, req.user.id]
    );
    if (!programQ.rows[0]) return res.status(404).json({ error: "Program not found" });

    const connQ = await pool.query(
      `select * from public.user_connections
       where id = $1 and status = 'accepted'
         and (requester_user_id = $2 or target_user_id = $2)
       limit 1`,
      [connectionId, req.user.id]
    );
    const conn = connQ.rows[0];
    if (!conn) return res.status(404).json({ error: "Accepted connection not found" });

    const targetUserId = conn.requester_user_id === req.user.id ? conn.target_user_id : conn.requester_user_id;

    const ins = await pool.query(
      `insert into public.program_shares_app
        (program_id, shared_by_user_id, shared_to_user_id, relationship_type, message, status)
       values ($1,$2,$3,$4,$5,'pending')
       returning *`,
      [programId, req.user.id, targetUserId, conn.relationship_type, message]
    );
    res.json({ ok: true, share: ins.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── GET incoming program shares ──────────────────────────────────────

router.get("/program-shares/incoming", requireAuth, async (req, res) => {
  try {
    const q = await pool.query(
      `select s.*, p.name as program_name, p.days_per_week, p.total_weeks,
              u.name as shared_by_name, u.email as shared_by_email
       from public.program_shares_app s
       join public.programs_app p on p.id = s.program_id
       join public.app_users u on u.id = s.shared_by_user_id
       where s.shared_to_user_id = $1
       order by s.created_at desc`,
      [req.user.id]
    );
    res.json({ shares: q.rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── POST copy incoming share ─────────────────────────────────────────

router.post("/program-shares/:id/copy", requireAuth, async (req, res) => {
  try {
    const shareId = String(req.params.id || "").trim();

    const shareQ = await pool.query(
      `select s.*, p.name, p.days_per_week, p.total_weeks, p.blocks
       from public.program_shares_app s
       join public.programs_app p on p.id = s.program_id
       where s.id = $1 and s.shared_to_user_id = $2
       limit 1`,
      [shareId, req.user.id]
    );
    const row = shareQ.rows[0];
    if (!row) return res.status(404).json({ error: "Shared program not found" });

    const clone = cloneProgramForUser(row, req.user.id);
    const ins = await pool.query(
      `insert into public.programs_app
        (user_id, name, days_per_week, total_weeks, blocks, start_date, training_days, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,now())
       returning *`,
      [clone.user_id, clone.name, clone.days_per_week, clone.total_weeks,
       JSON.stringify(clone.blocks), clone.start_date, clone.training_days]
    );

    await pool.query(
      `update public.program_shares_app
       set status = 'copied', copied_at = now(), accepted_at = coalesce(accepted_at, now())
       where id = $1`,
      [shareId]
    );

    res.json({ ok: true, program: ins.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── POST copy group shared program ──────────────────────────────────

router.post("/groups/:groupId/programs/:sharedId/copy", requireAuth, async (req, res) => {
  try {
    const { groupId, sharedId } = req.params;

    const membership = await pool.query(
      `select 1 from public.group_members where group_id = $1 and user_id = $2`,
      [groupId, req.user.id]
    );
    if (membership.rowCount === 0) return res.status(403).json({ error: "Not a member of this group" });

    const q = await pool.query(
      `select gsp.*, p.name, p.days_per_week, p.total_weeks, p.blocks
       from public.group_shared_programs gsp
       join public.programs_app p on p.id = gsp.program_id
       where gsp.id = $1 and gsp.group_id = $2`,
      [sharedId, groupId]
    );
    const row = q.rows[0];
    if (!row) return res.status(404).json({ error: "Shared program not found" });

    const clone = cloneProgramForUser(row, req.user.id);
    const ins = await pool.query(
      `insert into public.programs_app
        (user_id, name, days_per_week, total_weeks, blocks, created_at)
       values ($1,$2,$3,$4,$5::jsonb,now())
       returning *`,
      [clone.user_id, clone.name, clone.days_per_week, clone.total_weeks, JSON.stringify(clone.blocks)]
    );

    res.json({ ok: true, program: ins.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
