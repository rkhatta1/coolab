import { v } from "convex/values"

import { mutation, query } from "./_generated/server"

export const list = query({
  args: { userId: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    const sent = await ctx.db
      .query("friendships")
      .withIndex("by_requester", (q) => q.eq("requesterUserId", args.userId))
      .collect()
    const received = await ctx.db
      .query("friendships")
      .withIndex("by_addressee_email", (q) => q.eq("addresseeEmail", args.email))
      .collect()

    return { sent, received }
  },
})

export const request = mutation({
  args: {
    requesterUserId: v.string(),
    addresseeEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("friendships")
      .withIndex("by_requester", (q) => q.eq("requesterUserId", args.requesterUserId))
      .filter((q) => q.eq(q.field("addresseeEmail"), args.addresseeEmail))
      .first()

    if (existing) {
      return existing._id
    }

    return await ctx.db.insert("friendships", {
      requesterUserId: args.requesterUserId,
      addresseeEmail: args.addresseeEmail,
      status: "pending",
      createdAt: Date.now(),
    })
  },
})

export const accept = mutation({
  args: {
    friendshipId: v.id("friendships"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const friendship = await ctx.db.get(args.friendshipId)
    if (!friendship || friendship.status !== "pending") {
      return null
    }

    await ctx.db.patch(args.friendshipId, {
      addresseeUserId: args.userId,
      status: "accepted",
      respondedAt: Date.now(),
    })

    return args.friendshipId
  },
})
