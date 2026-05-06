import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

const nodeKind = v.union(
  v.literal("text"),
  v.literal("image"),
  v.literal("url"),
  v.literal("mixed"),
)

export const list = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const nodes = await ctx.db
      .query("nodes")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect()

    return await Promise.all(
      nodes.map(async (node) => ({
        ...node,
        imageUrl: node.storageId
          ? await ctx.storage.getUrl(node.storageId)
          : node.localImageUrl,
      })),
    )
  },
})

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl()
  },
})

export const create = mutation({
  args: {
    sessionId: v.id("sessions"),
    kind: nodeKind,
    x: v.number(),
    y: v.number(),
    width: v.number(),
    height: v.number(),
    heading: v.optional(v.string()),
    text: v.optional(v.string()),
    url: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    localImageUrl: v.optional(v.string()),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const nodeId = await ctx.db.insert("nodes", {
      sessionId: args.sessionId,
      kind: args.kind,
      x: args.x,
      y: args.y,
      width: args.width,
      height: args.height,
      heading: args.heading,
      text: args.text,
      url: args.url,
      storageId: args.storageId,
      localImageUrl: args.localImageUrl,
      createdByUserId: args.userId,
      updatedByUserId: args.userId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.patch(args.sessionId, { updatedAt: now })
    return nodeId
  },
})

export const update = mutation({
  args: {
    nodeId: v.id("nodes"),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    heading: v.optional(v.string()),
    text: v.optional(v.string()),
    url: v.optional(v.string()),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.nodeId)
    if (!node) return null

    const patch = {
      updatedByUserId: args.userId,
      updatedAt: Date.now(),
      ...(args.x === undefined ? {} : { x: args.x }),
      ...(args.y === undefined ? {} : { y: args.y }),
      ...(args.width === undefined ? {} : { width: args.width }),
      ...(args.height === undefined ? {} : { height: args.height }),
      ...(args.heading === undefined ? {} : { heading: args.heading }),
      ...(args.text === undefined ? {} : { text: args.text }),
      ...(args.url === undefined ? {} : { url: args.url }),
    }

    await ctx.db.patch(args.nodeId, patch)
    await ctx.db.patch(node.sessionId, { updatedAt: patch.updatedAt })
    return args.nodeId
  },
})

export const remove = mutation({
  args: {
    nodeId: v.id("nodes"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.nodeId)
    if (!node) return null

    await ctx.db.delete(args.nodeId)
    await ctx.db.patch(node.sessionId, { updatedAt: Date.now() })
    return args.nodeId
  },
})
