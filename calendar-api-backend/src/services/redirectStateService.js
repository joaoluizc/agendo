import { v4 as uuidv4 } from 'uuid';
import RedirectState from '../models/RedirectStateModel.js';

const createState = async (email) => {
    const state = uuidv4();
    const redirectState = new RedirectState({ state, userEmail: email });
    await redirectState.save();
    return state;
};

const findState = async (state) => {
    const foundState = await RedirectState.findOne({ state });
    console.log(`findState: ${foundState}`);
    return foundState;
};

const removeState = async (state) => {
    const foundState = await RedirectState.findOneAndDelete({ state });
    if (foundState) {
        return true;
    }
    return false;
};

export default { createState, findState, removeState };