import { clerkClient } from "@clerk/express";
import { User } from "../models/UserModel.js";
import redisClient from "../database/redisClient.js";
import { defaultPermissions } from "../permissions/evaluate.js";

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
    // A new user starts with the registry's defaults (permissions/registry.js), stamped
    // so it's clear nobody granted them by hand.
    permissions: defaultPermissions(),
    permissionsUpdatedAt: new Date(),
    permissionsUpdatedBy: "provisioning",
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

/**
 * Is this a zone the runtime can actually format a time in?
 *
 * Asked of `Intl.DateTimeFormat` directly rather than checked against
 * `Intl.supportedValuesOf("timeZone")`, which looks like the obvious list and is the
 * wrong one: it returns *canonical* zone names and omits `"UTC"`. Every agendo user
 * currently holds exactly `"UTC"`, so validating against that list rejects the entire
 * roster — a save of an unmodified profile would fail. Caught by a round-trip test that
 * could not restore the value it had just read.
 *
 * The question that matters is the one this answers: will rendering a time in this zone
 * throw later, somewhere far from here? `Intl` accepts "UTC", "America/Sao_Paulo" and
 * "Etc/GMT+3", and rejects "Mars/Olympus" and "UTC+3".
 */
export function isValidTimezone(zone) {
  if (typeof zone !== "string" || !zone.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Store an agent's timezone.
 *
 * The field existed on the schema from early on but nothing ever wrote it — the web UI
 * read the browser's zone instead, so all 18 production users sat on the default "UTC"
 * while the app happily rendered local times anyway. That worked until a client with no
 * browser arrived: agendo's MCP server has only this field to go on, and had to label
 * every time "UTC" because that is genuinely what it was told.
 *
 * So this writes the stored value, deliberately, rather than inferring one. A detected
 * zone is a good default to *offer*; it is not a substitute for a recorded answer.
 */
const setUserTimezone = async (clerkId, timezone) => {
  if (!isValidTimezone(timezone)) {
    const err = new Error(`"${timezone}" is not a known IANA timezone`);
    err.code = "INVALID_TIMEZONE";
    throw err;
  }
  const user = await User.findOneAndUpdate(
    { clerkId },
    { $set: { timezone } },
    { new: true },
  );
  if (!user) throw new Error("User not found");
  return { clerkId, timezone: user.timezone };
};

const findAllUsers = async () => {
  // Sorted so the roster order is stable. Clerk's getUserList (the previous source for
  // /user/all) returned newest-first; Mongo's natural order is insertion order, so
  // without this the schedule grid would silently reorder.
  //
  // `preferences` is `select: false` on the schema, so it has to be asked for by name.
  // This loader only feeds the roster (getAllUsersSafeInfo), and userController.getAllUsers
  // drops the field for non-admins along with the other admin-only fields.
  let users = await User.find()
    .select("+preferences")
    .sort({ firstName: 1, lastName: 1 });
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
      // Shown and editable in Settings -> Users; an admin has to be able to fix a wrong
      // zone without chasing the person.
      timezone: user.timezone || "UTC",
      preferences: user.preferences || "",
      preferencesUpdatedAt: user.preferencesUpdatedAt || null,
      preferencesUpdatedBy: user.preferencesUpdatedBy || null,
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

/**
 * Write one agent's manager-only scheduling preferences (HTML), stamped with who saved
 * them and when. Admin-gated at the route. Last write wins: two managers editing the same
 * agent at once overwrite each other, which is acceptable for a short note.
 */
const setUserPreferences = async (clerkId, preferences, updatedBy) => {
  const user = await findUserByClerkId(clerkId);
  if (!user) {
    throw new Error("User not found");
  }
  user.preferences = preferences;
  user.preferencesUpdatedAt = new Date();
  user.preferencesUpdatedBy = updatedBy;
  await user.save();
  return {
    preferences: user.preferences,
    preferencesUpdatedAt: user.preferencesUpdatedAt,
    preferencesUpdatedBy: user.preferencesUpdatedBy,
  };
};

const getGapiToken = async (email) => {
  let user = await findUserByEmail(email);
  if (!user.gapitoken) {
    return null;
  }
  return user.gapitoken;
};

export default {
  createUser,
  setUserTimezone,
  isValidTimezone,
  findUser: findUserByEmail,
  findAllUsers,
  findUserByClerkId,
  findUsersByClerkIds,
  getSlingIdByClerkId,
  getGapiToken,
  getAllUsersSafeInfo,
  setUserPreferences,
  // Clerk-backed. These are the only functions that may talk to Clerk.
  getClerkUserById,
  getGoogleOAuthTokenByClerkId,
  getUsersWithGoogleTokens,
};
