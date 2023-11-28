import { YogaInitialContext } from "graphql-yoga";
import { User } from "modules/User";

export interface CommonGraphQLContext extends YogaInitialContext {

}

export interface AuthGraphQLContext extends CommonGraphQLContext {
    currentUser: User
}