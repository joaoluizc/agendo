import jwt from 'jsonwebtoken';

const verifyUserAuthentication = async (req, res, next) => {
    const token = req.cookies.jwt;
    console.log('verifyUserAuthentication token:', token);
    if (!token) {
        return res.status(401).send('Unauthorized');
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({message: error.message});
    }
}

export default verifyUserAuthentication;