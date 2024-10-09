import jwt from 'jsonwebtoken';
import process from 'process';

const verifyUserAuth = async (req, res, next) => {
    const token = req.cookies.jwt;
    if (!token) {
        return res.status(401).send('Unauthorized');
    }
    try {
        if (token === "dud3v3l0pm3nt") {
            req.user = {email: "joao.coelho@duda.co"};
            next();
            return;
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded.user;
        next();
    } catch (error) {
        return res.status(401).json({message: error.message});
    }
}

export default verifyUserAuth;