import { mutation, query } from "./_generated/server"

export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const existing = await ctx.db.query("accounts").first()

    if (existing) {
      return existing._id
    }

    const accountId = await ctx.db.insert("accounts", {
      name: "Arc Studio",
      handle: "arc-studio",
      color: "#0f766e",
      createdAt: now,
    })

    const sessionId = await ctx.db.insert("sessions", {
      accountId,
      title: "Spring social launch",
      status: "draft",
      ownerUserId: "demo-raaj",
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert("collaborators", {
      sessionId,
      userId: "demo-raaj",
      role: "owner",
      joinedAt: now,
    })

    await ctx.db.insert("nodes", {
      sessionId,
      kind: "text",
      x: 260,
      y: 180,
      width: 300,
      height: 170,
      heading: "Launch angle",
      text: "## Launch angle\n\nShort-form cuts around founder POV, customer proof, and a campaign moodboard.",
      createdByUserId: "demo-raaj",
      updatedByUserId: "demo-raaj",
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert("nodes", {
      sessionId,
      kind: "url",
      x: 660,
      y: 270,
      width: 280,
      height: 130,
      heading: "Competitor reel reference",
      text: "Competitor reel reference",
      url: "https://www.instagram.com/",
      createdByUserId: "demo-raaj",
      updatedByUserId: "demo-raaj",
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert("messages", {
      sessionId,
      userId: "demo-maya",
      body: "Let us anchor the first carousel around the proof point and tag the moodboard node once pasted.",
      taggedNodeIds: [],
      createdAt: now,
    })

    return accountId
  },
})

export const initial = query({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.db.query("accounts").collect()
    const sessions = await ctx.db.query("sessions").order("desc").collect()

    return { accounts, sessions }
  },
})
