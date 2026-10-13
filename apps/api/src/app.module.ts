// Root module. Wires the global database module, the code-first GraphQL
// (Apollo) layer, authentication, and the feature modules together.
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { ThrottlerModule } from '@nestjs/throttler';
import { ActorsModule } from './actors/actors.module';
import { AdminModule } from './admin/admin.module';
import { ArchitectureDomainsModule } from './architecture-domains/architecture-domains.module';
import { AuthModule } from './auth/auth.module';
import { BuildingBlocksModule } from './building-blocks/building-blocks.module';
import { BusinessCapabilitiesModule } from './business-capabilities/business-capabilities.module';
import { BusinessProcessesModule } from './business-processes/business-processes.module';
import { PgErrorFilter } from './common/pg-error.filter';
import { config } from './config';
import { DataExchangeModule } from './data-exchange/data-exchange.module';
import { DbModule } from './db.module';
import { EnterprisesModule } from './enterprises/enterprises.module';
import { HealthModule } from './health/health.module';
import { IconsModule } from './icons/icons.module';
import { InformationObjectsModule } from './information-objects/information-objects.module';
import { OrganizationUnitsModule } from './organization-units/organization-units.module';
import { ValueStreamsModule } from './value-streams/value-streams.module';

@Module({
  imports: [
    DbModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      // Emit the SDL to a committed file: reviewable in PRs and the anchor for
      // future GraphQL Codegen (see docs/IDEAS.md). sortSchema keeps diffs stable.
      // In production the schema is built in memory: the container runs as an
      // unprivileged user on a read-only app directory.
      autoSchemaFile: config.isProduction ? true : 'schema.gql',
      sortSchema: true,
      playground: false,
      // Both are development tools; neither is exposed by a production build.
      graphiql: config.graphiql,
      introspection: config.graphiql,
      // The guard and the auth resolver need the Express request (session
      // cookie) and response (to set it).
      context: ({ req, res }: { req: unknown; res: unknown }) => ({ req, res }),
    }),
    // Only the sign-in and sign-up mutations opt in (GqlThrottlerGuard); the
    // limit is per client address.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 10 }] }),
    AuthModule,
    AdminModule,
    HealthModule,
    IconsModule,
    EnterprisesModule,
    ArchitectureDomainsModule,
    OrganizationUnitsModule,
    BuildingBlocksModule,
    BusinessCapabilitiesModule,
    BusinessProcessesModule,
    InformationObjectsModule,
    ActorsModule,
    ValueStreamsModule,
    DataExchangeModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: PgErrorFilter }],
})
export class AppModule {}
