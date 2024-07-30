import express from 'express';
import positionController from 'src/controllers/positionController.js';

const positionRouter = express.Router();

positionRouter.get('/', (req, res) => {
    res.status(200).json({message: 'position router working'});
});

positionRouter.post('/', (req, res) => {
    positionController.createPosition(req, res);
});

export default positionRouter;