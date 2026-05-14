import { v } from "convex/values"

import { mutation, query } from "./_generated/server"

export const list = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const collaborators = await ctx.db
      .query("collaborators")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect()
    const sessions = (
      await Promise.all(collaborators.map((collaborator) => ctx.db.get(collaborator.sessionId)))
    ).filter((session) => session !== null)
    const ownedSessions = (await ctx.db.query("sessions").collect()).filter(
      (session) => session.ownerUserId === args.userId,
    )
    const accountIds = new Set([...sessions, ...ownedSessions].map((session) => session.accountId))
    const accounts = await Promise.all(Array.from(accountIds).map((id) => ctx.db.get(id)))

    return accounts.filter((account) => account !== null)
  },
})

export const create = mutation({
  args: {
    name: v.string(),
    handle: v.string(),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("accounts", {
      name: args.name,
      handle: args.handle,
      color: args.color,
      createdAt: Date.now(),
    })
  },
})

export const update = mutation({
  args: {
    accountId: v.id("accounts"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId)
    if (!account) return null

    await ctx.db.patch(args.accountId, {
      ...(args.name === undefined ? {} : { name: args.name }),
      ...(args.color === undefined ? {} : { color: args.color }),
    })

    return args.accountId
  },
})

export const sessions = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .order("desc")
      .collect()
  },
})
