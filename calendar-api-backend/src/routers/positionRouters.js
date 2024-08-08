import express from 'express';
import positionController from '../controllers/positionController.js';

const positionRouter = express.Router();

positionRouter.get('/', (req, res) => {
    res.status(200).json({message: 'position router working'});
});

positionRouter.get('/:userId', (req, res) => {
    positionController.getUserPositionsToSync(req, res);
});

positionRouter.post('/', (req, res) => {
    positionController.createPosition(req, res);
});

export default positionRouter;