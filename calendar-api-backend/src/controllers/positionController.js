import positionService from '../services/positionService.js';
import userService from '../services/userService.js';

const getAllPositions = async (req, res) => {
    try {
        const positions = await positionService.getPositions();
        res.status(200).json(positions);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const createPosition = async (req, res) => {
    const positionData = req.body;
    if (!positionData) {
        return res.status(400).json({ message: 'Position data is required' });
    }
    if (!positionData.name) {
        return res.status(400).json({ message: 'Position name is required' });
    }
    if (!positionData.color) {
        return res.status(400).json({ message: 'Position color is required' });
    }
    try {
        const position = await positionService.createPosition(positionData);
        res.status(201).json(position);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const getUserPositionsToSync = async (req, res) => {
    const user = await userService.findUser(req.user.email);
    const userId = user.id;
    console.log('userId: ', userId);
    try {
        const positions = await positionService.getUserPositionsToSync(userId);
        res.status(200).json(positions);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const setUserPositionsToSync = async (req, res) => {
    const user = await userService.findUser(req.user.email);
    const userId = user.id;
    const positions = req.body;
    if (!positions) {
        return res.status(400).json({ message: 'Positions are required' });
    }
    try {
        await positionService.setUserPositionsToSync(userId, positions);
        res.status(200).json({ message: 'Positions updated' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export default {
    createPosition,
    getUserPositionsToSync,
    getAllPositions,
    setUserPositionsToSync,
};