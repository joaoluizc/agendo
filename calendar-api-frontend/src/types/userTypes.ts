export type UserSafeInfo = {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    imageUrl: string;
    hasImage: boolean;
    publicMedata: {
        slingId: string;
        type: string;
    };
};

export type User = {
    id: string;
    firstName: string | null;
    lastName: string | null;
    fullName: string | null;
    username: string | null;
    hasImage: boolean;
    imageUrl: string;
    passkeys: unknown | null;
    primaryEmailAddress: EmailAddress | null;
    primaryEmailAddressId: string | null;
    emailAddresses: EmailAddress[];
    hasVerifiedEmailAddress: boolean;
    primaryPhoneNumber: unknown | null;
    primaryPhoneNumberId: string | null;
    phoneNumbers: unknown;
    hasVerifiedPhoneNumber: boolean;
    primaryWeb3WalletId: string | null;
    primaryWeb3Wallet: unknown | null;
    web3Wallets: unknown;
    externalAccounts: unknown;
    verifiedExternalAccounts: unknown;
    unverifiedExternalAccounts: unknown;
    samlAccounts: unknown;
    organizationMemberships: unknown;
    passwordEnabled: boolean;
    totpEnabled: boolean;
    twoFactorEnabled: boolean;
    backupCodeEnabled: boolean;
    createOrganizationEnabled: boolean;
    createOrganizationsLimit?: number | null;
    deleteSelfEnabled: boolean;
    publicMetadata: { [key: string]: unknown } | null;
    unsafeMetadata: { [key: string]: unknown } | null;
    legalAcceptedAt: Date | null;
    lastSignInAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };

  type EmailAddress = {
    id: string;
    emailAddress: string;
    verification: unknown;
  };