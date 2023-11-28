import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm"

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

export const userTableRelations = relations(userTableSchema, ({ one }) => ({
    authentication: one(authTableSchema)
}))

export const authTableSchema = sqliteTable("authentication", {
    id: integer('id').primaryKey({
        autoIncrement: true
    }),
    user_id: integer('user_id').notNull().references(() => userTableSchema.id),
    last_login: text('last_login').notNull().$defaultFn(() => new Date().toISOString())
})

export const authTableRelations = relations(authTableSchema, ({ one }) => ({
    user: one(userTableSchema, {
        fields: [authTableSchema.user_id],
        references: [userTableSchema.id]
    })
}))

export const conversationTableSchema = sqliteTable("conversations", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
    updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const conversationTableRelations = relations(conversationTableSchema, ({ many }) => ({
    participants: many(participantTableSchema),
    messages: many(messageTableSchema)
}))

export const messageTableSchema = sqliteTable("messages", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    content: text("content"),
    created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
    updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
    sender_id: integer('sender_id').notNull().references(() => userTableSchema.id),
    conversation_id: integer('conversation_id').notNull().references(() => conversationTableSchema.id)
})

export const messageTableRelations = relations(messageTableSchema, ({ one }) => ({
    conversation: one(conversationTableSchema, {
        fields: [messageTableSchema.conversation_id],
        references: [conversationTableSchema.id]
    }),
    user: one(userTableSchema, {
        fields: [messageTableSchema.sender_id],
        references: [userTableSchema.id]
    })
}))

export const participantTableSchema = sqliteTable("participants", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
    updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
    user_id: integer('user_id').notNull().references(() => userTableSchema.id),
    conversation_id: integer('conversation_id').notNull().references(() => conversationTableSchema.id)
})

export const participantTableRelations = relations(participantTableSchema, ({ one }) => ({
    conversation: one(conversationTableSchema, {
        fields: [participantTableSchema.conversation_id],
        references: [conversationTableSchema.id]
    }),
    user: one(userTableSchema, {
        fields: [participantTableSchema.user_id],
        references: [userTableSchema.id]
    })
}))

