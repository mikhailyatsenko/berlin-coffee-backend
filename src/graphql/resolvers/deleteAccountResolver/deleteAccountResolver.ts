import User, { IUser } from "../../../models/User.js";
import Interaction from "../../../models/Interaction.js";

interface DeleteAccountContext {
  user?: IUser;
}

export const deleteAccountResolver = async (
  _: any,
  __: any,
  context: DeleteAccountContext
) => {
  try {
    // Проверяем, что пользователь авторизован
    if (!context.user) {
      throw new Error("Пользователь не авторизован");
    }

    const userId = context.user._id;

    // Удаляем все интеракции пользователя
    await Interaction.deleteMany({ userId });

    // Удаляем самого пользователя
    await User.findByIdAndDelete(userId);

    return {
      success: true,
    };
  } catch (error) {
    console.error("Ошибка при удалении аккаунта:", error);
    throw new Error("Не удалось удалить аккаунт");
  }
};
