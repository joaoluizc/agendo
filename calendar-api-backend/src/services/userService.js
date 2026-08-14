import { clerkClient } from "@clerk/express";
import { User } from "../models/UserModel.js";
import redisClient from "../database/redisClient.js";

// Returns { user, created } so callers can tell an actual insert apart from a
// no-op on an already-existing user (the clerk webhook logs which one happened).
const createUser = async (userData) => {
  // const { firstName, lastName, email, password } = userData;
  const { firstName, lastName, email, slingId, clerkId } = userData;

  let user = await User.findOne({ email });

  if (user) {
    return { user, created: false };
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
  return { user, created: true };
};

const findUserByEmail = async (email) => {
  let user = await User.findOne({ email });
  return user;
};

const findAllUsers = async () => {
  // Sorted so the roster order is stable. Clerk's getUserList (the previous source for
  // /user/all) returned newest-first; Mongo's natural order is insertion order, so
  // without this the schedule grid would silently reorder.
  let users = await User.find().sort({ firstName: 1, lastName: 1 });
  return users;
};

const findUserByClerkId = async (clerkId) => {
  let user = await User.findOne({ clerkId });
  return user;
};

const findUsersByClerkIds = async (clerkIds) => {
  let users = await User.find({ clerkId: { $in: clerkIds } });
  return users;
};

const getClerkUserById = async (userId) => {
  const user = await clerkClient.users.getUser(userId);
  return user;
};

const getSlingIdByClerkId = async (clerkId) => {
  const user = await User.findOne({ clerkId });
  console.log(`getSlingIdByClerkId: Found user for clerkId ${clerkId}:`, {
    email: user?.email,
    slingId: user?.slingId,
  });
  return user?.slingId;
};

async function getAllClerkUsers() {
  const response = await clerkClient.users.getUserList({ limit: 100 });
  return response.data;
}

/**
 * The user roster. Mongo is authoritative for identity and business data; Clerk is
 * joined in for avatars only, because `imageUrl`/`hasImage` have no Mongo equivalent.
 * See docs/knowledge/clerk-mongo-boundary.md.
 *
 * `id` is the CLERK id, not the Mongo _id. Consumers depend on that: the frontend
 * joins this against `useUser().id` to highlight the viewer's own row, and passes it
 * to endpoints that resolve users by Clerk id. Do not "fix" it to `_id`.
 *
 * Rows are driven by Mongo, so a Clerk account with no Mongo document does not appear.
 * That is intentional — such a user has no schedule, positions or type to show.
 */
async function getAllUsersSafeInfo() {
  const mongoUsers = await findAllUsers();

  // One Clerk call for the whole roster rather than one per user.
  const avatarsByClerkId = new Map();
  try {
    const response = await clerkClient.users.getUserList({ limit: 500 });
    for (const clerkUser of response.data) {
      avatarsByClerkId.set(clerkUser.id, {
        imageUrl: clerkUser.imageUrl || "",
        hasImage: clerkUser.hasImage || false,
      });
    }
  } catch (err) {
    // Avatars are cosmetic - never fail the roster over them.
    console.error(`could not load clerk avatars: ${err.message}`);
  }

  return mongoUsers.map((user) => {
    const avatar = avatarsByClerkId.get(user.clerkId);
    return {
      id: user.clerkId,
      email: user.email || "",
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      imageUrl: avatar?.imageUrl || "",
      hasImage: avatar?.hasImage || false,
      slingId: user.slingId || "",
      type: user.type || "normal",
    };
  });
}

async function getGoogleOAuthTokenByClerkId(userId) {
  const provider = "oauth_google";
  let response;
  try {
    response = await clerkClient.users.getUserOauthAccessToken(
      userId,
      provider,
    );
  } catch (e) {
    console.error("Error getting google oauth token: ", JSON.stringify(e));
    return null;
  }

  const data = response?.data[0];
  data ? (data.access_token = data?.token) : "";

  return data;
}

async function getUsersWithGoogleTokens() {
  const cacheKey = "clerk:users:withTokens";
  // Try to get from cache
  const cached = await redisClient.get(cacheKey);
  if (cached) {
    console.log("getUsersWithGoogleTokens: Returning cached data");
    return JSON.parse(cached);
  }

  const users = await getAllClerkUsers();

  const usersWithTokens = await Promise.all(
    users.map(async (user) => {
      const userTokensResponse = await getGoogleOAuthTokenByClerkId(user.id);
      if (!userTokensResponse) {
        console.log(
          "getUsersWithGoogleTokens: No Google OAuth token found for user:",
          user.id,
        );
        return { ...user };
      }
      return {
        ...user,
        GoogleAccessToken: userTokensResponse,
        slingId: await getSlingIdByClerkId(user.id),
      };
    }),
  );

  // Cache result for 10 minutes
  await redisClient.set(cacheKey, JSON.stringify(usersWithTokens), {
    EX: 10 * 60,
    NX: true,
  });
  console.log("getUsersWithGoogleTokens: Cached data for 10 minutes");

  return usersWithTokens;
}

const getGapiToken = async (email) => {
  let user = await findUserByEmail(email);
  if (!user.gapitoken) {
    return null;
  }
  return user.gapitoken;
};

export default {
  createUser,
  findUser: findUserByEmail,
  findUserByClerkId,
  findUsersByClerkIds,
  getSlingIdByClerkId,
  getGapiToken,
  getAllUsersSafeInfo,
  // Clerk-backed. These are the only functions that may talk to Clerk.
  getClerkUserById,
  getGoogleOAuthTokenByClerkId,
  getUsersWithGoogleTokens,
};
