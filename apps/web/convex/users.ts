import { v } from "convex/values"

import { mutation, query } from "./_generated/server"

export const upsert = mutation({
  args: {
    userId: v.string(),
    name: v.string(),
    email: v.string(),
    avatarUrl: v.optional(v.string()),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique()

    const payload = {
      externalUserId: args.userId,
      name: args.name,
      email: args.email,
      avatarUrl: args.avatarUrl,
      color: args.color,
    }

    if (existing) {
      await ctx.db.patch(existing._id, payload)
      return existing._id
    }

    return await ctx.db.insert("users", {
      ...payload,
      createdAt: Date.now(),
    })
  },
})

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("users").collect()
  },
})
