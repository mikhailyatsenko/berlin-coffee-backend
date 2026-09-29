import User from "../../../models/User.js";
import Interaction from "../../../models/Interaction.js";
import { requireUser } from "../../context.js";
import type { MutationResolvers } from "../../generated/types.js";

export const deleteAccountResolver: MutationResolvers["deleteAccount"] = async (
  _parent,
  _args,
  context,
) => {
  const userId = requireUser(context)._id;

  await Interaction.deleteMany({ userId });
  await User.findByIdAndDelete(userId);

  return {
    success: true,
  };
};
