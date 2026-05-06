import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

export const list = query({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db.query("sessions").order("desc").take(40)
    const accounts = await ctx.db.query("accounts").collect()
    const accountById = new Map(accounts.map((account) => [account._id, account]))

    return sessions.map((session) => ({
      ...session,
      account: accountById.get(session.accountId) ?? null,
    }))
  },
})

export const create = mutation({
  args: {
    accountId: v.id("accounts"),
    title: v.string(),
    ownerUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const sessionId = await ctx.db.insert("sessions", {
      accountId: args.accountId,
      title: args.title,
      status: "draft",
      ownerUserId: args.ownerUserId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert("collaborators", {
      sessionId,
      userId: args.ownerUserId,
      role: "owner",
      joinedAt: now,
    })

    return sessionId
  },
})

export const update = mutation({
  args: {
    sessionId: v.id("sessions"),
    title: v.optional(v.string()),
    status: v.optional(v.union(v.literal("draft"), v.literal("review"), v.literal("approved"))),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId)
    if (!session) return null

    await ctx.db.patch(args.sessionId, {
      ...(args.title === undefined ? {} : { title: args.title }),
      ...(args.status === undefined ? {} : { status: args.status }),
      updatedAt: Date.now(),
    })

    return args.sessionId
  },
})
