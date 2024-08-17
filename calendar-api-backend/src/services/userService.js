import { User } from '../models/UserModel.js'
import bcrypt from 'bcrypt'

const createUser = async (userData) => {
  const { firstName, lastName, email, password } = userData;
  
  let user = await User.findOne({ email });

  if (user) {
    throw new Error('User already exists');
  }

  user = new User({
    firstName,
    lastName,
    email,
    password
  });

  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(password, salt);

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
        tokens: user.gapitoken,
        slingId: user.slingId
    }));
};

const addGapiToken = async (email, token) => {
  let user = await findUser(email);
  user.gapitoken = token;
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
