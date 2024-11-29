import { clerkClient } from "@clerk/express";
import { User } from "../models/UserModel.js";
import { initialPositions } from "../database/seeds/initialPositions.js";
import utils from "../utils/utils.js";

// no longer used
const createUser = async (userData) => {
  // const { firstName, lastName, email, password } = userData;
  const { firstName, lastName, email, slingId } = userData;

  let user = await User.findOne({ email });

  if (user) {
    throw new Error("User already exists");
  }

  user = new User({
    firstName,
    lastName,
    email,
    slingId,
  });

  // const salt = await bcrypt.genSalt(10);
  // user.password = await bcrypt.hash(password, salt);

  await user.save();
  return user;
};

const findUser = async (email) => {
  let user = await User.findOne({ email });
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
  const response = await clerkClient.users.getUserList();
  return response.data;
}

async function getAllUsersSafeInfo_cl() {
  const response = await clerkClient.users.getUserList();
  return response.data.map((user) => {
    return {
      id: user.id,
      email: user.emailAddresses[0].emailAddress,
      firstName: user.firstName,
      lastName: user.lastName,
      imageUrl: user.imageUrl,
      hasImage: user.hasImage,
      publicMetadata: {
        slingId: user?.publicMetadata?.slingId,
        type: user?.publicMetadata?.type,
      },
    };
  });
}

async function getUserGoogleOAuthToken_cl(userId) {
  console.log("Getting google oauth token for user: ", userId);
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

  const data = response.data[0];
  data.access_token = data.token;

  return data;
}

async function getAllUsersWithTokens_cl() {
  console.log("getAllUsersWithTokens_cl: Fetching all users from Clerk");
  const users = await getAllUsers_cl();
  console.log("getAllUsersWithTokens_cl: Fetched users:", users);

  const usersWithTokens = await Promise.all(
    users.map(async (user) => {
      console.log(
        "getAllUsersWithTokens_cl: Fetching Google OAuth token for user:",
        user.id
      );
      const userTokensResponse = await getUserGoogleOAuthToken_cl(user.id);
      if (!userTokensResponse) {
        console.log(
          "getAllUsersWithTokens_cl: No Google OAuth token found for user:",
          user.id
        );
        return { ...user };
      }
      console.log(
        "getAllUsersWithTokens_cl: Fetched Google OAuth token for user:",
        user.id,
        userTokensResponse
      );
      return { ...user, GoogleAccessToken: userTokensResponse };
    })
  );

  console.log("getAllUsersWithTokens_cl: Users with tokens:", usersWithTokens);
  return usersWithTokens;
}

const addGapiToken = async (email, token) => {
  let user = await findUser(email);
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
  let user = await findUser(email);
  if (!user.gapitoken) {
    return null;
  }
  return user.gapitoken;
};

async function addPositionsToSyncNewUser(userId) {
  console.log("Adding default positions to sync to new user. userId: ", userId);
  try {
    await clerkClient.users.updateUserMetadata(userId, {
      publicMetadata: {
        positionsToSync: initialPositions,
      },
    });
  } catch (err) {
    console.error(
      "Error syncinc initial positions to sync to new user: ",
      err.message
    );
  }
}

async function addBasicPropertiesToNewUser(userId, userEmail) {
  console.log("Adding slingId to new user. userId: ", userId);
  const slingId = utils.getSlingIdByEmail(userEmail);
  try {
    await clerkClient.users.updateUserMetadata(userId, {
      publicMetadata: {
        slingId,
        type: "normal",
        timeZone: 0,
      },
    });
  } catch (err) {
    console.error("Error adding slingId to new user: ", err.message);
  }
}

export default {
  createUser,
  findUser,
  findUser_cl,
  addGapiToken,
  getGapiToken,
  getUserGoogleOAuthToken_cl,
  getAllUsersWithTokens,
  getAllUsersWithTokens_cl,
  getAllUsersSafeInfo_cl,
  addPositionsToSyncNewUser,
  addBasicPropertiesToNewUser,
};
