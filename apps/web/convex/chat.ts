import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

export const list = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect()
  },
})

export const send = mutation({
  args: {
    sessionId: v.id("sessions"),
    userId: v.string(),
    body: v.string(),
    taggedNodeIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      sessionId: args.sessionId,
      userId: args.userId,
      body: args.body,
      taggedNodeIds: args.taggedNodeIds,
      createdAt: Date.now(),
    })
  },
})
