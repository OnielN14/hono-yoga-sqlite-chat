import { SKIP_AUTH_DIRECTIVE_SDL } from "@envelop/generic-auth"
import { makeExecutableSchema } from "@graphql-tools/schema"
import { db } from "database/connection"
import { conversationTableSchema, messageTableSchema, participantTableSchema } from "database/schema"
import { eq } from "drizzle-orm"
import { PubSub } from "graphql-yoga"
import { AuthGraphQLContext } from "context"

const chatRepository = {
    async sendMessage(senderId: number, conversationId: number, message: string) {
        await db.insert(messageTableSchema).values({
            conversation_id: conversationId,
            sender_id: senderId,
            content: message,
        })
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
            participants: Participant[]
            messages: Message[]
            updated_at: String!
        }

        type Query {
            conversations: Conversation[]
        }

        type Mutation {
            sendMessage(content: String!, conversation_id: ID!)
        }

        type Subscription {
            listenConversation(conversation_id: ID!)
            listenConversationList(): Conversation[]
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
        sendMessage(_: unknown, args: unknown) {

        }
    },
    Subscription: {
        listenConversation(_: unknown, args: unknown) {

        },
        listenConversationList(_: unknown, args: unknown) {

        },
    },
}

const schema = makeExecutableSchema({
    typeDefs,
    resolvers
})

export {
    typeDefs,
    schema,
    resolvers
}