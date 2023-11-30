import { SKIP_AUTH_DIRECTIVE_SDL } from "@envelop/generic-auth"
import { db } from "database/connection"
import { conversationTableSchema, messageTableSchema, participantTableSchema } from "database/schema"
import { eq } from "drizzle-orm"
import { createPubSub, createSchema } from "graphql-yoga"
import { AuthGraphQLContext } from "context"

const pubsub = createPubSub<{
    'chat:conversationList': [userId: number, payload: string],
    'chat:conversation': [conversationId: number, incomingMessage: typeof messageTableSchema.$inferSelect]
}>()

const chatRepository = {
    async sendMessage(senderId: number, conversationId: number, message: string) {
        const insertResult = await db.insert(messageTableSchema).values({
            conversation_id: conversationId,
            sender_id: senderId,
            content: message,
        }).returning()


        await db.update(conversationTableSchema).set({
            updated_at: new Date().toISOString()
        }).where(eq(conversationTableSchema.id, conversationId))

        return insertResult[0]
    },
    async createConversation(users: number[]) {
        let name = ""
        if (users.length > 2) {
            const userQueryResult = await db.query.userTableSchema.findMany({
                where: (userSchema, clauses) => clauses.inArray(userSchema.id, users),
                columns: { username: true }
            })

            name = userQueryResult.map((v) => v.username).join(", ")
        }

        const conversations = await db.insert(conversationTableSchema)
            .values({ name })
            .returning({ id: conversationTableSchema.id })

        const participantValues: typeof participantTableSchema.$inferInsert[] = users.map((userId) => ({
            conversation_id: conversations[0].id,
            user_id: userId,
        }))

        await db.insert(participantTableSchema).values(participantValues)

        return conversations[0]
    },
    async getConversationsByUser(userId: number) {
        const conversationIdsSubQuery = db.select().from(conversationTableSchema).innerJoin(participantTableSchema, eq(participantTableSchema.conversation_id, conversationTableSchema.id)).where(eq(participantTableSchema.user_id, userId)).as("convoIds")

        const conversations = await db.query.conversationTableSchema.findMany({
            where: (conversationSchema, clauses) => {
                return clauses.inArray(conversationSchema.id, conversationIdsSubQuery)
            },
            with: {
                participants: {
                    with: {
                        user: {
                            columns: {
                                id: true,
                            },
                            extras: (fields, { sql }) => ({
                                name: sql`${fields.username}`.as("name")
                            }),
                        }
                    }
                },
                messages: {
                    limit: 1,
                    orderBy: (fields, operators) => [operators.desc(fields.created_at)],
                }
            }
        })

        return conversations
    }
}

const typeDefs = [
    SKIP_AUTH_DIRECTIVE_SDL,
    /* GraphQL */ `
        type User {
            id: ID!
        }

        type Participant {
            created_at: String!
            updated_at: String!
            user: User!
        }

        type Message {
            content: String!
            created_at: String!
            updated_at: String!
            sender_id: Int!
        }

        type Conversation {
            participants: [Participant]
            messages: [Message]
            updated_at: String!
        }

        type Query {
            conversations: [Conversation]
        }

        type Mutation {
            sendMessage(content: String!, conversation_id: ID!): Boolean
            sendMessageInitial(content: String!, participant_ids: [Int]): Boolean
        }

        type Subscription {
            listenConversation(conversation_id: ID!): Message!
            listenConversationList: [Conversation]
        }
    `
]

const resolvers = {
    Query: {
        async conversations(_: unknown, _args: unknown, ctx: AuthGraphQLContext) {
            return chatRepository.getConversationsByUser(ctx.currentUser.id)
        }
    },
    Mutation: {
        async sendMessage(_: unknown, args: { content: string, conversation_id: number }, ctx: AuthGraphQLContext) {
            const message = await chatRepository.sendMessage(ctx.currentUser.id, args.conversation_id, args.content)

            pubsub.publish("chat:conversation", args.conversation_id, message)
        },
        async sendMessageInitial(_: unknown, args: { content: string, participant_ids: number[] }, ctx: AuthGraphQLContext) {
            const conversation = await chatRepository.createConversation(args.participant_ids)
            await this.sendMessage(_, { content: args.content, conversation_id: conversation.id }, ctx)

            pubsub.publish('chat:conversationList', ctx.currentUser.id, "")
        },
    },
    Subscription: {
        listenConversation: {
            subscribe: (_: unknown, args: { conversation_id: number }) => {
                return pubsub.subscribe("chat:conversation", args.conversation_id)
            },
            resolve: (payload: unknown) => payload
        },
        listenConversationList: {
            subscribe: (_: unknown, _args: unknown, ctx: AuthGraphQLContext) => {
                return pubsub.subscribe("chat:conversationList", ctx.currentUser.id)
            },
            resolve: (payload: unknown) => payload
        }
    },
}

const schema = createSchema({
    typeDefs,
    resolvers
})

export {
    typeDefs,
    schema,
    resolvers
}