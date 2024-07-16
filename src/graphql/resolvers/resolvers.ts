// import Place from "../../models/Place.js";
import { Response } from "express";
import { GraphQLError } from "graphql";
import { OAuth2Client } from "google-auth-library";
import User from "../../models/User.js";
import { IUser } from "../../models/User.js";
import { createJWT } from "../../utils/jwt.js";
// import mongoose from "mongoose";
import { getAllPlacesResolver } from "./getAllPlacesResolver/getAllPlacesResolver.js";
import { ratePlaceResolver } from "./ratePlaceResolver/ratePlaceResolver.js";
import { addReviewResolver } from "./addReviewResolver/addReviewResolver.js";
import { toggleFavoriteResolver } from "./toggleFavoriteResolver/toggleFavoriteResolver.js";
import { placeReviewsResolver } from "./placeReviewsResolver/placeReviewsResolver.js";
import { deleteReviewResolver } from "./deleteReviewResolver/deleteReviewResolver.js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;

const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const client = new OAuth2Client(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  "http://localhost:5173",
);

export const resolvers = {
  Query: {
    places: getAllPlacesResolver,

    currentUser: async (_: never, __: never, { user }: { user: IUser }) => {
      return user;
    },
    placeReviews: placeReviewsResolver,
  },
  Mutation: {
    loginWithGoogle: async (
      _: never,
      { code }: { code: string },
      { res }: { res: Response },
    ) => {
      try {
        const { tokens } = await client.getToken({
          code,
          redirect_uri: "http://localhost:5173",
        });
        const idToken = tokens.id_token;

        if (!idToken) {
          throw new GraphQLError("Invalid Google token");
        }
        const ticket = await client.verifyIdToken({
          idToken,
          audience: GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();

        if (!payload) {
          throw new GraphQLError("Invalid Google token", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

        let user = await User.findOne({ googleId: payload.sub });

        if (!user) {
          user = new User({
            googleId: payload.sub,
            email: payload.email,
            displayName: payload.name,
            avatar: payload.picture,
          });
          await user.save();
        }

        const token = createJWT(user.id);

        res.cookie("jwt", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 24 * 60 * 60 * 1000 * 2, // 2 days
        });

        return { user };
      } catch (error) {
        console.error("Error in loginWithGoogle:", error);
        throw new GraphQLError("Error authenticating with Google", {
          extensions: {
            code: "INTERNAL_SERVER_ERROR",
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    },

    logout: (_: never, __: never, { res }: { res: Response }) => {
      res.clearCookie("jwt");
      return { message: "Logged out successfully" };
    },
    ratePlace: ratePlaceResolver,
    addReview: addReviewResolver,
    toggleFavorite: toggleFavoriteResolver,
    deleteReview: deleteReviewResolver,
  },
};
