import { serve } from "@hono/node-server"
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'

import { useServer } from "graphql-ws/lib/use/ws"
import { createSchema, createYoga } from "graphql-yoga"
import { WebSocketServer } from "ws"
import { Server } from "http"
import { UnauthenticatedError, useGenericAuth } from "@envelop/generic-auth"
import jsonwebtoken, { JwtPayload } from 'jsonwebtoken'
import { userRepository, schema as userSchema, resolvers as userResolvers } from "modules/User"
import { schema as authSchema, resolvers as authResolvers } from "modules/Auth"
import { schema as chatSchema, resolvers as chatResolvers } from "modules/Chat"
import { JWT_KEY } from "env"
import { GraphQLError } from "graphql"
import { HttpStatus } from "http-status-ts"
import { CommonGraphQLContext } from "context"

const schema = createSchema({
    typeDefs: [
        userSchema,
        authSchema,
        chatSchema
    ],
    resolvers: [
        userResolvers,
        authResolvers,
        chatResolvers
    ]
})

const yogaGraphqlInstance = createYoga({
    schema,
    fetchAPI: { fetch, Request, ReadableStream, Response },
    graphiql: {
        subscriptionsProtocol: 'WS'
    },
    plugins: [
        useGenericAuth({
            mode: 'protect-all',
            resolveUserFn: async (ctx: CommonGraphQLContext) => {
                try {
                    const token = ctx.request.headers.get('authorization')
                    if (!token) throw new UnauthenticatedError("Unauthenticated", {
                        extensions: {
                            http: {
                                status: HttpStatus.UNAUTHORIZED
                            }
                        }
                    })

                    const result = jsonwebtoken.verify(token, JWT_KEY) as JwtPayload
                    if (!result.sub) throw new GraphQLError("Invalid", {
                        extensions: {
                            http: {
                                status: HttpStatus.UNAUTHORIZED
                            }
                        }
                    })
                    const user = await userRepository.findByEmail(result.sub)
                    if (!user) throw new GraphQLError("User Invalid", {
                        extensions: {
                            http: {
                                status: HttpStatus.UNAUTHORIZED
                            }
                        }
                    })

                    return user
                } catch (e) {
                    return null
                }
            },
            validateUser: (params) => {
                if (params.fieldAuthDirectiveNode?.name.value === 'skipAuth') return

                if (!params.user) return new UnauthenticatedError("Unauthenticated", {
                    extensions: {
                        http: {
                            status: HttpStatus.UNAUTHORIZED
                        }
                    }
                })
            }
        })
    ]
})

const app = new Hono()

app.use("*", cors({
    origin: [
        'http://localhost:5173'
    ]
}), logger())

app.on(["GET", "POST"], "/graphql", (ctx) => yogaGraphqlInstance.fetch(ctx.req.raw))

const server = serve({
    fetch: app.fetch,
    port: 5000,
}, (info) => {
    console.log(`🚀 Running on http://${info.address}:${info.port}`)
})

const websocketServer = new WebSocketServer({
    server: server as Server,
    path: yogaGraphqlInstance.graphqlEndpoint
})

useServer({
    execute: (args: any) => args.rootValue.execute(args),
    subscribe: (args: any) => args.rootValue.subscribe(args),
    onSubscribe: async (ctx, msg) => {
        const { schema, execute, subscribe, contextFactory, parse, validate } = yogaGraphqlInstance.getEnveloped({
            ...ctx,
            req: ctx.extra.request,
            socket: ctx.extra.socket,
            params: msg.payload
        })

        const args = {
            schema,
            operationName: msg.payload.operationName,
            document: parse(msg.payload.query),
            variableValues: msg.payload.variables,
            contextValue: await contextFactory(),
            rootValue: {
                execute, subscribe
            }
        }

        const errors = validate(args.schema, args.document)
        if (errors.length) return errors

        return args
    }
}, websocketServer)