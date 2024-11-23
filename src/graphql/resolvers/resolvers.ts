import { getAllPlacesResolver } from "./getAllPlacesResolver/getAllPlacesResolver.js";
import { toggleFavoriteResolver } from "./toggleFavoriteResolver/toggleFavoriteResolver.js";
import { deleteReviewResolver } from "./deleteReviewResolver/deleteReviewResolver.js";
import { placeReviewsResolver } from "./placeReviewsResolver/placeReviewsResolver.js";
import { registerUserResolver } from "./registerUserResolver/registerUserResolver.js";
import { signInWithEmailResolver } from "./signInWithEmailResolver/gnInWithEmailResolver.js";
import { loginWithGoogleResolver } from "./loginWithGoogleResolver/loginWithGoogleResolver.js";
import { currentUserResolver } from "./currentUserResolver/currentUserResolver.js";
import { logoutResolver } from "./logoutReslover/logoutReslover.js";
import { getUserReviewActivityResolver } from "./getUserReviewActivityResolver/getUserReviewActivityResolver.js";
import { setNewPasswordResolver } from "./setNewPasswordResolver/setNewPasswordResolver.js";
import { updatePersonalDataResolver } from "./updatePersonalDataResolver/updatePersonalDataResolver.js";
import { uploadAvatarResolver } from "./uploadAvatarResolver/uploadAvatarResolver.js";
import { deleteAvatarResolver } from "./deleteAvatarResolver/deleteAvatarResolver.js";
import { toggleCharacteristicResolver } from "./toggleCharacteristicResolver/toggleCharacteristicResolver.js";
import { addTextReviewResolver } from "./addTextReviewResolver/addTextReviewResolver.js";
import { addRatingResolver } from "./addRatingResolver/addRatingResolver.js";

export const resolvers = {
  Query: {
    places: getAllPlacesResolver,
    currentUser: currentUserResolver,
    placeReviews: placeReviewsResolver,
    getUserReviewActivity: getUserReviewActivityResolver,
  },

  Mutation: {
    registerUser: registerUserResolver,
    loginWithGoogle: loginWithGoogleResolver,
    signInWithEmail: signInWithEmailResolver,
    logout: logoutResolver,

    updatePersonalData: updatePersonalDataResolver,
    setNewPassword: setNewPasswordResolver,
    uploadAvatar: uploadAvatarResolver,
    deleteAvatar: deleteAvatarResolver,

    addRating: addRatingResolver,
    addTextReview: addTextReviewResolver,
    toggleFavorite: toggleFavoriteResolver,
    deleteReview: deleteReviewResolver,
    toggleCharacteristic: toggleCharacteristicResolver,
  },
};
