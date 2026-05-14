import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

export const list = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("groups")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect()
  },
})

export const create = mutation({
  args: {
    sessionId: v.id("sessions"),
    name: v.string(),
    nodeIds: v.array(v.string()),
    x: v.number(),
    y: v.number(),
    width: v.number(),
    height: v.number(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const groupId = await ctx.db.insert("groups", {
      sessionId: args.sessionId,
      name: args.name,
      nodeIds: args.nodeIds,
      x: args.x,
      y: args.y,
      width: args.width,
      height: args.height,
      createdByUserId: args.userId,
      updatedByUserId: args.userId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.patch(args.sessionId, { updatedAt: now })
    return groupId
  },
})

export const update = mutation({
  args: {
    groupId: v.id("groups"),
    name: v.optional(v.string()),
    nodeIds: v.optional(v.array(v.string())),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.groupId)
    if (!group) return null

    const patch = {
      updatedByUserId: args.userId,
      updatedAt: Date.now(),
      ...(args.name === undefined ? {} : { name: args.name }),
      ...(args.nodeIds === undefined ? {} : { nodeIds: args.nodeIds }),
      ...(args.x === undefined ? {} : { x: args.x }),
      ...(args.y === undefined ? {} : { y: args.y }),
      ...(args.width === undefined ? {} : { width: args.width }),
      ...(args.height === undefined ? {} : { height: args.height }),
    }

    await ctx.db.patch(args.groupId, patch)
    await ctx.db.patch(group.sessionId, { updatedAt: patch.updatedAt })
    return args.groupId
  },
})

export const remove = mutation({
  args: {
    groupId: v.id("groups"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.groupId)
    if (!group) return null

    await ctx.db.delete(args.groupId)
    await ctx.db.patch(group.sessionId, { updatedAt: Date.now() })
    return args.groupId
  },
})
