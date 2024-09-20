import { getAllPlacesResolver } from "./getAllPlacesResolver/getAllPlacesResolver.js";
import { addReviewResolver } from "./addReviewResolver/addReviewResolver.js";
import { toggleFavoriteResolver } from "./toggleFavoriteResolver/toggleFavoriteResolver.js";
import { deleteReviewResolver } from "./deleteReviewResolver/deleteReviewResolver.js";
import { placeDetailsResolver } from "./placeDetailsResolver/placeDetailsResolver.js";
import { registerUserResolver } from "./registerUserResolver/registerUserResolver.js";
import { signInWithEmailResolver } from "./signInWithEmailResolver/signInWithEmailResolver.js";
import { loginWithGoogleResolver } from "./loginWithGoogleResolver/loginWithGoogleResolver.js";
import { currentUserResolver } from "./currentUserResolver/currentUserResolver.js";
import { logoutResolver } from "./logoutReslover/logoutReslover.js";

export const resolvers = {
  Query: {
    places: getAllPlacesResolver,
    currentUser: currentUserResolver,
    placeDetails: placeDetailsResolver,
  },

  Mutation: {
    registerUser: registerUserResolver,
    loginWithGoogle: loginWithGoogleResolver,
    signInWithEmail: signInWithEmailResolver,

    logout: logoutResolver,

    addReview: addReviewResolver,
    toggleFavorite: toggleFavoriteResolver,
    deleteReview: deleteReviewResolver,
  },
};
