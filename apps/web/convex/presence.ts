import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

export const list = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - 30_000
    return await ctx.db
      .query("presence")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.gt(q.field("updatedAt"), cutoff))
      .collect()
  },
})

export const heartbeat = mutation({
  args: {
    sessionId: v.id("sessions"),
    userId: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
    color: v.string(),
    cursorX: v.number(),
    cursorY: v.number(),
    activeNodeId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_session_user", (q) =>
        q.eq("sessionId", args.sessionId),
      )
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .unique()

    const payload = {
      name: args.name,
      avatarUrl: args.avatarUrl,
      color: args.color,
      cursorX: args.cursorX,
      cursorY: args.cursorY,
      activeNodeId: args.activeNodeId,
      updatedAt: Date.now(),
    }

    if (existing) {
      await ctx.db.patch(existing._id, payload)
      return existing._id
    }

    return await ctx.db.insert("presence", {
      sessionId: args.sessionId,
      userId: args.userId,
      ...payload,
    })
  },
})
