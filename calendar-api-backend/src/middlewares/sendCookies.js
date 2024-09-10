import jwt from 'jsonwebtoken';
import process from 'process';

export const sendCookies = (req, res) => {
  const { email } = req.body;

  const payload = {
    user: {
      email,
    }
  };

  jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: '4h' },
    (err, token) => {
      if (err) throw err;
      res.cookie('jwt', token, { maxAge: 4 * 60 * 60 * 1000, httpOnly: true });
      res.json({}).send('Logged in');
    }
  );
};