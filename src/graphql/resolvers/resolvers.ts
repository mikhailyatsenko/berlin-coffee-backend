import { getAllPlacesResolver } from "./getAllPlacesResolver/getAllPlacesResolver.js";
import { addReviewResolver } from "./addReviewResolver/addReviewResolver.js";
import { toggleFavoriteResolver } from "./toggleFavoriteResolver/toggleFavoriteResolver.js";
import { deleteReviewResolver } from "./deleteReviewResolver/deleteReviewResolver.js";
import { placeDetailsResolver } from "./placeDetailsResolver/placeDetailsResolver.js";
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

export const resolvers = {
  Query: {
    places: getAllPlacesResolver,
    currentUser: currentUserResolver,
    placeDetails: placeDetailsResolver,
    getUserReviewActivity: getUserReviewActivityResolver,
  },

  Mutation: {
    registerUser: registerUserResolver,
    loginWithGoogle: loginWithGoogleResolver,
    signInWithEmail: signInWithEmailResolver,

    updatePersonalData: updatePersonalDataResolver,
    setNewPassword: setNewPasswordResolver,

    logout: logoutResolver,

    uploadAvatar: uploadAvatarResolver,
    deleteAvatar: deleteAvatarResolver,

    addReview: addReviewResolver,
    toggleFavorite: toggleFavoriteResolver,
    deleteReview: deleteReviewResolver,
  },
};
