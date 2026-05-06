import { mutation, query, type MutationCtx } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { v } from "convex/values"

const inviteRole = v.union(v.literal("editor"), v.literal("viewer"))
const collaboratorRole = v.union(v.literal("owner"), v.literal("editor"), v.literal("viewer"))

async function canInvite(ctx: MutationCtx, sessionId: Id<"sessions">, userId: string) {
  const session = await ctx.db.get(sessionId)
  if (session?.ownerUserId === userId) return true

  const collaborators = await ctx.db
    .query("collaborators")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .collect()

  return collaborators.some(
    (collaborator) =>
      collaborator.userId === userId &&
      (collaborator.role === "owner" || collaborator.role === "editor"),
  )
}

async function isOwner(ctx: MutationCtx, sessionId: Id<"sessions">, userId: string) {
  const session = await ctx.db.get(sessionId)
  if (session?.ownerUserId === userId) return true

  const collaborators = await ctx.db
    .query("collaborators")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .collect()

  return collaborators.some((collaborator) => collaborator.userId === userId && collaborator.role === "owner")
}

export const listForSession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const [collaborators, invites] = await Promise.all([
      ctx.db
        .query("collaborators")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .collect(),
      ctx.db
        .query("invites")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .collect(),
    ])

    const users = await ctx.db.query("users").collect()
    const userByExternalId = new Map(users.map((user) => [user.externalUserId, user]))

    return {
      collaborators: collaborators.map((collaborator) => ({
        ...collaborator,
        user: userByExternalId.get(collaborator.userId) ?? null,
      })),
      invites: invites
        .filter((invite) => invite.status !== "declined")
        .map((invite) => ({ ...invite, role: invite.role ?? "editor" })),
    }
  },
})

export const listForUser = query({
  args: { userId: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    const invitations = await ctx.db
      .query("invites")
      .withIndex("by_email", (q) => q.eq("invitedEmail", args.email))
      .collect()
    const notificationsForEmail = await ctx.db
      .query("notifications")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .collect()
    const notificationsForUser = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect()
    const sessions = await Promise.all(
      [...invitations, ...notificationsForEmail, ...notificationsForUser].map((item) =>
        ctx.db.get(item.sessionId),
      ),
    )
    const sessionById = new Map(
      sessions.flatMap((session) => (session ? [[session._id, session] as const] : [])),
    )

    return {
      invitations: invitations
        .filter((invite) => invite.status === "pending")
        .map((invite) => ({
          ...invite,
          role: invite.role ?? "editor",
          session: sessionById.get(invite.sessionId) ?? null,
        })),
      notifications: [...notificationsForEmail, ...notificationsForUser]
        .filter((notification) => notification.readAt === undefined && notification.type !== "invite")
        .map((notification) => ({
          ...notification,
          session: sessionById.get(notification.sessionId) ?? null,
        }))
        .sort((a, b) => b.createdAt - a.createdAt),
    }
  },
})

export const invite = mutation({
  args: {
    sessionId: v.id("sessions"),
    invitedEmail: v.string(),
    invitedByUserId: v.string(),
    role: inviteRole,
  },
  handler: async (ctx, args) => {
    if (!(await canInvite(ctx, args.sessionId, args.invitedByUserId))) return null

    const now = Date.now()
    const invitedEmail = args.invitedEmail.trim().toLowerCase()
    const inviteId = await ctx.db.insert("invites", {
      sessionId: args.sessionId,
      invitedEmail,
      invitedByUserId: args.invitedByUserId,
      role: args.role,
      status: "pending",
      createdAt: now,
    })

    await ctx.db.insert("notifications", {
      email: invitedEmail,
      type: "invite",
      sessionId: args.sessionId,
      inviteId,
      actorUserId: args.invitedByUserId,
      message: "You were invited to a session.",
      createdAt: now,
    })

    return inviteId
  },
})

export const accept = mutation({
  args: {
    inviteId: v.id("invites"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const invite = await ctx.db.get(args.inviteId)
    if (!invite || invite.status !== "pending") return null

    await ctx.db.patch(args.inviteId, {
      status: "accepted",
      respondedAt: Date.now(),
    })

    return await ctx.db.insert("collaborators", {
      sessionId: invite.sessionId,
      userId: args.userId,
      role: invite.role ?? "editor",
      joinedAt: Date.now(),
    })
  },
})

export const decline = mutation({
  args: {
    inviteId: v.id("invites"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const invite = await ctx.db.get(args.inviteId)
    if (!invite || invite.status !== "pending") return null

    const now = Date.now()
    await ctx.db.patch(args.inviteId, {
      status: "declined",
      respondedAt: now,
    })

    await ctx.db.insert("notifications", {
      userId: invite.invitedByUserId,
      type: "invite_declined",
      sessionId: invite.sessionId,
      inviteId: args.inviteId,
      actorUserId: args.userId,
      message: `${invite.invitedEmail} declined your invitation.`,
      createdAt: now,
    })

    return args.inviteId
  },
})

export const updateCollaboratorRole = mutation({
  args: {
    collaboratorId: v.id("collaborators"),
    actorUserId: v.string(),
    role: collaboratorRole,
  },
  handler: async (ctx, args) => {
    const collaborator = await ctx.db.get(args.collaboratorId)
    if (!collaborator || collaborator.role === "owner") return null
    if (!(await isOwner(ctx, collaborator.sessionId, args.actorUserId))) return null

    await ctx.db.patch(args.collaboratorId, { role: args.role })
    return args.collaboratorId
  },
})

export const removeCollaborator = mutation({
  args: { collaboratorId: v.id("collaborators"), actorUserId: v.string() },
  handler: async (ctx, args) => {
    const collaborator = await ctx.db.get(args.collaboratorId)
    if (!collaborator || collaborator.role === "owner") return null
    if (!(await isOwner(ctx, collaborator.sessionId, args.actorUserId))) return null

    await ctx.db.delete(args.collaboratorId)
    return args.collaboratorId
  },
})

export const markNotificationRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.notificationId, { readAt: Date.now() })
    return args.notificationId
  },
})
