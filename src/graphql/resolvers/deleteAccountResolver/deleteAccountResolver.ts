import User from "../../../models/User.js";
import Interaction from "../../../models/Interaction.js";
import { type Context, requireUser } from "../../context.js";

export const deleteAccountResolver = async (
  _: never,
  __: never,
  context: Context,
) => {
  const userId = requireUser(context)._id;

  await Interaction.deleteMany({ userId });
  await User.findByIdAndDelete(userId);

  return {
    success: true,
  };
};
