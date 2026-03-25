"use strict";

const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const { requireAuth } = require("../middleware");
const { normalizeRelationshipType } = require("../utils");

// ─── Search users ─────────────────────────────────────────────────────

router.get("/connections/search", requireAuth, async (req, res) => {
  try {
    const q = String(req.query?.q || "").trim();
    if (!q || q.length < 2) return res.json({ users: [] });

    const r = await pool.query(
      `select id, email, name, created_at
       from public.app_users
       where id <> $1
         and (lower(email) like lower($2) or lower(coalesce(name,'')) like lower($2))
       order by created_at desc
       limit 20`,
      [req.user.id, `%${q}%`]
    );
    res.json({ users: r.rows || [] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── Send connection request ──────────────────────────────────────────

router.post("/connections/request", requireAuth, async (req, res) => {
  try {
    const targetUserId = String(req.body?.target_user_id || "").trim();
    const relationshipType = normalizeRelationshipType(req.body?.relationship_type);

    if (!targetUserId) return res.status(400).json({ error: "target_user_id is required" });
    if (targetUserId === req.user.id) return res.status(400).json({ error: "You cannot connect to yourself" });

    const existing = await pool.query(
  `select id, status from public.user_connections
   where least(requester_user_id::text, target_user_id::text) = least($1::text,$2::text)
     and greatest(requester_user_id::text, target_user_id::text) = greatest($1::text,$2::text)
     and relationship_type = $3
   limit 1`,
  [req.user.id, targetUserId, relationshipType]
);
    if (existing.rows[0]) return res.json({ ok: true, connection: existing.rows[0], already_exists: true });

    const ins = await pool.query(
      `insert into public.user_connections (requester_user_id, target_user_id, relationship_type, status)
       values ($1,$2,$3,'pending')
       returning *`,
      [req.user.id, targetUserId, relationshipType]
    );
    res.json({ ok: true, connection: ins.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── GET all connections ──────────────────────────────────────────────

router.get("/connections", requireAuth, async (req, res) => {
  try {
    const acceptedQ = await pool.query(
      `select c.id, c.relationship_type, c.status, c.created_at, c.accepted_at,
              case when c.requester_user_id=$1 then u2.id else u1.id end as other_user_id,
              case when c.requester_user_id=$1 then u2.email else u1.email end as other_email,
              case when c.requester_user_id=$1 then u2.name else u1.name end as other_name,
              case when c.requester_user_id=$1 then 'outgoing' else 'incoming' end as direction
       from public.user_connections c
       join public.app_users u1 on u1.id = c.requester_user_id
       join public.app_users u2 on u2.id = c.target_user_id
       where (c.requester_user_id=$1 or c.target_user_id=$1)
         and c.status = 'accepted'
       order by coalesce(c.accepted_at, c.created_at) desc`,
      [req.user.id]
    );

    const pendingQ = await pool.query(
      `select c.id, c.relationship_type, c.status, c.created_at,
              u.id as other_user_id, u.email as other_email, u.name as other_name,
              case when c.requester_user_id=$1 then 'outgoing' else 'incoming' end as direction
       from public.user_connections c
       join public.app_users u on u.id = case when c.requester_user_id=$1 then c.target_user_id else c.requester_user_id end
       where (c.requester_user_id=$1 or c.target_user_id=$1)
         and c.status = 'pending'
       order by c.created_at desc`,
      [req.user.id]
    );

    res.json({ accepted: acceptedQ.rows || [], pending: pendingQ.rows || [] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── Accept connection ────────────────────────────────────────────────

router.post("/connections/:id/accept", requireAuth, async (req, res) => {
  try {
    const upd = await pool.query(
      `update public.user_connections
       set status = 'accepted', accepted_at = now()
       where id = $1 and target_user_id = $2 and status = 'pending'
       returning *`,
      [req.params.id, req.user.id]
    );
    if (!upd.rows[0]) return res.status(404).json({ error: "Pending request not found" });
    res.json({ ok: true, connection: upd.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ─── Decline connection ───────────────────────────────────────────────

router.post("/connections/:id/decline", requireAuth, async (req, res) => {
  try {
    const upd = await pool.query(
      `update public.user_connections
       set status = 'declined'
       where id = $1 and target_user_id = $2 and status = 'pending'
       returning *`,
      [req.params.id, req.user.id]
    );
    if (!upd.rows[0]) return res.status(404).json({ error: "Pending request not found" });
    res.json({ ok: true, connection: upd.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
