import { query } from "./_generated/server"

export const initial = query({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.db.query("accounts").collect()
    const sessions = await ctx.db.query("sessions").order("desc").collect()

    return { accounts, sessions }
  },
})
