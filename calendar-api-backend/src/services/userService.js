import { clerkClient } from "@clerk/express";
import { User } from "../models/UserModel.js";
import { initialPositions } from "../database/seeds/initialPositions.js";
import redisClient from "../database/redisClient.js";

const createUser = async (userData) => {
  // const { firstName, lastName, email, password } = userData;
  const { firstName, lastName, email, slingId, clerkId } = userData;

  let user = await User.findOne({ email });

  if (user) {
    return user;
  }

  user = new User({
    firstName,
    lastName,
    email,
    slingId,
    clerkId,
  });

  // const salt = await bcrypt.genSalt(10);
  // user.password = await bcrypt.hash(password, salt);

  await user.save();
  return user;
};

const findUserByEmail = async (email) => {
  let user = await User.findOne({ email });
  return user;
};

const findAllUsers = async () => {
  let users = await User.find();
  return users;
};

const findUserByClerkId = async (clerkId) => {
  let user = await User.findOne({ clerkId });
  return user;
};

const findUser_cl = async (userId) => {
  const user = await clerkClient.users.getUser(userId);
  return user;
};

const getAllUsersWithTokens = async () => {
  const users = await User.find();
  return users
    .filter((user) => user.gapitoken)
    .map((user) => ({
      email: user.email,
      id: user.id,
      tokens: user.gapitoken,
      slingId: user.slingId,
      positionsToSync: user.positionsToSync,
    }));
};

async function getAllUsers_cl() {
  const response = await clerkClient.users.getUserList({ limit: 100 });
  return response.data;
}

async function getAllUsersSafeInfo_cl() {
  const response = await clerkClient.users.getUserList({ limit: 100 });
  return response.data.map((user) => {
    return {
      id: user.id,
      email: user.emailAddresses?.[0]?.emailAddress || "",
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      imageUrl: user.imageUrl || "",
      hasImage: user.hasImage || false,
      publicMetadata: {
        slingId: user.publicMetadata?.slingId || "",
        type: user.publicMetadata?.type || "",
        positionsToSync:
          user.publicMetadata?.positionsToSync || initialPositions,
      },
    };
  });
}

async function getUserGoogleOAuthToken_cl(userId) {
  const provider = "oauth_google";
  let response;
  try {
    response = await clerkClient.users.getUserOauthAccessToken(
      userId,
      provider
    );
  } catch (e) {
    console.error("Error getting google oauth token: ", JSON.stringify(e));
    return null;
  }

  const data = response?.data[0];
  data ? (data.access_token = data?.token) : "";

  return data;
}

async function getAllUsersWithTokens_cl() {
  const cacheKey = "clerk:users:withTokens";
  // Try to get from cache
  const cached = await redisClient.get(cacheKey);
  if (cached) {
    console.log("getAllUsersWithTokens_cl: Returning cached data");
    return JSON.parse(cached);
  }

  console.log("getAllUsersWithTokens_cl: Fetching all users from Clerk");
  const users = await getAllUsers_cl();

  const usersWithTokens = await Promise.all(
    users.map(async (user) => {
      const userTokensResponse = await getUserGoogleOAuthToken_cl(user.id);
      if (!userTokensResponse) {
        console.log(
          "getAllUsersWithTokens_cl: No Google OAuth token found for user:",
          user.id
        );
        return { ...user };
      }
      return { ...user, GoogleAccessToken: userTokensResponse };
    })
  );

  // Cache result for 15 minutes
  await redisClient.set(cacheKey, JSON.stringify(usersWithTokens), "EX", 900);
  console.log("getAllUsersWithTokens_cl: Cached data for 15 minutes");

  return usersWithTokens;
}

const addGapiToken = async (email, token) => {
  let user = await findUserByEmail(email);
  if (!user) {
    throw new Error("User not found");
  }

  const gapitokenKeys = [
    "access_token",
    "refresh_token",
    "scope",
    "token_type",
    "expiry_date",
  ];
  const userTokens = gapitokenKeys.reduce((acc, key) => {
    acc[key] = key in token ? token[key] : user.gapitoken[key];
    if (!token[key] && !user.gapitoken[key]) {
      throw new Error("Token not found");
    }
    return acc;
  }, {});

  user.gapitoken = userTokens;
  await user.save();
};

const getGapiToken = async (email) => {
  let user = await findUserByEmail(email);
  if (!user.gapitoken) {
    return null;
  }
  return user.gapitoken;
};

// async function addPositionsToSyncNewUser(userId) {
//   console.log("Adding default positions to sync to new user. userId: ", userId);
//   try {
//     await clerkClient.users.updateUserMetadata(userId, {
//       publicMetadata: {
//         positionsToSync: initialPositions,
//       },
//     });
//   } catch (err) {
//     console.error(
//       "Error syncinc initial positions to sync to new user: ",
//       err.message
//     );
//   }
// }

// async function addBasicPropertiesToNewUser(userId, userEmail) {
//   console.log("Adding slingId to new user. userId: ", userId);
//   const slingId = utils.getSlingIdByEmail(userEmail);
//   try {
//     await clerkClient.users.updateUserMetadata(userId, {
//       publicMetadata: {
//         slingId,
//         type: "normal",
//         timeZone: 0,
//       },
//     });
//   } catch (err) {
//     console.error("Error adding slingId to new user: ", err.message);
//   }
// }

const addClerkIdToAllUsers = async (_req, res) => {
  try {
    const mongoUsers = await findAllUsers();
    const clerkUsers = await getAllUsersSafeInfo_cl();
    const clerkUsersMap = new Map(
      clerkUsers.map((user) => [user.email, user.id])
    );

    for (const user of mongoUsers) {
      if (!user.clerkId && clerkUsersMap.has(user.email)) {
        const result = await User.updateOne(
          { email: user.email },
          { $set: { clerkId: clerkUsersMap.get(user.email) } }
        );
        console.log(`Mongo update result for ${user.email}:`, result);
        console.log(
          `Added Clerk ID for user: ${user.email} - ${clerkUsersMap.get(
            user.email
          )}`
        );
      }
    }
    console.log("Clerk IDs added to all users");
  } catch (err) {
    console.error("Error adding Clerk IDs to users:", err.message);
    throw err;
  }
  return res.status(200).json({
    message: "Clerk IDs added to all users successfully",
  });
};

async function addNewClerkUsersToMongo(_req, res) {
  try {
    const mongoUsers = await findAllUsers();
    const clerkUsers = await getAllUsersSafeInfo_cl();

    const newClerkUsers = clerkUsers
      .filter(
        (clerkUser) =>
          !mongoUsers.some((mongoUser) => mongoUser.email === clerkUser.email)
      )
      .map((clerkUser) => ({
        firstName: clerkUser.firstName || "",
        lastName: clerkUser.lastName || "",
        email: clerkUser.email,
        slingId: clerkUser.publicMetadata?.slingId || "",
        positionsToSync:
          clerkUser.publicMetadata?.positionsToSync || initialPositions,
        type: clerkUser.publicMetadata?.type || "normal",
        clerkId: clerkUser.id,
      }));

    if (newClerkUsers.length === 0) {
      console.log("No new Clerk users to add to MongoDB.");
      return;
    }

    await User.insertMany(newClerkUsers);
    console.log(
      "New Clerk users added to MongoDB:",
      newClerkUsers.map((u) => u.email)
    );
  } catch (err) {
    console.error("Error adding new Clerk users to MongoDB:", err.message);
    throw err;
  }
  return res.status(200).json({
    message: "New Clerk users added to MongoDB successfully",
  });
}

async function updatePositionsToSyncOnMongoUsers() {
  try {
    const mongoUsers = await findAllUsers();
    const clerkUsers = await getAllUsersSafeInfo_cl();

    for (const clerkUser of clerkUsers) {
      const mongoUser = mongoUsers.find(
        (user) => user.email === clerkUser.email
      );
      if (mongoUser) {
        const positionsToSync =
          clerkUser.publicMetadata?.positionsToSync || initialPositions;
        await User.updateOne(
          { email: mongoUser.email },
          { $set: { positionsToSync } }
        );
        console.log(`Updated positions to sync for user: ${mongoUser.email}`);
      }
    }
  } catch (err) {
    console.error(
      "Error updating positions to sync on MongoDB users:",
      err.message
    );
    throw err;
  }
}

export default {
  createUser,
  findUser: findUserByEmail,
  findUser_cl,
  findUserByClerkId,
  addGapiToken,
  getGapiToken,
  getUserGoogleOAuthToken_cl,
  getAllUsersWithTokens,
  getAllUsersWithTokens_cl,
  getAllUsersSafeInfo_cl,
  // addPositionsToSyncNewUser,
  // addBasicPropertiesToNewUser,
  addClerkIdToAllUsers,
  addNewClerkUsersToMongo,
  updatePositionsToSyncOnMongoUsers,
};
