async function getAllLocations() {
  try {
    const response = await fetch("/api/location/all", {
      method: "GET",
      mode: "cors",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      throw new Error("Response was not ok");
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching locations:", error);
    return [];
  }
}

async function createLocation(name: string) {
  try {
    const response = await fetch("/api/location/new", {
      method: "POST",
      mode: "cors",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      throw new Error("Response was not ok");
    }
    return await response.json();
  } catch (error) {
    console.error("Error creating location:", error);
    return null;
  }
}

async function deleteLocation(id: string) {
  try {
    const response = await fetch(`/api/location/${id}`, {
      method: "DELETE",
      mode: "cors",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      throw new Error("Response was not ok");
    }
    return await response.json();
  } catch (error) {
    console.error("Error deleting location:", error);
    return null;
  }
}

async function updateLocation(
  id: string,
  name: string,
  assignedUsers: string[]
) {
  try {
    const response = await fetch(`/api/location/${id}`, {
      method: "PUT",
      mode: "cors",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, assignedUsers }),
    });
    if (!response.ok) {
      throw new Error("Response was not ok");
    }
    return await response.json();
  } catch (error) {
    console.error("Error updating location:", error);
    return null;
  }
}

const mockUsers = [
  {
    id: "user_1",
    firstName: "Alice",
    lastName: "Smith",
    fullName: "Alice Smith",
    username: "alice.smith",
    hasImage: true,
    imageUrl: "https://randomuser.me/api/portraits/women/1.jpg",
    passkeys: null,
    primaryEmailAddress: {
      id: "email_1",
      emailAddress: "alice@example.com",
      verification: null,
    },
    primaryEmailAddressId: "email_1",
    emailAddresses: [
      {
        id: "email_1",
        emailAddress: "alice@example.com",
        verification: null,
      },
    ],
    hasVerifiedEmailAddress: true,
    primaryPhoneNumber: null,
    primaryPhoneNumberId: null,
    phoneNumbers: null,
    hasVerifiedPhoneNumber: false,
    primaryWeb3WalletId: null,
    primaryWeb3Wallet: null,
    web3Wallets: null,
    externalAccounts: null,
    verifiedExternalAccounts: null,
    unverifiedExternalAccounts: null,
    samlAccounts: null,
    organizationMemberships: null,
    passwordEnabled: true,
    totpEnabled: false,
    twoFactorEnabled: false,
    backupCodeEnabled: false,
    createOrganizationEnabled: true,
    createOrganizationsLimit: 3,
    deleteSelfEnabled: true,
    publicMetadata: { slingId: "sling1", type: "admin" },
    unsafeMetadata: null,
    legalAcceptedAt: new Date("2023-01-01"),
    lastSignInAt: new Date("2024-05-01"),
    createdAt: new Date("2023-01-01"),
    updatedAt: new Date("2024-05-01"),
  },
  {
    id: "user_2",
    firstName: "Bob",
    lastName: "Johnson",
    fullName: "Bob Johnson",
    username: "bob.johnson",
    hasImage: true,
    imageUrl: "https://randomuser.me/api/portraits/men/2.jpg",
    passkeys: null,
    primaryEmailAddress: {
      id: "email_2",
      emailAddress: "bob@example.com",
      verification: null,
    },
    primaryEmailAddressId: "email_2",
    emailAddresses: [
      {
        id: "email_2",
        emailAddress: "bob@example.com",
        verification: null,
      },
    ],
    hasVerifiedEmailAddress: true,
    primaryPhoneNumber: null,
    primaryPhoneNumberId: null,
    phoneNumbers: null,
    hasVerifiedPhoneNumber: false,
    primaryWeb3WalletId: null,
    primaryWeb3Wallet: null,
    web3Wallets: null,
    externalAccounts: null,
    verifiedExternalAccounts: null,
    unverifiedExternalAccounts: null,
    samlAccounts: null,
    organizationMemberships: null,
    passwordEnabled: true,
    totpEnabled: false,
    twoFactorEnabled: false,
    backupCodeEnabled: false,
    createOrganizationEnabled: true,
    createOrganizationsLimit: 3,
    deleteSelfEnabled: true,
    publicMetadata: { slingId: "sling2", type: "normal" },
    unsafeMetadata: null,
    legalAcceptedAt: new Date("2023-02-01"),
    lastSignInAt: new Date("2024-05-02"),
    createdAt: new Date("2023-02-01"),
    updatedAt: new Date("2024-05-02"),
  },
  {
    id: "user_3",
    firstName: "Carol",
    lastName: "Williams",
    fullName: "Carol Williams",
    username: "carol.williams",
    hasImage: false,
    imageUrl: "",
    passkeys: null,
    primaryEmailAddress: {
      id: "email_3",
      emailAddress: "carol@example.com",
      verification: null,
    },
    primaryEmailAddressId: "email_3",
    emailAddresses: [
      {
        id: "email_3",
        emailAddress: "carol@example.com",
        verification: null,
      },
    ],
    hasVerifiedEmailAddress: false,
    primaryPhoneNumber: null,
    primaryPhoneNumberId: null,
    phoneNumbers: null,
    hasVerifiedPhoneNumber: false,
    primaryWeb3WalletId: null,
    primaryWeb3Wallet: null,
    web3Wallets: null,
    externalAccounts: null,
    verifiedExternalAccounts: null,
    unverifiedExternalAccounts: null,
    samlAccounts: null,
    organizationMemberships: null,
    passwordEnabled: true,
    totpEnabled: false,
    twoFactorEnabled: false,
    backupCodeEnabled: false,
    createOrganizationEnabled: false,
    createOrganizationsLimit: 1,
    deleteSelfEnabled: true,
    publicMetadata: { slingId: "sling3", type: "normal" },
    unsafeMetadata: null,
    legalAcceptedAt: new Date("2023-03-01"),
    lastSignInAt: new Date("2024-05-03"),
    createdAt: new Date("2023-03-01"),
    updatedAt: new Date("2024-05-03"),
  },
  {
    id: "user_4",
    firstName: "David",
    lastName: "Brown",
    fullName: "David Brown",
    username: "david.brown",
    hasImage: true,
    imageUrl: "https://randomuser.me/api/portraits/men/4.jpg",
    passkeys: null,
    primaryEmailAddress: {
      id: "email_4",
      emailAddress: "david@example.com",
      verification: null,
    },
    primaryEmailAddressId: "email_4",
    emailAddresses: [
      {
        id: "email_4",
        emailAddress: "david@example.com",
        verification: null,
      },
    ],
    hasVerifiedEmailAddress: true,
    primaryPhoneNumber: null,
    primaryPhoneNumberId: null,
    phoneNumbers: null,
    hasVerifiedPhoneNumber: false,
    primaryWeb3WalletId: null,
    primaryWeb3Wallet: null,
    web3Wallets: null,
    externalAccounts: null,
    verifiedExternalAccounts: null,
    unverifiedExternalAccounts: null,
    samlAccounts: null,
    organizationMemberships: null,
    passwordEnabled: true,
    totpEnabled: false,
    twoFactorEnabled: false,
    backupCodeEnabled: false,
    createOrganizationEnabled: true,
    createOrganizationsLimit: 2,
    deleteSelfEnabled: true,
    publicMetadata: { slingId: "sling4", type: "normal" },
    unsafeMetadata: null,
    legalAcceptedAt: new Date("2023-04-01"),
    lastSignInAt: new Date("2024-05-04"),
    createdAt: new Date("2023-04-01"),
    updatedAt: new Date("2024-05-04"),
  },
  {
    id: "user_5",
    firstName: "Eva",
    lastName: "Davis",
    fullName: "Eva Davis",
    username: "eva.davis",
    hasImage: false,
    imageUrl: "",
    passkeys: null,
    primaryEmailAddress: {
      id: "email_5",
      emailAddress: "eva@example.com",
      verification: null,
    },
    primaryEmailAddressId: "email_5",
    emailAddresses: [
      {
        id: "email_5",
        emailAddress: "eva@example.com",
        verification: null,
      },
    ],
    hasVerifiedEmailAddress: false,
    primaryPhoneNumber: null,
    primaryPhoneNumberId: null,
    phoneNumbers: null,
    hasVerifiedPhoneNumber: false,
    primaryWeb3WalletId: null,
    primaryWeb3Wallet: null,
    web3Wallets: null,
    externalAccounts: null,
    verifiedExternalAccounts: null,
    unverifiedExternalAccounts: null,
    samlAccounts: null,
    organizationMemberships: null,
    passwordEnabled: true,
    totpEnabled: false,
    twoFactorEnabled: false,
    backupCodeEnabled: false,
    createOrganizationEnabled: false,
    createOrganizationsLimit: 1,
    deleteSelfEnabled: true,
    publicMetadata: { slingId: "sling5", type: "admin" },
    unsafeMetadata: null,
    legalAcceptedAt: new Date("2023-05-01"),
    lastSignInAt: new Date("2024-05-05"),
    createdAt: new Date("2023-05-01"),
    updatedAt: new Date("2024-05-05"),
  },
];

export default {
  getAllLocations,
  createLocation,
  deleteLocation,
  updateLocation,
  mockUsers,
};
