import { makeExecutableSchema } from "@graphql-tools/schema"
import { db } from 'database/connection'
import argon2 from 'argon2'
import { userTableSchema } from "database/schema"

type User = typeof userTableSchema.$inferSelect;
type NewUser = typeof userTableSchema.$inferInsert;

const userRepository = {
    async findById(id: number) {
        return await db.query.userTableSchema.findFirst({
            where: (userSchema, clauses) => clauses.eq(userSchema.id, id)
        })
    },
    async findByUsername(username: string) {
        return await db.query.userTableSchema.findFirst({
            where: (userSchema, clauses) => clauses.eq(userSchema.username, username)
        })
    },
    async findByEmail(email: string) {
        return await db.query.userTableSchema.findFirst({
            where: (userSchema, clauses) => clauses.eq(userSchema.email, email)
        })
    },
    async create(userData: Omit<NewUser, 'id'>) {
        userData.password = await argon2.hash(userData.password)

        const user = await db.insert(userTableSchema).values(userData).returning({
            id: userTableSchema.id,
            email: userTableSchema.email,
            username: userTableSchema.username
        })

        return user[0]
    }
}


const typeDefs = /* GraphQL */`
    type User {
        id: ID!
        name: String!
    }

    type Query {
        user(id: ID!): User!
    }

    # type Mutation {

    # }
`

const resolvers = {
    Query: {

    },
    // Mutation: {

    // }
}

const schema = makeExecutableSchema({
    typeDefs, resolvers
})

export type {
    User,
    NewUser
}

export {
    userTableSchema,
    userRepository,
    typeDefs,
    schema,
    resolvers
}