import jwt from 'jsonwebtoken';

const verifyUserAuthentication = async (req, res, next) => {
    const token = req.cookies.jwt;
    if (!token) {
        return res.status(401).send('Unauthorized');
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded.user;
        next();
    } catch (error) {
        return res.status(401).json({message: error.message});
    }
}

export default verifyUserAuthentication;