import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  accounts: defineTable({
    name: v.string(),
    handle: v.string(),
    color: v.string(),
    createdAt: v.number(),
  }).index("by_handle", ["handle"]),

  users: defineTable({
    externalUserId: v.optional(v.string()),
    name: v.string(),
    email: v.string(),
    avatarUrl: v.optional(v.string()),
    color: v.string(),
    createdAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_external_user", ["externalUserId"]),

  friendships: defineTable({
    requesterUserId: v.string(),
    addresseeEmail: v.string(),
    addresseeUserId: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("declined"),
    ),
    createdAt: v.number(),
    respondedAt: v.optional(v.number()),
  })
    .index("by_requester", ["requesterUserId"])
    .index("by_addressee_email", ["addresseeEmail"])
    .index("by_addressee_user", ["addresseeUserId"]),

  sessions: defineTable({
    accountId: v.id("accounts"),
    title: v.string(),
    status: v.union(v.literal("draft"), v.literal("review"), v.literal("approved")),
    ownerUserId: v.string(),
    updatedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_updated", ["updatedAt"])
    .index("by_account", ["accountId", "updatedAt"]),

  collaborators: defineTable({
    sessionId: v.id("sessions"),
    userId: v.string(),
    role: v.union(v.literal("owner"), v.literal("editor"), v.literal("viewer")),
    joinedAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_user", ["userId"]),

  invites: defineTable({
    sessionId: v.id("sessions"),
    invitedEmail: v.string(),
    invitedByUserId: v.string(),
    role: v.optional(v.union(v.literal("editor"), v.literal("viewer"))),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("declined"),
    ),
    createdAt: v.number(),
    respondedAt: v.optional(v.number()),
  })
    .index("by_email", ["invitedEmail"])
    .index("by_session", ["sessionId"]),

  notifications: defineTable({
    userId: v.optional(v.string()),
    email: v.optional(v.string()),
    type: v.union(v.literal("invite"), v.literal("invite_declined")),
    sessionId: v.id("sessions"),
    inviteId: v.optional(v.id("invites")),
    actorUserId: v.optional(v.string()),
    message: v.string(),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_email", ["email", "createdAt"]),

  nodes: defineTable({
    sessionId: v.id("sessions"),
    kind: v.union(v.literal("text"), v.literal("image"), v.literal("url"), v.literal("mixed")),
    x: v.number(),
    y: v.number(),
    width: v.number(),
    height: v.number(),
    heading: v.optional(v.string()),
    text: v.optional(v.string()),
    url: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    localImageUrl: v.optional(v.string()),
    createdByUserId: v.string(),
    updatedByUserId: v.string(),
    updatedAt: v.number(),
    createdAt: v.number(),
  }).index("by_session", ["sessionId", "updatedAt"]),

  messages: defineTable({
    sessionId: v.id("sessions"),
    userId: v.string(),
    body: v.string(),
    taggedNodeIds: v.array(v.string()),
    createdAt: v.number(),
  }).index("by_session", ["sessionId", "createdAt"]),

  presence: defineTable({
    sessionId: v.id("sessions"),
    userId: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
    color: v.string(),
    cursorX: v.number(),
    cursorY: v.number(),
    activeNodeId: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_session", ["sessionId", "updatedAt"])
    .index("by_session_user", ["sessionId", "userId"]),
})
