import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const userTableSchema = sqliteTable("users", {
    id: integer("id").primaryKey({
        autoIncrement: true
    }),
    username: text("username").notNull(),
    email: text("email").notNull(),
    password: text("password").notNull()
}, (users) => ({
    emailIdx: uniqueIndex("emailIdx").on(users.email),
    usernameIdx: uniqueIndex("usernameIdx").on(users.username),
}))

export const authTableSchema = sqliteTable("authentication", {
    id: integer('id').primaryKey({
        autoIncrement: true
    }),
    user_id: integer('user_id').notNull().references(() => userTableSchema.id),
    last_login: text('last_login').notNull().$defaultFn(() => new Date().toISOString())
})