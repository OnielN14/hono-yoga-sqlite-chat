import { migrate } from "drizzle-orm/libsql/migrator"
import { client, db } from "./connection"

await migrate(db, { migrationsFolder: './.migrations' })

await client.close()