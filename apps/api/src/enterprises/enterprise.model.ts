import { Field, InputType, ObjectType, registerEnumType } from '@nestjs/graphql';

// A member's role inside an enterprise (D-20): a fixed bundle of permissions
// from apps/api/src/auth/policy.ts.
export enum EnterpriseRole {
  OWNER = 'owner',
  EDITOR = 'editor',
  VIEWER = 'viewer',
}

registerEnumType(EnterpriseRole, {
  name: 'EnterpriseRole',
  description:
    'owner: everything, including members and deletion. editor: models the enterprise. viewer: reads it.',
});

// The scope of an architecture effort: one or more organizations (or parts
// of them) pursuing a shared goal. Every modeled entity belongs to exactly
// one enterprise — see docs/VISION.md.
@ObjectType()
export class Enterprise {
  @Field() id!: string;
  @Field() name!: string;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field(() => String, { nullable: true }) goal?: string | null;
  @Field(() => String, { nullable: true }) avatarBgColor?: string | null;
  @Field(() => String, { nullable: true }) avatarTextColor?: string | null;
  // The caller's role and effective permissions; what the web uses to show
  // or hide actions. Resolved per request, never stored on the row.
  @Field(() => EnterpriseRole, { nullable: true }) myRole?: EnterpriseRole | null;
  @Field(() => [String]) myPermissions?: string[];
}

// An account as an owner sees it when choosing whom to let in: enough to
// pick the right person, nothing more.
@ObjectType()
export class AccountSummary {
  @Field() id!: string;
  @Field() email!: string;
  @Field() displayName!: string;
}

// A user with access to an enterprise, and as what (INV-16, D-20).
@ObjectType()
export class EnterpriseMember {
  @Field() userId!: string;
  @Field() email!: string;
  @Field() displayName!: string;
  @Field(() => EnterpriseRole) role!: EnterpriseRole;
}

@InputType()
export class EnterpriseInput {
  @Field() name!: string;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field(() => String, { nullable: true }) goal?: string | null;
  @Field(() => String, { nullable: true }) avatarBgColor?: string | null;
  @Field(() => String, { nullable: true }) avatarTextColor?: string | null;
}
