import bcrypt from "bcrypt";
import { requireUser } from "../../context.js";
import { badInput, forbidden } from "../../errors.js";
import type { MutationResolvers } from "../../generated/types.js";
import { assertNewPassword } from "../../../utils/validateInput.js";

export const setNewPasswordResolver: MutationResolvers["setNewPassword"] =
  async (_parent, { userId, oldPassword, newPassword }, context) => {
    const user = requireUser(context);
    if (user.id !== userId) {
      throw forbidden("You can only change your own password");
    }

    if (!user.googleId && !user.password) {
      throw new Error(`User ${user.id} has neither a password nor a Google id`);
    }

    if (user.password) {
      const isMatch = await bcrypt.compare(oldPassword || "", user.password);
      if (!isMatch) {
        throw badInput("Old password is incorrect");
      }
    }

    assertNewPassword(newPassword);

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return {
      success: true,
    };
  };
