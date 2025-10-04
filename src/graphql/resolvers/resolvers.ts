import { placesResolver } from "./allPlacesResolver/placesResolver.js";
import { toggleFavoriteResolver } from "./toggleFavoriteResolver/toggleFavoriteResolver.js";
import { deleteReviewResolver } from "./deleteReviewResolver/deleteReviewResolver.js";
import { placeReviewsResolver } from "./placeReviewsResolver/placeReviewsResolver.js";
import { registerUserResolver } from "./registerUser/registerUserResolver.js";
import { signInWithEmailResolver } from "./signInWithEmailResolver/gnInWithEmailResolver.js";
import { loginWithGoogleResolver } from "./loginWithGoogleResolver/loginWithGoogleResolver.js";
import { currentUserResolver } from "./currentUserResolver/currentUserResolver.js";
import { logoutResolver } from "./logoutReslover/logoutReslover.js";
import { userReviewActivityResolver } from "./userReviewActivityResolver/userReviewActivityResolver.js";
import { setNewPasswordResolver } from "./setNewPasswordResolver/setNewPasswordResolver.js";
import { updatePersonalDataResolver } from "./updatePersonalDataResolver/updatePersonalDataResolver.js";
import { uploadAvatarResolver } from "./uploadAvatarResolver/uploadAvatarResolver.js";
import { deleteAvatarResolver } from "./deleteAvatarResolver/deleteAvatarResolver.js";
import { deleteAccountResolver } from "./deleteAccountResolver/deleteAccountResolver.js";
import { toggleCharacteristicResolver } from "./toggleCharacteristicResolver/toggleCharacteristicResolver.js";
import { addTextReviewResolver } from "./addTextReviewResolver/addTextReviewResolver.js";
import { addRatingResolver } from "./addRatingResolver/addRatingResolver.js";
import { contactFormResolver } from "./contactFormResolver/contactFormResolver.js";
import { resendConfirmationEmailResolver } from "./registerUser/resendConfirmationEmailResolver.js";
import { confirmEmailResolver } from "./registerUser/confirmEmailResolver.js";
import { placeResolver } from "./placeResolver/placeResolver.js";
import GraphQLJSON from "graphql-type-json";
import { requestPasswordResetResolver } from "./passwordReset/requestPasswordResetResolver.js";
import { validatePasswordResetTokenResolver } from "./passwordReset/validatePasswordResetTokenResolver.js";
import { resetPasswordResolver } from "./passwordReset/resetPasswordResolver.js";

export const resolvers = {
  JSON: GraphQLJSON,
  Query: {
    places: placesResolver,
    place: placeResolver,
    currentUser: currentUserResolver,
    placeReviews: placeReviewsResolver,
    userReviewActivity: userReviewActivityResolver,
  },

  Mutation: {
    registerUser: registerUserResolver,
    loginWithGoogle: loginWithGoogleResolver,
    signInWithEmail: signInWithEmailResolver,
    logout: logoutResolver,
    resendConfirmationEmail: resendConfirmationEmailResolver,
    confirmEmail: confirmEmailResolver,
    requestPasswordReset: requestPasswordResetResolver,
    validatePasswordResetToken: validatePasswordResetTokenResolver,
    resetPassword: resetPasswordResolver,

    updatePersonalData: updatePersonalDataResolver,
    setNewPassword: setNewPasswordResolver,
    uploadAvatar: uploadAvatarResolver,
    deleteAvatar: deleteAvatarResolver,
    deleteAccount: deleteAccountResolver,

    addRating: addRatingResolver,
    addTextReview: addTextReviewResolver,
    toggleFavorite: toggleFavoriteResolver,
    deleteReview: deleteReviewResolver,
    toggleCharacteristic: toggleCharacteristicResolver,

    contactForm: contactFormResolver,
  },
};
