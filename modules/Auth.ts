import { userRepository } from "./User";
import { eq } from "drizzle-orm";
import { db } from "database/connection";
import { makeExecutableSchema } from "@graphql-tools/schema";
import argon2 from 'argon2'
import jwt from 'jsonwebtoken'
import ms from "ms"
import { createGraphQLError } from "graphql-yoga";
import { HttpStatus } from "http-status-ts"
import { authTableSchema } from "database/schema";
import { JWT_KEY } from "env";
import { SKIP_AUTH_DIRECTIVE_SDL } from "@envelop/generic-auth";
import { AuthGraphQLContext } from "context";

interface LoginArgs {
    username: string;
    password: string;
}

interface RegisterArgs {
    username: string;
    password: string;
    email: string;
}

const UserAlreadyExist = createGraphQLError("User Already Exist", {
    extensions: {
        http: {
            status: HttpStatus.BAD_REQUEST
        }
    }
})

const NotFoundUserException = createGraphQLError("Not Found User Exception", {
    extensions: {
        http: {
            status: HttpStatus.UNAUTHORIZED
        }
    }
})


const PasswordNotMatchException = createGraphQLError("PasswordNotMatchException", {
    extensions: {
        http: {
            status: HttpStatus.UNAUTHORIZED
        }
    }
})

const authRepository = {
    async login(username: string, password: string) {
        const user = await db.query.userTableSchema.findFirst({
            where: (userSchema, clauses) => clauses.eq(userSchema.username, username),
            with: {
                authentication: true
            }
        })
        if (!user) throw NotFoundUserException

        if (!await argon2.verify(user.password, password)) throw PasswordNotMatchException

        const expiresIn = ms('1h')

        const token = jwt.sign({}, JWT_KEY, {
            subject: user.email,
            expiresIn: expiresIn / 1000
        })

        if (user.authentication === null) {
            await db.insert(authTableSchema).values({ user_id: user.id })
        } else {
            await db.update(authTableSchema).set({ last_login: new Date().toISOString() }).where(eq(authTableSchema.id, user.authentication.id))
        }

        return {
            token, expiresIn
        }
    },
}

const typeDefs = [
    SKIP_AUTH_DIRECTIVE_SDL,
    /* GraphQL */ `    
        type AuthReturn {
            token: String! @skipAuth
            expiry: Int! @skipAuth
        }

        input RegisterArgs {
            email: String!
            username: String!
            password: String!
        }

        type RegisterReturn {
            status: String! @skipAuth
        } 

        type Mutation {
            login(username: String!, password: String!): AuthReturn @skipAuth
            register(payload: RegisterArgs!): RegisterReturn @skipAuth
        }

        type Query {
            me: String
            public: String @skipAuth
        }
        
    `
]


const resolvers = {
    Query: {
        me: async (_: unknown, args: unknown, context: AuthGraphQLContext) => {
            console.log(context)
            return "Test"
        },
        public: async (_: unknown, args: unknown, context: unknown) => {
            return "Test"
        }
    },
    Mutation: {
        login: {
            resolve: async (_: unknown, args: LoginArgs) => {
                const {
                    expiresIn,
                    token
                } = await authRepository.login(args.username, args.password)

                return {
                    token,
                    expiry: expiresIn
                }
            },
            extensions: {
                skipAuth: true
            }
        },
        register: {
            resolve: async (_: unknown, args: { payload: RegisterArgs }) => {
                try {
                    const existingUser = await userRepository.findByEmail(args.payload.email)
                    if (existingUser) throw UserAlreadyExist

                    await userRepository.create(args.payload)

                    return {
                        status: "User Created"
                    }
                } catch (error) {
                    console.log(error)
                    throw error
                }
            },
            extensions: {
                skipAuth: true
            }
        }

    }
}

const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
})

export {
    authTableSchema,
    authRepository,
    schema,
    resolvers,
}