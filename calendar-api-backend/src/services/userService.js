import { User } from '../models/UserModel.js'
// import bcrypt from 'bcrypt'

const createUser = async (userData) => {
  // const { firstName, lastName, email, password } = userData;
  const { firstName, lastName, email, slingId } = userData;
  
  let user = await User.findOne({ email });

  if (user) {
    throw new Error('User already exists');
  }

  // user = new User({
  //   firstName,
  //   lastName,
  //   email,
  //   password
  // });
  user = new User({
    firstName,
    lastName,
    email,
    slingId
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

const getAllUsersWithTokens = async () => {
  const users = await User.find();
  return users
    .filter(user => user.gapitoken)
    .map(user => ({
        email: user.email,
        id: user.id,
        tokens: user.gapitoken,
        slingId: user.slingId,
        positionsToSync: user.positionsToSync,
    }));
};

const addGapiToken = async (email, token) => {
  let user = await findUser(email);
  if (!user) {
    throw new Error('User not found');
  }

  const gapitokenKeys = ['access_token', 'refresh_token', 'scope', 'token_type', 'expiry_date'];
  const userTokens = gapitokenKeys.reduce((acc, key) => {
    acc[key] = key in token ? token[key] : user.gapitoken[key];
    return acc;
  }, {});

  user.gapitoken = userTokens;
  await user.save();
}

const getGapiToken = async (email) => {
  let user = await findUser(email);
  if (!user.gapitoken) {
    return null;
  }
  return user.gapitoken;
}

export default {
  createUser,
  findUser,
  addGapiToken,
  getGapiToken,
  getAllUsersWithTokens,
};
