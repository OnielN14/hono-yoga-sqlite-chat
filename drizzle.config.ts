import type { Config } from "drizzle-kit"

export default {
    schema: "./database/schema.ts",
    out: "./.migrations",
    driver: 'turso',
} satisfies Config