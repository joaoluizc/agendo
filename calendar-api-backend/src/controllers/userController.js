import userService from '../services/userService.js'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

const registerUser = async (req, res) => {
  const {name, email, password, } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({message: "name, email, and password are required fields"});
  }
  try {
    console.log({ name, email, password});
    const user = await userService.createUser(req.body);
    res.status(201).json(user);
  } catch (err) {
    console.error(err.message);
    res.status(400).json({ msg: err.message });
  }
};

const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await userService.findUser(email);
    if (!user) {
      return res.status(400).json({ msg: 'Invalid credentials. Email not found.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid credentials. Wrong password.' });
    }

    const payload = {
      user: {
        id: user.id
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '4h' },
      (err, token) => {
        if (err) throw err;
        res.json({ token });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).json({message: `caught error: ${err.message}`});
  }
};

export default {
  registerUser,
  loginUser,
};
