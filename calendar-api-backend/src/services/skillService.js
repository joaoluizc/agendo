// services/skillService.js
import { Skill } from "../models/SkillModel.js";

const createSkill = async (data) => {
  const { name } = data;
  const skill = new Skill({
    name,
  });
  await skill.save();
  return skill;
};

const getSkills = async () => {
  const skills = await Skill.find().sort({ name: 1 });
  return skills;
};

const getSkillById = async (id) => {
  const skill = await Skill.findById(id);
  return skill;
};

const getSkillByName = async (name) => {
  const skill = await Skill.findOne({ name });
  return skill;
};

const updateSkill = async (id, data) => {
  const skill = await Skill.findById(id);
  if (!skill) {
    return null;
  }
  const { name } = data;
  skill.name = name;
  await skill.save();
  return skill;
};

const deleteSkill = async (id) => {
  const skill = await Skill.findByIdAndDelete(id);
  return skill;
};

const skillExists = async (name) => {
  const skill = await Skill.findOne({ name });
  return !!skill;
};

export default {
  createSkill,
  getSkills,
  getSkillById,
  getSkillByName,
  updateSkill,
  deleteSkill,
  skillExists,
};
