import userService from "../services/userService.js";

export async function userIsAdmin(userId) {
  const user = await userService.findUser_cl(userId);
  return user.publicMetadata.type === "admin";
}
