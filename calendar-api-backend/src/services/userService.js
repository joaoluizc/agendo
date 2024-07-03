import { User } from '../models/UserModel.js'
import bcrypt from 'bcrypt'

const createUser = async (userData) => {
  const { name, email, password } = userData;
  
  let user = await User.findOne({ email });

  if (user) {
    throw new Error('User already exists');
  }

  user = new User({
    name,
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

const addGapiToken = async (email, token) => {
  let user = await findUser(email);
  user.gapitoken = token;
  await user.save();
}

export default {
  createUser,
  findUser,
  addGapiToken,
};
