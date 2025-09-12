import skillService from "../services/skillService.js";

const getAllSkills = async (req, res) => {
  try {
    const skills = await skillService.getSkills();
    res.status(200).json(skills);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getSkillById = async (req, res) => {
  const skillId = req.params.skillId;
  if (!skillId) {
    return res.status(400).json({ message: "Skill ID is required" });
  }
  try {
    const skill = await skillService.getSkillById(skillId);
    if (!skill) {
      return res.status(404).json({ message: "Skill not found" });
    }
    res.status(200).json(skill);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const createSkill = async (req, res) => {
  const skillData = req.body;
  if (!skillData) {
    return res.status(400).json({ message: "Skill data is required" });
  }
  if (!skillData.name) {
    return res.status(400).json({ message: "Skill name is required" });
  }
  if (
    typeof skillData.name !== "string" ||
    skillData.name.trim().length === 0
  ) {
    return res
      .status(400)
      .json({ message: "Skill name must be a non-empty string" });
  }

  try {
    // Check if skill already exists
    const existingSkill = await skillService.skillExists(skillData.name.trim());
    if (existingSkill) {
      return res
        .status(409)
        .json({ message: "Skill with this name already exists" });
    }

    const skill = await skillService.createSkill({
      name: skillData.name.trim(),
    });
    res.status(201).json(skill);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateSkill = async (req, res) => {
  const skillId = req.params.skillId;
  const skillData = req.body;

  if (!skillId) {
    return res.status(400).json({ message: "Skill ID is required" });
  }
  if (!skillData) {
    return res.status(400).json({ message: "Skill data is required" });
  }
  if (!skillData.name) {
    return res.status(400).json({ message: "Skill name is required" });
  }
  if (
    typeof skillData.name !== "string" ||
    skillData.name.trim().length === 0
  ) {
    return res
      .status(400)
      .json({ message: "Skill name must be a non-empty string" });
  }

  try {
    // Check if another skill with the same name exists
    const existingSkill = await skillService.getSkillByName(
      skillData.name.trim()
    );
    if (existingSkill && existingSkill._id.toString() !== skillId) {
      return res
        .status(409)
        .json({ message: "Skill with this name already exists" });
    }

    const skill = await skillService.updateSkill(skillId, {
      name: skillData.name.trim(),
    });

    if (!skill) {
      return res.status(404).json({ message: "Skill not found" });
    }

    res.status(200).json(skill);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deleteSkill = async (req, res) => {
  const skillId = req.params.skillId;
  if (!skillId) {
    return res.status(400).json({ message: "Skill ID is required" });
  }

  try {
    const skill = await skillService.deleteSkill(skillId);
    if (!skill) {
      return res.status(404).json({ message: "Skill not found" });
    }
    res.status(200).json({ message: "Skill deleted successfully" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export default {
  getAllSkills,
  getSkillById,
  createSkill,
  updateSkill,
  deleteSkill,
};
