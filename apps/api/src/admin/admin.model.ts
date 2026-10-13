import { Field, InputType, ObjectType } from '@nestjs/graphql';
import { InstanceRole, SetupTokenPurpose } from '../auth/auth.model';
import { EnterpriseRole } from '../enterprises/enterprise.model';

// An account as the instance admin sees it.
@ObjectType()
export class AdminUser {
  @Field() id!: string;
  @Field() email!: string;
  @Field() displayName!: string;
  @Field(() => InstanceRole) instanceRole!: InstanceRole;
  @Field(() => String, { nullable: true }) disabledAt?: string | null;
  @Field() createdAt!: string;
  // False until the person has used their setup link.
  @Field() hasPassword!: boolean;
  // When the newest unused setup link runs out, if there is one.
  @Field(() => String, { nullable: true }) setupLinkExpiresAt?: string | null;
  @Field(() => [AdminUserMembership]) memberships!: AdminUserMembership[];
}

// A freshly issued setup link. The token is shown once; the web builds the
// URL from it. Nobody, the admin included, learns the password.
@ObjectType()
export class SetupLink {
  @Field(() => AdminUser) user!: AdminUser;
  @Field() token!: string;
  @Field() expiresAt!: string;
  @Field(() => SetupTokenPurpose) purpose!: SetupTokenPurpose;
}

@ObjectType()
export class AdminUserMembership {
  @Field() enterpriseId!: string;
  @Field() enterpriseName!: string;
  @Field(() => EnterpriseRole) role!: EnterpriseRole;
}

@InputType()
export class MembershipInput {
  @Field() enterpriseId!: string;
  @Field(() => EnterpriseRole, { nullable: true }) role?: EnterpriseRole | null;
}

@ObjectType()
export class InstanceSettings {
  @Field() signUpOpen!: boolean;
  // Instance branding (D-23); null is the product's own name, a null
  // version an empty image slot.
  @Field(() => String, { nullable: true }) name!: string | null;
  @Field(() => String, { nullable: true }) logoVersion!: string | null;
  @Field(() => String, { nullable: true }) logoDarkVersion!: string | null;
  @Field(() => String, { nullable: true }) iconVersion!: string | null;
}

// Every field is optional: only what is sent changes. `name: null` clears
// the instance name; leaving it out keeps it.
@InputType()
export class InstanceSettingsInput {
  @Field(() => Boolean, { nullable: true }) signUpOpen?: boolean | null;
  @Field(() => String, { nullable: true }) name?: string | null;
}

// No password: the account gets one through its setup link (D-19).
@InputType()
export class CreateUserInput {
  @Field() email!: string;
  @Field() displayName!: string;
  @Field(() => InstanceRole, { nullable: true }) instanceRole?: InstanceRole | null;
  // Enterprises the new account is a member of from the start (editor unless
  // a role is given), so creating someone and letting them in is one step.
  @Field(() => [MembershipInput], { nullable: true }) memberships?: MembershipInput[] | null;
}
