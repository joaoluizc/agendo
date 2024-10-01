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
    { expiresIn: '8h' },
    (err, token) => {
      if (err) throw err;
      console.log('JWT token created:', token);
      res.cookie('jwt', token, { maxAge: 4 * 60 * 60 * 1000, httpOnly: true });
      console.log('JWT token set as cookie. Redirecting to frontend:', process.env.REDIRECT_FRONTEND);
      return res.redirect(process.env.REDIRECT_FRONTEND);
    }
  );
};