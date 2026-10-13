import { Field, InputType, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum InstanceRole {
  ADMIN = 'admin',
  USER = 'user',
}

registerEnumType(InstanceRole, {
  name: 'InstanceRole',
  description:
    'Instance-level role: admin (manages accounts, sign-up and access to enterprises), user (everything else).',
});

@ObjectType()
export class User {
  @Field() id!: string;
  @Field() email!: string;
  @Field() displayName!: string;
  @Field(() => InstanceRole) instanceRole!: InstanceRole;
}

// What the sign-in page needs before anyone is signed in.
@ObjectType()
export class AuthStatus {
  // True when AUTH_ALLOW_SIGNUP is set or no account exists yet.
  @Field() signUpAllowed!: boolean;
  // Instance branding (D-23). Null means the product's own name and mark.
  // Each image, when uploaded, is GET /api/branding/<slot>?v=<version>.
  @Field(() => String, { nullable: true }) instanceName!: string | null;
  @Field(() => String, { nullable: true }) logoVersion!: string | null;
  @Field(() => String, { nullable: true }) logoDarkVersion!: string | null;
  @Field(() => String, { nullable: true }) iconVersion!: string | null;
}

// The browser relies on the httpOnly cookie set alongside this payload; the
// token is here for scripts that call the API with a bearer header instead.
@ObjectType()
export class AuthPayload {
  @Field(() => User) user!: User;
  @Field() token!: string;
  @Field() expiresAt!: string;
}

@InputType()
export class SignUpInput {
  @Field() email!: string;
  @Field() displayName!: string;
  @Field() password!: string;
}

@InputType()
export class SignInInput {
  @Field() email!: string;
  @Field() password!: string;
}

export enum SetupTokenPurpose {
  SETUP = 'setup',
  RESET = 'reset',
}

registerEnumType(SetupTokenPurpose, {
  name: 'SetupTokenPurpose',
  description: 'Why a setup link was issued: setup (new account), reset (replace a password).',
});

// What the setup page learns from a link before asking for a password.
@ObjectType()
export class SetupTokenStatus {
  @Field() valid!: boolean;
  @Field(() => SetupTokenPurpose, { nullable: true }) purpose?: SetupTokenPurpose | null;
  @Field(() => String, { nullable: true }) email?: string | null;
  @Field(() => String, { nullable: true }) displayName?: string | null;
}

@InputType()
export class CompletePasswordSetupInput {
  @Field() token!: string;
  @Field() password!: string;
}

@InputType()
export class ChangePasswordInput {
  @Field() currentPassword!: string;
  @Field() newPassword!: string;
}
