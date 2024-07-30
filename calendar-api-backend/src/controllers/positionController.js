import positionService from '../services/positionService.js';

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

export default {
    createPosition,
};