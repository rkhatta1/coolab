import { v } from "convex/values"

import { mutation, query } from "./_generated/server"

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("accounts").collect()
  },
})

export const create = mutation({
  args: {
    name: v.string(),
    handle: v.string(),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("accounts")
      .withIndex("by_handle", (q) => q.eq("handle", args.handle))
      .unique()

    if (existing) {
      return existing._id
    }

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
