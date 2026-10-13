// GraphQL resolver exposing the `ping` liveness query (returns "pong").
import { Query, Resolver } from '@nestjs/graphql';
import { Public } from '../auth/auth.decorators';

@Resolver()
export class HealthResolver {
  @Public()
  @Query(() => String, { description: 'Liveness smoke-test. Returns "pong".' })
  ping(): string {
    return 'pong';
  }
}
