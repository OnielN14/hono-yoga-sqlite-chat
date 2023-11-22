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
import { JWT_KEY } from "env"
import { GraphQLError } from "graphql"
import { HttpStatus } from "http-status-ts"

const schema = createSchema({
    typeDefs: [
        userSchema,
        authSchema
    ],
    resolvers: [
        userResolvers,
        authResolvers
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
            resolveUserFn: async (ctx) => {
                try {
                    const result = jsonwebtoken.verify(ctx.request.headers.get('authorization'), JWT_KEY) as JwtPayload

                    if (!result.sub) throw new GraphQLError("Invalid", {
                        extensions: {
                            http: {
                                status: HttpStatus.UNAUTHORIZED
                            }
                        }
                    })
                    const users = await userRepository.findByEmail(result.sub)
                    if (users.length === 0) throw new GraphQLError("User Invalid", {
                        extensions: {
                            http: {
                                status: HttpStatus.UNAUTHORIZED
                            }
                        }
                    })

                    return users[0]
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